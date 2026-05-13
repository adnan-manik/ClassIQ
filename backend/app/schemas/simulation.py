"""Schemas for the simulate endpoint."""

from uuid import UUID

from app.models.simulation import FactorImpact, PredictedOutcome, SocialImpact
from app.schemas.common import APIModel


class SimulateFactor(APIModel):
    factor_name: str
    score: int
    weight: float
    impact: FactorImpact


class SimulateResponse(APIModel):
    run_id: UUID
    result_id: UUID
    compatibility_score: int
    predicted_outcome: PredictedOutcome
    social_graph_impact: SocialImpact
    style_distribution: dict
    recommended_teacher_id: UUID | None
    factors: list[SimulateFactor]
