"""Tenant-scoped read queries for students.

The backend bypasses RLS (connects as `postgres`), so every query MUST
include the institution_id filter. The functions here own that scoping
so routes/services don't have to remember.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.student import Student, StudentAuxProfile, StudentProfile


async def list_students_with_current_profile(
    db: AsyncSession,
    institution_id: UUID,
) -> list[tuple[Student, StudentProfile | None, StudentAuxProfile | None]]:
    """Every student in the institution, plus their current profile + aux row.

    Returns a list of (student, profile_or_None, aux_or_None) tuples ordered
    by student name. Profiles / aux rows are filtered to `is_current = TRUE`
    and not soft-deleted.
    """
    stmt = (
        select(Student, StudentProfile, StudentAuxProfile)
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
        .outerjoin(
            StudentProfile,
            (StudentProfile.student_id == Student.id)
            & (StudentProfile.is_current.is_(True))
            & (StudentProfile.deleted_at.is_(None)),
        )
        .outerjoin(
            StudentAuxProfile,
            (StudentAuxProfile.student_id == Student.id)
            & (StudentAuxProfile.is_current.is_(True))
            & (StudentAuxProfile.deleted_at.is_(None)),
        )
        .order_by(Student.full_name)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], r[2]) for r in rows]


async def get_student_with_current_profile(
    db: AsyncSession,
    institution_id: UUID,
    student_id: UUID,
) -> tuple[Student, StudentProfile | None, StudentAuxProfile | None] | None:
    """Single student in the institution, with current profile + aux."""
    stmt = (
        select(Student, StudentProfile, StudentAuxProfile)
        .where(Student.id == student_id)
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
        .outerjoin(
            StudentProfile,
            (StudentProfile.student_id == Student.id)
            & (StudentProfile.is_current.is_(True))
            & (StudentProfile.deleted_at.is_(None)),
        )
        .outerjoin(
            StudentAuxProfile,
            (StudentAuxProfile.student_id == Student.id)
            & (StudentAuxProfile.is_current.is_(True))
            & (StudentAuxProfile.deleted_at.is_(None)),
        )
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    return row[0], row[1], row[2]
