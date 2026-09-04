"""F5 compare maths — factor deltas, roster diff, averages."""

from uuid import uuid4

from app.engines.scenario_compare import (
    FactorRow,
    average,
    factor_deltas,
    roster_diff,
    score_delta,
)


def test_factor_deltas_pair_by_name_and_keep_scenario_order():
    base = [FactorRow("Style Alignment", 60, 0.4), FactorRow("Social Cohesion", 50, 0.25)]
    scen = [FactorRow("Social Cohesion", 70, 0.25), FactorRow("Style Alignment", 55, 0.4), FactorRow("New", 10, 0.1)]
    out = factor_deltas(base, scen)
    assert [d.factor_name for d in out] == ["Social Cohesion", "Style Alignment", "New"]
    assert out[0].delta == 20
    assert out[1].delta == -5
    assert out[2].baseline_score is None and out[2].delta is None


def test_factor_deltas_without_baseline():
    out = factor_deltas(None, [FactorRow("x", 42, 1.0)])
    assert out[0].baseline_score is None and out[0].scenario_score == 42


def test_roster_diff_counts():
    a, b, c, d = (uuid4() for _ in range(4))
    diff = roster_diff([a, b, c], [b, c, d])
    assert (diff.added, diff.removed, diff.kept) == (1, 1, 2)
    assert diff.added_ids == (d,)
    assert diff.removed_ids == (a,)
    fresh = roster_diff(None, [a])
    assert (fresh.added, fresh.removed, fresh.kept) == (1, 0, 0)


def test_score_delta_and_average():
    assert score_delta(60, 72) == 12
    assert score_delta(None, 72) is None
    assert average([]) is None
    assert average([60, 71]) == 65.5
