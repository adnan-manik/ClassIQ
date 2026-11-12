"""Orchestrates F2 — load roster inputs, run the engine, persist the result.

This is the service layer between the simulate routes and the pure-compute
engine in app/engines/scoring/. Real sections (F4) and scenario sections (F5)
share one code path: `load_roster_inputs` → `score_roster`.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.scoring import ScoringInput, score_section
from app.engines.scoring.pipeline import ScoringOutput
from app.models.peer_relationship import PeerRelationship
from app.models.section import Section, SectionState, SectionStudent
from app.models.simulation import (
    FactorImpact,
    PredictedOutcome,
    SimRunStatus,
    SimulationResult,
    SimulationResultFactor,
    SimulationRun,
    SocialImpact,
)
from app.models.student import StudentAuxProfile, StudentProfile
from app.models.teacher import Teacher, TeacherProfile
from app.repositories import scoring as scoring_repo

ENGINE_VERSION = "0.1.1"


class SimulateError(Exception):
    """Raised when a roster can't be simulated (missing data, etc.)."""


@dataclass
class RosterInputs:
    """Everything the engine needs for one roster, loaded tenant-scoped."""

    student_ids: list[UUID]
    teacher_profile: TeacherProfile | None
    student_profiles: list[StudentProfile]
    aux_profiles: list[StudentAuxProfile]
    peer_relationships: list[PeerRelationship]
    weights: dict[str, float]
    scoring_config_id: UUID


@dataclass(frozen=True)
class ScoringContext:
    """Per-institution inputs every roster in one run shares.

    The scoring config and the teacher candidate list do not vary by roster, so
    a run that scores many rosters loads them once instead of per roster.
    `teacher_candidates` keeps the query's own row order, since
    `recommend_teacher` resolves ties by first-best-wins.
    """

    scoring_config_id: UUID
    weights: dict[str, float]
    teacher_candidates: list[tuple[Teacher, TeacherProfile | None]]


@dataclass(frozen=True)
class RosterPreload:
    """Roster-level inputs for the union of several rosters, fetched together.

    `load_roster_inputs` slices this instead of querying. The slices reproduce
    the per-roster filters exactly: profiles and aux rows are taken by student
    id, and a peer edge counts only when BOTH endpoints are in that roster.
    """

    academic_term_id: UUID
    student_profiles: dict[UUID, StudentProfile]
    aux_profiles: dict[UUID, list[StudentAuxProfile]]
    peer_relationships: list[PeerRelationship]


async def load_scoring_context(
    db: AsyncSession, institution_id: UUID
) -> ScoringContext:
    """The scoring config plus every teacher who could be recommended."""
    cfg = await scoring_repo.get_default_config(db, institution_id)
    if cfg is None:
        raise SimulateError(_NO_CONFIG)
    return ScoringContext(
        scoring_config_id=cfg.id,
        weights=cfg.weights,
        teacher_candidates=await _teacher_candidates(db, institution_id),
    )


async def load_roster_preload(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    student_ids: list[UUID],
) -> RosterPreload:
    """Profiles, aux rows and peer edges for every student across the rosters."""
    union = list(dict.fromkeys(student_ids))
    if not union:
        return RosterPreload(
            academic_term_id=academic_term_id,
            student_profiles={},
            aux_profiles={},
            peer_relationships=[],
        )

    profiles = {
        p.student_id: p
        for p in (
            await db.execute(_student_profiles_stmt(institution_id, union))
        ).scalars().all()
    }
    aux: dict[UUID, list[StudentAuxProfile]] = {}
    for a in (
        await db.execute(_aux_profiles_stmt(institution_id, academic_term_id, union))
    ).scalars().all():
        aux.setdefault(a.student_id, []).append(a)
    rels = list(
        (
            await db.execute(_peer_stmt(institution_id, academic_term_id, union))
        ).scalars().all()
    )
    return RosterPreload(
        academic_term_id=academic_term_id,
        student_profiles=profiles,
        aux_profiles=aux,
        peer_relationships=rels,
    )


