"""S1 Early Warning — record actual outcomes, evaluate vs prediction, manage flags.

Layering: routers/early_warning.py → this module → engines/early_warning.py (pure).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines import early_warning as engine
from app.models.auth_user import AuthUser
from app.models.early_warning import (
    EarlyWarningFlag,
    SectionOutcome,
    WarningSeverity,
    WarningStatus,
    WarningType,
)
from app.models.institution import Course
from app.models.section import Section, SectionStudent
from app.models.simulation import PredictedOutcome, SimulationResult
from app.models.student import Student
from app.models.teacher import Teacher
from app.schemas.early_warning import (
    EarlyWarningOverview,
    EvaluateResponse,
    FlagShape,
    OutcomeEntry,
    OutcomeShape,
    SectionWarningSummary,
)
from app.schemas.sections import CourseRef
from app.services.audit import write_audit


class EarlyWarningError(Exception):
    """User-facing failure (400)."""


# ─── Shapes ─────────────────────────────────────────────────────────────────

def _flag_shape(
    f: EarlyWarningFlag,
    *,
    course: Course | None,
    section_label: str | None,
    student_name: str | None,
) -> FlagShape:
    return FlagShape(
        id=f.id,
        section_id=f.section_id,
        course=CourseRef(id=course.id, code=course.code, name=course.name) if course else None,
        section_label=section_label,
        student_id=f.student_id,
        student_name=student_name,
        type=f.type,
        severity=f.severity,
        status=f.status,
        message=f.message,
        predicted_outcome=f.predicted_outcome,
        metric_name=f.metric_name,
        expected_value=float(f.expected_value) if f.expected_value is not None else None,
        actual_value=float(f.actual_value) if f.actual_value is not None else None,
        deviation=float(f.deviation) if f.deviation is not None else None,
        week_no=f.week_no,
        evaluated_at=f.evaluated_at,
        acknowledged_at=f.acknowledged_at,
        resolved_at=f.resolved_at,
        created_at=f.created_at,
    )


# ─── Loads ──────────────────────────────────────────────────────────────────

async def latest_prediction(
    db: AsyncSession, section_id: UUID
) -> tuple[PredictedOutcome | None, int | None]:
    row = (
        await db.execute(
            select(SimulationResult.predicted_outcome, SimulationResult.compatibility_score)
            .where(SimulationResult.section_id == section_id)
            .order_by(desc(SimulationResult.created_at))
            .limit(1)
        )
    ).first()
    return (row[0], row[1]) if row else (None, None)


async def roster_names(db: AsyncSession, section_id: UUID) -> dict[UUID, str]:
    rows = (
        await db.execute(
            select(Student.id, Student.full_name)
            .join(SectionStudent, SectionStudent.student_id == Student.id)
            .where(SectionStudent.section_id == section_id)
            .where(SectionStudent.removed_at.is_(None))
        )
    ).all()
    return {r[0]: r[1] for r in rows}


async def list_outcomes(db: AsyncSession, section_id: UUID) -> list[OutcomeShape]:
    stmt = (
        select(SectionOutcome, Student.full_name, AuthUser.full_name)
        .outerjoin(Student, Student.id == SectionOutcome.student_id)
        .outerjoin(AuthUser, AuthUser.id == SectionOutcome.recorded_by)
        .where(SectionOutcome.section_id == section_id)
        .order_by(SectionOutcome.week_no.desc(), Student.full_name)
    )
    rows = (await db.execute(stmt)).all()
    return [
        OutcomeShape(
            id=o.id,
            section_id=o.section_id,
            student_id=o.student_id,
            student_name=sname,
            week_no=o.week_no,
            attendance_pct=float(o.attendance_pct) if o.attendance_pct is not None else None,
            grade_pct=float(o.grade_pct) if o.grade_pct is not None else None,
            engagement_level=o.engagement_level,
            notes=o.notes,
            recorded_by_name=uname,
            recorded_at=o.recorded_at,
        )
        for o, sname, uname in rows
    ]


async def list_flags(
    db: AsyncSession,
    institution_id: UUID,
    *,
    section_id: UUID | None = None,
    status: WarningStatus | None = None,
    limit: int = 200,
) -> list[FlagShape]:
    stmt = (
        select(EarlyWarningFlag, Course, Section.label, Student.full_name)
        .join(Section, Section.id == EarlyWarningFlag.section_id)
        .join(Course, Course.id == Section.course_id)
        .outerjoin(Student, Student.id == EarlyWarningFlag.student_id)
        .where(EarlyWarningFlag.institution_id == institution_id)
        .order_by(
            desc(EarlyWarningFlag.status == WarningStatus.open),
            desc(EarlyWarningFlag.severity == WarningSeverity.high),
            desc(EarlyWarningFlag.evaluated_at),
        )
        .limit(limit)
    )
    if section_id is not None:
        stmt = stmt.where(EarlyWarningFlag.section_id == section_id)
    if status is not None:
        stmt = stmt.where(EarlyWarningFlag.status == status)
    rows = (await db.execute(stmt)).all()
    return [
        _flag_shape(f, course=c, section_label=label, student_name=sname)
        for f, c, label, sname in rows
    ]


# ─── Writes ─────────────────────────────────────────────────────────────────

async def record_outcomes(
    db: AsyncSession,
    *,
    institution_id: UUID,
    user: AuthUser,
    section: Section,
    week_no: int,
    entries: list[OutcomeEntry],
) -> int:
    """Upsert one row per (section, student, week). Caller commits."""
    roster = await roster_names(db, section.id)
    now = datetime.now(timezone.utc)
    saved = 0
    for e in entries:
        if e.student_id is not None and e.student_id not in roster:
            raise EarlyWarningError("One of the students is not enrolled in this section")
        if e.attendance_pct is None and e.grade_pct is None and e.engagement_level is None:
            continue
        stmt = (
            select(SectionOutcome)
            .where(SectionOutcome.section_id == section.id)
            .where(SectionOutcome.week_no == week_no)
            .where(
                SectionOutcome.student_id == e.student_id
                if e.student_id is not None
                else SectionOutcome.student_id.is_(None)
            )
        )
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            row = SectionOutcome(
                id=uuid4(),
                institution_id=institution_id,
                section_id=section.id,
                student_id=e.student_id,
                week_no=week_no,
                recorded_at=now,
            )
            db.add(row)
        row.attendance_pct = e.attendance_pct
        row.grade_pct = e.grade_pct
        row.engagement_level = e.engagement_level
        row.notes = e.notes
        row.recorded_by = user.id
        row.recorded_at = now
        saved += 1
    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user.id,
        action="section.outcomes.record",
        entity_type="section",
        entity_id=section.id,
        payload={"week_no": week_no, "rows": saved},
    )
    return saved


async def evaluate_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    user: AuthUser,
    section: Section,
) -> EvaluateResponse:
    """Run the comparator and reconcile flags: open new, refresh existing,
    auto-resolve those no longer produced. Caller commits."""
    predicted, score = await latest_prediction(db, section.id)
    names = await roster_names(db, section.id)
    outcomes = list(
        (
            await db.execute(
                select(SectionOutcome).where(SectionOutcome.section_id == section.id)
            )
        ).scalars().all()
    )
    samples = [
        engine.OutcomeSample(
            student_id=o.student_id,
            week_no=o.week_no,
            attendance_pct=float(o.attendance_pct) if o.attendance_pct is not None else None,
            grade_pct=float(o.grade_pct) if o.grade_pct is not None else None,
            engagement_level=o.engagement_level.value if o.engagement_level else None,
        )
        for o in outcomes
    ]
    drafts = engine.evaluate(
        predicted_outcome=predicted.value if predicted else None,
        compatibility_score=score,
        samples=samples,
        roster_size=len(names),
        names=names,
    )

    now = datetime.now(timezone.utc)
    existing = list(
        (
            await db.execute(
                select(EarlyWarningFlag)
                .where(EarlyWarningFlag.section_id == section.id)
                .where(EarlyWarningFlag.status != WarningStatus.resolved)
            )
        ).scalars().all()
    )
    by_key = {(f.student_id, f.type.value): f for f in existing}
    opened = updated = 0
    seen: set[tuple[UUID | None, str]] = set()
    for d in drafts:
        key = (d.student_id, d.type)
        seen.add(key)
        f = by_key.get(key)
        if f is None:
            db.add(
                EarlyWarningFlag(
                    id=uuid4(),
                    institution_id=institution_id,
                    section_id=section.id,
                    student_id=d.student_id,
                    type=WarningType(d.type),
                    severity=WarningSeverity(d.severity),
                    status=WarningStatus.open,
                    message=d.message,
                    predicted_outcome=predicted,
                    metric_name=d.metric_name,
                    expected_value=d.expected_value,
                    actual_value=d.actual_value,
                    deviation=d.deviation,
                    week_no=d.week_no,
                    evaluated_at=now,
                    created_at=now,
                )
            )
            opened += 1
        else:
            f.severity = WarningSeverity(d.severity)
            f.message = d.message
            f.metric_name = d.metric_name
            f.expected_value = d.expected_value
            f.actual_value = d.actual_value
            f.deviation = d.deviation
            f.week_no = d.week_no
            f.evaluated_at = now
            f.predicted_outcome = predicted
            updated += 1
    auto_resolved = 0
    for f in existing:
        if (f.student_id, f.type.value) not in seen:
            f.status = WarningStatus.resolved
            f.resolved_at = now
            auto_resolved += 1

    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user.id,
        action="section.early_warning.evaluate",
        entity_type="section",
        entity_id=section.id,
        payload={"opened": opened, "updated": updated, "auto_resolved": auto_resolved},
    )
    await db.flush()

    weeks = len({o.week_no for o in outcomes})
    flags = await list_flags(db, institution_id, section_id=section.id)
    return EvaluateResponse(
        section_id=section.id,
        predicted_outcome=predicted,
        compatibility_score=score,
        weeks_recorded=weeks,
        flags=flags,
        opened=opened,
        updated=updated,
        auto_resolved=auto_resolved,
    )


async def set_flag_status(
    db: AsyncSession,
    *,
    institution_id: UUID,
    user: AuthUser,
    flag: EarlyWarningFlag,
    status: WarningStatus,
) -> None:
    now = datetime.now(timezone.utc)
    flag.status = status
    if status == WarningStatus.acknowledged:
        flag.acknowledged_by = user.id
        flag.acknowledged_at = now
    elif status == WarningStatus.resolved:
        flag.resolved_at = now
    else:
        flag.resolved_at = None
    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user.id,
        action="early_warning.flag.status",
        entity_type="early_warning_flag",
        entity_id=flag.id,
        payload={"status": status.value},
    )


# ─── Overview ───────────────────────────────────────────────────────────────

async def overview(db: AsyncSession, institution_id: UUID) -> EarlyWarningOverview:
    open_rows = list(
        (
            await db.execute(
                select(EarlyWarningFlag)
                .where(EarlyWarningFlag.institution_id == institution_id)
                .where(EarlyWarningFlag.status != WarningStatus.resolved)
            )
        ).scalars().all()
    )
    by_sev: dict[str, int] = {s.value: 0 for s in WarningSeverity}
    by_type: dict[str, int] = {t.value: 0 for t in WarningType}
    open_by_section: dict[UUID, list[EarlyWarningFlag]] = {}
    for f in open_rows:
        by_sev[f.severity.value] += 1
        by_type[f.type.value] += 1
        open_by_section.setdefault(f.section_id, []).append(f)

    # Sections worth watching: active/simulated ones (and any with data or flags).
    stmt = (
        select(Section, Course, Teacher.full_name)
        .join(Course, Course.id == Section.course_id)
        .outerjoin(Teacher, Teacher.id == Section.teacher_id)
        .where(Section.institution_id == institution_id)
        .where(Section.deleted_at.is_(None))
        .order_by(Course.code, Section.label)
    )
    sections = (await db.execute(stmt)).all()

    week_stats = {
        r[0]: (int(r[1] or 0), r[2])
        for r in (
            await db.execute(
                select(
                    SectionOutcome.section_id,
                    func.count(func.distinct(SectionOutcome.week_no)),
                    func.max(SectionOutcome.week_no),
                )
                .where(SectionOutcome.institution_id == institution_id)
                .group_by(SectionOutcome.section_id)
            )
        ).all()
    }

    summaries: list[SectionWarningSummary] = []
    for sec, course, teacher_name in sections:
        predicted, score = await latest_prediction(db, sec.id)
        weeks, latest = week_stats.get(sec.id, (0, None))
        flags = open_by_section.get(sec.id, [])
        if sec.state.value not in ("active", "simulated") and not weeks and not flags:
            continue
        summaries.append(
            SectionWarningSummary(
                section_id=sec.id,
                course=CourseRef(id=course.id, code=course.code, name=course.name),
                label=sec.label,
                state=sec.state.value,
                teacher_name=teacher_name,
                predicted_outcome=predicted,
                compatibility_score=score,
                weeks_recorded=weeks,
                latest_week=latest,
                open_flags=len(flags),
                high_flags=sum(1 for f in flags if f.severity == WarningSeverity.high),
            )
        )

    return EarlyWarningOverview(
        open_total=len(open_rows),
        by_severity=by_sev,
        by_type=by_type,
        sections=summaries,
    )
