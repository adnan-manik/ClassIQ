"""The analytics panel must not scale its query count with the data.

The DB is a remote pooler, so every statement is a network round trip. These
tests pin the number of statements each aggregation issues and check that the
merge logic still zero-fills departments with no rows — the behaviour that was
free when each department had its own query.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.repositories import analytics

DIALECT = postgresql.dialect()


class _Row(tuple):
    """Tuple that also answers to the labels the repo reads by name."""

    def __new__(cls, values, labels):
        self = super().__new__(cls, values)
        self._labels = dict(zip(labels, values))
        return self

    def __getattr__(self, name):
        try:
            return self._labels[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


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

    def one(self):
        assert len(self._rows) == 1, f"expected exactly one row, got {len(self._rows)}"
        return self._rows[0]

    def scalars(self):
        return _Scalars([r[0] for r in self._rows])


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


def _dept(name: str, code: str):
    return SimpleNamespace(id=uuid4(), name=name, code=code)


COUNT_LABELS = (
    "student_count",
    "teacher_count",
    "section_count",
    "simulation_count",
    "avg_score",
)
AXIS_LABELS = ["total"] + [
    label for key, *_ in analytics.AXES for label in (f"{key}__a", f"{key}__b")
]


async def test_institution_counts_is_one_round_trip():
    db = FakeSession([[_Row((12, 3, 5, 7, 74.5), COUNT_LABELS)]])
    out = await analytics.institution_counts(db, uuid4())
    assert len(db.sql) == 1
    assert out == {
        "student_count": 12,
        "teacher_count": 3,
        "section_count": 5,
        "simulation_count": 7,
        "avg_compatibility_score": 74.5,
    }
    # Tenant scoping survives the rewrite: the backend bypasses RLS.
    assert db.sql[0].count("institution_id") >= 5


async def test_institution_counts_keeps_null_average():
    db = FakeSession([[_Row((0, 0, 0, 0, None), COUNT_LABELS)]])
    out = await analytics.institution_counts(db, uuid4())
    assert out["avg_compatibility_score"] is None


async def test_institution_counts_scopes_to_department_via_courses():
    db = FakeSession([[_Row((4, 1, 2, 2, 60.0), COUNT_LABELS)]])
    await analytics.institution_counts(db, uuid4(), department_id=uuid4())
    assert len(db.sql) == 1
    assert "JOIN courses" in db.sql[0]
    assert "department_id" in db.sql[0]


async def test_fslsm_distribution_is_one_round_trip():
    db = FakeSession([[_Row((20, 11, 9, 12, 8, 15, 5, 10, 10), AXIS_LABELS)]])
    out = await analytics.fslsm_distribution(db, uuid4())
    assert len(db.sql) == 1
    # one total plus a pole pair per axis, all as FILTER aggregates
    assert db.sql[0].count("FILTER (WHERE") == 2 * len(analytics.AXES)
    assert out["total_profiles"] == 20
    assert [(a["axis"], a["pole_a_count"], a["pole_b_count"]) for a in out["axes"]] == [
        ("active_reflective", 11, 9),
        ("sensing_intuitive", 12, 8),
        ("visual_verbal", 15, 5),
        ("sequential_global", 10, 10),
    ]
    assert out["axes"][0]["pole_a_label"] == "Active"
    assert out["axes"][0]["pole_b_label"] == "Reflective"
    assert "is_current" in db.sql[0]


async def test_departments_rollup_does_not_query_per_department():
    alpha, beta, gamma = _dept("Alpha", "AL"), _dept("Beta", "BE"), _dept("Gamma", "GA")
    db = FakeSession(
        [
            [(alpha,), (beta,), (gamma,)],
            [(alpha.id, 10), (beta.id, 4)],
            [(alpha.id, 2)],
            [(alpha.id, 3), (gamma.id, 1)],
            [(alpha.id, 6, 80.0)],
        ]
    )
    out = await analytics.departments_rollup(db, uuid4())

    # 1 department query + 4 grouped aggregates, whatever the department count
    assert len(db.sql) == 5
    assert [r["department_name"] for r in out] == ["Alpha", "Beta", "Gamma"]
    assert out[0] == {
        "department_id": alpha.id,
        "department_name": "Alpha",
        "department_code": "AL",
        "student_count": 10,
        "teacher_count": 2,
        "section_count": 3,
        "avg_compatibility_score": 80.0,
        "simulations_run": 6,
    }
    # Departments missing from an aggregate still appear, with zeros and no avg
    assert (out[1]["teacher_count"], out[1]["simulations_run"]) == (0, 0)
    assert out[1]["avg_compatibility_score"] is None
    assert (out[2]["student_count"], out[2]["section_count"]) == (0, 1)
    assert all("institution_id" in q for q in db.sql[1:])


async def test_departments_rollup_short_circuits_without_departments():
    db = FakeSession([[]])
    assert await analytics.departments_rollup(db, uuid4()) == []
    assert len(db.sql) == 1


async def test_simulations_by_department_is_two_round_trips():
    alpha, beta = _dept("Alpha", "AL"), _dept("Beta", "BE")
    db = FakeSession([[(alpha,), (beta,)], [(alpha.id, 9, 71.25)]])
    out = await analytics.simulations_by_department(db, uuid4(), days=30)
    assert len(db.sql) == 2
    assert (out[0]["runs_last_30d"], out[0]["avg_score"]) == (9, 71.25)
    assert (out[1]["runs_last_30d"], out[1]["avg_score"]) == (0, None)
    assert "created_at >=" in db.sql[1]


async def test_simulations_by_department_short_circuits_without_departments():
    db = FakeSession([[]])
    assert await analytics.simulations_by_department(db, uuid4()) == []
    assert len(db.sql) == 1


async def test_score_trend_unchanged():
    db = FakeSession([[(datetime(2026, 10, 19), 70.0, 3)]])
    out = await analytics.score_trend(db, uuid4(), weeks=12)
    assert len(db.sql) == 1
    assert out == [
        {"bucket_start": datetime(2026, 10, 19).date(), "avg_score": 70.0, "runs": 3}
    ]


@pytest.mark.parametrize(
    "fn",
    [analytics.departments_rollup, analytics.simulations_by_department],
)
async def test_rollups_never_loop_a_query(fn):
    """Ten departments must cost the same as one."""
    depts = [_dept(f"D{i:02d}", f"D{i}") for i in range(10)]
    # One canned result per statement the function is allowed to issue; an
    # extra query raises inside FakeSession.
    db = FakeSession([[(d,) for d in depts]] + [[] for _ in range(4)])
    out = await fn(db, uuid4())
    assert len(out) == 10
    assert len(db.sql) <= 5
