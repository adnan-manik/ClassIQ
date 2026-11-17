"""Tenant-scoped queries + writes for scenarios (F5)."""

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import AcademicTerm, Course
from app.models.scenario import (
    Scenario,
    ScenarioSection,
    ScenarioSectionStudent,
    ScenarioStatus,
)
from app.models.section import Section, SectionStudent
from app.models.simulation import (
    SimRunStatus,
    SimulationResult,
    SimulationResultFactor,
    SimulationRun,
)
from app.models.student import Student, StudentAuxProfile, StudentProfile
from app.models.teacher import Teacher, TeacherProfile
from app.repositories import refs


class ScenarioRefError(ValueError):
    """A referenced course / term / teacher / department is invalid for this tenant,
    or a (course, label) pair is duplicated inside the scenario."""


# ─── Reads ──────────────────────────────────────────────────────────────────

async def list_scenarios(
    db: AsyncSession, institution_id: UUID
) -> list[tuple[Scenario, str | None, int]]:
    """Scenarios newest-first with term name + section count."""
    section_count_subq = (
        select(func.count())
        .where(ScenarioSection.scenario_id == Scenario.id)
        .correlate(Scenario)
        .scalar_subquery()
    )
    stmt = (
        select(Scenario, AcademicTerm.name, section_count_subq)
        .outerjoin(AcademicTerm, AcademicTerm.id == Scenario.academic_term_id)
        .where(Scenario.institution_id == institution_id)
        .order_by(desc(Scenario.created_at))
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], r[2] or 0) for r in rows]


async def get_scenario(
    db: AsyncSession, institution_id: UUID, scenario_id: UUID
) -> Scenario | None:
    stmt = (
        select(Scenario)
        .where(Scenario.id == scenario_id)
        .where(Scenario.institution_id == institution_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def term_name(db: AsyncSession, term_id: UUID) -> str | None:
    return (
        await db.execute(select(AcademicTerm.name).where(AcademicTerm.id == term_id))
    ).scalar_one_or_none()


async def list_scenario_sections(
    db: AsyncSession, scenario_id: UUID
) -> list[tuple[ScenarioSection, Course, Teacher | None, TeacherProfile | None]]:
    stmt = (
        select(ScenarioSection, Course, Teacher, TeacherProfile)
        .join(Course, Course.id == ScenarioSection.course_id)
        .outerjoin(Teacher, Teacher.id == ScenarioSection.teacher_id)
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
        .where(ScenarioSection.scenario_id == scenario_id)
        .order_by(Course.code, ScenarioSection.label)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1], r[2], r[3]) for r in rows]


async def get_scenario_section(
    db: AsyncSession, scenario_id: UUID, scenario_section_id: UUID
) -> ScenarioSection | None:
    stmt = (
        select(ScenarioSection)
        .where(ScenarioSection.id == scenario_section_id)
        .where(ScenarioSection.scenario_id == scenario_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def student_ids_by_scenario_section(
    db: AsyncSession, scenario_section_ids: Sequence[UUID]
) -> dict[UUID, list[UUID]]:
    """Roster ids for several scenario sections in one query."""
    ids = list(scenario_section_ids)
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(
                ScenarioSectionStudent.scenario_section_id,
                ScenarioSectionStudent.student_id,
            ).where(ScenarioSectionStudent.scenario_section_id.in_(ids))
        )
    ).all()
    out: dict[UUID, list[UUID]] = {}
    for scenario_section_id, student_id in rows:
        out.setdefault(scenario_section_id, []).append(student_id)
    return out


async def latest_results_for_scenario_sections(
    db: AsyncSession,
    scenario_section_ids: Sequence[UUID],
) -> dict[UUID, tuple[SimulationResult, list[SimulationResultFactor], Teacher | None]]:
    """Latest result per scenario section, with factors, keyed by section id.

    Two round trips however many sections come in, rather than two per section.
    """
    ids = list(scenario_section_ids)
    if not ids:
        return {}

    rows = (
        await db.execute(
            select(SimulationResult, Teacher)
            .outerjoin(Teacher, Teacher.id == SimulationResult.recommended_teacher_id)
            .where(SimulationResult.scenario_section_id.in_(ids))
            .distinct(SimulationResult.scenario_section_id)
            .order_by(
                SimulationResult.scenario_section_id,
                desc(SimulationResult.created_at),
            )
        )
    ).all()
    if not rows:
        return {}

    factors_by_result: dict[UUID, list[SimulationResultFactor]] = {}
    factor_rows = (
        await db.execute(
            select(SimulationResultFactor)
            .where(
                SimulationResultFactor.simulation_result_id.in_(
                    [result.id for result, _rec in rows]
                )
            )
            .order_by(SimulationResultFactor.factor_name)
        )
    ).scalars().all()
    for f in factor_rows:
        factors_by_result.setdefault(f.simulation_result_id, []).append(f)

    return {
        result.scenario_section_id: (
            result,
            factors_by_result.get(result.id, []),
            recommended,
        )
        for result, recommended in rows
    }


