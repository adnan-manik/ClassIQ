"""/api/sections — list with simulation overview + detail with roster + simulate."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.repositories import sections as sections_repo
from app.schemas.sections import (
    CourseRef,
    SectionCreate,
    SectionDetail,
    SectionListItem,
    SectionUpdate,
    SimulationFactorShape,
    SimulationResultShape,
    TeacherRef,
)
from app.schemas.simulation import SimulateFactor, SimulateResponse
from app.schemas.students import StudentListItem
from app.schemas.teachers import TeacherProfileShape
from app.services.compatibility_service import SimulateError, simulate_section

router = APIRouter(prefix="/sections", tags=["sections"])

# Section Builder is a staff workspace — HoD / Institution Admin / Super Admin.
_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _build_result_shape(
    db: AsyncSession, section_id: UUID
) -> SimulationResultShape | None:
    bundle = await sections_repo.latest_result_for_section(db, section_id)
    if not bundle:
        return None
    result, factors, recommended = bundle
    return SimulationResultShape(
        id=result.id,
        compatibility_score=result.compatibility_score,
        predicted_outcome=result.predicted_outcome,
        social_graph_impact=result.social_graph_impact,
        style_distribution=result.style_distribution,
        recommended_teacher_id=result.recommended_teacher_id,
        recommended_teacher_name=recommended.full_name if recommended else None,
        factors=[
            SimulationFactorShape(
                factor_name=f.factor_name,
                score=f.score,
                weight=float(f.weight),
                impact=f.impact,
            )
            for f in factors
        ],
    )


@router.get("", response_model=list[SectionListItem])
async def list_sections(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SectionListItem]:
    rows = await sections_repo.list_sections(db, user.institution_id)
    items: list[SectionListItem] = []
    for sec, course, teacher, t_profile, student_count in rows:
        items.append(
            SectionListItem(
                id=sec.id,
                label=sec.label,
                state=sec.state,
                course=CourseRef(id=course.id, code=course.code, name=course.name),
                teacher=(
                    TeacherRef(
                        id=teacher.id,
                        full_name=teacher.full_name,
                        email=teacher.email,
                        profile=(
                            TeacherProfileShape.model_validate(t_profile)
                            if t_profile
                            else None
                        ),
                    )
                    if teacher
                    else None
                ),
                student_count=student_count,
                latest_result=await _build_result_shape(db, sec.id),
            )
        )
    return items


async def _build_section_detail(
    db: AsyncSession, institution_id: UUID, section_id: UUID
) -> SectionDetail | None:
    """Assemble the full SectionDetail shape (used by GET / POST / PATCH)."""
    bundle = await sections_repo.get_section(db, institution_id, section_id)
    if not bundle:
        return None
    sec, course, teacher, t_profile = bundle

    enrolled = await sections_repo.list_section_students(db, sec.id)
    students = [
        StudentListItem(
            id=s.id,
            full_name=s.full_name,
            external_id=s.external_id,
            email=s.email,
            dominant_axis=p.dominant_axis if p else None,
            collaboration_pref=a.collaboration_pref if a else None,
            participation_level=a.participation_level if a else None,
        )
        for (s, p, a) in enrolled
    ]

    return SectionDetail(
        id=sec.id,
        label=sec.label,
        state=sec.state,
        course=CourseRef(id=course.id, code=course.code, name=course.name),
        teacher=(
            TeacherRef(
                id=teacher.id,
                full_name=teacher.full_name,
                email=teacher.email,
                profile=(
                    TeacherProfileShape.model_validate(t_profile)
                    if t_profile
                    else None
                ),
            )
            if teacher
            else None
        ),
        student_count=len(students),
        latest_result=await _build_result_shape(db, sec.id),
        students=students,
    )


@router.get("/{section_id}", response_model=SectionDetail)
async def get_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    detail = await _build_section_detail(db, user.institution_id, section_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
    return detail


@router.post("", response_model=SectionDetail, status_code=status.HTTP_201_CREATED)
async def create_section_endpoint(
    body: SectionCreate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """Create a new draft section (and enrol the given students)."""
    try:
        section_id = await sections_repo.create_section(
            db,
            institution_id=user.institution_id,
            created_by=user.id,
            course_id=body.course_id,
            academic_term_id=body.academic_term_id,
            label=body.label,
            teacher_id=body.teacher_id,
            student_ids=body.student_ids,
        )
    except sections_repo.SectionRefError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    detail = await _build_section_detail(db, user.institution_id, section_id)
    assert detail is not None  # just created
    return detail


@router.patch("/{section_id}", response_model=SectionDetail)
async def update_section_endpoint(
    section_id: UUID,
    body: SectionUpdate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """Edit a section's label and/or assigned teacher. Editing a simulated
    section drops it back to draft."""
    fields = body.model_fields_set
    try:
        found = await sections_repo.update_section(
            db,
            institution_id=user.institution_id,
            section_id=section_id,
            set_label="label" in fields,
            label=body.label,
            set_teacher="teacher_id" in fields,
            teacher_id=body.teacher_id,
        )
    except sections_repo.SectionRefError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )

    detail = await _build_section_detail(db, user.institution_id, section_id)
    assert detail is not None
    return detail


@router.post(
    "/{section_id}/simulate",
    response_model=SimulateResponse,
    status_code=status.HTTP_200_OK,
)
async def simulate_section_endpoint(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SimulateResponse:
    """Run the compatibility scoring engine on the section and persist the result.

    Restricted to staff (HoD / Institution Admin / Super Admin) via `_staff`.
    """
    try:
        _run, result, factors = await simulate_section(
            db,
            institution_id=user.institution_id,
            section_id=section_id,
            triggered_by=user.id,
        )
    except SimulateError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    return SimulateResponse(
        run_id=result.simulation_run_id,
        result_id=result.id,
        compatibility_score=result.compatibility_score,
        predicted_outcome=result.predicted_outcome,
        social_graph_impact=result.social_graph_impact,
        style_distribution=result.style_distribution,
        recommended_teacher_id=result.recommended_teacher_id,
        factors=[
            SimulateFactor(
                factor_name=f.factor_name,
                score=f.score,
                weight=float(f.weight),
                impact=f.impact,
            )
            for f in factors
        ],
    )