@dataclass(frozen=True)
class RosterScore:
    output: ScoringOutput
    recommended_teacher_id: UUID | None
    scoring_config_id: UUID


def select_aux_profiles(
    profiles: list[StudentAuxProfile], academic_term_id: UUID
) -> list[StudentAuxProfile]:
    """One participation signal per student: this term wins over generic data."""
    selected: dict[UUID, StudentAuxProfile] = {}
    eligible = [p for p in profiles if p.academic_term_id in (None, academic_term_id)]
    for profile in sorted(
        eligible,
        key=lambda p: (p.academic_term_id == academic_term_id, p.collected_at, str(p.id)),
        reverse=True,
    ):
        selected.setdefault(profile.student_id, profile)
    return list(selected.values())


# simulation_runs.scoring_config_id is NOT NULL + a real FK, so we must
# reference an existing config. Fabricating a UUID would violate the FK and 500
# with an opaque error — fail cleanly instead.
_NO_CONFIG = (
    "No scoring configuration is available. Seed a default "
    "scoring_config (global or for this institution) before simulating."
)


def _student_profiles_stmt(institution_id: UUID, student_ids: list[UUID]):
    return (
        select(StudentProfile)
        .where(StudentProfile.institution_id == institution_id)
        .where(StudentProfile.student_id.in_(student_ids))
        .where(StudentProfile.is_current.is_(True))
        .where(StudentProfile.deleted_at.is_(None))
    )


def _aux_profiles_stmt(
    institution_id: UUID, academic_term_id: UUID, student_ids: list[UUID]
):
    return (
        select(StudentAuxProfile)
        .where(StudentAuxProfile.institution_id == institution_id)
        .where(StudentAuxProfile.student_id.in_(student_ids))
        # Match this term OR term-agnostic rows (academic_term_id is
        # nullable). An equality-only filter silently drops NULL-term
        # aux profiles, so participation would score against an empty
        # set even though the roster view shows those profiles.
        .where(
            (StudentAuxProfile.academic_term_id == academic_term_id)
            | (StudentAuxProfile.academic_term_id.is_(None))
        )
        .where(StudentAuxProfile.is_current.is_(True))
        .where(StudentAuxProfile.deleted_at.is_(None))
    )


def _peer_stmt(institution_id: UUID, academic_term_id: UUID, student_ids: list[UUID]):
    return (
        select(PeerRelationship)
        .where(PeerRelationship.institution_id == institution_id)
        .where(PeerRelationship.academic_term_id == academic_term_id)
        .where(PeerRelationship.from_student_id.in_(student_ids))
        .where(PeerRelationship.to_student_id.in_(student_ids))
        .where(PeerRelationship.deleted_at.is_(None))
    )


async def _teacher_candidates(
    db: AsyncSession, institution_id: UUID
) -> list[tuple[Teacher, TeacherProfile | None]]:
    return list(
        (
            await db.execute(
                select(Teacher, TeacherProfile)
                .outerjoin(
                    TeacherProfile,
                    (TeacherProfile.teacher_id == Teacher.id)
                    & (TeacherProfile.is_current.is_(True))
                    & (TeacherProfile.deleted_at.is_(None)),
                )
                .where(Teacher.institution_id == institution_id)
                .where(Teacher.deleted_at.is_(None))
            )
        ).all()
    )


