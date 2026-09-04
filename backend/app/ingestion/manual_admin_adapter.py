"""Manual-entry adapter — the `manual_admin` source (an admin or HoD types one
student's answers into the ClassIQ form).

It is the form_app adapter with a fixed source and an optional link to an
existing student row (by id) instead of only external id / email.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.ingestion.types import IngestionIssue, InternalResponse
from app.models.ingestion_job import ResponseSource


def build_manual_response(
    *,
    answers: dict[int, str],
    student_id: UUID | None,
    external_id: str | None,
    email: str | None,
    full_name: str | None,
    collaboration_pref: str | None = None,
    participation_level: str | None = None,
    notes: str | None = None,
    submitted_at: datetime | None = None,
    entered_by: UUID | None = None,
) -> tuple[InternalResponse, list[IngestionIssue]]:
    when = submitted_at or datetime.now(timezone.utc)
    issues: list[IngestionIssue] = []
    if student_id is None and not external_id and not email:
        issues.append(
            IngestionIssue("manual", "identity", "pick an existing student or give an external id / email")
        )
    extra: dict = {}
    if student_id is not None:
        extra["student_id"] = student_id
    if collaboration_pref:
        extra["collaboration_pref"] = collaboration_pref.lower()
    if participation_level:
        extra["participation_level"] = participation_level.lower()
    if notes:
        extra["notes"] = notes
    stamp = when.strftime("%Y%m%dT%H%M%S%f")
    who = str(student_id) if student_id else (external_id or email or "anon")
    return (
        InternalResponse(
            external_response_id=f"manual:{who}:{stamp}",
            answers={int(k): str(v).strip().upper()[:1] for k, v in answers.items()},
            source=ResponseSource.manual_admin,
            email=(email or "").lower() or None,
            full_name=full_name,
            student_external_id=external_id,
            submitted_at=when,
            ref="manual entry",
            extra={**extra, "entered_by": str(entered_by) if entered_by else None},
        ),
        issues,
    )
