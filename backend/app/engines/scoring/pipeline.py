"""Scoring engine pipeline — pure compute, no DB.

Inputs: teacher profile + student profiles + aux profiles + peer relationships.
Output: compatibility score, factor breakdown, outcome label, social-graph
label, and the class FSLSM pole distribution.
"""

from dataclasses import dataclass
from uuid import UUID

from app.engines.scoring import (
    aggregator,
    class_balance,
    participation,
    social_cohesion,
    style_alignment,
)
from app.models.peer_relationship import PeerRelationship
from app.models.student import FslsmAxis, StudentAuxProfile, StudentProfile
from app.models.teacher import TeacherProfile


# Default weights — sum to 1.0. Match scoring_configs seed.
DEFAULT_WEIGHTS: dict[str, float] = {
    "style_alignment": 0.40,
    "social_cohesion": 0.25,
    "class_balance": 0.20,
    "participation": 0.15,
}


@dataclass(frozen=True)
class FactorScore:
    name: str
    score: int
    weight: float
    impact: str  # positive | neutral | negative


@dataclass(frozen=True)
class ScoringInput:
    section_student_ids: list[UUID]
    teacher_profile: TeacherProfile | None
    student_profiles: list[StudentProfile]
    aux_profiles: list[StudentAuxProfile]
    peer_relationships: list[PeerRelationship]
    weights: dict[str, float]


@dataclass(frozen=True)
class ScoringOutput:
    compatibility_score: int                 # 0..100
    predicted_outcome: str                   # high | medium | low
    social_graph_impact: str                 # supportive | neutral | hindering
    style_distribution: dict[str, dict[str, int]]
    factors: list[FactorScore]


_AXIS_POLES: dict[FslsmAxis, tuple[str, str]] = {
    FslsmAxis.active_reflective: ("active", "reflective"),
    FslsmAxis.sensing_intuitive: ("sensing", "intuitive"),
    FslsmAxis.visual_verbal: ("visual", "verbal"),
    FslsmAxis.sequential_global: ("sequential", "global"),
}


def _style_distribution(profiles: list[StudentProfile]) -> dict[str, dict[str, int]]:
    """Per-axis pole share as percentages, e.g.
        {"visual_verbal": {"visual": 70, "verbal": 30}, ...}

    Always emits both poles for every axis (0/0 when there's no data) so the
    JSONB shape is stable for downstream consumers (charts, the report view).
    """
    out: dict[str, dict[str, int]] = {}
    for axis, (pole_a, pole_b) in _AXIS_POLES.items():
        field = f"{axis.value}_score"
        a_count = sum(1 for p in profiles if getattr(p, field) > 0)
        b_count = sum(1 for p in profiles if getattr(p, field) < 0)
        total = a_count + b_count
        if total == 0:
            out[axis.value] = {pole_a: 0, pole_b: 0}
        else:
            out[axis.value] = {
                pole_a: round((a_count / total) * 100),
                pole_b: round((b_count / total) * 100),
            }
    return out


def score_section(inp: ScoringInput) -> ScoringOutput:
    """Run the full scoring pipeline against a single section."""
    # Merge over defaults so a config missing (or with extra) keys never raises
    # KeyError and never silently zero-weights a factor.
    w = {**DEFAULT_WEIGHTS, **(inp.weights or {})}

    style_score = style_alignment.score(inp.student_profiles, inp.teacher_profile)
    social_result = social_cohesion.score(
        inp.section_student_ids, inp.peer_relationships
    )
    balance_score = class_balance.score(inp.student_profiles)
    participation_score = participation.score(inp.aux_profiles)

    weighted = [
        aggregator.WeightedFactor("Style Alignment", style_score, w["style_alignment"]),
        aggregator.WeightedFactor("Social Cohesion", social_result.score, w["social_cohesion"]),
        aggregator.WeightedFactor("Class Balance", balance_score, w["class_balance"]),
        aggregator.WeightedFactor("Participation Mix", participation_score, w["participation"]),
    ]
    overall = aggregator.aggregate(weighted)

    return ScoringOutput(
        compatibility_score=overall,
        predicted_outcome=aggregator.classify_outcome(overall),
        social_graph_impact=social_result.label,
        style_distribution=_style_distribution(inp.student_profiles),
        factors=[
            FactorScore(name=f.name, score=f.score, weight=f.weight, impact=f.impact)
            for f in weighted
        ],
    )