async def load_roster_inputs(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    teacher_id: UUID | None,
    student_ids: list[UUID],
    context: ScoringContext | None = None,
    preload: RosterPreload | None = None,
) -> RosterInputs:
    """Load profiles, aux rows, peer edges and the scoring config for a roster.

    `context` and `preload` let a caller that scores several rosters supply the
    shared parts instead of this function re-querying them per roster; both are
    optional and the single-roster behaviour is unchanged.
    """
    if not student_ids:
        raise SimulateError("No enrolled students")

    teacher_profile: TeacherProfile | None = None
    if teacher_id:
        teacher_profile = (
            await db.execute(
                select(TeacherProfile)
                .where(TeacherProfile.institution_id == institution_id)
                .where(TeacherProfile.teacher_id == teacher_id)
                .where(TeacherProfile.is_current.is_(True))
                .where(TeacherProfile.deleted_at.is_(None))
            )
        ).scalar_one_or_none()

    if preload is not None:
        if preload.academic_term_id != academic_term_id:
            raise SimulateError("Preloaded roster data is for a different term")
        wanted = set(student_ids)
        # Ordered by the roster rather than by whatever the DB returned, which
        # is at least as deterministic as the per-roster query it replaces.
        student_profiles = [
            preload.student_profiles[sid]
            for sid in dict.fromkeys(student_ids)
            if sid in preload.student_profiles
        ]
        aux_rows = [
            a for sid in dict.fromkeys(student_ids)
            for a in preload.aux_profiles.get(sid, ())
        ]
        rels = [
            r
            for r in preload.peer_relationships
            if r.from_student_id in wanted and r.to_student_id in wanted
        ]
    else:
        student_profiles = list(
            (
                await db.execute(_student_profiles_stmt(institution_id, student_ids))
            ).scalars().all()
        )
        aux_rows = list(
            (
                await db.execute(
                    _aux_profiles_stmt(institution_id, academic_term_id, student_ids)
                )
            ).scalars().all()
        )
        rels = list(
            (
                await db.execute(
                    _peer_stmt(institution_id, academic_term_id, student_ids)
                )
            ).scalars().all()
        )

    if context is not None:
        weights, config_id = context.weights, context.scoring_config_id
    else:
        cfg = await scoring_repo.get_default_config(db, institution_id)
        if cfg is None:
            raise SimulateError(_NO_CONFIG)
        weights, config_id = cfg.weights, cfg.id

    return RosterInputs(
        student_ids=list(student_ids),
        teacher_profile=teacher_profile,
        student_profiles=student_profiles,
        aux_profiles=select_aux_profiles(aux_rows, academic_term_id),
        peer_relationships=rels,
        weights=weights,
        scoring_config_id=config_id,
    )


def run_engine(inputs: RosterInputs, teacher_profile: TeacherProfile | None = None) -> ScoringOutput:
    """Run the pure engine on loaded inputs (optionally with a different teacher)."""
    return score_section(
        ScoringInput(
            section_student_ids=inputs.student_ids,
            teacher_profile=teacher_profile if teacher_profile is not None else inputs.teacher_profile,
            student_profiles=inputs.student_profiles,
            aux_profiles=inputs.aux_profiles,
            peer_relationships=inputs.peer_relationships,
            weights=inputs.weights,
        )
    )


async def recommend_teacher(
    db: AsyncSession,
    *,
    institution_id: UUID,
    inputs: RosterInputs,
    current_score: int,
    context: ScoringContext | None = None,
) -> UUID | None:
    """Try every other teacher in the institution; return the id whose hypothetical
    score beats the current one by ≥3 points. None if nobody does better.

    The candidate list is the same for every roster in a run, so `context`
    supplies it rather than this function fetching it again per roster.
    """
    teachers = (
        context.teacher_candidates
        if context is not None
        else await _teacher_candidates(db, institution_id)
    )
    best_id: UUID | None = None
    best_score = current_score
    for teacher, profile in teachers:
        if profile is None:
            continue
        out = run_engine(inputs, teacher_profile=profile)
        if out.compatibility_score >= current_score + 3 and out.compatibility_score > best_score:
            best_score = out.compatibility_score
            best_id = teacher.id
    return best_id


