"""The CSV user import must resolve its lookups per file, not per row.

Preview ran one department-code query per CSV line and commit ran one
auth_users query per row, so a 200-line staff import spent hundreds of network
round trips deciding what to do before creating anything. Both are now one
query each; these tests pin that and the exact-match semantics the row-at-a-
time versions had, since the import's accept/reject decisions depend on them.
"""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.repositories import institutions_admin as ia_repo

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


# ── department codes ──────────────────────────────────────────────────────


async def test_department_codes_resolve_in_one_query():
    cs, ee = uuid4(), uuid4()
    db = FakeSession([[("CS", cs), ("EE", ee)]])
    out = await ia_repo.department_codes_to_ids(
        db, uuid4(), ["CS", "EE", "CS", "GONE"]
    )

    # one statement for the whole file, repeated codes collapsed
    assert len(db.sql) == 1
    assert out == {"CS": cs, "EE": ee}
    # a code with no live department is absent, so callers still read None
    assert out.get("GONE") is None
    assert "deleted_at IS NULL" in db.sql[0]
    assert "institution_id" in db.sql[0]


async def test_department_codes_short_circuit_without_codes():
    db = FakeSession([])
    assert await ia_repo.department_codes_to_ids(db, uuid4(), []) == {}
    assert db.sql == []


async def test_department_codes_are_matched_exactly():
    """The per-row version used `==`, so casing must still matter."""
    db = FakeSession([[]])
    out = await ia_repo.department_codes_to_ids(db, uuid4(), ["cs"])
    assert out == {}
    assert "lower(" not in db.sql[0].lower()


# ── existing auth_users emails ────────────────────────────────────────────


async def test_existing_emails_resolve_in_one_query():
    db = FakeSession([[("taken@x.test",), ("also@x.test",)]])
    out = await ia_repo.existing_auth_user_emails(
        db, uuid4(), ["taken@x.test", "free@x.test", "also@x.test", "taken@x.test"]
    )

    assert len(db.sql) == 1
    assert out == {"taken@x.test", "also@x.test"}
    # the import rejects a row only when its email is in this set
    assert "free@x.test" not in out
    assert "institution_id" in db.sql[0]


async def test_existing_emails_short_circuit_without_emails():
    db = FakeSession([])
    assert await ia_repo.existing_auth_user_emails(db, uuid4(), []) == set()
    assert db.sql == []


async def test_existing_emails_are_matched_exactly():
    db = FakeSession([[]])
    assert await ia_repo.existing_auth_user_emails(db, uuid4(), ["A@x.test"]) == set()
    assert "lower(" not in db.sql[0].lower()
