"""F5 — what-if scenarios: build, simulate, compare, apply.

Layering: routers/scenarios.py → this module → repositories/scenarios.py +
services/compatibility_service.py (shared engine path) + engines/scenario_compare.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines import scenario_compare as cmp
from app.models.scenario import Scenario, ScenarioStatus
from app.models.section import Section, SectionState, SectionStudent
from app.models.simulation import SimRunStatus, SimulationResult, SimulationRun
from app.models.teacher import Teacher
from app.repositories import scenarios as repo
from app.repositories import sections as sections_repo
from app.schemas.scenarios import (
    AppliedSectionShape,
    FactorDeltaShape,
    RosterDiffShape,
    ScenarioApplyResponse,
    ScenarioCompareResponse,
    ScenarioCompareRow,
    ScenarioCreate,
    ScenarioDetail,
    ScenarioListItem,
    ScenarioSectionInput,
    ScenarioSectionShape,
    ScenarioSimulateResponse,
    ScenarioUpdate,
)
from app.schemas.sections import (
    CourseRef,
    SimulationFactorShape,
    SimulationResultShape,
    TeacherRef,
)
from app.schemas.students import StudentListItem
from app.schemas.teachers import TeacherProfileShape
from app.services import compatibility_service as compat
from app.services.audit import write_audit


class ScenarioError(Exception):
    """User-facing failure (400) from the scenario flows."""


# ─── Shape builders ─────────────────────────────────────────────────────────

def _teacher_ref(teacher, profile) -> TeacherRef | None:
    if teacher is None:
        return None
    return TeacherRef(
        id=teacher.id,
        full_name=teacher.full_name,
        email=teacher.email,
        profile=TeacherProfileShape.model_validate(profile) if profile else None,
    )


def _result_shape(bundle) -> SimulationResultShape | None:
    if not bundle:
        return None
    result, factors, recommended = bundle
    return SimulationResultShape(
        id=result.id,
        compatibility_score=result.compatibility_score,
        predicted_outcome=result.predicted_outcome,
        social_graph_impact=result.social_graph_impact,
        style_distribution=result.style_distribution,
        recommended_teacher_id=result.recommended_teacher_id,
        recommended_teacher_name=recommended.full_name if recommended else None,
        factors=[
            SimulationFactorShape(
                factor_name=f.factor_name,
                score=f.score,
                weight=float(f.weight),
                impact=f.impact,
            )
            for f in factors
        ],
    )


def _section_shape(ss, course, teacher, t_profile, enrolled, result) -> ScenarioSectionShape:
    """Build one section's shape from already-fetched roster and result rows."""
    students = [
        StudentListItem(
            id=s.id,
            full_name=s.full_name,
            external_id=s.external_id,
            email=s.email,
            dominant_axis=p.dominant_axis if p else None,
            collaboration_pref=a.collaboration_pref if a else None,
            participation_level=a.participation_level if a else None,
        )
        for (s, p, a) in enrolled
    ]
    return ScenarioSectionShape(
        id=ss.id,
        course=CourseRef(id=course.id, code=course.code, name=course.name),
        teacher=_teacher_ref(teacher, t_profile),
        label=ss.label,
        student_count=len(students),
        students=students,
        latest_result=_result_shape(result),
    )


async def _sections_with_results(
    db: AsyncSession, scenario_id: UUID
) -> list[ScenarioSectionShape]:
    """A scenario's full section shapes in four queries, not three per section."""
    rows = await repo.list_scenario_sections(db, scenario_id)
    ss_ids = [ss.id for ss, _c, _t, _tp in rows]
    rosters = await repo.students_by_scenario_section(db, ss_ids)
    results = await repo.latest_results_for_scenario_sections(db, ss_ids)
    return [
        _section_shape(ss, c, t, tp, rosters.get(ss.id, []), results.get(ss.id))
        for (ss, c, t, tp) in rows
    ]


