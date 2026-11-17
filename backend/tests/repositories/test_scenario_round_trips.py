"""The scenarios endpoints must not query per scenario or per section.

`GET /api/scenarios` used to build a complete section shape for every scenario
— a roster query plus two result queries per section, plus a last-run query per
scenario — only to average the scores. Ten scenarios of three sections each
cost over a hundred statements. These tests pin the batched replacements, and
cover `compare_scenario`, which calls the section builder and had no tests.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.engines import scenario_compare as cmp
from app.models.scenario import ScenarioStatus
from app.repositories import scenarios as repo
from app.services import scenario_service as svc

DIALECT = postgresql.dialect()


class _Scalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return _Scalars([r[0] if isinstance(r, tuple) else r for r in self._rows])


class FakeSession:
    """Records the SQL of every statement and replays canned result sets."""

    def __init__(self, results):
        self.sql: list[str] = []
        self._results = list(results)

    async def execute(self, stmt):
        self.sql.append(str(stmt.compile(dialect=DIALECT)))
        if not self._results:
            raise AssertionError(
                f"query #{len(self.sql)} was not expected:\n{self.sql[-1]}"
            )
        return _Result(self._results.pop(0))


def _scenario(name: str):
    return SimpleNamespace(
        id=uuid4(),
        name=name,
        notes=None,
        status=ScenarioStatus.simulated,
        academic_term_id=uuid4(),
        department_id=uuid4(),
        created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        updated_at=None,
    )


# ── repository batches ────────────────────────────────────────────────────


async def test_latest_scores_by_scenario_is_one_round_trip():
    a, b, c = uuid4(), uuid4(), uuid4()
    db = FakeSession([[(a, 80), (a, 70), (b, 55)]])
    out = await repo.latest_scores_by_scenario(db, [a, b, c])

    assert len(db.sql) == 1
    # the newest result per scenario SECTION, grouped up to the scenario
    assert "DISTINCT ON (simulation_results.scenario_section_id)" in db.sql[0]
    assert "JOIN scenario_sections" in db.sql[0]
    assert out == {a: [80, 70], b: [55]}
    assert c not in out
    # the averages the list page shows come from the shared helper
    assert cmp.average(out[a]) == 75.0
    assert cmp.average(out.get(c, [])) is None


async def test_latest_scores_by_scenario_short_circuits_when_empty():
    db = FakeSession([])
    assert await repo.latest_scores_by_scenario(db, []) == {}
    assert db.sql == []


async def test_last_simulated_at_by_scenario_is_one_round_trip():
    a, b = uuid4(), uuid4()
    when = datetime(2026, 10, 20, tzinfo=timezone.utc)
    db = FakeSession([[(a, when)]])
    out = await repo.last_simulated_at_by_scenario(db, [a, b])

    assert len(db.sql) == 1
    assert "DISTINCT ON (simulation_runs.scenario_id)" in db.sql[0]
    assert out == {a: when}
    # a scenario that never ran successfully is simply absent
    assert out.get(b) is None


async def test_last_simulated_at_by_scenario_short_circuits_when_empty():
    db = FakeSession([])
    assert await repo.last_simulated_at_by_scenario(db, []) == {}
    assert db.sql == []


async def test_latest_results_for_scenario_sections_is_two_round_trips():
    ids = [uuid4() for _ in range(9)]
    results = [SimpleNamespace(id=uuid4(), scenario_section_id=i) for i in ids]
    db = FakeSession(
        [
            [(r, None) for r in results],
            [
                (SimpleNamespace(simulation_result_id=results[0].id, factor_name="a"),),
                (SimpleNamespace(simulation_result_id=results[1].id, factor_name="b"),),
            ],
        ]
    )
    out = await repo.latest_results_for_scenario_sections(db, ids)

    assert len(db.sql) == 2
    assert "DISTINCT ON (simulation_results.scenario_section_id)" in db.sql[0]
    assert set(out) == set(ids)
    assert [f.factor_name for f in out[ids[0]][1]] == ["a"]
    assert out[ids[2]][1] == []


async def test_latest_results_for_scenario_sections_edge_cases():
    empty = FakeSession([])
    assert await repo.latest_results_for_scenario_sections(empty, []) == {}
    assert empty.sql == []

    no_rows = FakeSession([[]])
    assert await repo.latest_results_for_scenario_sections(no_rows, [uuid4()]) == {}
    assert len(no_rows.sql) == 1


async def test_students_by_scenario_section_is_one_round_trip():
    s1, s2 = uuid4(), uuid4()
    ada = SimpleNamespace(id=uuid4(), full_name="Ada")
    bob = SimpleNamespace(id=uuid4(), full_name="Bob")
    db = FakeSession([[(s1, ada, None, None), (s1, bob, None, None), (s2, ada, None, None)]])
    out = await repo.students_by_scenario_section(db, [s1, s2, uuid4()])

    assert len(db.sql) == 1
    assert [s.full_name for s, _p, _a in out[s1]] == ["Ada", "Bob"]
    assert len(out[s2]) == 1
    assert "ORDER BY students.full_name" in db.sql[0]


async def test_students_by_scenario_section_short_circuits_when_empty():
    db = FakeSession([])
    assert await repo.students_by_scenario_section(db, []) == {}
    assert db.sql == []


# ── service: the list endpoint ────────────────────────────────────────────


@pytest.fixture
def batched_repo(monkeypatch):
    """Record what the list builder asks the repository for."""
    calls = SimpleNamespace(scores=None, runs=None)

    async def scores(_db, ids):
        calls.scores = list(ids)
        return calls.score_map

    async def runs(_db, ids):
        calls.runs = list(ids)
        return calls.run_map

    calls.score_map = {}
    calls.run_map = {}
    monkeypatch.setattr(repo, "latest_scores_by_scenario", scores)
    monkeypatch.setattr(repo, "last_simulated_at_by_scenario", runs)
    # if the batched path regressed to per-scenario work, these would fire
    monkeypatch.setattr(svc, "_sections_with_results", AsyncMock(return_value=[]))
    monkeypatch.setattr(svc, "_last_simulated_at", AsyncMock(return_value=None))
    return calls


async def test_build_list_items_asks_once_for_every_scenario(batched_repo):
    scenarios = [_scenario(f"What-if {i}") for i in range(10)]
    when = datetime(2026, 10, 20, tzinfo=timezone.utc)
    batched_repo.score_map = {
        scenarios[0].id: [80, 70],
        scenarios[1].id: [55],
    }
    batched_repo.run_map = {scenarios[0].id: when}

    rows = [(sc, "Fall 2026", 3) for sc in scenarios]
    items = await svc.build_list_items(AsyncMock(), rows)

    assert len(items) == 10
    # both batches got every id, once
    assert batched_repo.scores == [sc.id for sc in scenarios]
    assert batched_repo.runs == [sc.id for sc in scenarios]
    # no per-scenario section assembly
    svc._sections_with_results.assert_not_awaited()
    svc._last_simulated_at.assert_not_awaited()

    assert items[0].avg_score == 75.0
    assert items[0].last_simulated_at == when
    assert items[1].avg_score == 55.0
    # a scenario with no results keeps a null average, as before
    assert items[2].avg_score is None
    assert items[2].last_simulated_at is None
    # the rest of the row is untouched
    assert items[0].name == "What-if 0"
    assert items[0].section_count == 3
    assert items[0].academic_term_name == "Fall 2026"


async def test_build_list_items_handles_an_empty_list(batched_repo):
    assert await svc.build_list_items(AsyncMock(), []) == []
    assert batched_repo.scores is None


async def test_sections_with_results_is_a_fixed_number_of_queries(monkeypatch):
    """A scenario's detail shapes must not scale with its section count."""
    course = SimpleNamespace(id=uuid4(), code="CS101", name="Intro")
    sections = [
        (SimpleNamespace(id=uuid4(), label=chr(65 + i)), course, None, None)
        for i in range(4)
    ]
    monkeypatch.setattr(
        repo, "list_scenario_sections", AsyncMock(return_value=sections)
    )
    rosters = AsyncMock(return_value={})
    results = AsyncMock(return_value={})
    monkeypatch.setattr(repo, "students_by_scenario_section", rosters)
    monkeypatch.setattr(repo, "latest_results_for_scenario_sections", results)

    out = await svc._sections_with_results(AsyncMock(), uuid4())

    assert [s.label for s in out] == ["A", "B", "C", "D"]
    assert rosters.await_count == 1
    assert results.await_count == 1
    assert rosters.await_args[0][1] == [ss.id for ss, *_ in sections]


