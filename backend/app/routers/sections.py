"""/api/sections — Section Builder (F4) + simulate (F2) + lifecycle (§7).

    GET    /api/sections                      list with latest result
    POST   /api/sections                      create draft (+ enrol students)
    GET    /api/sections/{id}                 detail with roster
    PATCH  /api/sections/{id}                 label / teacher (simulated → draft)
    PUT    /api/sections/{id}/students        replace roster (simulated → draft)
    POST   /api/sections/{id}/simulate        run the engine, persist result
    POST   /api/sections/{id}/activate        simulated → active
    POST   /api/sections/{id}/archive         active → archived
    POST   /api/sections/{id}/reopen          simulated → draft (explicit re-edit)
    DELETE /api/sections/{id}                 soft-delete (not while active)

Every mutation writes an audit_logs row.
"""

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.section import SectionState
from app.repositories import sections as sections_repo
from app.schemas.sections import (
    CourseRef,
    SectionCreate,
    SectionDetail,
    SectionListItem,
    SectionRosterUpdate,
    SectionUpdate,
    SimulationFactorShape,
    SimulationResultShape,
    TeacherRef,
)
from app.schemas.simulation import SimulateFactor, SimulateResponse
from app.schemas.students import StudentListItem
from app.schemas.teachers import TeacherProfileShape
from app.services.audit import write_audit
from app.services.compatibility_service import SimulateError, simulate_section

router = APIRouter(prefix="/sections", tags=["sections"])

# Section Builder is a staff workspace — HoD / Institution Admin / Super Admin.
_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _build_result_shape(
    db: AsyncSession, section_id: UUID
) -> SimulationResultShape | None:
    """One section's latest result. For a list of sections, fetch them with
    `sections_repo.latest_results_for_sections` and call `_result_shape`."""
    return _result_shape(await sections_repo.latest_result_for_section(db, section_id))


def _result_shape(bundle) -> SimulationResultShape | None:
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


def _teacher_ref(teacher, t_profile) -> TeacherRef | None:
    if teacher is None:
        return None
    return TeacherRef(
        id=teacher.id,
        full_name=teacher.full_name,
        email=teacher.email,
        profile=TeacherProfileShape.model_validate(t_profile) if t_profile else None,
    )


@router.get("", response_model=list[SectionListItem])
async def list_sections(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SectionListItem]:
    rows = await sections_repo.list_sections(db, user.institution_id)
    # Every section's latest result in two queries, not two per section.
    results = await sections_repo.latest_results_for_sections(
        db, [sec.id for sec, *_ in rows]
    )
    return [
        SectionListItem(
            id=sec.id,
            label=sec.label,
            state=sec.state,
            course=CourseRef(id=course.id, code=course.code, name=course.name),
            teacher=_teacher_ref(teacher, t_profile),
            student_count=student_count,
            latest_result=_result_shape(results.get(sec.id)),
        )
        for sec, course, teacher, t_profile, student_count in rows
    ]


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
        teacher=_teacher_ref(teacher, t_profile),
        student_count=len(students),
        latest_result=await _build_result_shape(db, sec.id),
        students=students,
    )


async def _detail_or_404(db: AsyncSession, institution_id: UUID, section_id: UUID) -> SectionDetail:
    detail = await _build_section_detail(db, institution_id, section_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    return detail


@router.get("/{section_id}", response_model=SectionDetail)
async def get_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    return await _detail_or_404(db, user.institution_id, section_id)


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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action="section.create",
        entity_type="section",
        entity_id=section_id,
        payload={
            "course_id": str(body.course_id),
            "academic_term_id": str(body.academic_term_id),
            "label": body.label,
            "teacher_id": str(body.teacher_id) if body.teacher_id else None,
            "students": len(body.student_ids),
        },
    )
    await db.commit()
    return await _detail_or_404(db, user.institution_id, section_id)


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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")

    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action="section.update",
        entity_type="section",
        entity_id=section_id,
        payload={
            k: (str(v) if v is not None else None)
            for k, v in body.model_dump().items()
            if k in fields
        },
    )
    await db.commit()
    return await _detail_or_404(db, user.institution_id, section_id)


@router.put("/{section_id}/students", response_model=SectionDetail)
async def replace_roster(
    section_id: UUID,
    body: SectionRosterUpdate,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """Replace the enrolled roster. A simulated section returns to draft."""
    section = await sections_repo.get_section_row(db, user.institution_id, section_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    if section.state in (SectionState.active, SectionState.archived):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot change the roster of a {section.state.value} section",
        )
    now = datetime.now(timezone.utc)
    try:
        added, removed = await sections_repo.reconcile_roster(
            db,
            institution_id=user.institution_id,
            section=section,
            student_ids=body.student_ids,
            now=now,
        )
    except sections_repo.SectionRefError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    if added or removed:
        await write_audit(
            db,
            institution_id=user.institution_id,
            actor_user_id=user.id,
            action="section.roster",
            entity_type="section",
            entity_id=section.id,
            payload={"added": added, "removed": removed, "size": len(body.student_ids)},
        )
    await db.commit()
    return await _detail_or_404(db, user.institution_id, section_id)


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
    """Run the compatibility scoring engine on the section and persist the result."""
    try:
        _run, result, factors = await simulate_section(
            db,
            institution_id=user.institution_id,
            section_id=section_id,
            triggered_by=user.id,
        )
    except SimulateError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action="section.simulate",
        entity_type="section",
        entity_id=section_id,
        payload={
            "run_id": str(result.simulation_run_id),
            "compatibility_score": result.compatibility_score,
            "predicted_outcome": result.predicted_outcome.value,
        },
    )
    await db.commit()

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


async def _transition(
    db: AsyncSession, user: AuthUser, section_id: UUID, to_state: SectionState, action: str
) -> SectionDetail:
    section = await sections_repo.get_section_row(db, user.institution_id, section_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    now = datetime.now(timezone.utc)
    from_state = section.state
    try:
        sections_repo.transition(section, to_state, now)
    except sections_repo.SectionStateError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action=action,
        entity_type="section",
        entity_id=section.id,
        payload={"from": from_state.value, "to": to_state.value},
    )
    await db.commit()
    return await _detail_or_404(db, user.institution_id, section_id)


@router.post("/{section_id}/activate", response_model=SectionDetail)
async def activate_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """simulated → active: the HoD applies this configuration for the semester."""
    return await _transition(db, user, section_id, SectionState.active, "section.activate")


@router.post("/{section_id}/archive", response_model=SectionDetail)
async def archive_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """active → archived: the academic term is over."""
    return await _transition(db, user, section_id, SectionState.archived, "section.archive")


@router.post("/{section_id}/reopen", response_model=SectionDetail)
async def reopen_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionDetail:
    """simulated → draft without changing anything (invalidates the result on purpose)."""
    return await _transition(db, user, section_id, SectionState.draft, "section.reopen")


@router.delete("/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_section(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    section = await sections_repo.get_section_row(db, user.institution_id, section_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    now = datetime.now(timezone.utc)
    try:
        await sections_repo.soft_delete_section(db, section, now)
    except sections_repo.SectionStateError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action="section.delete",
        entity_type="section",
        entity_id=section.id,
        payload={"label": section.label, "state": section.state.value},
    )
    await db.commit()
