"""/api/institution/analytics — institution-scoped charts data."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.repositories import analytics as analytics_repo
from app.repositories import institutions_admin as ia_repo
from app.schemas.analytics import (
    DepartmentRollup,
    FslsmAxisCount,
    FslsmDistribution,
    InstitutionAnalyticsOverview,
    ScoreTrendPoint,
    SimulationsByDepartment,
)

router = APIRouter(prefix="/institution/analytics", tags=["institution: analytics"])

_admin_gate = require_role(UserRole.institution_admin, UserRole.super_admin)


def _to_fslsm(payload: dict) -> FslsmDistribution:
    return FslsmDistribution(
        total_profiles=payload["total_profiles"],
        axes=[FslsmAxisCount(**a) for a in payload["axes"]],
    )


@router.get("/overview", response_model=InstitutionAnalyticsOverview)
async def overview(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionAnalyticsOverview:
    counts = await analytics_repo.institution_counts(db, actor.institution_id)
    fslsm = await analytics_repo.fslsm_distribution(db, actor.institution_id)
    rollups = await analytics_repo.departments_rollup(db, actor.institution_id)
    return InstitutionAnalyticsOverview(
        student_count=counts["student_count"],
        teacher_count=counts["teacher_count"],
        section_count=counts["section_count"],
        simulation_count=counts["simulation_count"],
        avg_compatibility_score=counts["avg_compatibility_score"],
        fslsm=_to_fslsm(fslsm),
        departments=[DepartmentRollup(**r) for r in rollups],
    )


@router.get(
    "/departments/{department_id}", response_model=InstitutionAnalyticsOverview
)
async def department_analytics(
    department_id: UUID,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionAnalyticsOverview:
    dept = await ia_repo.get_department(db, actor.institution_id, department_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    counts = await analytics_repo.institution_counts(
        db, actor.institution_id, department_id=department_id
    )
    fslsm = await analytics_repo.fslsm_distribution(
        db, actor.institution_id, department_id=department_id
    )
    return InstitutionAnalyticsOverview(
        student_count=counts["student_count"],
        teacher_count=counts["teacher_count"],
        section_count=counts["section_count"],
        simulation_count=counts["simulation_count"],
        avg_compatibility_score=counts["avg_compatibility_score"],
        fslsm=_to_fslsm(fslsm),
        departments=[],
    )


@router.get("/score-trend", response_model=list[ScoreTrendPoint])
async def score_trend(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    weeks: int = 12,
) -> list[ScoreTrendPoint]:
    points = await analytics_repo.score_trend(db, actor.institution_id, weeks=weeks)
    return [ScoreTrendPoint(**p) for p in points]


@router.get("/simulations-by-department", response_model=list[SimulationsByDepartment])
async def simulations_by_department(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
) -> list[SimulationsByDepartment]:
    rows = await analytics_repo.simulations_by_department(db, actor.institution_id, days=days)
    return [SimulationsByDepartment(**r) for r in rows]
