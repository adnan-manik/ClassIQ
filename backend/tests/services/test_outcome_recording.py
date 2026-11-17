"""record_outcomes must cost a fixed number of queries, not one per entry.

A teacher saving a week for a full class sends one entry per student. Each one
used to run its own SELECT for the existing row, so a 30-student class meant 30
round trips to a remote pooler. The rows for a (section, week) now arrive in a
single query; these tests pin that and the upsert behaviour that came free with
the old per-entry lookup.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.models.early_warning import SectionOutcome
from app.models.section import Section
from app.schemas.early_warning import OutcomeEntry
from app.services import early_warning_service as ew


@pytest.fixture
def section():
    return Section(id=uuid4(), institution_id=uuid4())


@pytest.fixture
def actor():
    return SimpleNamespace(id=uuid4())


def session_returning(existing_rows):
    """AsyncSession stub whose single SELECT yields `existing_rows`."""
    db = AsyncMock()
    db.add = Mock()
    db.execute = AsyncMock(
        return_value=Mock(
            scalars=Mock(return_value=Mock(all=Mock(return_value=existing_rows)))
        )
    )
    return db


@pytest.fixture(autouse=True)
def _quiet_audit(monkeypatch):
    monkeypatch.setattr(ew, "write_audit", AsyncMock())


async def test_one_select_for_a_whole_class(monkeypatch, section, actor):
    students = [uuid4() for _ in range(30)]
    monkeypatch.setattr(
        ew, "roster_names", AsyncMock(return_value={s: f"S{i}" for i, s in enumerate(students)})
    )
    db = session_returning([])
    saved = await ew.record_outcomes(
        db,
        institution_id=section.institution_id,
        user=actor,
        section=section,
        week_no=3,
        entries=[OutcomeEntry(student_id=s, attendance_pct=90) for s in students],
    )
    assert saved == 30
    # one SELECT for the existing rows, and nothing per entry
    assert db.execute.await_count == 1
    assert db.add.call_count == 30


async def test_existing_rows_are_updated_not_duplicated(monkeypatch, section, actor):
    student = uuid4()
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={student: "Ada"}))
    row = SectionOutcome(
        id=uuid4(),
        institution_id=section.institution_id,
        section_id=section.id,
        student_id=student,
        week_no=3,
        attendance_pct=10,
    )
    db = session_returning([row])
    saved = await ew.record_outcomes(
        db,
        institution_id=section.institution_id,
        user=actor,
        section=section,
        week_no=3,
        entries=[OutcomeEntry(student_id=student, attendance_pct=88, grade_pct=70)],
    )
    assert saved == 1
    db.add.assert_not_called()
    assert (row.attendance_pct, row.grade_pct) == (88, 70)
    assert row.recorded_by == actor.id


async def test_section_level_row_keyed_by_null_student(monkeypatch, section, actor):
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={}))
    row = SectionOutcome(
        id=uuid4(),
        institution_id=section.institution_id,
        section_id=section.id,
        student_id=None,
        week_no=2,
        attendance_pct=50,
    )
    db = session_returning([row])
    saved = await ew.record_outcomes(
        db,
        institution_id=section.institution_id,
        user=actor,
        section=section,
        week_no=2,
        entries=[OutcomeEntry(student_id=None, attendance_pct=77)],
    )
    assert saved == 1
    db.add.assert_not_called()
    assert row.attendance_pct == 77


async def test_repeated_entry_for_one_student_updates_a_single_row(
    monkeypatch, section, actor
):
    student = uuid4()
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={student: "Ada"}))
    db = session_returning([])
    saved = await ew.record_outcomes(
        db,
        institution_id=section.institution_id,
        user=actor,
        section=section,
        week_no=1,
        entries=[
            OutcomeEntry(student_id=student, attendance_pct=60),
            OutcomeEntry(student_id=student, attendance_pct=95),
        ],
    )
    assert saved == 2
    # one row created, then reused — not two inserts racing the same unique key
    assert db.add.call_count == 1
    created = db.add.call_args[0][0]
    assert created.attendance_pct == 95


async def test_student_outside_the_roster_is_rejected(monkeypatch, section, actor):
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={uuid4(): "Ada"}))
    db = session_returning([])
    with pytest.raises(ew.EarlyWarningError):
        await ew.record_outcomes(
            db,
            institution_id=section.institution_id,
            user=actor,
            section=section,
            week_no=1,
            entries=[OutcomeEntry(student_id=uuid4(), attendance_pct=50)],
        )
    db.add.assert_not_called()


async def test_blank_entries_are_skipped(monkeypatch, section, actor):
    student = uuid4()
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={student: "Ada"}))
    db = session_returning([])
    saved = await ew.record_outcomes(
        db,
        institution_id=section.institution_id,
        user=actor,
        section=section,
        week_no=1,
        entries=[OutcomeEntry(student_id=student, notes="just a note")],
    )
    assert saved == 0
    db.add.assert_not_called()
