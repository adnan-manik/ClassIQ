"""The sections, early-warning and departments list pages must not query per row.

Each of these used to resolve one extra lookup for every row it rendered, so a
page's cost grew with the institution. Against a remote pooler that is a
network hop per row. These tests pin the statement count and the grouping that
replaced it.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.repositories import institutions_admin as ia_repo
from app.repositories import sections as sections_repo
from app.services import early_warning_service as ew

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


def _result(section_id):
    return SimpleNamespace(id=uuid4(), section_id=section_id)


def _factor(result_id, name):
    return SimpleNamespace(simulation_result_id=result_id, factor_name=name)


# ── sections list ─────────────────────────────────────────────────────────


async def test_latest_results_for_sections_is_two_round_trips():
    sections = [uuid4() for _ in range(12)]
    results = [_result(sid) for sid in sections]
    teacher = SimpleNamespace(id=uuid4(), full_name="Ada")
    factors = [
        _factor(results[0].id, "style_alignment"),
        _factor(results[0].id, "participation"),
        _factor(results[1].id, "social_cohesion"),
    ]
    db = FakeSession(
        [
            [(r, teacher if i == 0 else None) for i, r in enumerate(results)],
            [(f,) for f in factors],
        ]
    )
    out = await sections_repo.latest_results_for_sections(db, sections)

    # twelve sections, two statements — the old path cost two each
    assert len(db.sql) == 2
    assert set(out) == set(sections)
    # the newest row per section is picked by the DB, not in Python
    assert "DISTINCT ON (simulation_results.section_id)" in db.sql[0]

    first_result, first_factors, first_teacher = out[sections[0]]
    assert first_result is results[0]
    assert first_teacher is teacher
    # factor rows arrive ordered by name and stay grouped by their own result
    assert [f.factor_name for f in first_factors] == [
        "style_alignment",
        "participation",
    ]
    assert len(out[sections[1]][1]) == 1
    assert out[sections[2]][1] == []
    assert out[sections[2]][2] is None


async def test_latest_results_for_sections_short_circuits_when_empty():
    db = FakeSession([])
    assert await sections_repo.latest_results_for_sections(db, []) == {}
    assert db.sql == []


async def test_latest_results_for_sections_skips_factors_with_no_results():
    db = FakeSession([[]])
    assert await sections_repo.latest_results_for_sections(db, [uuid4()]) == {}
    assert len(db.sql) == 1


async def test_list_sections_route_batches_the_result_lookup(monkeypatch):
    """The route must ask for every section's result at once."""
    from app.routers import sections as sections_router

    secs = [
        (
            SimpleNamespace(id=uuid4(), label=chr(65 + i), state="draft"),
            SimpleNamespace(id=uuid4(), code=f"CS10{i}", name="Intro"),
            None,
            None,
            3,
        )
        for i in range(5)
    ]
    monkeypatch.setattr(
        sections_router.sections_repo, "list_sections", AsyncMock(return_value=secs)
    )
    batched = AsyncMock(return_value={})
    monkeypatch.setattr(
        sections_router.sections_repo, "latest_results_for_sections", batched
    )
    per_row = AsyncMock(return_value=None)
    monkeypatch.setattr(
        sections_router.sections_repo, "latest_result_for_section", per_row
    )

    items = await sections_router.list_sections(
        SimpleNamespace(institution_id=uuid4()), AsyncMock()
    )

    assert len(items) == 5
    assert batched.await_count == 1
    assert batched.await_args[0][1] == [sec.id for sec, *_ in secs]
    per_row.assert_not_awaited()


# ── early-warning overview ────────────────────────────────────────────────


async def test_latest_predictions_is_one_round_trip():
    a, b, c = uuid4(), uuid4(), uuid4()
    db = FakeSession([[(a, "high", 80), (b, "low", 40)]])
    out = await ew.latest_predictions(db, [a, b, c])

    assert len(db.sql) == 1
    assert "DISTINCT ON (simulation_results.section_id)" in db.sql[0]
    assert out == {a: ("high", 80), b: ("low", 40)}
    # a section that has never been simulated is simply absent
    assert c not in out


async def test_latest_predictions_short_circuits_when_empty():
    db = FakeSession([])
    assert await ew.latest_predictions(db, []) == {}
    assert db.sql == []


# ── departments list ──────────────────────────────────────────────────────


async def test_list_hods_of_departments_is_one_round_trip():
    d1, d2, d3 = uuid4(), uuid4(), uuid4()
    ada = SimpleNamespace(id=uuid4(), full_name="Ada", email="ada@x.test")
    bob = SimpleNamespace(id=uuid4(), full_name="Bob", email="bob@x.test")
    cleo = SimpleNamespace(id=uuid4(), full_name="Cleo", email="cleo@x.test")
    db = FakeSession([[(d1, ada), (d1, bob), (d2, cleo)]])
    out = await ia_repo.list_hods_of_departments(db, [d1, d2, d3])

    assert len(db.sql) == 1
    assert "hod" in db.sql[0] or "role" in db.sql[0]
    # grouping preserves the name ordering the query asked for
    assert [h.full_name for h in out[d1]] == ["Ada", "Bob"]
    assert [h.full_name for h in out[d2]] == ["Cleo"]
    # a department with no HOD is absent, so callers default to []
    assert out.get(d3, []) == []


async def test_list_hods_of_departments_short_circuits_when_empty():
    db = FakeSession([])
    assert await ia_repo.list_hods_of_departments(db, []) == {}
    assert db.sql == []
