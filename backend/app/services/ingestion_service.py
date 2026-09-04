"""Survey ingestion pipeline (BACKEND_ARCHITECTURE §5).

    adapter → InternalResponse[] → run_ingestion()
        create ingestion_jobs row (status=running)
        validate (44 answers, A/B only, identity present)
        resolve / upsert students
        INSERT survey_responses  (idempotent on external_response_id)
        INSERT survey_answers    (44 rows)
        FSLSM scorer             (raw = A_count − B_count per axis)
        INSERT student_profiles  (new version, is_current flipped)
        optional student_aux_profiles from adapter extras
        ingestion_jobs.status = succeeded | partial | failed, summary JSONB

Per-response failures roll back to a savepoint and are reported; one bad row
never sinks the batch. `dry_run=True` validates and resolves identities without
writing anything (no job row either).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.fslsm.scorer import score_responses
from app.ingestion.ils_instrument import (
    INSTRUMENT_NAME,
    INSTRUMENT_VERSION,
    TOTAL_QUESTIONS,
    ils_questions,
)
from app.ingestion.types import IngestionIssue, InternalResponse, validate_response
from app.models.ingestion_job import IngestionJob, IngestionStatus, ResponseSource
from app.models.institution import AcademicTerm
from app.models.student import (
    CollabPref,
    FslsmAxis,
    ParticipationLevel,
    Student,
    StudentAuxProfile,
    StudentProfile,
)
from app.models.survey import (
    AnswerChoice,
    FslsmPoleA,
    FslsmPoleB,
    SurveyAnswer,
    SurveyInstrument,
    SurveyQuestion,
    SurveyResponse,
)
from app.repositories import refs
from app.services.audit import write_audit

FSLSM_SCORER_VERSION = "1.0.0"
MAX_ERRORS_IN_SUMMARY = 200


class IngestionError(Exception):
    """Whole-batch failure (bad references, nothing parseable…)."""


@dataclass
class IngestionSummary:
    students_seen: int = 0
    students_created: int = 0
    students_matched: int = 0
    responses_ingested: int = 0
    responses_duplicate: int = 0
    responses_rejected: int = 0
    profiles_created: int = 0
    aux_profiles_created: int = 0
    errors: list[IngestionIssue] = field(default_factory=list)

    def as_dict(self) -> dict:
        errs = [e.as_dict() for e in self.errors[:MAX_ERRORS_IN_SUMMARY]]
        return {
            "students_seen": self.students_seen,
            "students_created": self.students_created,
            "students_matched": self.students_matched,
            "responses_ingested": self.responses_ingested,
            "responses_duplicate": self.responses_duplicate,
            "responses_rejected": self.responses_rejected,
            "profiles_created": self.profiles_created,
            "aux_profiles_created": self.aux_profiles_created,
            "errors": errs,
            "errors_truncated": max(0, len(self.errors) - MAX_ERRORS_IN_SUMMARY),
        }


@dataclass
class IngestionReport:
    job_id: UUID | None
    status: IngestionStatus
    dry_run: bool
    source: ResponseSource
    summary: IngestionSummary


# ─── Instrument ─────────────────────────────────────────────────────────────

async def get_instrument(db: AsyncSession) -> SurveyInstrument | None:
    stmt = (
        select(SurveyInstrument)
        .where(SurveyInstrument.name == INSTRUMENT_NAME)
        .where(SurveyInstrument.version == INSTRUMENT_VERSION)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def question_map(db: AsyncSession, instrument_id: UUID) -> dict[int, UUID]:
    stmt = select(SurveyQuestion.sequence_no, SurveyQuestion.id).where(
        SurveyQuestion.instrument_id == instrument_id
    )
    return {int(seq): qid for seq, qid in (await db.execute(stmt)).all()}


async def ensure_instrument(db: AsyncSession) -> tuple[SurveyInstrument, dict[int, UUID]]:
    """Return the default ILS instrument + question map, seeding both if absent.
    Caller commits."""
    inst = await get_instrument(db)
    now = datetime.now(timezone.utc)
    if inst is None:
        inst = SurveyInstrument(
            id=uuid4(),
            institution_id=None,
            name=INSTRUMENT_NAME,
            version=INSTRUMENT_VERSION,
            total_questions=TOTAL_QUESTIONS,
            is_published=True,
            created_at=now,
        )
        db.add(inst)
        await db.flush()

    qmap = await question_map(db, inst.id)
    if len(qmap) < TOTAL_QUESTIONS:
        for q in ils_questions():
            if q.sequence_no in qmap:
                continue
            row = SurveyQuestion(
                id=uuid4(),
                instrument_id=inst.id,
                sequence_no=q.sequence_no,
                question_text=q.question_text,
                axis=FslsmAxis(q.axis.value),
                rdf_property=q.rdf_property,
                answer_a_pole=FslsmPoleA(q.answer_a_pole),
                answer_b_pole=FslsmPoleB(q.answer_b_pole),
                created_at=now,
            )
            db.add(row)
            qmap[q.sequence_no] = row.id
        await db.flush()
    return inst, qmap


# ─── Student resolution ─────────────────────────────────────────────────────

@dataclass
class _Roster:
    by_external: dict[str, Student]
    by_email: dict[str, Student]
    by_id: dict[UUID, Student]


async def _load_roster(db: AsyncSession, institution_id: UUID) -> _Roster:
    stmt = (
        select(Student)
        .where(Student.institution_id == institution_id)
        .where(Student.deleted_at.is_(None))
    )
    rows = list((await db.execute(stmt)).scalars().all())
    return _Roster(
        by_external={s.external_id.strip().lower(): s for s in rows if s.external_id},
        by_email={s.email.strip().lower(): s for s in rows if s.email},
        by_id={s.id: s for s in rows},
    )


def _display_name(r: InternalResponse) -> str:
    if r.full_name:
        return r.full_name.strip()
    if r.email:
        local = r.email.split("@", 1)[0]
        return local.replace(".", " ").replace("_", " ").title()
    if r.student_external_id:
        return r.student_external_id
    return "Unnamed student"


# ─── Pipeline ───────────────────────────────────────────────────────────────

async def run_ingestion(
    db: AsyncSession,
    *,
    institution_id: UUID,
    responses: list[InternalResponse],
    adapter_issues: list[IngestionIssue],
    source: ResponseSource,
    triggered_by: UUID | None,
    academic_term_id: UUID | None = None,
    department_id: UUID | None = None,
    file_path: str | None = None,
    dry_run: bool = False,
) -> IngestionReport:
    summary = IngestionSummary(errors=list(adapter_issues))

    # ── References ──────────────────────────────────────────────────────
    if academic_term_id is not None and not await refs.term_in_institution(
        db, academic_term_id, institution_id
    ):
        raise IngestionError("Academic term not found in your institution")
    if department_id is not None and not await refs.department_in_institution(
        db, department_id, institution_id
    ):
        raise IngestionError("Department not found in your institution")
    if academic_term_id is None:
        academic_term_id = (
            await db.execute(
                select(AcademicTerm.id)
                .where(AcademicTerm.institution_id == institution_id)
                .where(AcademicTerm.is_active.is_(True))
                .limit(1)
            )
        ).scalar_one_or_none()

    if not responses:
        if dry_run:
            return IngestionReport(None, IngestionStatus.failed, True, source, summary)
        raise IngestionError(
            "Nothing to ingest — " + "; ".join(e.message for e in adapter_issues[:3])
            if adapter_issues
            else "Nothing to ingest"
        )

    now = datetime.now(timezone.utc)
    job: IngestionJob | None = None
    if not dry_run:
        job = IngestionJob(
            id=uuid4(),
            institution_id=institution_id,
            source=source,
            status=IngestionStatus.running,
            started_at=now,
            file_path=file_path,
            triggered_by=triggered_by,
            created_at=now,
        )
        db.add(job)
        await db.flush()

    # ── Instrument + existing data ──────────────────────────────────────
    if dry_run:
        inst = await get_instrument(db)
        qmap = await question_map(db, inst.id) if inst else {}
    else:
        inst, qmap = await ensure_instrument(db)

    existing_ext_ids: set[str] = set()
    if inst is not None:
        stmt = (
            select(SurveyResponse.external_response_id)
            .where(SurveyResponse.instrument_id == inst.id)
            .where(SurveyResponse.external_response_id.is_not(None))
        )
        existing_ext_ids = set((await db.execute(stmt)).scalars().all())

    roster = await _load_roster(db, institution_id)
    version_cache: dict[UUID, int] = {}
    seen_students: set[UUID] = set()
    unsaved_students: set[UUID] = set()

    # ── Per-response loop ───────────────────────────────────────────────
    for r in responses:
        ref = r.ref or r.external_response_id
        issues = validate_response(r)
        if issues:
            summary.errors.extend(issues)
            summary.responses_rejected += 1
            continue

        # Identity resolution
        student: Student | None = None
        if r.student_external_id:
            student = roster.by_external.get(r.student_external_id.strip().lower())
        if student is None and r.extra.get("student_id"):
            sid = r.extra["student_id"]
            sid = sid if isinstance(sid, UUID) else UUID(str(sid))
            student = roster.by_id.get(sid)
            if student is None:
                summary.errors.append(
                    IngestionIssue(ref, "student_id", "student not found in your institution")
                )
                summary.responses_rejected += 1
                continue
        if student is None and r.email:
            student = roster.by_email.get(r.email.strip().lower())

        created_now = False
        if student is None:
            created_now = True
            student = Student(
                id=uuid4(),
                institution_id=institution_id,
                department_id=department_id,
                external_id=(r.student_external_id or "").strip() or None,
                full_name=_display_name(r),
                email=(r.email or "").strip().lower() or None,
                created_at=now,
            )
            if student.external_id:
                roster.by_external[student.external_id.lower()] = student
            if student.email:
                roster.by_email[student.email] = student
            roster.by_id[student.id] = student

        if student.id not in seen_students:
            seen_students.add(student.id)
            summary.students_seen += 1
            if created_now:
                summary.students_created += 1
            else:
                summary.students_matched += 1

        # Idempotency
        if r.external_response_id in existing_ext_ids:
            summary.responses_duplicate += 1
            continue

        if dry_run:
            summary.responses_ingested += 1
            summary.profiles_created += 1
            if r.extra.get("collaboration_pref") or r.extra.get("participation_level"):
                summary.aux_profiles_created += 1
            continue

        assert inst is not None and job is not None
        try:
            async with db.begin_nested():
                # A student created earlier in this batch whose savepoint rolled
                # back was expunged from the session — re-add until it lands.
                if created_now or student.id in unsaved_students:
                    db.add(student)
                    unsaved_students.add(student.id)
                else:
                    if department_id is not None and student.department_id is None:
                        student.department_id = department_id
                    if not student.email and r.email:
                        student.email = r.email.strip().lower()

                response = SurveyResponse(
                    id=uuid4(),
                    institution_id=institution_id,
                    student_id=student.id,
                    instrument_id=inst.id,
                    academic_term_id=academic_term_id,
                    submitted_at=r.submitted_at or now,
                    source=r.source,
                    ingestion_job_id=job.id,
                    external_response_id=r.external_response_id,
                    created_at=now,
                )
                db.add(response)
                for qno, choice in r.answers.items():
                    db.add(
                        SurveyAnswer(
                            response_id=response.id,
                            question_id=qmap[qno],
                            choice=AnswerChoice(choice),
                        )
                    )

                score = score_responses(r.answers)  # type: ignore[arg-type]
                dominant = score.dominant_axis()

                if student.id not in version_cache:
                    current_max = (
                        await db.execute(
                            select(func.coalesce(func.max(StudentProfile.version), 0)).where(
                                StudentProfile.student_id == student.id
                            )
                        )
                    ).scalar_one()
                    version_cache[student.id] = int(current_max or 0)
                version_cache[student.id] += 1

                await db.execute(
                    update(StudentProfile)
                    .where(StudentProfile.student_id == student.id)
                    .where(StudentProfile.is_current.is_(True))
                    .values(is_current=False)
                )
                db.add(
                    StudentProfile(
                        id=uuid4(),
                        institution_id=institution_id,
                        student_id=student.id,
                        derived_from_response_id=response.id,
                        version=version_cache[student.id],
                        is_current=True,
                        scored_at=now,
                        scoring_engine_version=FSLSM_SCORER_VERSION,
                        active_reflective_score=score.active_reflective,
                        sensing_intuitive_score=score.sensing_intuitive,
                        visual_verbal_score=score.visual_verbal,
                        sequential_global_score=score.sequential_global,
                        dominant_axis=FslsmAxis(dominant.value) if dominant else None,
                    )
                )

                collab = r.extra.get("collaboration_pref")
                part = r.extra.get("participation_level")
                if collab or part:
                    collab_enum = CollabPref(collab) if collab else None
                    part_enum = ParticipationLevel(part) if part else None
                    await db.execute(
                        update(StudentAuxProfile)
                        .where(StudentAuxProfile.student_id == student.id)
                        .where(StudentAuxProfile.is_current.is_(True))
                        .where(
                            (StudentAuxProfile.academic_term_id == academic_term_id)
                            if academic_term_id is not None
                            else StudentAuxProfile.academic_term_id.is_(None)
                        )
                        .values(is_current=False)
                    )
                    db.add(
                        StudentAuxProfile(
                            id=uuid4(),
                            institution_id=institution_id,
                            student_id=student.id,
                            academic_term_id=academic_term_id,
                            collaboration_pref=collab_enum,
                            participation_level=part_enum,
                            notes=r.extra.get("notes"),
                            is_current=True,
                            collected_at=now,
                        )
                    )
                    summary.aux_profiles_created += 1

                await db.flush()
        except Exception as exc:  # noqa: BLE001 — per-row tolerance
            summary.responses_rejected += 1
            summary.errors.append(IngestionIssue(ref, "row", str(exc).splitlines()[0][:300]))
            continue

        unsaved_students.discard(student.id)
        existing_ext_ids.add(r.external_response_id)
        summary.responses_ingested += 1
        summary.profiles_created += 1

    # ── Finalise ────────────────────────────────────────────────────────
    if summary.responses_ingested == 0 and summary.responses_duplicate == 0:
        status = IngestionStatus.failed
    elif summary.responses_rejected > 0 or (
        adapter_issues and summary.responses_ingested < len(responses)
    ):
        status = IngestionStatus.partial
    else:
        status = IngestionStatus.succeeded

    if dry_run:
        return IngestionReport(None, status, True, source, summary)

    assert job is not None
    job.status = status
    job.finished_at = datetime.now(timezone.utc)
    job.summary = {**summary.as_dict(), "academic_term_id": str(academic_term_id) if academic_term_id else None}

    await write_audit(
        db,
        institution_id=institution_id,
        actor_user_id=triggered_by,
        action="survey.ingest",
        entity_type="ingestion_job",
        entity_id=job.id,
        payload={
            "source": source.value,
            "status": status.value,
            "responses_ingested": summary.responses_ingested,
            "students_created": summary.students_created,
            "rejected": summary.responses_rejected,
        },
    )
    await db.commit()
    return IngestionReport(job.id, status, False, source, summary)
