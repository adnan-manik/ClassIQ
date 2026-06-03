"""CSV parsing + row validation for the user-import endpoint.

Schema:
    email,full_name,role[,department_code][,password]

`role` must be one of: hod, teacher, student, institution_admin.
`department_code` is optional; if present, must match a department code in
the caller's institution.
`password` is optional; only honored when mode=password is selected.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Iterable


VALID_ROLES = {"institution_admin", "hod", "teacher", "student"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


@dataclass(slots=True)
class UserImportRow:
    line: int
    email: str
    full_name: str
    role: str
    department_code: str | None
    password: str | None


@dataclass(slots=True)
class UserImportError:
    line: int
    field: str
    message: str


@dataclass(slots=True)
class CsvParseResult:
    valid: list[UserImportRow]
    errors: list[UserImportError]
    total: int


def parse_users_csv(blob: bytes) -> CsvParseResult:
    """Parse + validate a CSV upload. Does NOT touch the DB."""
    valid: list[UserImportRow] = []
    errors: list[UserImportError] = []
    total = 0

    try:
        text = blob.decode("utf-8-sig")
    except UnicodeDecodeError:
        errors.append(UserImportError(0, "file", "File must be UTF-8 encoded"))
        return CsvParseResult(valid, errors, 0)

    reader = csv.DictReader(io.StringIO(text))
    required = {"email", "full_name", "role"}
    missing = required - set(reader.fieldnames or [])
    if missing:
        errors.append(
            UserImportError(
                0,
                "header",
                f"Missing required columns: {', '.join(sorted(missing))}",
            )
        )
        return CsvParseResult(valid, errors, 0)

    for idx, raw in enumerate(reader, start=2):  # line 1 is header
        total += 1
        email = (raw.get("email") or "").strip().lower()
        full_name = (raw.get("full_name") or "").strip()
        role = (raw.get("role") or "").strip().lower()
        dept = (raw.get("department_code") or "").strip() or None
        password = (raw.get("password") or "").strip() or None

        row_errors: list[UserImportError] = []
        if not email:
            row_errors.append(UserImportError(idx, "email", "Email is required"))
        elif not EMAIL_RE.match(email):
            row_errors.append(UserImportError(idx, "email", f"Invalid email: {email}"))
        if not full_name:
            row_errors.append(
                UserImportError(idx, "full_name", "Full name is required")
            )
        if role not in VALID_ROLES:
            row_errors.append(
                UserImportError(
                    idx,
                    "role",
                    f"Role must be one of: {', '.join(sorted(VALID_ROLES))}",
                )
            )
        if password and len(password) < 8:
            row_errors.append(
                UserImportError(idx, "password", "Password must be ≥ 8 chars")
            )

        if row_errors:
            errors.extend(row_errors)
            continue

        valid.append(
            UserImportRow(
                line=idx,
                email=email,
                full_name=full_name,
                role=role,
                department_code=dept,
                password=password,
            )
        )

    return CsvParseResult(valid, errors, total)


def detect_duplicate_emails(rows: Iterable[UserImportRow]) -> list[UserImportError]:
    """Return errors for any email that appears more than once in the batch."""
    seen: dict[str, int] = {}
    errors: list[UserImportError] = []
    for r in rows:
        prev = seen.get(r.email)
        if prev is not None:
            errors.append(
                UserImportError(
                    r.line,
                    "email",
                    f"Duplicate email in batch (also at line {prev})",
                )
            )
        else:
            seen[r.email] = r.line
    return errors
