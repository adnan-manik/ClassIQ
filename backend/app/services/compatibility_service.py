"""Orchestrates F2 — load section inputs, run the engine, persist the result.

This is the service layer between the /api/sections/{id}/simulate route
and the pure-compute engine in app/engines/scoring/.
"""

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
    """Raised when the section can't be simulated (missing data, etc.)."""


async def simulate_section(
    db: AsyncSession,
    *,
    institution_id: UUID,
    section_id: UUID,
    triggered_by: UUID,
) -> tuple[SimulationRun, SimulationResult, list[SimulationResultFactor]]:
    """Run the scoring engine on `section_id` and persist the result."""
    # ── 1. Load section ──────────────────────────────────────────────────
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

    # ── 2. Teacher profile (current) ─────────────────────────────────────
    teacher_profile: TeacherProfile | None = None
    if sec.teacher_id:
        teacher_profile = (
            await db.execute(
                select(TeacherProfile)
                .where(TeacherProfile.teacher_id == sec.teacher_id)
                .where(TeacherProfile.is_current.is_(True))
                .where(TeacherProfile.deleted_at.is_(None))
            )
        ).scalar_one_or_none()

    # ── 3. Enrolled students ─────────────────────────────────────────────
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

    # ── 4. Current student profiles ──────────────────────────────────────
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

    # ── 5. Aux profiles ──────────────────────────────────────────────────
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
                    (StudentAuxProfile.academic_term_id == sec.academic_term_id)
                    | (StudentAuxProfile.academic_term_id.is_(None))
                )
                .where(StudentAuxProfile.is_current.is_(True))
                .where(StudentAuxProfile.deleted_at.is_(None))
            )
        ).scalars().all()
    )

    # ── 6. Peer relationships within the section ────────────────────────
    rels = list(
        (
            await db.execute(
                select(PeerRelationship)
                .where(PeerRelationship.institution_id == institution_id)
                .where(PeerRelationship.academic_term_id == sec.academic_term_id)
                .where(PeerRelationship.from_student_id.in_(student_ids))
                .where(PeerRelationship.to_student_id.in_(student_ids))
                .where(PeerRelationship.deleted_at.is_(None))
            )
        ).scalars().all()
    )

    # ── 7. Scoring config ────────────────────────────────────────────────
    # simulation_runs.scoring_config_id is NOT NULL + a real FK, so we must
    # reference an existing config. Fabricating a UUID here would violate the
    # FK and 500 with an opaque error — fail cleanly instead.
    cfg = await scoring_repo.get_default_config(db, institution_id)
    if cfg is None:
        raise SimulateError(
            "No scoring configuration is available. Seed a default "
            "scoring_config (global or for this institution) before simulating."
        )
    weights = cfg.weights
    scoring_config_id = cfg.id

    # ── 8. Run engine ───────────────────────────────────────────────────
    output: ScoringOutput = score_section(
        ScoringInput(
            section_student_ids=student_ids,
            teacher_profile=teacher_profile,
            student_profiles=student_profiles,
            aux_profiles=aux_profiles,
            peer_relationships=rels,
            weights=weights,
        )
    )

    # ── 9. Recommend a better teacher if possible ────────────────────────
    recommended_id = await _recommend_teacher(
        db,
        institution_id=institution_id,
        student_profiles=student_profiles,
        aux_profiles=aux_profiles,
        peer_relationships=rels,
        student_ids=student_ids,
        current_score=output.compatibility_score,
        weights=weights,
    )

    # ── 10. Persist ──────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    run = SimulationRun(
        id=uuid4(),
        institution_id=institution_id,
        scenario_id=None,
        section_id=section_id,
        scoring_config_id=scoring_config_id,
        engine_version=ENGINE_VERSION,
        status=SimRunStatus.succeeded,
        started_at=now,
        finished_at=now,
        triggered_by=triggered_by,
        created_at=now,
    )
    db.add(run)

    result = SimulationResult(
        id=uuid4(),
        simulation_run_id=run.id,
        scenario_section_id=None,
        section_id=section_id,
        compatibility_score=output.compatibility_score,
        predicted_outcome=PredictedOutcome(output.predicted_outcome),
        social_graph_impact=SocialImpact(output.social_graph_impact),
        style_distribution=output.style_distribution,
        recommended_teacher_id=recommended_id,
        created_at=now,
    )
    db.add(result)

    factor_rows: list[SimulationResultFactor] = []
    for f in output.factors:
        factor_rows.append(
            SimulationResultFactor(
                id=uuid4(),
                simulation_result_id=result.id,
                factor_name=f.name,
                score=f.score,
                weight=f.weight,
                impact=FactorImpact(f.impact),
            )
        )
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


async def _recommend_teacher(
    db: AsyncSession,
    *,
    institution_id: UUID,
    student_profiles: list[StudentProfile],
    aux_profiles: list[StudentAuxProfile],
    peer_relationships: list[PeerRelationship],
    student_ids: list[UUID],
    current_score: int,
    weights: dict[str, float],
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
        out = score_section(
            ScoringInput(
                section_student_ids=student_ids,
                teacher_profile=profile,
                student_profiles=student_profiles,
                aux_profiles=aux_profiles,
                peer_relationships=peer_relationships,
                weights=weights,
            )
        )
        if out.compatibility_score > best_score + 2:
            best_score = out.compatibility_score
            best_id = teacher.id
    return best_id
