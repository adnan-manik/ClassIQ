"""/api/ingestion — survey ingestion (BACKEND_ARCHITECTURE §5).

    POST /api/ingestion/rdf         multipart: file (+ academic_term_id, department_id, dry_run)
    POST /api/ingestion/csv         multipart: file (+ same fields)
    POST /api/ingestion/form        JSON submissions from ClassIQ's form app
    POST /api/ingestion/manual      one student's answers typed by staff
    GET  /api/ingestion/jobs        this institution's jobs, newest first
    GET  /api/ingestion/jobs/{id}
    GET  /api/ingestion/instrument  the 44-question ILS (for the manual form)
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.ingestion.csv_adapter import parse_csv
from app.ingestion.form_app_adapter import parse_form_payload
from app.ingestion.ils_instrument import (
    INSTRUMENT_NAME,
    INSTRUMENT_VERSION,
    TOTAL_QUESTIONS,
    ils_questions,
)
from app.ingestion.manual_admin_adapter import build_manual_response
from app.ingestion.rdf_parser import parse_rdf
from app.models.auth_user import AuthUser, UserRole
from app.models.ingestion_job import IngestionJob, ResponseSource
from app.schemas.ingestion import (
    FormIngestRequest,
    IngestionIssueShape,
    IngestionJobShape,
    IngestionReportShape,
    IngestionSummaryShape,
    InstrumentShape,
    ManualSubmission,
    QuestionShape,
)
from app.services import ingestion_service as svc

router = APIRouter(prefix="/ingestion", tags=["ingestion"])

# Staff who load survey data: HoD (runs the demo), institution admin, super admin.
_gate = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


def _report_shape(report: svc.IngestionReport) -> IngestionReportShape:
    s = report.summary.as_dict()
    return IngestionReportShape(
        job_id=report.job_id,
        status=report.status,
        dry_run=report.dry_run,
        source=report.source.value,
        summary=IngestionSummaryShape(
            **{k: v for k, v in s.items() if k != "errors"},
            errors=[IngestionIssueShape(**e) for e in s["errors"]],
        ),
    )


async def _read_upload(file: UploadFile) -> bytes:
    blob = await file.read()
    if len(blob) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 25 MB")
    if not blob:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    return blob


async def _run(
    db: AsyncSession,
    user: AuthUser,
    *,
    responses,
    issues,
    source: ResponseSource,
    academic_term_id: UUID | None,
    department_id: UUID | None,
    file_path: str | None,
    dry_run: bool,
) -> IngestionReportShape:
    try:
        report = await svc.run_ingestion(
            db,
            institution_id=user.institution_id,
            responses=responses,
            adapter_issues=issues,
            source=source,
            triggered_by=user.id,
            academic_term_id=academic_term_id,
            department_id=department_id,
            file_path=file_path,
            dry_run=dry_run,
        )
    except svc.IngestionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return _report_shape(report)


@router.post("/rdf", response_model=IngestionReportShape)
async def ingest_rdf(
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    academic_term_id: Annotated[UUID | None, Form()] = None,
    department_id: Annotated[UUID | None, Form()] = None,
    dry_run: Annotated[bool, Form()] = False,
) -> IngestionReportShape:
    """Bulk-import an RDF/XML dump (176 students × 44 ILS answers in the repo file)."""
    blob = await _read_upload(file)
    responses, issues = parse_rdf(blob)
    return await _run(
        db,
        user,
        responses=responses,
        issues=issues,
        source=ResponseSource.rdf_bulk_import,
        academic_term_id=academic_term_id,
        department_id=department_id,
        file_path=file.filename,
        dry_run=dry_run,
    )


@router.post("/csv", response_model=IngestionReportShape)
async def ingest_csv(
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File(...)],
    academic_term_id: Annotated[UUID | None, Form()] = None,
    department_id: Annotated[UUID | None, Form()] = None,
    dry_run: Annotated[bool, Form()] = False,
) -> IngestionReportShape:
    """Import a ClassIQ survey export (`external_id,email,full_name,q1..q44`)."""
    blob = await _read_upload(file)
    responses, issues = parse_csv(blob)
    return await _run(
        db,
        user,
        responses=responses,
        issues=issues,
        source=ResponseSource.classiq_internal,
        academic_term_id=academic_term_id,
        department_id=department_id,
        file_path=file.filename,
        dry_run=dry_run,
    )


@router.post("/form", response_model=IngestionReportShape)
async def ingest_form(
    body: FormIngestRequest,
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IngestionReportShape:
    """Accept submissions pushed by ClassIQ's survey/form app."""
    responses, issues = parse_form_payload(body.submissions)
    return await _run(
        db,
        user,
        responses=responses,
        issues=issues,
        source=ResponseSource.form_app,
        academic_term_id=body.academic_term_id,
        department_id=body.department_id,
        file_path=None,
        dry_run=False,
    )


