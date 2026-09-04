"""Request + response shapes for /api/early-warning (S1)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.early_warning import WarningSeverity, WarningStatus, WarningType
from app.models.simulation import PredictedOutcome
from app.models.student import ParticipationLevel
from app.schemas.common import APIModel
from app.schemas.sections import CourseRef


class OutcomeEntry(APIModel):
    student_id: UUID | None = None  # None = whole-section aggregate
    attendance_pct: float | None = Field(default=None, ge=0, le=100)
    grade_pct: float | None = Field(default=None, ge=0, le=100)
    engagement_level: ParticipationLevel | None = None
    notes: str | None = Field(default=None, max_length=500)


class RecordOutcomesRequest(APIModel):
    week_no: int = Field(..., ge=1, le=20)
    entries: list[OutcomeEntry] = Field(..., min_length=1)
    evaluate: bool = True  # re-run the comparator right after saving


class OutcomeShape(APIModel):
    id: UUID
    section_id: UUID
    student_id: UUID | None
    student_name: str | None
    week_no: int
    attendance_pct: float | None
    grade_pct: float | None
    engagement_level: ParticipationLevel | None
    notes: str | None
    recorded_by_name: str | None
    recorded_at: datetime


class FlagShape(APIModel):
    id: UUID
    section_id: UUID
    course: CourseRef | None
    section_label: str | None
    student_id: UUID | None
    student_name: str | None
    type: WarningType
    severity: WarningSeverity
    status: WarningStatus
    message: str
    predicted_outcome: PredictedOutcome | None
    metric_name: str | None
    expected_value: float | None
    actual_value: float | None
    deviation: float | None
    week_no: int | None
    evaluated_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime


class FlagPatch(APIModel):
    status: WarningStatus


class EvaluateResponse(APIModel):
    section_id: UUID
    predicted_outcome: PredictedOutcome | None
    compatibility_score: int | None
    weeks_recorded: int
    flags: list[FlagShape]
    opened: int
    updated: int
    auto_resolved: int


class RecordOutcomesResponse(APIModel):
    saved: int
    evaluation: EvaluateResponse | None


class SectionWarningSummary(APIModel):
    section_id: UUID
    course: CourseRef
    label: str
    state: str
    teacher_name: str | None
    predicted_outcome: PredictedOutcome | None
    compatibility_score: int | None
    weeks_recorded: int
    latest_week: int | None
    open_flags: int
    high_flags: int


class EarlyWarningOverview(APIModel):
    open_total: int
    by_severity: dict[str, int]
    by_type: dict[str, int]
    sections: list[SectionWarningSummary]
