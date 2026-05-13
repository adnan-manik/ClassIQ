"""Tenant-scoped read queries for teachers."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.teacher import Teacher, TeacherProfile


async def list_teachers_with_current_profile(
    db: AsyncSession,
    institution_id: UUID,
) -> list[tuple[Teacher, TeacherProfile | None]]:
    stmt = (
        select(Teacher, TeacherProfile)
        .where(Teacher.institution_id == institution_id)
        .where(Teacher.deleted_at.is_(None))
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
        .order_by(Teacher.full_name)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1]) for r in rows]


async def get_teacher_with_current_profile(
    db: AsyncSession,
    institution_id: UUID,
    teacher_id: UUID,
) -> tuple[Teacher, TeacherProfile | None] | None:
    stmt = (
        select(Teacher, TeacherProfile)
        .where(Teacher.id == teacher_id)
        .where(Teacher.institution_id == institution_id)
        .where(Teacher.deleted_at.is_(None))
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    return row[0], row[1]
