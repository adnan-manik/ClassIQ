"""Weighted aggregator + predicted_outcome classifier."""

from dataclasses import dataclass


@dataclass(frozen=True)
class WeightedFactor:
    name: str
    score: int   # 0..100
    weight: float

    @property
    def impact(self) -> str:
        if self.score >= 60:
            return "positive"
        if self.score >= 40:
            return "neutral"
        return "negative"


def aggregate(factors: list[WeightedFactor]) -> int:
    """Compute the 0..100 compatibility score as the weighted mean.

    Weights are normalized — if they don't sum to 1, we rescale.
    """
    if not factors:
        return 0
    total_weight = sum(f.weight for f in factors)
    if total_weight <= 0:
        return 0
    weighted_sum = sum(f.score * f.weight for f in factors)
    return max(0, min(100, round(weighted_sum / total_weight)))


def classify_outcome(score: int) -> str:
    if score >= 70:
        return "high"
    if score >= 50:
        return "medium"
    return "low"
