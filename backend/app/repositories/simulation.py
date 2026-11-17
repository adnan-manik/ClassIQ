"""Writes to simulation_runs / simulation_results / simulation_result_factors."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.scoring.pipeline import ScoringOutput
from app.models.simulation import (
    FactorImpact,
    PredictedOutcome,
    SimRunStatus,
    SimulationResult,
    SimulationResultFactor,
    SimulationRun,
    SocialImpact,
)


async def write_simulation(
    db: AsyncSession,
    *,
    institution_id: UUID,
    section_id: UUID,
    scoring_config_id: UUID,
    triggered_by: UUID,
    engine_version: str,
    output: ScoringOutput,
) -> tuple[SimulationRun, SimulationResult, list[SimulationResultFactor]]:
    """Insert run + result + factor rows in one transaction."""
    now = datetime.now(timezone.utc)
    run = SimulationRun(
        id=uuid4(),
        institution_id=institution_id,
        scenario_id=None,
        section_id=section_id,
        scoring_config_id=scoring_config_id,
        engine_version=engine_version,
        status=SimRunStatus.succeeded,
        started_at=now,
        finished_at=now,
        triggered_by=triggered_by,
        created_at=now,
    )
    db.add(run)
    await db.flush()  # bare FK column, no relationship(): insert the run first

    result = SimulationResult(
        id=uuid4(),
        simulation_run_id=run.id,
        scenario_section_id=None,
        section_id=section_id,
        compatibility_score=output.compatibility_score,
        predicted_outcome=PredictedOutcome(output.predicted_outcome),
        social_graph_impact=SocialImpact(output.social_graph_impact),
        style_distribution=output.style_distribution,
        recommended_teacher_id=None,  # populated by service if computed
        created_at=now,
    )
    db.add(result)
    await db.flush()  # factors reference the result the same way

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

    await db.commit()
    return run, result, factor_rows
