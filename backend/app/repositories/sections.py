"""Tenant-scoped read queries for sections.

Pulls section + course + teacher + teacher's current profile + the latest
simulation result (and its factors) in a couple of round-trips.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import AcademicTerm, Course
from app.models.section import Section, SectionState, SectionStudent
from app.models.simulation import SimulationResult, SimulationResultFactor
from app.models.student import Student, StudentAuxProfile, StudentProfile
from app.models.teacher import Teacher, TeacherProfile


class SectionRefError(ValueError):
    """A referenced course / term / teacher / label is invalid for this tenant."""


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


# ── Writes ──────────────────────────────────────────────────────────────────
# The backend bypasses RLS (service connection), so every referenced entity is
# explicitly re-scoped to the caller's institution to prevent cross-tenant
# attachment.


async def _term_in_institution(
    db: AsyncSession, term_id: UUID, institution_id: UUID
) -> bool:
    stmt = (
        select(func.count())
        .select_from(AcademicTerm)
        .where(AcademicTerm.id == term_id)
        .where(AcademicTerm.institution_id == institution_id)
    )
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def _course_in_institution(
    db: AsyncSession, course_id: UUID, institution_id: UUID
) -> bool:
    stmt = (
        select(func.count())
        .select_from(Course)
        .where(Course.id == course_id)
        .where(Course.institution_id == institution_id)
        .where(Course.deleted_at.is_(None))
    )
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def _teacher_in_institution(
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


async def _valid_student_ids(
    db: AsyncSession, student_ids: list[UUID], institution_id: UUID
) -> list[UUID]:
    if not student_ids:
        return []
    stmt = (
        select(Student.id)
        .where(Student.id.in_(student_ids))
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    created_by: UUID,
    course_id: UUID,
    academic_term_id: UUID,
    label: str,
    teacher_id: UUID | None,
    student_ids: list[UUID],
) -> UUID:
    """Create a draft section + enrol the given students. Raises SectionRefError
    on bad references or a duplicate (course, term, label)."""
    if not await _course_in_institution(db, course_id, institution_id):
        raise SectionRefError("Course not found in your institution")
    if not await _term_in_institution(db, academic_term_id, institution_id):
        raise SectionRefError("Academic term not found in your institution")
    if teacher_id is not None and not await _teacher_in_institution(
        db, teacher_id, institution_id
    ):
        raise SectionRefError("Teacher not found in your institution")

    valid_students = await _valid_student_ids(db, student_ids, institution_id)

    now = datetime.now(timezone.utc)
    section_id = uuid4()
    db.add(
        Section(
            id=section_id,
            institution_id=institution_id,
            course_id=course_id,
            academic_term_id=academic_term_id,
            teacher_id=teacher_id,
            label=label.strip(),
            state=SectionState.draft,
            created_by=created_by,
            created_at=now,
        )
    )
    for sid in valid_students:
        db.add(SectionStudent(section_id=section_id, student_id=sid, added_at=now))

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise SectionRefError(
            "A section with this course, term, and label already exists"
        ) from exc
    return section_id


async def update_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    section_id: UUID,
    set_label: bool,
    label: str | None,
    set_teacher: bool,
    teacher_id: UUID | None,
) -> bool:
    """Update label/teacher of a section. Editing a `simulated` section drops it
    back to `draft` (architecture §7). Returns False if the section isn't found,
    raises SectionRefError on an invalid teacher or duplicate label."""
    sec = (
        await db.execute(
            select(Section)
            .where(Section.id == section_id)
            .where(Section.institution_id == institution_id)
            .where(Section.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if sec is None:
        return False

    changed = False
    if set_label and label and label.strip():
        sec.label = label.strip()
        changed = True
    if set_teacher:
        if teacher_id is not None and not await _teacher_in_institution(
            db, teacher_id, institution_id
        ):
            raise SectionRefError("Teacher not found in your institution")
        sec.teacher_id = teacher_id
        changed = True

    if changed:
        # Re-editing invalidates a prior simulation — back to draft.
        if sec.state == SectionState.simulated:
            sec.state = SectionState.draft
        sec.updated_at = datetime.now(timezone.utc)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise SectionRefError(
            "A section with this course, term, and label already exists"
        ) from exc
    return True


class SectionStateError(ValueError):
    """An illegal state transition per BACKEND_ARCHITECTURE §7."""


async def get_section_row(
    db: AsyncSession, institution_id: UUID, section_id: UUID
) -> Section | None:
    return (
        await db.execute(
            select(Section)
            .where(Section.id == section_id)
            .where(Section.institution_id == institution_id)
            .where(Section.deleted_at.is_(None))
        )
    ).scalar_one_or_none()


async def reconcile_roster(
    db: AsyncSession,
    *,
    institution_id: UUID,
    section: Section,
    student_ids: list[UUID],
    now: datetime,
) -> tuple[int, int]:
    """Make the section's live roster equal `student_ids` (tenant-validated).
    Absent students are soft-removed, new ones added, previously removed ones
    restored. Returns (added, removed). Does not commit."""
    wanted = set(await _valid_student_ids(db, student_ids, institution_id))
    existing = list(
        (
            await db.execute(
                select(SectionStudent).where(SectionStudent.section_id == section.id)
            )
        ).scalars().all()
    )
    by_student = {e.student_id: e for e in existing}
    added = removed = 0
    for e in existing:
        if e.student_id not in wanted and e.removed_at is None:
            e.removed_at = now
            removed += 1
    for sid in wanted:
        e = by_student.get(sid)
        if e is None:
            db.add(SectionStudent(section_id=section.id, student_id=sid, added_at=now))
            added += 1
        elif e.removed_at is not None:
            e.removed_at = None
            e.added_at = now
            added += 1
    if added or removed:
        if section.state == SectionState.simulated:
            section.state = SectionState.draft
        section.updated_at = now
    return added, removed


_TRANSITIONS: dict[SectionState, set[SectionState]] = {
    SectionState.active: {SectionState.simulated},
    SectionState.archived: {SectionState.active},
    SectionState.draft: {SectionState.simulated},  # explicit "reopen"
}


def transition(section: Section, to_state: SectionState, now: datetime) -> None:
    """Apply a state-machine transition or raise SectionStateError."""
    allowed = _TRANSITIONS.get(to_state, set())
    if section.state not in allowed:
        raise SectionStateError(
            f"Cannot move a {section.state.value} section to {to_state.value}"
            + (
                " — run a simulation first"
                if to_state == SectionState.active and section.state == SectionState.draft
                else ""
            )
        )
    section.state = to_state
    section.updated_at = now


async def soft_delete_section(db: AsyncSession, section: Section, now: datetime) -> None:
    if section.state in (SectionState.active,):
        raise SectionStateError("Archive an active section instead of deleting it")
    section.deleted_at = now
    section.updated_at = now
