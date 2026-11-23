"""The one internal shape every ingestion source converges on."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.models.ingestion_job import ResponseSource

TOTAL_QUESTIONS = 44


@dataclass(slots=True)
class InternalResponse:
    """One survey submission, source-agnostic.

    `answers` maps question sequence number (1..44) → 'A' | 'B'.
    Student identity resolution order in the pipeline:
      1. `student_external_id` within the institution,
      2. `email` (case-insensitive) within the institution,
      3. otherwise a new student row is created.
    """

    external_response_id: str
    answers: dict[int, str]
    source: ResponseSource
    email: str | None = None
    full_name: str | None = None
    student_external_id: str | None = None
    submitted_at: datetime | None = None
    ref: str | None = None  # where it came from (RDF individual, CSV line…) for error messages
    extra: dict = field(default_factory=dict)  # aux data (collaboration, participation…)
    # True when `external_response_id` is derived from who answered (an RDF
    # individual's name, a hash of identity + answers) rather than issued per
    # submission. Such an id repeats when the same student is surveyed again
    # next term, so the pipeline scopes it to the academic term.
    term_scoped_id: bool = False


@dataclass(slots=True)
class IngestionIssue:
    ref: str
    field: str
    message: str

    def as_dict(self) -> dict:
        return {"ref": self.ref, "field": self.field, "message": self.message}


def validate_response(r: InternalResponse) -> list[IngestionIssue]:
    """Structural checks — 44 questions present, A/B only, some identity."""
    ref = r.ref or r.external_response_id
    issues: list[IngestionIssue] = []
    if not r.external_response_id:
        issues.append(IngestionIssue(ref, "external_response_id", "missing response id"))
    if not r.email and not r.student_external_id and not r.extra.get("student_id"):
        issues.append(IngestionIssue(ref, "identity", "needs an email or a student id"))

    bad = [q for q, a in r.answers.items() if a not in ("A", "B")]
    if bad:
        issues.append(
            IngestionIssue(ref, "answers", f"non A/B answer for question(s) {sorted(bad)}")
        )
    out_of_range = [q for q in r.answers if not 1 <= q <= TOTAL_QUESTIONS]
    if out_of_range:
        issues.append(
            IngestionIssue(ref, "answers", f"question number out of range: {sorted(out_of_range)}")
        )
    missing = [q for q in range(1, TOTAL_QUESTIONS + 1) if q not in r.answers]
    if missing:
        issues.append(
            IngestionIssue(
                ref,
                "answers",
                f"{len(missing)} of {TOTAL_QUESTIONS} answers missing (e.g. Q{missing[0]})",
            )
        )
    return issues