async def students_by_scenario_section(
    db: AsyncSession,
    scenario_section_ids: Sequence[UUID],
) -> dict[UUID, list[tuple[Student, StudentProfile | None, StudentAuxProfile | None]]]:
    """Rosters for several scenario sections at once, each still ordered by name."""
    ids = list(scenario_section_ids)
    if not ids:
        return {}
    stmt = (
        select(
            ScenarioSectionStudent.scenario_section_id,
            Student,
            StudentProfile,
            StudentAuxProfile,
        )
        .join(
            ScenarioSectionStudent,
            ScenarioSectionStudent.student_id == Student.id,
        )
        .where(ScenarioSectionStudent.scenario_section_id.in_(ids))
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
    out: dict[UUID, list[tuple[Student, StudentProfile | None, StudentAuxProfile | None]]] = {}
    for ss_id, student, profile, aux in (await db.execute(stmt)).all():
        out.setdefault(ss_id, []).append((student, profile, aux))
    return out


async def latest_scores_by_scenario(
    db: AsyncSession, scenario_ids: Sequence[UUID]
) -> dict[UUID, list[int]]:
    """Each scenario's latest compatibility score per section, in one query.

    The list page averages these. Rounding stays in engines.scenario_compare,
    so this returns the raw scores rather than a mean.
    """
    ids = list(scenario_ids)
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(
                ScenarioSection.scenario_id,
                SimulationResult.compatibility_score,
            )
            .select_from(SimulationResult)
            .join(
                ScenarioSection,
                ScenarioSection.id == SimulationResult.scenario_section_id,
            )
            .where(ScenarioSection.scenario_id.in_(ids))
            .distinct(SimulationResult.scenario_section_id)
            .order_by(
                SimulationResult.scenario_section_id,
                desc(SimulationResult.created_at),
            )
        )
    ).all()
    out: dict[UUID, list[int]] = {}
    for scenario_id, score in rows:
        out.setdefault(scenario_id, []).append(score)
    return out


async def last_simulated_at_by_scenario(
    db: AsyncSession, scenario_ids: Sequence[UUID]
) -> dict[UUID, datetime | None]:
    """Finish time of each scenario's most recent successful run, in one query."""
    ids = list(scenario_ids)
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(SimulationRun.scenario_id, SimulationRun.finished_at)
            .where(SimulationRun.scenario_id.in_(ids))
            .where(SimulationRun.status == SimRunStatus.succeeded)
            .distinct(SimulationRun.scenario_id)
            .order_by(SimulationRun.scenario_id, desc(SimulationRun.created_at))
        )
    ).all()
    return {scenario_id: finished_at for scenario_id, finished_at in rows}


async def baseline_section_for(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    course_id: UUID,
    label: str,
    lock: bool = False,
) -> tuple[Section, Teacher | None, TeacherProfile | None] | None:
    """The live section matching (course, term, label) — the comparison baseline."""
    stmt = (
        select(Section, Teacher, TeacherProfile)
        .outerjoin(Teacher, Teacher.id == Section.teacher_id)
        .outerjoin(
            TeacherProfile,
            (TeacherProfile.teacher_id == Teacher.id)
            & (TeacherProfile.is_current.is_(True))
            & (TeacherProfile.deleted_at.is_(None)),
        )
        .where(Section.institution_id == institution_id)
        .where(Section.academic_term_id == academic_term_id)
        .where(Section.course_id == course_id)
        .where(Section.label == label)
        .where(Section.deleted_at.is_(None))
        .limit(1)
    )
    if lock:
        stmt = stmt.with_for_update(of=Section).execution_options(populate_existing=True)
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    return row[0], row[1], row[2]


async def section_student_ids(db: AsyncSession, section_id: UUID) -> list[UUID]:
    stmt = (
        select(SectionStudent.student_id)
        .where(SectionStudent.section_id == section_id)
        .where(SectionStudent.removed_at.is_(None))
    )
    return list((await db.execute(stmt)).scalars().all())


# ─── Writes ─────────────────────────────────────────────────────────────────

