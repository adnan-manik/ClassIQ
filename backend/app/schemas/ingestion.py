"""Request + response shapes for /api/ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import EmailStr, Field, field_validator

from app.models.ingestion_job import IngestionStatus
from app.models.student import CollabPref, ParticipationLevel
from app.schemas.common import APIModel


class IngestionIssueShape(APIModel):
    ref: str
    field: str
    message: str


class IngestionSummaryShape(APIModel):
    students_seen: int = 0
    students_created: int = 0
    students_matched: int = 0
    responses_ingested: int = 0
    responses_duplicate: int = 0
    responses_rejected: int = 0
    profiles_created: int = 0
    aux_profiles_created: int = 0
    errors: list[IngestionIssueShape] = Field(default_factory=list)
    errors_truncated: int = 0


class IngestionReportShape(APIModel):
    job_id: UUID | None
    status: IngestionStatus
    dry_run: bool
    source: str
    summary: IngestionSummaryShape


class FormIngestRequest(APIModel):
    """Submissions from ClassIQ's own form app. See ingestion/form_app_adapter.py."""

    submissions: list[dict[str, Any]] | dict[str, Any]
    academic_term_id: UUID | None = None
    department_id: UUID | None = None


class ManualSubmission(APIModel):
    """One student's ILS answers typed in by staff."""

    student_id: UUID | None = None
    external_id: str | None = Field(default=None, max_length=64)
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=160)
    answers: dict[int, str]
    collaboration_pref: CollabPref | None = None
    participation_level: ParticipationLevel | None = None
    notes: str | None = Field(default=None, max_length=1000)
    academic_term_id: UUID | None = None
    department_id: UUID | None = None

    @field_validator("answers")
    @classmethod
    def _check_answers(cls, v: dict[int, str]) -> dict[int, str]:
        cleaned = {int(k): str(a).strip().upper() for k, a in v.items()}
        bad = [q for q, a in cleaned.items() if a not in ("A", "B")]
        if bad:
            raise ValueError(f"answers must be 'A' or 'B' (bad: {sorted(bad)[:5]})")
        missing = [q for q in range(1, 45) if q not in cleaned]
        if missing:
            raise ValueError(f"all 44 answers are required (missing {missing[:5]}…)")
        return cleaned


class QuestionShape(APIModel):
    sequence_no: int
    prompt: str
    answer_a: str
    answer_b: str
    axis: str
    answer_a_pole: str
    answer_b_pole: str


class InstrumentShape(APIModel):
    id: UUID | None
    name: str
    version: str
    total_questions: int
    questions: list[QuestionShape]


class IngestionJobShape(APIModel):
    id: UUID
    source: str
    status: IngestionStatus
    started_at: datetime | None
    finished_at: datetime | None
    file_path: str | None
    summary: dict | None
    triggered_by: UUID | None
    triggered_by_name: str | None = None
    created_at: datetime