@router.post("/manual", response_model=IngestionReportShape)
async def ingest_manual(
    body: ManualSubmission,
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IngestionReportShape:
    """Score one student from answers typed in by staff. Creates a new profile
    version (and an aux profile when collaboration / participation are given)."""
    response, issues = build_manual_response(
        answers=body.answers,
        student_id=body.student_id,
        external_id=body.external_id,
        email=str(body.email) if body.email else None,
        full_name=body.full_name,
        collaboration_pref=body.collaboration_pref.value if body.collaboration_pref else None,
        participation_level=body.participation_level.value if body.participation_level else None,
        notes=body.notes,
        entered_by=user.id,
    )
    if issues:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, issues[0].message)
    return await _run(
        db,
        user,
        responses=[response],
        issues=[],
        source=ResponseSource.manual_admin,
        academic_term_id=body.academic_term_id,
        department_id=body.department_id,
        file_path=None,
        dry_run=False,
    )


@router.get("/jobs", response_model=list[IngestionJobShape])
async def list_jobs(
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=500),
) -> list[IngestionJobShape]:
    stmt = (
        select(IngestionJob, AuthUser.full_name)
        .outerjoin(AuthUser, AuthUser.id == IngestionJob.triggered_by)
        .where(IngestionJob.institution_id == user.institution_id)
        .order_by(desc(IngestionJob.created_at))
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [_job_shape(job, name) for job, name in rows]


@router.get("/jobs/{job_id}", response_model=IngestionJobShape)
async def get_job(
    job_id: UUID,
    user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> IngestionJobShape:
    stmt = (
        select(IngestionJob, AuthUser.full_name)
        .outerjoin(AuthUser, AuthUser.id == IngestionJob.triggered_by)
        .where(IngestionJob.id == job_id)
        .where(IngestionJob.institution_id == user.institution_id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ingestion job not found")
    return _job_shape(row[0], row[1])


def _job_shape(job: IngestionJob, name: str | None) -> IngestionJobShape:
    return IngestionJobShape(
        id=job.id,
        source=job.source.value if hasattr(job.source, "value") else str(job.source),
        status=job.status,
        started_at=job.started_at,
        finished_at=job.finished_at,
        file_path=job.file_path,
        summary=job.summary,
        triggered_by=job.triggered_by,
        triggered_by_name=name,
        created_at=job.created_at,
    )


@router.get("/instrument", response_model=InstrumentShape)
async def get_instrument(
    _user: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstrumentShape:
    """The default ILS definition — question stems + answer pairs for the manual form."""
    inst = await svc.get_instrument(db)
    return InstrumentShape(
        id=inst.id if inst else None,
        name=INSTRUMENT_NAME,
        version=INSTRUMENT_VERSION,
        total_questions=TOTAL_QUESTIONS,
        questions=[
            QuestionShape(
                sequence_no=q.sequence_no,
                prompt=q.question_text.split(" — (A)")[0],
                answer_a=q.answer_a_text,
                answer_b=q.answer_b_text,
                axis=q.axis.value,
                answer_a_pole=q.answer_a_pole,
                answer_b_pole=q.answer_b_pole,
            )
            for q in ils_questions()
        ],
    )
