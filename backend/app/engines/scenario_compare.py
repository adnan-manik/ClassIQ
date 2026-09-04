"""Pure helpers for scenario-vs-baseline comparison (F5).

No DB access — the service layer loads results and rosters, these functions
turn them into deltas the compare view renders.
"""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class FactorRow:
    factor_name: str
    score: int
    weight: float


@dataclass(frozen=True)
class FactorDelta:
    factor_name: str
    baseline_score: int | None
    scenario_score: int
    delta: int | None
    weight: float


@dataclass(frozen=True)
class RosterDiff:
    added: int
    removed: int
    kept: int
    added_ids: tuple[UUID, ...]
    removed_ids: tuple[UUID, ...]


def factor_deltas(
    baseline: list[FactorRow] | None,
    scenario: list[FactorRow],
) -> list[FactorDelta]:
    """Pair scenario factors with the baseline factor of the same name.

    Order follows the scenario's factor order. A factor missing from the
    baseline (or no baseline at all) yields `baseline_score=None, delta=None`.
    """
    base_by_name = {f.factor_name: f for f in (baseline or [])}
    out: list[FactorDelta] = []
    for f in scenario:
        b = base_by_name.get(f.factor_name)
        out.append(
            FactorDelta(
                factor_name=f.factor_name,
                baseline_score=b.score if b else None,
                scenario_score=f.score,
                delta=(f.score - b.score) if b else None,
                weight=f.weight,
            )
        )
    return out


def roster_diff(
    baseline_ids: list[UUID] | None, scenario_ids: list[UUID]
) -> RosterDiff:
    """Count students added / removed / kept between two rosters."""
    base = set(baseline_ids or [])
    scen = set(scenario_ids)
    added = tuple(sorted(scen - base, key=str))
    removed = tuple(sorted(base - scen, key=str))
    kept = len(scen & base)
    return RosterDiff(
        added=len(added),
        removed=len(removed),
        kept=kept,
        added_ids=added,
        removed_ids=removed,
    )


def score_delta(baseline_score: int | None, scenario_score: int | None) -> int | None:
    if baseline_score is None or scenario_score is None:
        return None
    return scenario_score - baseline_score


def average(scores: list[int]) -> float | None:
    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)
