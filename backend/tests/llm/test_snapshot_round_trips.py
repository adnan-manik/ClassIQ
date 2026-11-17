"""The Ask ClassIQ snapshot must cost a fixed number of queries.

`build_snapshot` used to run roughly four queries per scenario plus one per
simulation result, so a tenant near MAX_SCENARIOS spent ~190 network round
trips assembling one prompt. Scenario sections, their rosters and their latest
results are now fetched for the whole snapshot at once. These tests pin the
statement count and the grouping that replaced the loop.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.llm import context as ctx

DIALECT = postgresql.dialect()


class _Rows:
    """One canned result set, served through whichever accessor is used."""

    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._rows[0][0]

    def scalar_one_or_none(self):
        return self._rows[0][0] if self._rows else None

    def scalars(self):
        return _Scalars([r[0] for r in self._rows])


class _Scalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class FakeSession:
    """Records every statement and replays canned result sets in order."""

    def __init__(self, results, gets=()):
        self.sql: list[str] = []
        self._results = list(results)
        self._gets = list(gets)

    async def execute(self, stmt):
        self.sql.append(str(stmt.compile(dialect=DIALECT)))
        if not self._results:
            raise AssertionError(
                f"query #{len(self.sql)} was not expected:\n{self.sql[-1]}"
            )
        return _Rows(self._results.pop(0))

    async def get(self, _model, _pk):
        return self._gets.pop(0) if self._gets else None


def _result(section_id=None, scenario_section_id=None):
    return SimpleNamespace(
        id=uuid4(),
        section_id=section_id,
        scenario_section_id=scenario_section_id,
        compatibility_score=80,
        predicted_outcome=SimpleNamespace(value="high"),
        social_graph_impact=SimpleNamespace(value="supportive"),
        style_distribution={},
    )


def _factor(result_id, name, score):
    return SimpleNamespace(
        simulation_result_id=result_id, factor_name=name, score=score
    )


# ── _latest_results ───────────────────────────────────────────────────────


async def test_latest_results_is_two_round_trips_for_many_sections():
    ids = [uuid4() for _ in range(15)]
    results = [_result(section_id=sid) for sid in ids]
    db = FakeSession(
        [
            [(r, "Ada" if i == 0 else None) for i, r in enumerate(results)],
            [
                (_factor(results[0].id, "participation", 70),),
                (_factor(results[0].id, "style_alignment", 90),),
                (_factor(results[1].id, "social_cohesion", 55),),
            ],
        ]
    )
    out = await ctx._latest_results(db, section_ids=ids, scenario_section_ids=None)

    # fifteen sections, two statements
    assert len(db.sql) == 2
    assert "DISTINCT ON (simulation_results.section_id)" in db.sql[0]
    assert set(out) == set(ids)
    # factors stay attached to their own result, in factor_name order
    assert out[ids[0]]["factors"] == {"participation": 70, "style_alignment": 90}
    assert out[ids[1]]["factors"] == {"social_cohesion": 55}
    assert out[ids[2]]["factors"] == {}
    assert out[ids[0]]["recommended_teacher"] == "Ada"
    assert out[ids[1]]["recommended_teacher"] is None


async def test_latest_results_keys_scenario_sections_when_asked():
    ids = [uuid4(), uuid4()]
    results = [_result(scenario_section_id=i) for i in ids]
    db = FakeSession([[(r, None) for r in results], []])
    out = await ctx._latest_results(db, section_ids=None, scenario_section_ids=ids)
    assert set(out) == set(ids)
    assert "DISTINCT ON (simulation_results.scenario_section_id)" in db.sql[0]


async def test_latest_results_issues_nothing_without_ids():
    db = FakeSession([])
    assert await ctx._latest_results(db, section_ids=[], scenario_section_ids=None) == {}
    assert db.sql == []


async def test_latest_results_skips_the_factor_query_when_nothing_matched():
    db = FakeSession([[]])
    out = await ctx._latest_results(db, section_ids=[uuid4()], scenario_section_ids=None)
    assert out == {}
    assert len(db.sql) == 1


# ── build_snapshot ────────────────────────────────────────────────────────


@pytest.fixture
def no_fslsm(monkeypatch):
    """Keep the analytics aggregate out of the statement count."""
    monkeypatch.setattr(
        ctx.analytics_repo,
        "fslsm_distribution",
        AsyncMock(return_value={"total_profiles": 0, "axes": []}),
    )


def _snapshot_session(scenario_count: int, sections_per_scenario: int = 2):
    """Canned answers for build_snapshot: no live sections, N scenarios."""
    dept = SimpleNamespace(id=uuid4(), code="CS", name="Computing")
    course = SimpleNamespace(
        id=uuid4(), code="CS101", name="Intro", department_id=dept.id
    )
    scenarios = [
        SimpleNamespace(
            id=uuid4(),
            name=f"What-if {i}",
            notes=None,
            status=SimpleNamespace(value="draft"),
        )
        for i in range(scenario_count)
    ]
    scenario_sections = [
        (
            SimpleNamespace(id=uuid4(), scenario_id=sc.id, label=chr(65 + j)),
            course,
            None,
        )
        for sc in scenarios
        for j in range(sections_per_scenario)
    ]
    db = FakeSession(
        results=[
            [("Fall 2026",)],                       # active term
            [(dept,)],                              # departments
            [],                                     # teachers
            [],                                     # live sections
            [],                                     # roster counts
            [],                                     # open early-warning flags
            [(sc, "Fall 2026") for sc in scenarios],  # scenarios
            scenario_sections,                      # ALL scenario sections
            [],                                     # latest results (none)
            [],                                     # roster counts per ss
            [(0,)],                                 # profiles total
        ],
        gets=[SimpleNamespace(name="Test University")],
    )
    return db, scenarios, scenario_sections


async def test_snapshot_query_count_does_not_grow_with_scenarios(no_fslsm):
    inst = uuid4()

    one_db, _s1, _ss1 = _snapshot_session(1)
    _text, summary_one = await ctx.build_snapshot(one_db, inst)

    three_db, _s3, _ss3 = _snapshot_session(3)
    _text, summary_three = await ctx.build_snapshot(three_db, inst)

    assert summary_one.scenarios == 1
    assert summary_three.scenarios == 3
    # the whole point: three scenarios cost no more statements than one
    assert len(three_db.sql) == len(one_db.sql)


async def test_snapshot_keeps_each_scenarios_own_sections(no_fslsm):
    db, scenarios, scenario_sections = _snapshot_session(3, sections_per_scenario=2)
    text, summary = await ctx.build_snapshot(db, uuid4())
    payload = json.loads(text)

    assert summary.scenarios == 3
    assert [s["name"] for s in payload["scenarios"]] == [
        sc.name for sc in scenarios
    ]
    # grouping must not leak one scenario's sections into another
    for sc, entry in zip(scenarios, payload["scenarios"]):
        expected = [ss.label for ss, _c, _t in scenario_sections if ss.scenario_id == sc.id]
        assert [s["label"] for s in entry["sections"]] == expected
        assert len(entry["sections"]) == 2

    assert payload["institution"] == "Test University"
    assert payload["active_term"] == "Fall 2026"
    assert payload["departments"] == ["CS"]
