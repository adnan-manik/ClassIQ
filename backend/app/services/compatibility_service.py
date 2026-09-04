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

ENGINE_VERSION = "0.1.0"


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
class RosterScore:
    output: ScoringOutput
    recommended_teacher_id: UUID | None
    scoring_config_id: UUID


async def load_roster_inputs(
    db: AsyncSession,
    *,
    institution_id: UUID,
    academic_term_id: UUID,
    teacher_id: UUID | None,
    student_ids: list[UUID],
) -> RosterInputs:
    """Load profiles, aux rows, peer edges and the scoring config for a roster."""
    if not student_ids:
        raise SimulateError("No enrolled students")

    teacher_profile: TeacherProfile | None = None
    if teacher_id:
        teacher_profile = (
            await db.execute(
                select(TeacherProfile)
                .where(TeacherProfile.teacher_id == teacher_id)
                .where(TeacherProfile.is_current.is_(True))
                .where(TeacherProfile.deleted_at.is_(None))
            )
        ).scalar_one_or_none()

    student_profiles = list(
        (
            await db.execute(
                select(StudentProfile)
                .where(StudentProfile.student_id.in_(student_ids))
                .where(StudentProfile.is_current.is_(True))
                .where(StudentProfile.deleted_at.is_(None))
            )
        ).scalars().all()
    )

    aux_profiles = list(
        (
            await db.execute(
                select(StudentAuxProfile)
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
        ).scalars().all()
    )

    rels = list(
        (
            await db.execute(
                select(PeerRelationship)
                .where(PeerRelationship.institution_id == institution_id)
                .where(PeerRelationship.academic_term_id == academic_term_id)
                .where(PeerRelationship.from_student_id.in_(student_ids))
                .where(PeerRelationship.to_student_id.in_(student_ids))
                .where(PeerRelationship.deleted_at.is_(None))
            )
        ).scalars().all()
    )

    # simulation_runs.scoring_config_id is NOT NULL + a real FK, so we must
    # reference an existing config. Fabricating a UUID here would violate the
    # FK and 500 with an opaque error — fail cleanly instead.
    cfg = await scoring_repo.get_default_config(db, institution_id)
    if cfg is None:
        raise SimulateError(
            "No scoring configuration is available. Seed a default "
            "scoring_config (global or for this institution) before simulating."
        )

    return RosterInputs(
        student_ids=list(student_ids),
        teacher_profile=teacher_profile,
        student_profiles=student_profiles,
        aux_profiles=aux_profiles,
        peer_relationships=rels,
        weights=cfg.weights,
        scoring_config_id=cfg.id,
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
) -> UUID | None:
    """Try every other teacher in the institution; return the id whose hypothetical
    score beats the current one by ≥3 points. None if nobody does better."""
    teachers = list(
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
    best_id: UUID | None = None
    best_score = current_score
    for teacher, profile in teachers:
        if profile is None:
            continue
        out = run_engine(inputs, teacher_profile=profile)
        if out.compatibility_score > best_score + 2:
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
) -> RosterScore:
    """Load + score one roster and find a better teacher if one exists.
    Does NOT persist anything."""
    inputs = await load_roster_inputs(
        db,
        institution_id=institution_id,
        academic_term_id=academic_term_id,
        teacher_id=teacher_id,
        student_ids=student_ids,
    )
    output = run_engine(inputs)
    recommended = await recommend_teacher(
        db,
        institution_id=institution_id,
        inputs=inputs,
        current_score=output.compatibility_score,
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
) -> tuple[SimulationRun, SimulationResult, list[SimulationResultFactor]]:
    """Run the scoring engine on `section_id` and persist the result."""
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

    await db.commit()
    return run, result, factor_rows
