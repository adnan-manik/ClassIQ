"""Tenant-scope reference checks shared by the write paths.

The backend bypasses RLS (service connection), so every id a client sends must
be re-checked against the caller's institution before it is attached to
anything. These helpers are the single place that check lives.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import AcademicTerm, Course, Department
from app.models.student import Student
from app.models.teacher import Teacher


class RefError(ValueError):
    """A referenced entity does not exist inside the caller's institution."""


async def term_in_institution(
    db: AsyncSession, term_id: UUID, institution_id: UUID
) -> bool:
    stmt = (
        select(func.count())
        .select_from(AcademicTerm)
        .where(AcademicTerm.id == term_id)
        .where(AcademicTerm.institution_id == institution_id)
    )
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def department_in_institution(
    db: AsyncSession, department_id: UUID, institution_id: UUID
) -> bool:
    stmt = (
        select(func.count())
        .select_from(Department)
        .where(Department.id == department_id)
        .where(Department.institution_id == institution_id)
        .where(Department.deleted_at.is_(None))
    )
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def get_course_in_institution(
    db: AsyncSession, course_id: UUID, institution_id: UUID
) -> Course | None:
    stmt = (
        select(Course)
        .where(Course.id == course_id)
        .where(Course.institution_id == institution_id)
        .where(Course.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def teacher_in_institution(
    db: AsyncSession, teacher_id: UUID, institution_id: UUID
) -> bool:
    stmt = (
        select(func.count())
        .select_from(Teacher)
        .where(Teacher.id == teacher_id)
        .where(Teacher.institution_id == institution_id)
        .where(Teacher.deleted_at.is_(None))
    )
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def valid_student_ids(
    db: AsyncSession, student_ids: list[UUID], institution_id: UUID
) -> list[UUID]:
    """Return the subset of `student_ids` that belong to the institution,
    de-duplicated and in the caller's order."""
    if not student_ids:
        return []
    stmt = (
        select(Student.id)
        .where(Student.id.in_(list(set(student_ids))))
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
    )
    found = set((await db.execute(stmt)).scalars().all())
    seen: set[UUID] = set()
    ordered: list[UUID] = []
    for sid in student_ids:
        if sid in found and sid not in seen:
            seen.add(sid)
            ordered.append(sid)
    return ordered
