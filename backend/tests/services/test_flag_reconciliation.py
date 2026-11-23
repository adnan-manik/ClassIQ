"""evaluate_section must keep one flag per (student, type, metric).

A student under the attendance band who also reports low engagement produces
two `engagement` drafts. Keyed by (student, type) alone, the first evaluation
inserted two rows and every later one wrote both drafts into a single row,
leaving the other stale and never auto-resolved.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.models.early_warning import (
    EarlyWarningFlag,
    SectionOutcome,
    WarningSeverity,
    WarningStatus,
    WarningType,
)
from app.models.section import Section
from app.models.simulation import PredictedOutcome
from app.models.student import ParticipationLevel
from app.services import early_warning_service as ew

STUDENT = uuid4()


@pytest.fixture
def section():
    return Section(id=uuid4(), institution_id=uuid4())


@pytest.fixture(autouse=True)
def _stubs(monkeypatch):
    monkeypatch.setattr(ew, "write_audit", AsyncMock())
    monkeypatch.setattr(ew, "list_flags", AsyncMock(return_value=[]))
    monkeypatch.setattr(ew, "roster_names", AsyncMock(return_value={STUDENT: "Ali"}))
    monkeypatch.setattr(
        ew, "latest_prediction", AsyncMock(return_value=(PredictedOutcome.high, 75))
    )


def _rows(items):
    return Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=items))))


def session(section, existing_flags):
    """Attendance 60 % and engagement 'low' for one week: under the high band
    on attendance and on engagement, fine on grade."""
    outcome = SectionOutcome(
        id=uuid4(),
        institution_id=section.institution_id,
        section_id=section.id,
        student_id=STUDENT,
        week_no=1,
        attendance_pct=60,
        grade_pct=80,
        engagement_level=ParticipationLevel.low,
    )
    db = AsyncMock()
    db.add = Mock()
    db.execute = AsyncMock(side_effect=[_rows([outcome]), _rows(existing_flags)])
    return db


def flag(section, metric, *, age_days=0, message="old"):
    return EarlyWarningFlag(
        id=uuid4(),
        institution_id=section.institution_id,
        section_id=section.id,
        student_id=STUDENT,
        type=WarningType.engagement,
        severity=WarningSeverity.low,
        status=WarningStatus.open,
        message=message,
        metric_name=metric,
        created_at=datetime.now(timezone.utc) - timedelta(days=age_days),
    )


async def evaluate(db, section):
    return await ew.evaluate_section(
        db, institution_id=section.institution_id, user=SimpleNamespace(id=uuid4()), section=section
    )


async def test_first_evaluation_opens_one_flag_per_metric(section):
    db = session(section, [])
    res = await evaluate(db, section)
    assert (res.opened, res.updated, res.auto_resolved) == (2, 0, 0)
    metrics = sorted(call.args[0].metric_name for call in db.add.call_args_list)
    assert metrics == ["attendance_pct", "engagement"]


async def test_re_evaluation_updates_each_flag_with_its_own_message(section):
    attendance = flag(section, "attendance_pct")
    engagement = flag(section, "engagement")
    db = session(section, [attendance, engagement])
    res = await evaluate(db, section)
    assert (res.opened, res.updated, res.auto_resolved) == (0, 2, 0)
    db.add.assert_not_called()
    assert "attendance" in attendance.message
    assert "engagement reported as low" in engagement.message
    assert attendance.status == engagement.status == WarningStatus.open


async def test_leftover_duplicates_are_resolved(section):
    # The state the old key left behind: two open rows that both ended up
    # carrying the engagement metric, and no row for attendance.
    older = flag(section, "engagement", age_days=7)
    newer = flag(section, "engagement", age_days=1)
    db = session(section, [newer, older])
    res = await evaluate(db, section)
    assert (res.opened, res.updated, res.auto_resolved) == (1, 1, 1)
    assert older.status == WarningStatus.open  # oldest keeps the key
    assert newer.status == WarningStatus.resolved
    assert db.add.call_args.args[0].metric_name == "attendance_pct"


async def test_section_flag_keeps_identity_when_its_metric_changes():
    a = ew.flag_key(None, "compatibility", "class_grade")
    b = ew.flag_key(None, "compatibility", "attendance_pct")
    assert a == b
    assert ew.flag_key(STUDENT, "engagement", "attendance_pct") != ew.flag_key(
        STUDENT, "engagement", "engagement"
    )
