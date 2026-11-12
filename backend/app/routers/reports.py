"""/api/reports — F6 simulation report payloads.

    GET /api/reports/sections/{id}   staff, or the teacher assigned to the section

The dashboard still reads Supabase directly for the report list; this endpoint
is the API-shaped report (roster + latest result + full run history) for
print/export tooling and for the LLM context builder.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import current_user
from app.models.auth_user import AuthUser, UserRole
from app.models.institution import AcademicTerm, Department
from app.models.simulation import SimulationResult, SimulationResultFactor, SimulationRun
from app.models.teacher import Teacher
from app.repositories import sections as sections_repo
from app.routers.sections import _build_section_detail
from app.schemas.sections import SectionReport, SimulationFactorShape, SimulationHistoryItem

router = APIRouter(prefix="/reports", tags=["reports"])

_STAFF = {UserRole.hod, UserRole.institution_admin, UserRole.super_admin}


async def _history(db: AsyncSession, section_id: UUID) -> list[SimulationHistoryItem]:
    stmt = (
        select(SimulationResult, SimulationRun, Teacher)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .outerjoin(Teacher, Teacher.id == SimulationResult.recommended_teacher_id)
        .where(SimulationResult.section_id == section_id)
        .order_by(desc(SimulationResult.created_at))
        .limit(25)
    )
    rows = (await db.execute(stmt)).all()

    # One query for every result's factors, not one per result: this history
    # is up to 25 rows deep and each query is a round trip to the pooler.
    factors_by_result: dict[UUID, list[SimulationResultFactor]] = {}
    if rows:
        factor_rows = (
            await db.execute(
                select(SimulationResultFactor)
                .where(
                    SimulationResultFactor.simulation_result_id.in_(
                        [result.id for result, _run, _rec in rows]
                    )
                )
                .order_by(SimulationResultFactor.factor_name)
            )
        ).scalars().all()
        for f in factor_rows:
            factors_by_result.setdefault(f.simulation_result_id, []).append(f)

    out: list[SimulationHistoryItem] = []
    for result, run, recommended in rows:
        factors = factors_by_result.get(result.id, [])
        out.append(
            SimulationHistoryItem(
                id=result.id,
                run_id=run.id,
                created_at=result.created_at,
                engine_version=run.engine_version,
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
        )
    return out


@router.get("/sections/{section_id}", response_model=SectionReport)
async def section_report(
    section_id: UUID,
    user: Annotated[AuthUser, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SectionReport:
    section = await sections_repo.get_section_row(db, user.institution_id, section_id)
    if section is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")

    if user.role not in _STAFF:
        # Teachers may only read reports for sections assigned to them.
        if user.role != UserRole.teacher:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
        teacher_id = (
            await db.execute(
                select(Teacher.id)
                .where(Teacher.auth_user_id == user.id)
                .where(Teacher.institution_id == user.institution_id)
                .where(Teacher.deleted_at.is_(None))
            )
        ).scalar_one_or_none()
        if teacher_id is None or section.teacher_id != teacher_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This section is not assigned to you")

    detail = await _build_section_detail(db, user.institution_id, section_id)
    assert detail is not None

    term_name = (
        await db.execute(select(AcademicTerm.name).where(AcademicTerm.id == section.academic_term_id))
    ).scalar_one_or_none()
    dept = (
        await db.execute(
            select(Department.id, Department.name)
            .join(
                sections_repo.Course, sections_repo.Course.department_id == Department.id
            )
            .where(sections_repo.Course.id == section.course_id)
        )
    ).first()

    return SectionReport(
        **detail.model_dump(),
        academic_term_id=section.academic_term_id,
        academic_term_name=term_name,
        department_id=dept[0] if dept else None,
        department_name=dept[1] if dept else None,
        history=await _history(db, section_id),
        generated_at=datetime.now(timezone.utc),
    )