def _summary(sections: list[ScenarioSectionShape]) -> tuple[float | None, datetime | None]:
    scores = [s.latest_result.compatibility_score for s in sections if s.latest_result]
    return cmp.average(scores), None


async def _last_simulated_at(db: AsyncSession, scenario_id: UUID) -> datetime | None:
    stmt = (
        select(SimulationRun.finished_at)
        .where(SimulationRun.scenario_id == scenario_id)
        .where(SimulationRun.status == SimRunStatus.succeeded)
        .order_by(SimulationRun.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _list_item(
    scenario: Scenario,
    term_name: str | None,
    section_count: int,
    avg_score: float | None,
    last_simulated_at: datetime | None,
) -> ScenarioListItem:
    """The list row itself. Shared so the one-scenario and the batched paths
    cannot drift apart."""
    return ScenarioListItem(
        id=scenario.id,
        name=scenario.name,
        notes=scenario.notes,
        status=scenario.status,
        academic_term_id=scenario.academic_term_id,
        academic_term_name=term_name,
        department_id=scenario.department_id,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        section_count=section_count,
        avg_score=avg_score,
        last_simulated_at=last_simulated_at,
    )


async def build_list_item(
    db: AsyncSession, scenario: Scenario, term_name: str | None, section_count: int
) -> ScenarioListItem:
    """One scenario's list row. For a whole list use `build_list_items`."""
    sections = await _sections_with_results(db, scenario.id)
    avg, _ = _summary(sections)
    return _list_item(
        scenario,
        term_name,
        section_count,
        avg,
        await _last_simulated_at(db, scenario.id),
    )


async def build_list_items(
    db: AsyncSession, rows: list[tuple[Scenario, str | None, int]]
) -> list[ScenarioListItem]:
    """Every scenario's list row in two queries.

    A list row shows only an average score and the last run time, so this does
    not assemble the section shapes `build_detail` needs. Calling
    `build_list_item` per scenario did, which cost three queries per scenario
    section plus one per scenario — and it pulled every student roster purely
    to average the scores.
    """
    if not rows:
        return []
    scenario_ids = [scenario.id for scenario, _term, _count in rows]
    scores = await repo.latest_scores_by_scenario(db, scenario_ids)
    last_runs = await repo.last_simulated_at_by_scenario(db, scenario_ids)
    return [
        _list_item(
            scenario,
            term_name,
            section_count,
            cmp.average(scores.get(scenario.id, [])),
            last_runs.get(scenario.id),
        )
        for scenario, term_name, section_count in rows
    ]


async def build_detail(db: AsyncSession, scenario: Scenario) -> ScenarioDetail:
    sections = await _sections_with_results(db, scenario.id)
    avg, _ = _summary(sections)
    return ScenarioDetail(
        id=scenario.id,
        name=scenario.name,
        notes=scenario.notes,
        status=scenario.status,
        academic_term_id=scenario.academic_term_id,
        academic_term_name=await repo.term_name(db, scenario.academic_term_id),
        department_id=scenario.department_id,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
        section_count=len(sections),
        avg_score=avg,
        last_simulated_at=await _last_simulated_at(db, scenario.id),
        sections=sections,
    )


# ─── Create / update / delete ───────────────────────────────────────────────

def _section_dicts(sections: list[ScenarioSectionInput]) -> list[dict]:
    return [
        {
            "course_id": s.course_id,
            "teacher_id": s.teacher_id,
            "label": s.label,
            "student_ids": s.student_ids,
        }
        for s in sections
    ]


async def create_scenario(
    db: AsyncSession, *, institution_id: UUID, user_id: UUID, body: ScenarioCreate
) -> Scenario:
    try:
        scenario = await repo.create_scenario(
            db,
            institution_id=institution_id,
            created_by=user_id,
            name=body.name,
            notes=body.notes,
            academic_term_id=body.academic_term_id,
            department_id=body.department_id,
            sections=_section_dicts(body.sections),
        )
    except repo.ScenarioRefError as exc:
        raise ScenarioError(str(exc)) from exc

    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user_id,
        action="scenario.create",
        entity_type="scenario",
        entity_id=scenario.id,
        payload={"name": scenario.name, "sections": len(body.sections)},
    )
    await db.commit()
    return scenario


async def update_scenario(
    db: AsyncSession,
    *,
    institution_id: UUID,
    user_id: UUID,
    scenario: Scenario,
    body: ScenarioUpdate,
) -> Scenario:
    if scenario.status == ScenarioStatus.applied:
        raise ScenarioError("An applied scenario is read-only")
    changes: dict[str, object] = {}
    fields = body.model_fields_set
    if "name" in fields and body.name:
        scenario.name = body.name.strip()
        changes["name"] = scenario.name
    if "notes" in fields:
        scenario.notes = (body.notes or "").strip() or None
        changes["notes"] = scenario.notes
    if body.sections is not None:
        try:
            await repo.replace_sections(
                db,
                institution_id=institution_id,
                scenario=scenario,
                sections=_section_dicts(body.sections),
            )
        except repo.ScenarioRefError as exc:
            await db.rollback()
            raise ScenarioError(str(exc)) from exc
        changes["sections"] = len(body.sections)
    if changes:
        scenario.updated_at = datetime.now(timezone.utc)
        await write_audit(
            db,
            institution_id=institution_id,
            actor_user_id=user_id,
            action="scenario.update",
            entity_type="scenario",
            entity_id=scenario.id,
            payload=changes,
        )
        await db.commit()
    return scenario


async def delete_scenario(
    db: AsyncSession, *, institution_id: UUID, user_id: UUID, scenario: Scenario
) -> None:
    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user_id,
        action="scenario.delete",
        entity_type="scenario",
        entity_id=scenario.id,
        payload={"name": scenario.name},
    )
    await repo.delete_scenario(db, scenario)


