"""JSON adapter — the `form_app` source (ClassIQ's survey/form app pushing
submissions to the backend).

Accepted payload — one object or a list of them:

    {
      "response_id": "form-8f2c…",           # optional idempotency key
      "student": {                           # at least one of external_id / email
        "external_id": "SP23-BSCS-0179",
        "email": "someone@example.com",
        "full_name": "Someone"
      },
      "submitted_at": "2026-09-01T10:00:00Z", # optional
      "answers": {"1": "A", "2": "B", …}     # 44 entries, keys 1..44 (or "q1"…)
                 | ["A","B",…]               # or a 44-element list in order
      "aux": {"collaboration_pref": "group", "participation_level": "high"}  # optional
    }
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

from app.ingestion.types import IngestionIssue, InternalResponse
from app.models.ingestion_job import ResponseSource

_KEY_RE = re.compile(r"^\s*q?\s*(\d{1,2})\s*$", re.IGNORECASE)


def _answers_from(raw: Any, ref: str, issues: list[IngestionIssue]) -> dict[int, str]:
    answers: dict[int, str] = {}
    if isinstance(raw, list):
        for i, v in enumerate(raw, start=1):
            answers[i] = str(v).strip().upper()[:1]
        return answers
    if isinstance(raw, dict):
        for k, v in raw.items():
            m = _KEY_RE.match(str(k))
            if not m:
                issues.append(IngestionIssue(ref, "answers", f"unrecognised question key {k!r}"))
                continue
            answers[int(m.group(1))] = str(v).strip().upper()[:1]
        return answers
    issues.append(IngestionIssue(ref, "answers", "answers must be an object or a list"))
    return answers


def parse_form_payload(
    payload: Any,
    *,
    source: ResponseSource = ResponseSource.form_app,
) -> tuple[list[InternalResponse], list[IngestionIssue]]:
    items = payload if isinstance(payload, list) else [payload]
    issues: list[IngestionIssue] = []
    responses: list[InternalResponse] = []

    for i, item in enumerate(items, start=1):
        ref = f"submission {i}"
        if not isinstance(item, dict):
            issues.append(IngestionIssue(ref, "body", "submission must be an object"))
            continue
        student = item.get("student") or {}
        if not isinstance(student, dict):
            student = {}
        ext_id = (str(student.get("external_id") or "").strip()) or None
        email = (str(student.get("email") or "").strip().lower()) or None
        name = (str(student.get("full_name") or "").strip()) or None

        answers = _answers_from(item.get("answers"), ref, issues)

        when = datetime.now(timezone.utc)
        raw_when = item.get("submitted_at")
        if raw_when:
            try:
                parsed = datetime.fromisoformat(str(raw_when).replace("Z", "+00:00"))
                when = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                issues.append(IngestionIssue(ref, "submitted_at", f"not ISO-8601: {raw_when!r}"))

        response_id = str(item.get("response_id") or "").strip()
        if not response_id:
            digest = hashlib.sha1(
                f"{ext_id or ''}|{email or ''}|{''.join(answers.get(q, '?') for q in range(1, 45))}|{when.isoformat()}".encode()
            ).hexdigest()[:16]
            response_id = f"form:{digest}"

        extra: dict = {}
        aux = item.get("aux") or {}
        if isinstance(aux, dict):
            for key in ("collaboration_pref", "participation_level", "notes"):
                if aux.get(key):
                    extra[key] = str(aux[key]).strip().lower() if key != "notes" else str(aux[key])

        responses.append(
            InternalResponse(
                external_response_id=response_id,
                answers=answers,
                source=source,
                email=email,
                full_name=name,
                student_external_id=ext_id,
                submitted_at=when,
                ref=ref,
                extra=extra,
            )
        )
    return responses, issues
