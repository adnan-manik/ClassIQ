"""/api/institution/users/import — CSV bulk-create users.

Two phases:
  POST /preview  — parse + validate, no DB writes
  POST /commit   — provision users; writes ingestion_jobs summary; per-row error tolerance

Behavior depends on role:
  - student → insert directly into public.students (no auth account)
  - teacher → call Supabase Admin API + insert into public.teachers
  - hod / institution_admin → call Supabase Admin API only
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.ingestion_job import IngestionJob, IngestionStatus, ResponseSource
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.user_department import UserDepartment
from app.repositories import institutions_admin as ia_repo
from app.schemas.institution_admin import (
    UserImportPreview,
    UserImportPreviewError,
    UserImportPreviewRow,
    UserImportResult,
)
from app.services import supabase_admin
from app.services.audit import write_audit
from app.services.csv_import import (
    UserImportError,
    detect_duplicate_emails,
    parse_users_csv,
)

router = APIRouter(prefix="/institution/users/import", tags=["institution: users import"])

_admin_gate = require_role(UserRole.institution_admin, UserRole.super_admin)


def _errors_to_schema(errors: list[UserImportError]) -> list[UserImportPreviewError]:
    return [
        UserImportPreviewError(line=e.line, field=e.field, message=e.message)
        for e in errors
    ]


@router.post("/preview", response_model=UserImportPreview)
async def preview_import(
    file: Annotated[UploadFile, File(...)],
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserImportPreview:
    blob = await file.read()
    parsed = parse_users_csv(blob)
    dup_errors = detect_duplicate_emails(parsed.valid)
    all_errors = parsed.errors + dup_errors
    # Drop duplicates from valid list
    dup_lines = {e.line for e in dup_errors}
    valid_rows = [r for r in parsed.valid if r.line not in dup_lines]

    # Validate department codes against this institution's departments
    code_errors: list[UserImportError] = []
    for r in valid_rows:
        if r.department_code is None:
            continue
        dept_id = await ia_repo.department_code_to_id(
            db, actor.institution_id, r.department_code
        )
        if dept_id is None:
            code_errors.append(
                UserImportError(
                    r.line,
                    "department_code",
                    f"No department with code '{r.department_code}'",
                )
            )
    bad_lines = {e.line for e in code_errors}
    valid_rows = [r for r in valid_rows if r.line not in bad_lines]
    all_errors.extend(code_errors)

    return UserImportPreview(
        total=parsed.total,
        valid=[
            UserImportPreviewRow(
                line=r.line,
                email=r.email,
                full_name=r.full_name,
                role=r.role,
                department_code=r.department_code,
                password=("***" if r.password else None),
            )
            for r in valid_rows
        ],
        errors=_errors_to_schema(all_errors),
    )


@router.post("/commit", response_model=UserImportResult)
async def commit_import(
    file: Annotated[UploadFile, File(...)],
    mode: Annotated[str, Form(...)],
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserImportResult:
    if mode not in ("invite", "password"):
        raise HTTPException(400, "mode must be 'invite' or 'password'")

    blob = await file.read()
    parsed = parse_users_csv(blob)
    dup_errors = detect_duplicate_emails(parsed.valid)
    dup_lines = {e.line for e in dup_errors}
    rows = [r for r in parsed.valid if r.line not in dup_lines]

    # Resolve department codes once
    dept_cache: dict[str, UUID | None] = {}
    for r in rows:
        if r.department_code and r.department_code not in dept_cache:
            dept_cache[r.department_code] = await ia_repo.department_code_to_id(
                db, actor.institution_id, r.department_code
            )

    # Create the ingestion_jobs row up front so we can attribute errors to it.
    job = IngestionJob(
        id=uuid.uuid4(),
        institution_id=actor.institution_id,
        source=ResponseSource.manual_admin,
        status=IngestionStatus.running,
        started_at=datetime.now(timezone.utc),
        triggered_by=actor.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.flush()

    created = 0
    failed = 0
    errors: list[UserImportError] = list(parsed.errors) + list(dup_errors)

    for r in rows:
        dept_id = dept_cache.get(r.department_code) if r.department_code else None
        if r.department_code and dept_id is None:
            failed += 1
            errors.append(
                UserImportError(
                    r.line,
                    "department_code",
                    f"No department with code '{r.department_code}'",
                )
            )
            continue

        try:
            role_enum = UserRole(r.role)
            now = datetime.now(timezone.utc)

            if role_enum == UserRole.student:
                db.add(
                    Student(
                        id=uuid.uuid4(),
                        institution_id=actor.institution_id,
                        department_id=dept_id,
                        external_id=None,
                        full_name=r.full_name,
                        email=r.email,
                        created_at=now,
                    )
                )
                created += 1
                continue

            # Reject if email already exists in this tenant
            existing = await ia_repo.auth_user_by_email(
                db, actor.institution_id, r.email
            )
            if existing is not None:
                failed += 1
                errors.append(
                    UserImportError(
                        r.line, "email", f"User {r.email} already exists"
                    )
                )
                continue

            if mode == "password":
                pwd = r.password or "ClassIQ2026!"
                sup = await supabase_admin.create_user_with_password(
                    email=r.email,
                    password=pwd,
                    institution_id=actor.institution_id,
                    role=role_enum.value,
                    full_name=r.full_name,
                )
            else:
                sup = await supabase_admin.invite_user_by_email(
                    email=r.email,
                    institution_id=actor.institution_id,
                    role=role_enum.value,
                    full_name=r.full_name,
                )

            new_id = UUID(sup["id"]) if isinstance(sup.get("id"), str) else sup["id"]

            if dept_id is not None and role_enum in (UserRole.hod, UserRole.teacher):
                db.add(
                    UserDepartment(
                        auth_user_id=new_id,
                        department_id=dept_id,
                        created_at=now,
                    )
                )

            if role_enum == UserRole.teacher:
                db.add(
                    Teacher(
                        id=uuid.uuid4(),
                        institution_id=actor.institution_id,
                        department_id=dept_id,
                        full_name=r.full_name,
                        email=r.email,
                        auth_user_id=new_id,
                        created_at=now,
                    )
                )

            created += 1
        except supabase_admin.SupabaseAdminError as exc:
            failed += 1
            errors.append(
                UserImportError(r.line, "supabase", f"{exc.status}: {exc.body}")
            )
        except Exception as exc:  # noqa: BLE001 — per-row tolerance
            failed += 1
            errors.append(UserImportError(r.line, "row", str(exc)))

    job.finished_at = datetime.now(timezone.utc)
    if failed == 0 and created > 0:
        job.status = IngestionStatus.succeeded
    elif created == 0:
        job.status = IngestionStatus.failed
    else:
        job.status = IngestionStatus.partial
    job.summary = {
        "created": created,
        "failed": failed,
        "total": parsed.total,
        "errors": [
            {"line": e.line, "field": e.field, "message": e.message} for e in errors
        ],
    }

    await write_audit(
        db,
        institution_id=actor.institution_id,
        actor_user_id=actor.id,
        action="users.bulk_import",
        entity_type="ingestion_job",
        entity_id=job.id,
        payload={"created": created, "failed": failed, "total": parsed.total},
    )
    await db.commit()

    return UserImportResult(
        ingestion_job_id=job.id,
        total=parsed.total,
        created=created,
        failed=failed,
        status=job.status,
        errors=_errors_to_schema(errors),
    )
