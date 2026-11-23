"""CSV adapter — the `classiq_internal` source (exports of ClassIQ's own survey).

Columns (header row required, case-insensitive):
    external_id | student_id      optional — institution roster id (SP23-BSCS-0179)
    email                         optional — used to match when no external id
    full_name | name              optional
    response_id                   optional — idempotency key; defaults to a hash of
                                  identity + answers
    submitted_at                  optional ISO-8601
    q1 … q44                      required — 'A' or 'B' (also accepts 'a'/'b', 'A1'-style)
    collaboration_pref            optional — solo | pair | group
    participation_level           optional — low | medium | high
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime, timezone

from app.ingestion.types import TOTAL_QUESTIONS, IngestionIssue, InternalResponse
from app.models.ingestion_job import ResponseSource

_Q_RE = re.compile(r"^q\s*(\d{1,2})$")
_VAL_RE = re.compile(r"^\s*([AaBb])\s*\d{0,2}\s*$")


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", "", (h or "").strip().lower())


def parse_csv(
    blob: bytes | str,
    *,
    submitted_at: datetime | None = None,
) -> tuple[list[InternalResponse], list[IngestionIssue]]:
    issues: list[IngestionIssue] = []
    try:
        text = blob.decode("utf-8-sig") if isinstance(blob, (bytes, bytearray)) else blob
    except UnicodeDecodeError:
        return [], [IngestionIssue("file", "encoding", "file must be UTF-8 encoded")]

    reader = csv.DictReader(io.StringIO(text))
    headers = [(_norm_header(h), h) for h in (reader.fieldnames or [])]
    qcols: dict[int, str] = {}
    for norm, raw in headers:
        m = _Q_RE.match(norm)
        if m:
            qcols[int(m.group(1))] = raw
    missing_q = [q for q in range(1, TOTAL_QUESTIONS + 1) if q not in qcols]
    if missing_q:
        return [], [
            IngestionIssue(
                "header", "columns", f"missing question column(s): {', '.join(f'q{q}' for q in missing_q[:6])}{'…' if len(missing_q) > 6 else ''}"
            )
        ]

    def col(row: dict, *names: str) -> str | None:
        for norm, raw in headers:
            if norm in names:
                v = (row.get(raw) or "").strip()
                if v:
                    return v
        return None

    when_default = submitted_at or datetime.now(timezone.utc)
    responses: list[InternalResponse] = []
    for line_no, row in enumerate(reader, start=2):
        ref = f"line {line_no}"
        ext_id = col(row, "external_id", "student_id", "studentid")
        email = (col(row, "email") or "").lower() or None
        name = col(row, "full_name", "name", "fullname")
        answers: dict[int, str] = {}
        for q, raw in qcols.items():
            v = (row.get(raw) or "").strip()
            if not v:
                continue
            m = _VAL_RE.match(v)
            if not m:
                issues.append(IngestionIssue(ref, f"q{q}", f"expected A or B, got {v!r}"))
                continue
            answers[q] = m.group(1).upper()

        when = when_default
        raw_when = col(row, "submitted_at", "submittedat", "timestamp")
        if raw_when:
            try:
                parsed = datetime.fromisoformat(raw_when.replace("Z", "+00:00"))
                when = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                issues.append(IngestionIssue(ref, "submitted_at", f"not ISO-8601: {raw_when!r}"))

        response_id = col(row, "response_id", "responseid")
        derived_id = not response_id
        if derived_id:
            digest = hashlib.sha1(
                f"{ext_id or ''}|{email or ''}|{''.join(answers.get(q, '?') for q in range(1, 45))}".encode()
            ).hexdigest()[:16]
            response_id = f"csv:{digest}"

        extra: dict = {}
        collab = col(row, "collaboration_pref", "collaborationpref", "collaboration")
        part = col(row, "participation_level", "participationlevel", "participation")
        if collab:
            extra["collaboration_pref"] = collab.lower()
        if part:
            extra["participation_level"] = part.lower()

        responses.append(
            InternalResponse(
                external_response_id=response_id,
                answers=answers,
                source=ResponseSource.classiq_internal,
                email=email,
                full_name=name,
                student_external_id=ext_id,
                submitted_at=when,
                ref=ref,
                extra=extra,
                term_scoped_id=derived_id,
            )
        )

    if not responses and not issues:
        issues.append(IngestionIssue("file", "content", "no data rows"))
    return responses, issues
