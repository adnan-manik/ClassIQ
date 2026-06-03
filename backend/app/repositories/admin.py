"""Cross-tenant read queries used by the Super Admin panel."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.auth_user import AuthUser, UserRole
from app.models.ingestion_job import IngestionJob
from app.models.institution import Department, Institution
from app.models.section import Section
from app.models.simulation import SimulationRun
from app.models.student import Student
from app.models.teacher import Teacher


async def list_institutions_with_counts(db: AsyncSession) -> list[tuple[Institution, int, int, int]]:
    """Each institution with (department_count, user_count, student_count)."""
    dept_count_subq = (
        select(func.count())
        .where(Department.institution_id == Institution.id)
        .where(Department.deleted_at.is_(None))
        .correlate(Institution)
        .scalar_subquery()
    )
    user_count_subq = (
        select(func.count())
        .where(AuthUser.institution_id == Institution.id)
        .correlate(Institution)
        .scalar_subquery()
    )
    student_count_subq = (
        select(func.count())
        .where(Student.institution_id == Institution.id)
        .where(Student.deleted_at.is_(None))
        .correlate(Institution)
        .scalar_subquery()
    )

    stmt = (
        select(Institution, dept_count_subq, user_count_subq, student_count_subq)
        .where(Institution.deleted_at.is_(None))
        .order_by(Institution.name)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1] or 0, r[2] or 0, r[3] or 0) for r in rows]


async def get_institution(
    db: AsyncSession, institution_id: UUID
) -> Institution | None:
    return await db.get(Institution, institution_id)


async def list_departments_for_institution(
    db: AsyncSession, institution_id: UUID
) -> list[Department]:
    stmt = (
        select(Department)
        .where(Department.institution_id == institution_id)
        .where(Department.deleted_at.is_(None))
        .order_by(Department.name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def system_overview(db: AsyncSession) -> dict:
    """Platform-wide counts for the super admin dashboard."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    inst_count = (
        await db.execute(
            select(func.count()).select_from(Institution).where(
                Institution.deleted_at.is_(None)
            )
        )
    ).scalar_one() or 0

    role_rows = (
        await db.execute(
            select(AuthUser.role, func.count(AuthUser.id)).group_by(AuthUser.role)
        )
    ).all()
    users_by_role = [{"role": r[0], "count": r[1]} for r in role_rows]
    # Ensure every role has an entry, even with zero
    seen = {r["role"] for r in users_by_role}
    for role in UserRole:
        if role not in seen:
            users_by_role.append({"role": role, "count": 0})

    student_count = (
        await db.execute(
            select(func.count()).select_from(Student).where(Student.deleted_at.is_(None))
        )
    ).scalar_one() or 0
    teacher_count = (
        await db.execute(
            select(func.count()).select_from(Teacher).where(Teacher.deleted_at.is_(None))
        )
    ).scalar_one() or 0
    section_count = (
        await db.execute(
            select(func.count()).select_from(Section).where(Section.deleted_at.is_(None))
        )
    ).scalar_one() or 0
    sim_count = (
        await db.execute(
            select(func.count()).select_from(SimulationRun).where(
                SimulationRun.created_at >= cutoff
            )
        )
    ).scalar_one() or 0

    return {
        "institutions": inst_count,
        "users_by_role": users_by_role,
        "students": student_count,
        "teachers": teacher_count,
        "sections": section_count,
        "simulations_last_30d": sim_count,
    }


async def list_audit_global(
    db: AsyncSession, *, limit: int = 200, institution_id: UUID | None = None
) -> list[tuple[AuditLog, str | None, str | None]]:
    """Recent audit entries, with institution name + actor email joined."""
    stmt = (
        select(AuditLog, Institution.name, AuthUser.email)
        .join(Institution, Institution.id == AuditLog.institution_id, isouter=True)
        .join(AuthUser, AuthUser.id == AuditLog.actor_user_id, isouter=True)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    if institution_id is not None:
        stmt = stmt.where(AuditLog.institution_id == institution_id)
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], r[2]) for r in rows]


async def list_ingestion_jobs_global(
    db: AsyncSession, *, limit: int = 100
) -> list[tuple[IngestionJob, str | None]]:
    stmt = (
        select(IngestionJob, Institution.name)
        .join(Institution, Institution.id == IngestionJob.institution_id, isouter=True)
        .order_by(IngestionJob.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1]) for r in rows]