async def clone_from_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    user_id: UUID,
    section_id: UUID,
    name: str | None,
) -> Scenario:
    """Start a scenario from a real section's current assignment."""
    bundle = await sections_repo.get_section(db, institution_id, section_id)
    if not bundle:
        raise ScenarioError("Section not found")
    sec, course, teacher, _ = bundle
    if teacher is None:
        raise ScenarioError(
            "Assign a teacher to the section before cloning it into a scenario"
        )
    student_ids = await repo.section_student_ids(db, sec.id)
    body = ScenarioCreate(
        name=name or f"What-if: {course.code} {sec.label}",
        notes=f"Cloned from live section {course.code} {sec.label}",
        academic_term_id=sec.academic_term_id,
        department_id=course.department_id,
        sections=[
            ScenarioSectionInput(
                course_id=course.id,
                teacher_id=teacher.id,
                label=sec.label,
                student_ids=student_ids,
            )
        ],
    )
    return await create_scenario(
        db, institution_id=institution_id, user_id=user_id, body=body
    )


# ─── Simulate ───────────────────────────────────────────────────────────────

async def simulate_scenario(
    db: AsyncSession, *, institution_id: UUID, user_id: UUID, scenario: Scenario
) -> ScenarioSimulateResponse:
    """One simulation_run for the scenario, one result per scenario section."""
    if scenario.status == ScenarioStatus.applied:
        raise ScenarioError("An applied scenario cannot be re-simulated")

    rows = await repo.list_scenario_sections(db, scenario.id)
    if not rows:
        raise ScenarioError("Scenario has no sections")

    now = datetime.now(timezone.utc)
    run = SimulationRun(
        id=uuid4(),
        institution_id=institution_id,
        scenario_id=scenario.id,
        section_id=None,
        scoring_config_id=uuid4(),  # replaced below once we know the config
        engine_version=compat.ENGINE_VERSION,
        status=SimRunStatus.running,
        started_at=now,
        triggered_by=user_id,
        created_at=now,
    )

    # The scoring config, the teacher candidates and every roster's profiles,
    # aux rows and peer edges are loaded once for the run. Scoring a roster
    # used to re-fetch all of that, so this was seven queries per section.
    try:
        context = await compat.load_scoring_context(db, institution_id)
    except compat.SimulateError as exc:
        raise ScenarioError(str(exc)) from exc

    ids_by_section = await repo.student_ids_by_scenario_section(
        db, [ss.id for ss, _c, _t, _tp in rows]
    )
    preload = await compat.load_roster_preload(
        db,
        institution_id=institution_id,
        academic_term_id=scenario.academic_term_id,
        student_ids=[sid for ids in ids_by_section.values() for sid in ids],
    )

    skipped: list[str] = []
    results: list[tuple[SimulationResult, list]] = []
    config_id: UUID | None = None
    for ss, course, _teacher, _tp in rows:
        student_ids = ids_by_section.get(ss.id, [])
        try:
            scored = await compat.score_roster(
                db,
                institution_id=institution_id,
                academic_term_id=scenario.academic_term_id,
                teacher_id=ss.teacher_id,
                student_ids=student_ids,
                context=context,
                preload=preload,
            )
        except compat.SimulateError as exc:
            skipped.append(f"{course.code} {ss.label}: {exc}")
            continue
        config_id = scored.scoring_config_id
        result, factors = compat.build_result_rows(
            run_id=run.id,
            output=scored.output,
            recommended_teacher_id=scored.recommended_teacher_id,
            section_id=None,
            scenario_section_id=ss.id,
            now=now,
        )
        results.append((result, factors))

    if config_id is None:
        raise ScenarioError(
            "No section could be scored — " + "; ".join(skipped)
            if skipped
            else "No section could be scored"
        )

    run.scoring_config_id = config_id
    run.status = SimRunStatus.succeeded
    run.finished_at = datetime.now(timezone.utc)
    if skipped:
        run.error_message = "Skipped: " + "; ".join(skipped)
    db.add(run)
    for result, factors in results:
        db.add(result)
        db.add_all(factors)

    scenario.status = ScenarioStatus.simulated
    scenario.scoring_config_id = config_id
    scenario.updated_at = run.finished_at

    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user_id,
        action="scenario.simulate",
        entity_type="scenario",
        entity_id=scenario.id,
        payload={"run_id": str(run.id), "sections_scored": len(results), "skipped": skipped},
    )
    await db.commit()

    sections = await _sections_with_results(db, scenario.id)
    avg, _ = _summary(sections)
    return ScenarioSimulateResponse(
        run_id=run.id,
        scenario_id=scenario.id,
        status=scenario.status,
        avg_score=avg,
        sections=sections,
        skipped=skipped,
    )