# ── service: compare still pairs sections correctly ───────────────────────


async def test_compare_scenario_builds_each_section_from_the_batches(monkeypatch):
    """Regression guard: _section_shape takes prefetched rows, not a session."""
    course = SimpleNamespace(id=uuid4(), code="CS101", name="Intro")
    sections = [
        (SimpleNamespace(id=uuid4(), label=chr(65 + i)), course, None, None)
        for i in range(3)
    ]
    ada = SimpleNamespace(
        id=uuid4(), full_name="Ada", external_id=None, email=None
    )
    monkeypatch.setattr(
        repo, "list_scenario_sections", AsyncMock(return_value=sections)
    )
    monkeypatch.setattr(
        repo,
        "students_by_scenario_section",
        AsyncMock(return_value={sections[0][0].id: [(ada, None, None)]}),
    )
    monkeypatch.setattr(
        repo, "latest_results_for_scenario_sections", AsyncMock(return_value={})
    )
    # no live counterpart for any scenario section
    monkeypatch.setattr(repo, "baseline_section_for", AsyncMock(return_value=None))
    monkeypatch.setattr(repo, "term_name", AsyncMock(return_value="Fall 2026"))
    scenario = _scenario("What-if")
    monkeypatch.setattr(
        svc,
        "build_list_item",
        AsyncMock(return_value=svc._list_item(scenario, "Fall 2026", 3, None, None)),
    )

    out = await svc.compare_scenario(
        AsyncMock(), institution_id=uuid4(), scenario=scenario
    )

    assert [r.label for r in out.rows] == ["A", "B", "C"]
    # the roster batch lands on the right section, and the others stay empty
    assert out.rows[0].scenario_student_count == 1
    assert out.rows[1].scenario_student_count == 0
    assert all(r.baseline_section_id is None for r in out.rows)
    assert out.baseline_avg is None and out.scenario_avg is None
