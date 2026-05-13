"""/api/sections — list with simulation overview + detail with roster + simulate."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import current_user
from app.models.auth_user import AuthUser, UserRole
from app.repositories import sections as sections_repo
from app.schemas.sections import (
    CourseRef,
    SectionDetail,
    SectionListItem,
    SimulationFactorShape,
    SimulationResultShape,
    TeacherRef,
)
from app.schemas.simulation import SimulateFactor, SimulateResponse
from app.schemas.students import StudentListItem
from app.schemas.teachers import TeacherProfileShape
from app.services.compatibility_service import SimulateError, simulate_section

router = APIRouter(prefix="/sections", tags=["sections"])


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
    user: Annotated[AuthUser, Depends(current_user)],
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


@router.get("/{section_id}", response_model=SectionDetail)
async def get_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    bundle = await sections_repo.get_section(db, user.institution_id, section_id)
    if not bundle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Section not found"
        )
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


@router.post(
    "/{section_id}/simulate",
    response_model=SimulateResponse,
    status_code=status.HTTP_200_OK,
)
async def simulate_section_endpoint(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SimulateResponse:
    """Run the compatibility scoring engine on the section and persist the result.

    HoD and Super Admin can trigger simulations.
    """
    if user.role not in (UserRole.hod, UserRole.super_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HoD or Super Admin can run simulations",
        )
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