async def score_roster(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    teacher_id: UUID | None,
    student_ids: list[UUID],
    context: ScoringContext | None = None,
    preload: RosterPreload | None = None,
) -> RosterScore:
    """Load + score one roster and find a better teacher if one exists.
    Does NOT persist anything."""
    inputs = await load_roster_inputs(
        db,
        institution_id=institution_id,
        academic_term_id=academic_term_id,
        teacher_id=teacher_id,
        student_ids=student_ids,
        context=context,
        preload=preload,
    )
    output = run_engine(inputs)
    recommended = await recommend_teacher(
        db,
        institution_id=institution_id,
        inputs=inputs,
        current_score=output.compatibility_score,
        context=context,
    )
    return RosterScore(
        output=output,
        recommended_teacher_id=recommended,
        scoring_config_id=inputs.scoring_config_id,
    )


def build_result_rows(
    *,
    run_id: UUID,
    output: ScoringOutput,
    recommended_teacher_id: UUID | None,
    section_id: UUID | None,
    scenario_section_id: UUID | None,
    now: datetime,
) -> tuple[SimulationResult, list[SimulationResultFactor]]:
    """Construct (unsaved) result + factor rows for a run."""
    result = SimulationResult(
        id=uuid4(),
        simulation_run_id=run_id,
        scenario_section_id=scenario_section_id,
        section_id=section_id,
        compatibility_score=output.compatibility_score,
        predicted_outcome=PredictedOutcome(output.predicted_outcome),
        social_graph_impact=SocialImpact(output.social_graph_impact),
        style_distribution=output.style_distribution,
        recommended_teacher_id=recommended_teacher_id,
        created_at=now,
    )
    factor_rows = [
        SimulationResultFactor(
            id=uuid4(),
            simulation_result_id=result.id,
            factor_name=f.name,
            score=f.score,
            weight=f.weight,
            impact=FactorImpact(f.impact),
        )
        for f in output.factors
    ]
    return result, factor_rows


async def simulate_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    section_id: UUID,
    triggered_by: UUID,
    context: ScoringContext | None = None,
) -> tuple[SimulationRun, SimulationResult, list[SimulationResultFactor]]:
    """Run the scoring engine on `section_id` and persist the result.

    `context` is for callers that re-score several sections in a row, such as
    applying a scenario; without it the shared data is loaded per section.
    """
    sec = (
        await db.execute(
            select(Section)
            .where(Section.id == section_id)
            .where(Section.institution_id == institution_id)
            .where(Section.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not sec:
        raise SimulateError(f"Section {section_id} not found")
    if sec.state == SectionState.archived:
        raise SimulateError("An archived section cannot be simulated")

    student_ids = list(
        (
            await db.execute(
                select(SectionStudent.student_id)
                .where(SectionStudent.section_id == sec.id)
                .where(SectionStudent.removed_at.is_(None))
            )
        ).scalars().all()
    )
    if not student_ids:
        raise SimulateError("Section has no enrolled students")

    scored = await score_roster(
        db,
        institution_id=institution_id,
        academic_term_id=sec.academic_term_id,
        teacher_id=sec.teacher_id,
        student_ids=student_ids,
        context=context,
    )

    now = datetime.now(timezone.utc)
    run = SimulationRun(
        id=uuid4(),
        institution_id=institution_id,
        scenario_id=None,
        section_id=section_id,
        scoring_config_id=scored.scoring_config_id,
        engine_version=ENGINE_VERSION,
        status=SimRunStatus.succeeded,
        started_at=now,
        finished_at=now,
        triggered_by=triggered_by,
        created_at=now,
    )
    db.add(run)

    result, factor_rows = build_result_rows(
        run_id=run.id,
        output=scored.output,
        recommended_teacher_id=scored.recommended_teacher_id,
        section_id=section_id,
        scenario_section_id=None,
        now=now,
    )
    db.add(result)
    db.add_all(factor_rows)

    # Bump the section state out of `draft`
    if sec.state == SectionState.draft:
        await db.execute(
            update(Section)
            .where(Section.id == section_id)
            .values(state=SectionState.simulated, updated_at=now)
        )

    # The caller commits results together with its audit entry / scenario apply.
    await db.flush()
    return run, result, factor_rows
