"""/api/early-warning — S1 Early Warning System.

    GET   /api/early-warning/overview                       staff
    GET   /api/early-warning/flags?section_id=&status=      staff
    PATCH /api/early-warning/flags/{id}                     staff — acknowledge / resolve / reopen
    GET   /api/early-warning/sections/{id}/outcomes         staff or the section's teacher
    POST  /api/early-warning/sections/{id}/outcomes         staff or the section's teacher
    POST  /api/early-warning/sections/{id}/evaluate         staff or the section's teacher
    GET   /api/early-warning/sections/{id}/flags            staff or the section's teacher
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import current_user, require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.early_warning import EarlyWarningFlag, WarningStatus
from app.models.section import Section
from app.models.teacher import Teacher
from app.repositories import sections as sections_repo
from app.schemas.early_warning import (
    EarlyWarningOverview,
    EvaluateResponse,
    FlagPatch,
    FlagShape,
    OutcomeShape,
    RecordOutcomesRequest,
    RecordOutcomesResponse,
)
from app.services import early_warning_service as svc

router = APIRouter(prefix="/early-warning", tags=["early warning"])

_STAFF = {UserRole.hod, UserRole.institution_admin, UserRole.super_admin}
_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _section_for(db: AsyncSession, user: AuthUser, section_id: UUID) -> Section:
    """Staff may touch any section in the tenant; a teacher only their own."""
    section = await sections_repo.get_section_row(db, user.institution_id, section_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    if user.role in _STAFF:
        return section
    if user.role == UserRole.teacher:
        teacher_id = (
            await db.execute(
                select(Teacher.id)
                .where(Teacher.auth_user_id == user.id)
                .where(Teacher.institution_id == user.institution_id)
                .where(Teacher.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if teacher_id is not None and section.teacher_id == teacher_id:
            return section
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This section is not assigned to you")
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")


@router.get("/overview", response_model=EarlyWarningOverview)
async def get_overview(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EarlyWarningOverview:
    return await svc.overview(db, user.institution_id)


@router.get("/flags", response_model=list[FlagShape])
async def get_flags(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
    section_id: UUID | None = Query(default=None),
    flag_status: WarningStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[FlagShape]:
    return await svc.list_flags(
        db, user.institution_id, section_id=section_id, status=flag_status, limit=limit
    )


@router.patch("/flags/{flag_id}", response_model=FlagShape)
async def patch_flag(
    flag_id: UUID,
    body: FlagPatch,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FlagShape:
    flag = (
        await db.execute(
            select(EarlyWarningFlag)
            .where(EarlyWarningFlag.id == flag_id)
            .where(EarlyWarningFlag.institution_id == user.institution_id)
        )
    ).scalar_one_or_none()
    if flag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flag not found")
    await svc.set_flag_status(
        db, institution_id=user.institution_id, user=user, flag=flag, status=body.status
    )
    await db.commit()
    rows = await svc.list_flags(db, user.institution_id, section_id=flag.section_id, limit=1000)
    return next(r for r in rows if r.id == flag.id)


@router.get("/sections/{section_id}/outcomes", response_model=list[OutcomeShape])
async def get_outcomes(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OutcomeShape]:
    section = await _section_for(db, user, section_id)
    return await svc.list_outcomes(db, section.id)


@router.post("/sections/{section_id}/outcomes", response_model=RecordOutcomesResponse)
async def post_outcomes(
    section_id: UUID,
    body: RecordOutcomesRequest,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecordOutcomesResponse:
    """Record real attendance / grade / engagement for a week, then (by default)
    re-evaluate the section against its predicted outcome."""
    section = await _section_for(db, user, section_id)
    try:
        saved = await svc.record_outcomes(
            db,
            institution_id=user.institution_id,
            user=user,
            section=section,
            week_no=body.week_no,
            entries=body.entries,
        )
        evaluation = None
        if body.evaluate:
            evaluation = await svc.evaluate_section(
                db, institution_id=user.institution_id, user=user, section=section
            )
    except svc.EarlyWarningError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    await db.commit()
    return RecordOutcomesResponse(saved=saved, evaluation=evaluation)


@router.post("/sections/{section_id}/evaluate", response_model=EvaluateResponse)
async def evaluate(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EvaluateResponse:
    section = await _section_for(db, user, section_id)
    result = await svc.evaluate_section(
        db, institution_id=user.institution_id, user=user, section=section
    )
    await db.commit()
    return result


@router.get("/sections/{section_id}/flags", response_model=list[FlagShape])
async def section_flags(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FlagShape]:
    section = await _section_for(db, user, section_id)
    return await svc.list_flags(db, user.institution_id, section_id=section.id)
