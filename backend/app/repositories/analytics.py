"""Analytics aggregations for the institution_admin panel.

Every function here costs one round trip per metric, not one per row: the DB
is a remote pooler, so a "for dept in depts: await db.execute(...)" loop pays
a full network RTT per department. Counts that used to be looped are now
expressed as FILTER (WHERE ...) aggregates or GROUP BY queries merged in
Python against the already-ordered department list.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import Select, func, select
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
    sections requires a join through courses. The five figures aggregate
    different tables, so they ship as scalar subqueries inside one SELECT
    instead of four separate statements.
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
    sim_count_q = (
        select(func.count())
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .where(SimulationRun.institution_id == institution_id)
    )
    sim_avg_q = (
        select(func.avg(SimulationResult.compatibility_score))
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .where(SimulationRun.institution_id == institution_id)
    )

    if department_id is not None:
        student_q = student_q.where(Student.department_id == department_id)
        teacher_q = teacher_q.where(Teacher.department_id == department_id)
        section_q = section_q.join(
            Course, Course.id == Section.course_id
        ).where(Course.department_id == department_id)

        def _scope_sims(q: Select) -> Select:
            """Same join chain the count and the average both need."""
            return (
                q.join(Section, Section.id == SimulationResult.section_id)
                .join(Course, Course.id == Section.course_id)
                .where(Course.department_id == department_id)
            )

        sim_count_q = _scope_sims(sim_count_q)
        sim_avg_q = _scope_sims(sim_avg_q)

    row = (
        await db.execute(
            select(
                student_q.scalar_subquery().label("student_count"),
                teacher_q.scalar_subquery().label("teacher_count"),
                section_q.scalar_subquery().label("section_count"),
                sim_count_q.scalar_subquery().label("simulation_count"),
                sim_avg_q.scalar_subquery().label("avg_score"),
            )
        )
    ).one()

    return {
        "student_count": row.student_count or 0,
        "teacher_count": row.teacher_count or 0,
        "section_count": row.section_count or 0,
        "simulation_count": row.simulation_count or 0,
        "avg_compatibility_score": (
            float(row.avg_score) if row.avg_score is not None else None
        ),
    }


async def fslsm_distribution(
    db: AsyncSession, institution_id: UUID, *, department_id: UUID | None = None
) -> dict:
    """Per-axis breakdown of pole_a vs pole_b across current student profiles.

    pole_a = score > 0 (e.g. Active), pole_b = score < 0 (e.g. Reflective).
    Score 0 is impossible (DB CHECK enforces odd values in [-11, 11]).

    All nine figures (total, plus two poles for each of the four axes) share
    one WHERE clause, so they are one SELECT of COUNT(*) FILTER aggregates.
    """
    cols = [func.count().label("total")]
    for axis_key, col_name, _pole_a, _pole_b in AXES:
        col = getattr(StudentProfile, col_name)
        cols.append(func.count().filter(col > 0).label(f"{axis_key}__a"))
        cols.append(func.count().filter(col < 0).label(f"{axis_key}__b"))

    stmt = (
        select(*cols)
        .select_from(StudentProfile)
        .join(Student, Student.id == StudentProfile.student_id)
        .where(StudentProfile.institution_id == institution_id)
        .where(StudentProfile.is_current.is_(True))
        .where(StudentProfile.deleted_at.is_(None))
        .where(Student.deleted_at.is_(None))
    )
    if department_id is not None:
        stmt = stmt.where(Student.department_id == department_id)

    row = (await db.execute(stmt)).one()

    return {
        "total_profiles": row.total or 0,
        "axes": [
            {
                "axis": axis_key,
                "pole_a_count": getattr(row, f"{axis_key}__a") or 0,
                "pole_b_count": getattr(row, f"{axis_key}__b") or 0,
                "pole_a_label": pole_a_label,
                "pole_b_label": pole_b_label,
            }
            for axis_key, _col_name, pole_a_label, pole_b_label in AXES
        ],
    }


async def departments_rollup(db: AsyncSession, institution_id: UUID) -> list[dict]:
    """One row per department: student/teacher/section counts + sim stats.

    Four GROUP BY aggregates for the whole institution, merged onto the
    ordered department list. A department with no matching rows keeps its
    zero counts and a null average, exactly as the per-department version
    returned.
    """
    depts = list(
        (
            await db.execute(
                select(Department)
                .where(Department.institution_id == institution_id)
                .where(Department.deleted_at.is_(None))
                .order_by(Department.name)
            )
        )
        .scalars()
        .all()
    )
    if not depts:
        return []

    student_stmt = (
        select(Student.department_id, func.count())
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
        .group_by(Student.department_id)
    )
    teacher_stmt = (
        select(Teacher.department_id, func.count())
        .where(Teacher.institution_id == institution_id)
        .where(Teacher.deleted_at.is_(None))
        .group_by(Teacher.department_id)
    )
    section_stmt = (
        select(Course.department_id, func.count())
        .select_from(Section)
        .join(Course, Course.id == Section.course_id)
        .where(Section.institution_id == institution_id)
        .where(Section.deleted_at.is_(None))
        .group_by(Course.department_id)
    )
    sim_stmt = (
        select(
            Course.department_id,
            func.count(),
            func.avg(SimulationResult.compatibility_score),
        )
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .join(Section, Section.id == SimulationResult.section_id)
        .join(Course, Course.id == Section.course_id)
        .where(SimulationRun.institution_id == institution_id)
        .group_by(Course.department_id)
    )

    students_by_dept = {r[0]: r[1] for r in (await db.execute(student_stmt)).all()}
    teachers_by_dept = {r[0]: r[1] for r in (await db.execute(teacher_stmt)).all()}
    sections_by_dept = {r[0]: r[1] for r in (await db.execute(section_stmt)).all()}
    sims_by_dept = {r[0]: (r[1], r[2]) for r in (await db.execute(sim_stmt)).all()}

    rollups: list[dict] = []
    for d in depts:
        sim_count, sim_avg = sims_by_dept.get(d.id, (0, None))
        rollups.append(
            {
                "department_id": d.id,
                "department_name": d.name,
                "department_code": d.code,
                "student_count": students_by_dept.get(d.id, 0) or 0,
                "teacher_count": teachers_by_dept.get(d.id, 0) or 0,
                "section_count": sections_by_dept.get(d.id, 0) or 0,
                "avg_compatibility_score": (
                    float(sim_avg) if sim_avg is not None else None
                ),
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


async def simulations_by_department(
    db: AsyncSession, institution_id: UUID, *, days: int = 30
) -> list[dict]:
    """Runs in the last N days + average score, per department (via section → course).

    One GROUP BY query covering every department, not one query each.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    depts = list(
        (
            await db.execute(
                select(Department)
                .where(Department.institution_id == institution_id)
                .where(Department.deleted_at.is_(None))
                .order_by(Department.name)
            )
        )
        .scalars()
        .all()
    )
    if not depts:
        return []

    stmt = (
        select(
            Course.department_id,
            func.count(SimulationResult.id),
            func.avg(SimulationResult.compatibility_score),
        )
        .select_from(SimulationResult)
        .join(SimulationRun, SimulationRun.id == SimulationResult.simulation_run_id)
        .join(Section, Section.id == SimulationResult.section_id)
        .join(Course, Course.id == Section.course_id)
        .where(SimulationRun.institution_id == institution_id)
        .where(SimulationResult.created_at >= cutoff)
        .group_by(Course.department_id)
    )
    by_dept = {r[0]: (r[1], r[2]) for r in (await db.execute(stmt)).all()}

    out: list[dict] = []
    for d in depts:
        runs, avg = by_dept.get(d.id, (0, None))
        out.append(
            {
                "department_id": d.id,
                "department_name": d.name,
                "department_code": d.code,
                "runs_last_30d": int(runs or 0),
                "avg_score": float(avg) if avg is not None else None,
            }
        )
    return out