# ─── Compare ────────────────────────────────────────────────────────────────

def _factor_rows(shape: SimulationResultShape | None) -> list[cmp.FactorRow] | None:
    if shape is None:
        return None
    return [
        cmp.FactorRow(factor_name=f.factor_name, score=f.score, weight=f.weight)
        for f in shape.factors
    ]


async def compare_scenario(
    db: AsyncSession, *, institution_id: UUID, scenario: Scenario
) -> ScenarioCompareResponse:
    """Each scenario section next to the live section with the same
    (course, term, label) — score, per-factor deltas and roster changes."""
    rows = await repo.list_scenario_sections(db, scenario.id)
    # Rosters and scenario-side results for the whole comparison up front; the
    # baseline lookups below still run per section, since which live section
    # pairs with which scenario section is only known inside the loop.
    ss_ids = [ss.id for ss, _c, _t, _tp in rows]
    rosters = await repo.students_by_scenario_section(db, ss_ids)
    scen_results = await repo.latest_results_for_scenario_sections(db, ss_ids)

    out_rows: list[ScenarioCompareRow] = []
    base_scores: list[int] = []
    scen_scores: list[int] = []

    for ss, course, teacher, t_profile in rows:
        scen_shape = _section_shape(
            ss, course, teacher, t_profile,
            rosters.get(ss.id, []), scen_results.get(ss.id),
        )
        scen_ids = [s.id for s in scen_shape.students]

        baseline = await repo.baseline_section_for(
            db,
            institution_id=institution_id,
            academic_term_id=scenario.academic_term_id,
            course_id=course.id,
            label=ss.label,
        )
        base_section = base_teacher = base_tp = None
        base_result: SimulationResultShape | None = None
        base_ids: list[UUID] = []
        if baseline:
            base_section, base_teacher, base_tp = baseline
            base_ids = await repo.section_student_ids(db, base_section.id)
            bundle = await sections_repo.latest_result_for_section(db, base_section.id)
            base_result = _result_shape(bundle)

        scen_result = scen_shape.latest_result
        deltas = cmp.factor_deltas(
            _factor_rows(base_result), _factor_rows(scen_result) or []
        )
        diff = cmp.roster_diff(base_ids if baseline else None, scen_ids)

        if base_result:
            base_scores.append(base_result.compatibility_score)
        if scen_result:
            scen_scores.append(scen_result.compatibility_score)

        out_rows.append(
            ScenarioCompareRow(
                scenario_section_id=ss.id,
                course=scen_shape.course,
                label=ss.label,
                scenario_teacher=scen_shape.teacher,
                scenario_student_count=scen_shape.student_count,
                scenario_result=scen_result,
                baseline_section_id=base_section.id if base_section else None,
                baseline_state=base_section.state.value if base_section else None,
                baseline_teacher=_teacher_ref(base_teacher, base_tp),
                baseline_student_count=len(base_ids) if baseline else None,
                baseline_result=base_result,
                score_delta=cmp.score_delta(
                    base_result.compatibility_score if base_result else None,
                    scen_result.compatibility_score if scen_result else None,
                ),
                factor_deltas=[
                    FactorDeltaShape(
                        factor_name=d.factor_name,
                        baseline_score=d.baseline_score,
                        scenario_score=d.scenario_score,
                        delta=d.delta,
                        weight=d.weight,
                    )
                    for d in deltas
                ],
                roster=RosterDiffShape(added=diff.added, removed=diff.removed, kept=diff.kept),
            )
        )

    base_avg = cmp.average(base_scores)
    scen_avg = cmp.average(scen_scores)
    avg_delta = (
        round(scen_avg - base_avg, 1) if base_avg is not None and scen_avg is not None else None
    )
    term = await repo.term_name(db, scenario.academic_term_id)
    return ScenarioCompareResponse(
        scenario=await build_list_item(db, scenario, term, len(rows)),
        rows=out_rows,
        baseline_avg=base_avg,
        scenario_avg=scen_avg,
        avg_delta=avg_delta,
    )