async def _validate_sections(
    db: AsyncSession, institution_id: UUID, sections: list[dict]
) -> list[dict]:
    """Check every reference against the tenant; return normalised section dicts
    with validated student ids. Raises ScenarioRefError.

    The three reference checks are resolved for the whole payload up front —
    three queries total instead of three per section — then the sections are
    validated in order, so the first error reported is unchanged.
    """
    course_ids = {s["course_id"] for s in sections if s.get("course_id") is not None}
    teacher_ids = {s["teacher_id"] for s in sections if s.get("teacher_id") is not None}
    student_ids: set[UUID] = set()
    for s in sections:
        student_ids.update(s.get("student_ids") or [])

    courses: dict[UUID, Course] = {}
    if course_ids:
        courses = {
            c.id: c
            for c in (
                await db.execute(
                    select(Course)
                    .where(Course.id.in_(course_ids))
                    .where(Course.institution_id == institution_id)
                    .where(Course.deleted_at.is_(None))
                )
            )
            .scalars()
            .all()
        }

    valid_teachers: set[UUID] = set()
    if teacher_ids:
        valid_teachers = set(
            (
                await db.execute(
                    select(Teacher.id)
                    .where(Teacher.id.in_(teacher_ids))
                    .where(Teacher.institution_id == institution_id)
                    .where(Teacher.deleted_at.is_(None))
                )
            )
            .scalars()
            .all()
        )

    valid_students: set[UUID] = set()
    if student_ids:
        valid_students = set(
            (
                await db.execute(
                    select(Student.id)
                    .where(Student.id.in_(student_ids))
                    .where(Student.institution_id == institution_id)
                    .where(Student.deleted_at.is_(None))
                )
            )
            .scalars()
            .all()
        )

    seen: set[tuple[UUID, str]] = set()
    out: list[dict] = []
    for s in sections:
        label = str(s["label"]).strip()
        if not label:
            raise ScenarioRefError("Section label is required")
        course = courses.get(s["course_id"])
        if course is None:
            raise ScenarioRefError("Course not found in your institution")
        if s["teacher_id"] not in valid_teachers:
            raise ScenarioRefError("Teacher not found in your institution")
        key = (course.id, label)
        if key in seen:
            raise ScenarioRefError(
                f"Duplicate section {course.code} {label} inside the scenario"
            )
        seen.add(key)
        requested = list(s.get("student_ids") or [])
        # Same contract as refs.valid_student_ids: the caller's order, de-duped.
        students: list[UUID] = []
        kept: set[UUID] = set()
        for sid in requested:
            if sid in valid_students and sid not in kept:
                kept.add(sid)
                students.append(sid)
        if kept != set(requested):
            raise ScenarioRefError("One or more students are not in your institution")
        out.append(
            {
                "course": course,
                "teacher_id": s["teacher_id"],
                "label": label,
                "student_ids": students,
            }
        )
    return out


def _insert_sections(
    db: AsyncSession, scenario_id: UUID, sections: list[dict]
) -> list[UUID]:
    ids: list[UUID] = []
    for s in sections:
        ss_id = uuid4()
        db.add(
            ScenarioSection(
                id=ss_id,
                scenario_id=scenario_id,
                course_id=s["course"].id,
                teacher_id=s["teacher_id"],
                label=s["label"],
            )
        )
        for sid in s["student_ids"]:
            db.add(ScenarioSectionStudent(scenario_section_id=ss_id, student_id=sid))
        ids.append(ss_id)
    return ids


async def create_scenario(
    db: AsyncSession,
    *,
    institution_id: UUID,
    created_by: UUID,
    name: str,
    notes: str | None,
    academic_term_id: UUID,
    department_id: UUID | None,
    sections: list[dict],
) -> Scenario:
    if not await refs.term_in_institution(db, academic_term_id, institution_id):
        raise ScenarioRefError("Academic term not found in your institution")
    validated = await _validate_sections(db, institution_id, sections)

    if department_id is None:
        department_id = validated[0]["course"].department_id
    elif not await refs.department_in_institution(db, department_id, institution_id):
        raise ScenarioRefError("Department not found in your institution")

    now = datetime.now(timezone.utc)
    scenario = Scenario(
        id=uuid4(),
        institution_id=institution_id,
        department_id=department_id,
        academic_term_id=academic_term_id,
        name=name.strip(),
        notes=(notes or "").strip() or None,
        status=ScenarioStatus.draft,
        scoring_config_id=None,
        created_by=created_by,
        created_at=now,
    )
    db.add(scenario)
    await db.flush()
    _insert_sections(db, scenario.id, validated)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise ScenarioRefError("Could not save scenario: duplicate section") from exc
    return scenario


async def replace_sections(
    db: AsyncSession,
    *,
    institution_id: UUID,
    scenario: Scenario,
    sections: list[dict],
) -> None:
    """Replace every section in the scenario. Prior scenario results are
    discarded via ON DELETE CASCADE; the scenario returns to `draft`."""
    validated = await _validate_sections(db, institution_id, sections)
    await db.execute(
        delete(ScenarioSection).where(ScenarioSection.scenario_id == scenario.id)
    )
    _insert_sections(db, scenario.id, validated)
    scenario.status = ScenarioStatus.draft
    scenario.updated_at = datetime.now(timezone.utc)


async def delete_scenario(db: AsyncSession, scenario: Scenario) -> None:
    await db.delete(scenario)
    await db.commit()
