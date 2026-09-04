"""Tenant-scoped queries + writes for scenarios (F5)."""

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
from app.models.simulation import SimulationResult, SimulationResultFactor
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


async def scenario_section_student_ids(
    db: AsyncSession, scenario_section_id: UUID
) -> list[UUID]:
    stmt = select(ScenarioSectionStudent.student_id).where(
        ScenarioSectionStudent.scenario_section_id == scenario_section_id
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_scenario_section_students(
    db: AsyncSession, scenario_section_id: UUID
) -> list[tuple[Student, StudentProfile | None, StudentAuxProfile | None]]:
    stmt = (
        select(Student, StudentProfile, StudentAuxProfile)
        .join(
            ScenarioSectionStudent,
            ScenarioSectionStudent.student_id == Student.id,
        )
        .where(ScenarioSectionStudent.scenario_section_id == scenario_section_id)
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


async def latest_result_for_scenario_section(
    db: AsyncSession, scenario_section_id: UUID
) -> tuple[SimulationResult, list[SimulationResultFactor], Teacher | None] | None:
    stmt = (
        select(SimulationResult, Teacher)
        .outerjoin(Teacher, Teacher.id == SimulationResult.recommended_teacher_id)
        .where(SimulationResult.scenario_section_id == scenario_section_id)
        .order_by(desc(SimulationResult.created_at))
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        return None
    result: SimulationResult = row[0]
    factors = list(
        (
            await db.execute(
                select(SimulationResultFactor)
                .where(SimulationResultFactor.simulation_result_id == result.id)
                .order_by(SimulationResultFactor.factor_name)
            )
        ).scalars().all()
    )
    return result, factors, row[1]


async def baseline_section_for(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    course_id: UUID,
    label: str,
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
    with validated student ids. Raises ScenarioRefError."""
    seen: set[tuple[UUID, str]] = set()
    out: list[dict] = []
    for s in sections:
        label = str(s["label"]).strip()
        if not label:
            raise ScenarioRefError("Section label is required")
        course = await refs.get_course_in_institution(db, s["course_id"], institution_id)
        if course is None:
            raise ScenarioRefError("Course not found in your institution")
        if not await refs.teacher_in_institution(db, s["teacher_id"], institution_id):
            raise ScenarioRefError("Teacher not found in your institution")
        key = (course.id, label)
        if key in seen:
            raise ScenarioRefError(
                f"Duplicate section {course.code} {label} inside the scenario"
            )
        seen.add(key)
        students = await refs.valid_student_ids(
            db, list(s.get("student_ids") or []), institution_id
        )
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
        await db.commit()
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