# ─── Apply ──────────────────────────────────────────────────────────────────

async def apply_scenario(
    db: AsyncSession, *, institution_id: UUID, user_id: UUID, scenario: Scenario
) -> ScenarioApplyResponse:
    """Copy every scenario section onto the live section with the same
    (course, term, label) — creating it if needed — then re-run the engine on
    each so the live result matches the scenario. The scenario becomes `applied`."""
    # Serialize retries of the same apply request and re-read its current state.
    await db.refresh(scenario, with_for_update=True)
    if scenario.status == ScenarioStatus.applied:
        raise ScenarioError("Scenario has already been applied")
    if scenario.status != ScenarioStatus.simulated:
        raise ScenarioError("Simulate the scenario before applying it")

    rows = await repo.list_scenario_sections(db, scenario.id)
    if not rows:
        raise ScenarioError("Scenario has no sections")

    now = datetime.now(timezone.utc)
    applied: list[AppliedSectionShape] = []
    touched: list[UUID] = []
    ids_by_section = await repo.student_ids_by_scenario_section(
        db, [ss.id for ss, _c, _t, _tp in rows]
    )

    for ss, course, _teacher, _tp in rows:
        student_ids = ids_by_section.get(ss.id, [])
        baseline = await repo.baseline_section_for(
            db,
            institution_id=institution_id,
            academic_term_id=scenario.academic_term_id,
            course_id=course.id,
            label=ss.label,
            lock=True,
        )
        created = False
        if baseline:
            section = baseline[0]
            if section.state in (SectionState.active, SectionState.archived):
                raise ScenarioError(
                    f"Live section {course.code} {ss.label} is {section.state.value} and cannot be changed"
                )
            section.teacher_id = ss.teacher_id
            section.updated_at = now
            if section.state == SectionState.simulated:
                section.state = SectionState.draft
            # Reconcile roster: soft-remove absent, restore/insert present.
            existing = list(
                (
                    await db.execute(
                        select(SectionStudent).where(SectionStudent.section_id == section.id)
                    )
                ).scalars().all()
            )
            by_student = {e.student_id: e for e in existing}
            wanted = set(student_ids)
            for e in existing:
                if e.student_id not in wanted and e.removed_at is None:
                    e.removed_at = now
            for sid in student_ids:
                e = by_student.get(sid)
                if e is None:
                    db.add(SectionStudent(section_id=section.id, student_id=sid, added_at=now))
                elif e.removed_at is not None:
                    e.removed_at = None
                    e.added_at = now
        else:
            created = True
            section = Section(
                id=uuid4(),
                institution_id=institution_id,
                course_id=course.id,
                academic_term_id=scenario.academic_term_id,
                teacher_id=ss.teacher_id,
                label=ss.label,
                state=SectionState.draft,
                created_by=user_id,
                created_at=now,
            )
            db.add(section)
            for sid in student_ids:
                db.add(SectionStudent(section_id=section.id, student_id=sid, added_at=now))

        await db.flush()
        touched.append(section.id)
        applied.append(
            AppliedSectionShape(
                section_id=section.id,
                course=CourseRef(id=course.id, code=course.code, name=course.name),
                label=ss.label,
                created=created,
                compatibility_score=None,
            )
        )

    scenario.status = ScenarioStatus.applied
    scenario.updated_at = now
    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=user_id,
        action="scenario.apply",
        entity_type="scenario",
        entity_id=scenario.id,
        payload={"sections": [str(s) for s in touched]},
    )
    # Re-score each live section so its persisted result reflects the applied
    # roster. The config and teacher candidates are shared across the sections;
    # each section's own roster is still read inside simulate_section, since
    # reconciliation above may have changed it.
    try:
        context = await compat.load_scoring_context(db, institution_id)
    except compat.SimulateError as exc:
        await db.rollback()
        raise ScenarioError(f"Could not apply scenario: {exc}") from exc

    for i, section_id in enumerate(touched):
        try:
            _run, result, _f = await compat.simulate_section(
                db,
                institution_id=institution_id,
                section_id=section_id,
                triggered_by=user_id,
                context=context,
            )
            applied[i] = applied[i].model_copy(
                update={"compatibility_score": result.compatibility_score}
            )
        except compat.SimulateError as exc:
            await db.rollback()
            raise ScenarioError(f"Could not apply scenario: {exc}") from exc

    await db.commit()

    return ScenarioApplyResponse(
        scenario_id=scenario.id, status=scenario.status, applied=applied
    )


async def teacher_exists(db: AsyncSession, institution_id: UUID, teacher_id: UUID) -> bool:
    stmt = (
        select(Teacher.id)
        .where(Teacher.id == teacher_id)
        .where(Teacher.institution_id == institution_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
