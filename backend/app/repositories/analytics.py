"""Analytics aggregations for the institution_admin panel."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import Course, Department
from app.models.section import Section
from app.models.simulation import SimulationResult, SimulationRun
from app.models.student import Student, StudentProfile
from app.models.teacher import Teacher


# 4 FSLSM axes; pole labels mirror lib/types.ts FSLSM_AXES on the frontend
AXES: list[tuple[str, str, str, str]] = [
    ("active_reflective", "active_reflective_score", "Active", "Reflective"),
    ("sensing_intuitive", "sensing_intuitive_score", "Sensing", "Intuitive"),
    ("visual_verbal", "visual_verbal_score", "Visual", "Verbal"),
    ("sequential_global", "sequential_global_score", "Sequential", "Global"),
]


async def institution_counts(
    db: AsyncSession, institution_id: UUID, *, department_id: UUID | None = None
) -> dict:
    """Top-line counts for the institution (optionally filtered to one dept).

    Sections link to courses, courses to departments — so dept-filtering
    sections requires a join through courses.
    """
    student_q = (
        select(func.count())
        .select_from(Student)
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
    )
    teacher_q = (
        select(func.count())
        .select_from(Teacher)
        .where(Teacher.institution_id == institution_id)
        .where(Teacher.deleted_at.is_(None))
    )
    section_q = (
        select(func.count())
        .select_from(Section)
        .where(Section.institution_id == institution_id)
        .where(Section.deleted_at.is_(None))
    )
    sim_q = (
        select(func.count(), func.avg(SimulationResult.compatibility_score))
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .where(SimulationRun.institution_id == institution_id)
    )

    if department_id is not None:
        student_q = student_q.where(Student.department_id == department_id)
        teacher_q = teacher_q.where(Teacher.department_id == department_id)
        section_q = (
            section_q.join(Course, Course.id == Section.course_id)
            .where(Course.department_id == department_id)
        )
        sim_q = (
            sim_q.join(Section, Section.id == SimulationResult.section_id)
            .join(Course, Course.id == Section.course_id)
            .where(Course.department_id == department_id)
        )

    student_count = (await db.execute(student_q)).scalar_one() or 0
    teacher_count = (await db.execute(teacher_q)).scalar_one() or 0
    section_count = (await db.execute(section_q)).scalar_one() or 0
    sim_row = (await db.execute(sim_q)).first()
    sim_count = sim_row[0] if sim_row else 0
    avg_score = float(sim_row[1]) if sim_row and sim_row[1] is not None else None

    return {
        "student_count": student_count,
        "teacher_count": teacher_count,
        "section_count": section_count,
        "simulation_count": sim_count or 0,
        "avg_compatibility_score": avg_score,
    }


async def fslsm_distribution(
    db: AsyncSession, institution_id: UUID, *, department_id: UUID | None = None
) -> dict:
    """Per-axis breakdown of pole_a vs pole_b across current student profiles.

    pole_a = score > 0 (e.g. Active), pole_b = score < 0 (e.g. Reflective).
    Score 0 is impossible (DB CHECK enforces odd values in [-11, 11]).
    """
    total_q = (
        select(func.count())
        .select_from(StudentProfile)
        .join(Student, Student.id == StudentProfile.student_id)
        .where(StudentProfile.institution_id == institution_id)
        .where(StudentProfile.is_current.is_(True))
        .where(StudentProfile.deleted_at.is_(None))
        .where(Student.deleted_at.is_(None))
    )
    if department_id is not None:
        total_q = total_q.where(Student.department_id == department_id)
    total = (await db.execute(total_q)).scalar_one() or 0

    axes_out: list[dict] = []
    for axis_key, col_name, pole_a_label, pole_b_label in AXES:
        col = getattr(StudentProfile, col_name)

        def _count(sign_filter):
            q = (
                select(func.count())
                .select_from(StudentProfile)
                .join(Student, Student.id == StudentProfile.student_id)
                .where(StudentProfile.institution_id == institution_id)
                .where(StudentProfile.is_current.is_(True))
                .where(StudentProfile.deleted_at.is_(None))
                .where(Student.deleted_at.is_(None))
                .where(sign_filter)
            )
            if department_id is not None:
                q = q.where(Student.department_id == department_id)
            return q

        a = (await db.execute(_count(col > 0))).scalar_one() or 0
        b = (await db.execute(_count(col < 0))).scalar_one() or 0

        axes_out.append(
            {
                "axis": axis_key,
                "pole_a_count": a,
                "pole_b_count": b,
                "pole_a_label": pole_a_label,
                "pole_b_label": pole_b_label,
            }
        )

    return {"total_profiles": total, "axes": axes_out}


async def departments_rollup(db: AsyncSession, institution_id: UUID) -> list[dict]:
    """One row per department: student/teacher/section counts + sim stats."""
    stmt = (
        select(Department)
        .where(Department.institution_id == institution_id)
        .where(Department.deleted_at.is_(None))
        .order_by(Department.name)
    )
    depts = list((await db.execute(stmt)).scalars().all())

    rollups: list[dict] = []
    for d in depts:
        s_q = (
            select(func.count())
            .select_from(Student)
            .where(Student.institution_id == institution_id)
            .where(Student.department_id == d.id)
            .where(Student.deleted_at.is_(None))
        )
        t_q = (
            select(func.count())
            .select_from(Teacher)
            .where(Teacher.institution_id == institution_id)
            .where(Teacher.department_id == d.id)
            .where(Teacher.deleted_at.is_(None))
        )
        sec_q = (
            select(func.count())
            .select_from(Section)
            .join(Course, Course.id == Section.course_id)
            .where(Section.institution_id == institution_id)
            .where(Course.department_id == d.id)
            .where(Section.deleted_at.is_(None))
        )
        sim_q = (
            select(func.count(), func.avg(SimulationResult.compatibility_score))
            .select_from(SimulationResult)
            .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
            .join(Section, Section.id == SimulationResult.section_id)
            .join(Course, Course.id == Section.course_id)
            .where(SimulationRun.institution_id == institution_id)
            .where(Course.department_id == d.id)
        )

        s_count = (await db.execute(s_q)).scalar_one() or 0
        t_count = (await db.execute(t_q)).scalar_one() or 0
        sec_count = (await db.execute(sec_q)).scalar_one() or 0
        sim_row = (await db.execute(sim_q)).first()
        sim_count = sim_row[0] if sim_row else 0
        avg_score = float(sim_row[1]) if sim_row and sim_row[1] is not None else None

        rollups.append(
            {
                "department_id": d.id,
                "department_name": d.name,
                "department_code": d.code,
                "student_count": s_count,
                "teacher_count": t_count,
                "section_count": sec_count,
                "avg_compatibility_score": avg_score,
                "simulations_run": sim_count or 0,
            }
        )
    return rollups


async def score_trend(
    db: AsyncSession,
    institution_id: UUID,
    *,
    weeks: int = 12,
) -> list[dict]:
    """Average compatibility score per ISO week for the last N weeks."""
    cutoff = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    bucket = func.date_trunc("week", SimulationResult.created_at).label("bucket")
    stmt = (
        select(
            bucket,
            func.avg(SimulationResult.compatibility_score).label("avg_score"),
            func.count(SimulationResult.id).label("runs"),
        )
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .where(SimulationRun.institution_id == institution_id)
        .where(SimulationResult.created_at >= cutoff)
        .group_by(bucket)
        .order_by(bucket)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "bucket_start": r[0].date() if hasattr(r[0], "date") else r[0],
            "avg_score": float(r[1]) if r[1] is not None else 0.0,
            "runs": int(r[2] or 0),
        }
        for r in rows
    ]
