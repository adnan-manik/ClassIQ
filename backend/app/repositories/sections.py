"""Tenant-scoped read queries for sections.

Pulls section + course + teacher + teacher's current profile + the latest
simulation result (and its factors) in a couple of round-trips.
"""

from uuid import UUID

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import Course
from app.models.section import Section, SectionStudent
from app.models.simulation import SimulationResult, SimulationResultFactor
from app.models.student import Student, StudentAuxProfile, StudentProfile
from app.models.teacher import Teacher, TeacherProfile


async def list_sections(
    db: AsyncSession,
    institution_id: UUID,
) -> list[tuple[Section, Course, Teacher | None, TeacherProfile | None, int]]:
    """Sections + course + (teacher, teacher_profile) + student count.

    student_count is computed via a correlated COUNT subquery (cheap for
    classroom-sized sections; fine without a window).
    """
    student_count_subq = (
        select(func.count())
        .where(SectionStudent.section_id == Section.id)
        .where(SectionStudent.removed_at.is_(None))
        .correlate(Section)
        .scalar_subquery()
    )

    stmt = (
        select(Section, Course, Teacher, TeacherProfile, student_count_subq)
        .join(Course, Course.id == Section.course_id)
        .outerjoin(Teacher, Teacher.id == Section.teacher_id)
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
        .where(Section.institution_id == institution_id)
        .where(Section.deleted_at.is_(None))
        .order_by(Course.code, Section.label)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], r[2], r[3], r[4] or 0) for r in rows]


async def get_section(
    db: AsyncSession,
    institution_id: UUID,
    section_id: UUID,
) -> tuple[Section, Course, Teacher | None, TeacherProfile | None] | None:
    stmt = (
        select(Section, Course, Teacher, TeacherProfile)
        .join(Course, Course.id == Section.course_id)
        .outerjoin(Teacher, Teacher.id == Section.teacher_id)
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
        .where(Section.id == section_id)
        .where(Section.institution_id == institution_id)
        .where(Section.deleted_at.is_(None))
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    return row[0], row[1], row[2], row[3]


async def list_section_students(
    db: AsyncSession,
    section_id: UUID,
) -> list[tuple[Student, StudentProfile | None, StudentAuxProfile | None]]:
    """Enrolled students in a section with current profile + aux row."""
    stmt = (
        select(Student, StudentProfile, StudentAuxProfile)
        .join(SectionStudent, SectionStudent.student_id == Student.id)
        .where(SectionStudent.section_id == section_id)
        .where(SectionStudent.removed_at.is_(None))
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


async def latest_result_for_section(
    db: AsyncSession,
    section_id: UUID,
) -> tuple[SimulationResult, list[SimulationResultFactor], Teacher | None] | None:
    """Most recent simulation result for the given section (live, not scenario)."""
    stmt = (
        select(SimulationResult, Teacher)
        .outerjoin(
            Teacher, Teacher.id == SimulationResult.recommended_teacher_id
        )
        .where(SimulationResult.section_id == section_id)
        .order_by(desc(SimulationResult.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    result: SimulationResult = row[0]
    recommended: Teacher | None = row[1]

    factors_stmt = (
        select(SimulationResultFactor)
        .where(SimulationResultFactor.simulation_result_id == result.id)
        .order_by(SimulationResultFactor.factor_name)
    )
    factors = list((await db.execute(factors_stmt)).scalars().all())
    return result, factors, recommended
