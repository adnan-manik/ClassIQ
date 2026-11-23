"""Shareable survey forms — staff build them, students answer by code.

Staff side (authenticated, tenant from the caller):
    create / update / list / delete forms, list and void submissions.
Public side (no auth — the tenant comes ONLY from the form found by code):
    open form by code → identify against the form's roster → submit.

A submission writes, in one transaction:
    survey_form_submissions row (the unique index makes it one per student)
    survey_responses + 44 answers + new current student_profiles version
    student_aux_profiles (collaboration / participation), when collected
    peer_relationships, one edge per picked classmate, upserted
Custom questions are stored on the submission only; they are not scored.

Identity is weak proof: a student ID plus the email on file. Anyone who knows
both can answer as that student. Staff can void a submission, which removes
its profile, aux profile and peer edges and frees the slot.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion.ils_instrument import available_wordings, survey_items
from app.models.ingestion_job import ResponseSource
from app.models.institution import AcademicTerm, Institution
from app.models.peer_relationship import (
    PeerRelationship,
    RelationshipSource,
    RelationshipType,
)
from app.models.section import SectionStudent
from app.models.student import Student, StudentAuxProfile, StudentProfile
from app.models.survey_form import SurveyForm, SurveyFormStatus, SurveyFormSubmission
from app.repositories import refs
from app.repositories import sections as sections_repo
from app.schemas.forms import (
    CHOICE_KINDS,
    DEFAULT_PEER_OPTIONS,
    Classmate,
    ExtraQuestion,
    FormShape,
    IdentifyResponse,
    Identity,
    PeerOption,
    PublicForm,
    PublicPeerOption,
    PublicQuestion,
    PublicSubmission,
    SubmissionShape,
    SubmitResponse,
)
from app.services import ingestion_service
from app.services.audit import write_audit

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
CODE_LENGTH = 6

# One message for every "can't open this form" case, so a code reveals nothing.
FORM_UNAVAILABLE = "This survey does not exist or is not accepting responses."
IDENTITY_FAILED = (
    "We couldn't match you to this survey's class list. "
    "Check your student ID and the email your institution has on file."
)


class FormError(Exception):
    """Staff-side validation failure (400)."""


class FormNotFound(Exception):
    """Unknown, deleted, draft, closed or expired form (404)."""


class IdentityError(Exception):
    """Respondent could not be matched to the form's roster (403)."""


class SubmissionError(Exception):
    """Invalid answers (400)."""


class AlreadySubmitted(Exception):
    """This student already has a live submission for this form (409)."""


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(code: str) -> str:
    return "".join(ch for ch in (code or "").upper() if ch.isalnum())[:12]


# ─── Staff: settings validation ─────────────────────────────────────────────

async def _check_settings(db: AsyncSession, institution_id: UUID, s: dict[str, Any]) -> dict[str, Any]:
    """Validate references and combinations; fill derived values. Returns `s`."""
    if s.get("department_id") and not await refs.department_in_institution(
        db, s["department_id"], institution_id
    ):
        raise FormError("Department not found in your institution")
    if s.get("academic_term_id") and not await refs.term_in_institution(
        db, s["academic_term_id"], institution_id
    ):
        raise FormError("Academic term not found in your institution")
    if s.get("section_id"):
        section = await sections_repo.get_section_row(db, institution_id, s["section_id"])
        if section is None:
            raise FormError("Section not found in your institution")
        # Peer edges and responses belong to the section's own term.
        s["academic_term_id"] = section.academic_term_id
        if s.get("allow_new_students"):
            raise FormError(
                "A section-scoped form only accepts students already on that section's roster"
            )

    if s.get("academic_term_id") is None:
        s["academic_term_id"] = (
            await db.execute(
                select(AcademicTerm.id)
                .where(AcademicTerm.institution_id == institution_id)
                .where(AcademicTerm.is_active.is_(True))
                .order_by(AcademicTerm.starts_on.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    if s.get("include_ils") and s.get("ils_wording") not in available_wordings():
        raise FormError(
            "The standard ILS wording is not installed on this server; use the RDF wording"
        )
    if s.get("collect_peers"):
        if not (s.get("section_id") or s.get("department_id")):
            raise FormError("Pick a section or department so students choose classmates from it")
        if s.get("academic_term_id") is None:
            raise FormError("Peer relations need an academic term")
        if not s.get("peer_options"):
            s["peer_options"] = [dict(o) for o in DEFAULT_PEER_OPTIONS]
        if not s.get("max_peer_picks"):
            raise FormError("Allow at least one classmate pick, or turn peer relations off")
    if s.get("allow_new_students") and not s.get("department_id"):
        raise FormError("New students need a department to be added to")
    if not (
        s.get("include_ils")
        or s.get("collect_collaboration")
        or s.get("collect_participation")
        or s.get("collect_peers")
        or s.get("extra_questions")
    ):
        raise FormError("The form has no questions")
    return s


def _jsonable(settings: dict[str, Any]) -> dict[str, Any]:
    """JSONB-ready copies of the two list fields (enums → plain strings)."""
    out = dict(settings)
    for key, model in (("peer_options", PeerOption), ("extra_questions", ExtraQuestion)):
        if out.get(key) is not None:
            out[key] = [
                (i if isinstance(i, model) else model(**i)).model_dump(mode="json")
                for i in out[key]
            ]
    return out


def _settings_of(form: SurveyForm) -> dict[str, Any]:
    return {
        "title": form.title,
        "description": form.description,
        "department_id": form.department_id,
        "section_id": form.section_id,
        "academic_term_id": form.academic_term_id,
        "include_ils": form.include_ils,
        "ils_wording": form.ils_wording,
        "collect_collaboration": form.collect_collaboration,
        "collect_participation": form.collect_participation,
        "collect_peers": form.collect_peers,
        "peer_options": list(form.peer_options or []),
        "max_peer_picks": form.max_peer_picks,
        "extra_questions": list(form.extra_questions or []),
        "allow_new_students": form.allow_new_students,
        "closes_at": form.closes_at,
    }


# ─── Staff: CRUD ────────────────────────────────────────────────────────────

async def _unique_code(db: AsyncSession) -> str:
    for _ in range(20):
        code = new_code()
        taken = (
            await db.execute(select(func.count()).select_from(SurveyForm).where(SurveyForm.code == code))
        ).scalar()
        if not taken:
            return code
    raise FormError("Could not allocate a form code; try again")


async def create_form(
    db: AsyncSession, *, institution_id: UUID, user_id: UUID, settings: dict[str, Any]
) -> SurveyForm:
    s = await _check_settings(db, institution_id, _jsonable(settings))
    now = datetime.now(timezone.utc)
    form = SurveyForm(
        id=uuid4(),
        institution_id=institution_id,
        code=await _unique_code(db),
        status=SurveyFormStatus.draft,
        created_by=user_id,
        created_at=now,
        updated_at=now,
        **s,
    )
    db.add(form)
    await db.flush()
    await write_audit(
        db, institution_id=institution_id, actor_user_id=user_id, action="survey_form.create",
        entity_type="survey_form", entity_id=form.id, payload={"code": form.code, "title": form.title},
    )
    return form


async def get_form(db: AsyncSession, institution_id: UUID, form_id: UUID) -> SurveyForm | None:
    return (
        await db.execute(
            select(SurveyForm)
            .where(SurveyForm.id == form_id)
            .where(SurveyForm.institution_id == institution_id)
            .where(SurveyForm.deleted_at.is_(None))
        )
    ).scalar_one_or_none()


async def update_form(
    db: AsyncSession, *, form: SurveyForm, user_id: UUID, changes: dict[str, Any]
) -> SurveyForm:
    status = changes.pop("status", None)
    if changes:
        merged = {**_settings_of(form), **_jsonable(changes)}
        merged = await _check_settings(db, form.institution_id, merged)
        for key, value in merged.items():
            setattr(form, key, value)
    if status is not None:
        form.status = status
    form.updated_at = datetime.now(timezone.utc)
    await write_audit(
        db, institution_id=form.institution_id, actor_user_id=user_id, action="survey_form.update",
        entity_type="survey_form", entity_id=form.id,
        payload={"fields": sorted(changes), "status": status.value if status else None},
    )
    await db.flush()
    return form


async def regenerate_code(db: AsyncSession, *, form: SurveyForm, user_id: UUID) -> SurveyForm:
    old = form.code
    form.code = await _unique_code(db)
    form.updated_at = datetime.now(timezone.utc)
    await write_audit(
        db, institution_id=form.institution_id, actor_user_id=user_id, action="survey_form.code",
        entity_type="survey_form", entity_id=form.id, payload={"old": old, "new": form.code},
    )
    await db.flush()
    return form


async def delete_form(db: AsyncSession, *, form: SurveyForm, user_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    form.deleted_at = now
    form.status = SurveyFormStatus.closed
    form.updated_at = now
    await write_audit(
        db, institution_id=form.institution_id, actor_user_id=user_id, action="survey_form.delete",
        entity_type="survey_form", entity_id=form.id, payload={"code": form.code},
    )


async def submission_counts(db: AsyncSession, form_ids: list[UUID]) -> dict[UUID, int]:
    if not form_ids:
        return {}
    rows = await db.execute(
        select(SurveyFormSubmission.form_id, func.count())
        .where(SurveyFormSubmission.form_id.in_(form_ids))
        .where(SurveyFormSubmission.voided_at.is_(None))
        .group_by(SurveyFormSubmission.form_id)
    )
    return {fid: int(n) for fid, n in rows.all()}


def form_shape(form: SurveyForm, count: int = 0) -> FormShape:
    return FormShape(
        id=form.id,
        code=form.code,
        title=form.title,
        description=form.description,
        status=form.status,
        department_id=form.department_id,
        section_id=form.section_id,
        academic_term_id=form.academic_term_id,
        include_ils=form.include_ils,
        ils_wording=form.ils_wording,
        collect_collaboration=form.collect_collaboration,
        collect_participation=form.collect_participation,
        collect_peers=form.collect_peers,
        peer_options=[PeerOption(**o) for o in form.peer_options or []],
        max_peer_picks=form.max_peer_picks,
        extra_questions=[ExtraQuestion(**q) for q in form.extra_questions or []],
        allow_new_students=form.allow_new_students,
        closes_at=form.closes_at,
        created_at=form.created_at,
        updated_at=form.updated_at,
        submission_count=count,
    )


async def list_forms(db: AsyncSession, institution_id: UUID) -> list[FormShape]:
    forms = list(
        (
            await db.execute(
                select(SurveyForm)
                .where(SurveyForm.institution_id == institution_id)
                .where(SurveyForm.deleted_at.is_(None))
                .order_by(SurveyForm.created_at.desc())
            )
        ).scalars().all()
    )
    counts = await submission_counts(db, [f.id for f in forms])
    return [form_shape(f, counts.get(f.id, 0)) for f in forms]


async def list_submissions(db: AsyncSession, form: SurveyForm) -> list[SubmissionShape]:
    rows = (
        await db.execute(
            select(SurveyFormSubmission, Student, StudentProfile)
            .join(Student, Student.id == SurveyFormSubmission.student_id)
            .outerjoin(StudentProfile, StudentProfile.id == SurveyFormSubmission.student_profile_id)
            .where(SurveyFormSubmission.form_id == form.id)
            .order_by(SurveyFormSubmission.submitted_at.desc())
        )
    ).all()
    out = []
    for sub, student, profile in rows:
        fslsm = None
        if profile is not None:
            fslsm = {
                "active_reflective": profile.active_reflective_score,
                "sensing_intuitive": profile.sensing_intuitive_score,
                "visual_verbal": profile.visual_verbal_score,
                "sequential_global": profile.sequential_global_score,
            }
        out.append(
            SubmissionShape(
                id=sub.id,
                student_id=student.id,
                student_name=student.full_name,
                student_external_id=student.external_id,
                submitted_at=sub.submitted_at,
                voided_at=sub.voided_at,
                profile=sub.profile or {},
                peers=sub.peers or [],
                extra_answers=sub.extra_answers or {},
                fslsm=fslsm,
            )
        )
    return out


async def _restore_latest(db: AsyncSession, model, student_id: UUID, extra_filter=None) -> None:
    """After a void: make the newest remaining row current again."""
    stmt = (
        select(model)
        .where(model.student_id == student_id)
        .where(model.deleted_at.is_(None))
    )
    if extra_filter is not None:
        stmt = stmt.where(extra_filter)
    order = model.version.desc() if model is StudentProfile else model.collected_at.desc()
    latest = (await db.execute(stmt.order_by(order).limit(1))).scalar_one_or_none()
    if latest is not None:
        latest.is_current = True


async def void_submission(
    db: AsyncSession, *, form: SurveyForm, submission_id: UUID, user_id: UUID
) -> SurveyFormSubmission:
    sub = (
        await db.execute(
            select(SurveyFormSubmission)
            .where(SurveyFormSubmission.id == submission_id)
            .where(SurveyFormSubmission.form_id == form.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if sub is None:
        raise FormError("Submission not found")
    if sub.voided_at is not None:
        raise FormError("Submission is already void")
    now = datetime.now(timezone.utc)
    sub.voided_at = now
    sub.voided_by = user_id

    await db.execute(
        update(PeerRelationship)
        .where(PeerRelationship.form_submission_id == sub.id)
        .where(PeerRelationship.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    if sub.student_profile_id:
        profile = await db.get(StudentProfile, sub.student_profile_id)
        if profile is not None and profile.deleted_at is None:
            was_current = profile.is_current
            profile.deleted_at = now
            profile.is_current = False
            await db.flush()
            if was_current:
                await _restore_latest(db, StudentProfile, sub.student_id)
    if sub.aux_profile_id:
        aux = await db.get(StudentAuxProfile, sub.aux_profile_id)
        if aux is not None and aux.deleted_at is None:
            was_current = aux.is_current
            aux.deleted_at = now
            aux.is_current = False
            await db.flush()
            if was_current:
                term_filter = (
                    StudentAuxProfile.academic_term_id == aux.academic_term_id
                    if aux.academic_term_id is not None
                    else StudentAuxProfile.academic_term_id.is_(None)
                )
                await _restore_latest(db, StudentAuxProfile, sub.student_id, term_filter)
    await write_audit(
        db, institution_id=form.institution_id, actor_user_id=user_id, action="survey_form.void",
        entity_type="survey_form_submission", entity_id=sub.id, payload={"student_id": str(sub.student_id)},
    )
    await db.flush()
    return sub


# ─── Public: open, identify, submit ─────────────────────────────────────────

async def open_form(db: AsyncSession, code: str) -> SurveyForm:
    code = normalize_code(code)
    if len(code) < CODE_LENGTH:
        raise FormNotFound
    form = (
        await db.execute(
            select(SurveyForm)
            .where(SurveyForm.code == code)
            .where(SurveyForm.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        form is None
        or form.status != SurveyFormStatus.open
        or (form.closes_at is not None and form.closes_at <= now)
    ):
        raise FormNotFound
    return form


async def public_form(db: AsyncSession, form: SurveyForm) -> PublicForm:
    institution_name = (
        await db.execute(select(Institution.name).where(Institution.id == form.institution_id))
    ).scalar_one_or_none() or ""
    questions = (
        [
            PublicQuestion(sequence_no=q.sequence_no, prompt=q.prompt, answer_a=q.answer_a, answer_b=q.answer_b)
            for q in survey_items(form.ils_wording)
        ]
        if form.include_ils
        else []
    )
    return PublicForm(
        code=form.code,
        title=form.title,
        description=form.description,
        institution_name=institution_name,
        include_ils=form.include_ils,
        questions=questions,
        collect_collaboration=form.collect_collaboration,
        collect_participation=form.collect_participation,
        collect_peers=form.collect_peers,
        peer_options=[PublicPeerOption(key=o["key"], label=o["label"]) for o in form.peer_options or []],
        max_peer_picks=form.max_peer_picks,
        extra_questions=[ExtraQuestion(**q) for q in form.extra_questions or []],
        allow_new_students=form.allow_new_students,
        closes_at=form.closes_at,
    )


def _scope_filter(form: SurveyForm):
    """Students who may answer this form and be named as classmates."""
    stmt = (
        select(Student)
        .where(Student.institution_id == form.institution_id)
        .where(Student.deleted_at.is_(None))
    )
    if form.section_id is not None:
        stmt = stmt.where(
            Student.id.in_(
                select(SectionStudent.student_id)
                .where(SectionStudent.section_id == form.section_id)
                .where(SectionStudent.removed_at.is_(None))
            )
        )
    elif form.department_id is not None:
        stmt = stmt.where(Student.department_id == form.department_id)
    return stmt


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@dataclass
class _Resolved:
    student: Student | None  # None → a new student will be created on submit
    new_student: bool


async def resolve_identity(db: AsyncSession, form: SurveyForm, who: Identity) -> _Resolved:
    """Match the respondent to the roster. The record's ID and email, where on
    file, must both be supplied and match."""
    ext = _clean(who.external_id)
    email = (_clean(who.email) or "").lower() or None
    if not ext and not email:
        raise IdentityError(IDENTITY_FAILED)

    base = (
        select(Student)
        .where(Student.institution_id == form.institution_id)
        .where(Student.deleted_at.is_(None))
    )
    student = None
    if ext:
        student = (
            await db.execute(base.where(func.lower(Student.external_id) == ext.lower()).limit(1))
        ).scalar_one_or_none()
    if student is None and email:
        student = (
            await db.execute(base.where(func.lower(Student.email) == email).limit(1))
        ).scalar_one_or_none()

    if student is None:
        if form.allow_new_students and ext and email and _clean(who.full_name):
            return _Resolved(None, True)
        raise IdentityError(IDENTITY_FAILED)

    if student.external_id and (not ext or ext.lower() != student.external_id.strip().lower()):
        raise IdentityError(IDENTITY_FAILED)
    if student.email and (not email or email != student.email.strip().lower()):
        raise IdentityError(IDENTITY_FAILED)

    in_scope = (
        await db.execute(_scope_filter(form).where(Student.id == student.id))
    ).scalar_one_or_none()
    if in_scope is None:
        raise IdentityError(IDENTITY_FAILED)
    return _Resolved(student, False)


async def _classmates(db: AsyncSession, form: SurveyForm, exclude: UUID | None) -> list[Student]:
    if not form.collect_peers:
        return []
    stmt = _scope_filter(form).order_by(Student.full_name)
    if exclude is not None:
        stmt = stmt.where(Student.id != exclude)
    return list((await db.execute(stmt)).scalars().all())


async def _has_live_submission(db: AsyncSession, form: SurveyForm, student_id: UUID) -> bool:
    return bool(
        (
            await db.execute(
                select(func.count())
                .select_from(SurveyFormSubmission)
                .where(SurveyFormSubmission.form_id == form.id)
                .where(SurveyFormSubmission.student_id == student_id)
                .where(SurveyFormSubmission.voided_at.is_(None))
            )
        ).scalar()
    )


async def identify(db: AsyncSession, form: SurveyForm, who: Identity) -> IdentifyResponse:
    resolved = await resolve_identity(db, form, who)
    student = resolved.student
    already = student is not None and await _has_live_submission(db, form, student.id)
    mates = [] if already else await _classmates(db, form, student.id if student else None)
    return IdentifyResponse(
        student_name=student.full_name if student else (_clean(who.full_name) or ""),
        new_student=resolved.new_student,
        already_submitted=already,
        classmates=[Classmate(id=m.id, name=m.full_name) for m in mates],
    )


def validate_extra_answers(questions: list[dict], answers: dict[str, Any]) -> dict[str, Any]:
    """Check each answer against its question; drop blanks. Raises SubmissionError."""
    by_id = {q["id"]: ExtraQuestion(**q) for q in questions}
    unknown = set(answers) - set(by_id)
    if unknown:
        raise SubmissionError("Answers include questions that are not on this form")
    out: dict[str, Any] = {}
    for qid, q in by_id.items():
        value = answers.get(qid)
        blank = value is None or value == "" or value == []
        if blank:
            if q.required:
                raise SubmissionError(f"Please answer: {q.prompt[:80]}")
            continue
        label = q.prompt[:80]
        if q.kind in ("short_text", "long_text"):
            limit = 500 if q.kind == "short_text" else 4000
            if not isinstance(value, str) or len(value) > limit:
                raise SubmissionError(f"Answer too long or not text: {label}")
            out[qid] = value.strip()
        elif q.kind == "single_choice":
            if value not in q.options:
                raise SubmissionError(f"Pick one of the listed options: {label}")
            out[qid] = value
        elif q.kind == "multi_choice":
            if (
                not isinstance(value, list)
                or not all(isinstance(v, str) and v in q.options for v in value)
            ):
                raise SubmissionError(f"Pick from the listed options: {label}")
            out[qid] = list(dict.fromkeys(value))
        elif q.kind == "scale":
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= q.scale_max:
                raise SubmissionError(f"Choose a value from 1 to {q.scale_max}: {label}")
            out[qid] = value
        elif q.kind == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or abs(value) > 1e9:
                raise SubmissionError(f"Enter a number: {label}")
            out[qid] = value
    return out


def plan_peer_edges(
    form: SurveyForm, picks, classmate_ids: set[UUID], self_id: UUID | None
) -> list[dict[str, Any]]:
    """Validate picks and turn them into edges keyed (to, base_type), keeping
    the strongest pick when two options share a base type."""
    if not form.collect_peers:
        if picks:
            raise SubmissionError("This survey does not ask about classmates")
        return []
    options = {o["key"]: o for o in form.peer_options or []}
    picked_students = {p.student_id for p in picks}
    if len(picked_students) > form.max_peer_picks:
        raise SubmissionError(f"Choose at most {form.max_peer_picks} classmates")
    edges: dict[tuple[UUID, str], dict[str, Any]] = {}
    for p in picks:
        if p.student_id == self_id or p.student_id not in classmate_ids:
            raise SubmissionError("One of the chosen classmates is not on this survey's class list")
        opt = options.get(p.option)
        if opt is None:
            raise SubmissionError("Unknown relation option")
        key = (p.student_id, opt["base_type"])
        current = edges.get(key)
        if current is None or opt["strength"] > current["strength"]:
            edges[key] = {
                "to_student_id": p.student_id,
                "type": opt["base_type"],
                "strength": opt["strength"],
                "label": opt["label"],
            }
    return list(edges.values())


async def submit(db: AsyncSession, form: SurveyForm, body: PublicSubmission) -> SubmitResponse:
    """Validate everything, then write every row in the caller's transaction.
    The caller commits; an IntegrityError on the submission row means the
    student already answered."""
    resolved = await resolve_identity(db, form, body)

    if form.include_ils:
        missing = [q for q in range(1, 45) if q not in body.answers]
        if missing:
            raise SubmissionError(f"Answer all 44 learning-style questions ({len(missing)} left)")
    elif body.answers:
        raise SubmissionError("This survey has no learning-style questions")
    collab = body.collaboration_pref if form.collect_collaboration else None
    part = body.participation_level if form.collect_participation else None
    extra = validate_extra_answers(list(form.extra_questions or []), body.extra_answers)

    now = datetime.now(timezone.utc)
    student = resolved.student
    if student is None:
        student = Student(
            id=uuid4(),
            institution_id=form.institution_id,
            department_id=form.department_id,
            external_id=_clean(body.external_id),
            full_name=_clean(body.full_name) or "Unnamed student",
            email=(_clean(body.email) or "").lower() or None,
            created_at=now,
        )
        db.add(student)
        await db.flush()
    elif await _has_live_submission(db, form, student.id):
        raise AlreadySubmitted

    classmate_ids = {m.id for m in await _classmates(db, form, student.id)}
    edges = plan_peer_edges(form, body.peers, classmate_ids, student.id)

    sub = SurveyFormSubmission(
        id=uuid4(),
        institution_id=form.institution_id,
        form_id=form.id,
        student_id=student.id,
        profile={
            k: v.value
            for k, v in (("collaboration_pref", collab), ("participation_level", part))
            if v is not None
        },
        peers=[{"student_id": str(p.student_id), "option": p.option} for p in body.peers],
        extra_answers=extra,
        submitted_at=now,
    )
    db.add(sub)
    try:
        await db.flush()  # the unique index rejects a second live submission here
    except IntegrityError as exc:
        raise AlreadySubmitted from exc

    fslsm = dominant = None
    if form.include_ils:
        written = await ingestion_service.write_single_response(
            db,
            institution_id=form.institution_id,
            student_id=student.id,
            answers=dict(body.answers),
            source=ResponseSource.form_app,
            academic_term_id=form.academic_term_id,
            external_response_id=f"form:{form.id}:{sub.id}",
            now=now,
        )
        sub.survey_response_id = written.response_id
        sub.student_profile_id = written.profile_id
        fslsm = written.score.as_dict()
        d = written.score.dominant_axis()
        dominant = d.value if d else None

    if collab is not None or part is not None:
        sub.aux_profile_id = await ingestion_service.write_aux_profile(
            db,
            institution_id=form.institution_id,
            student_id=student.id,
            academic_term_id=form.academic_term_id,
            collaboration_pref=collab,
            participation_level=part,
            now=now,
        )

    if edges:
        stmt = pg_insert(PeerRelationship).values(
            [
                {
                    "id": uuid4(),
                    "institution_id": form.institution_id,
                    "academic_term_id": form.academic_term_id,
                    "from_student_id": student.id,
                    "to_student_id": e["to_student_id"],
                    "type": RelationshipType(e["type"]),
                    "strength": e["strength"],
                    "label": e["label"],
                    "source": RelationshipSource.survey,
                    "form_submission_id": sub.id,
                    "created_at": now,
                }
                for e in edges
            ]
        )
        # The unique key also covers soft-deleted edges, so revive them.
        stmt = stmt.on_conflict_do_update(
            index_elements=["academic_term_id", "from_student_id", "to_student_id", "type"],
            set_={
                "strength": stmt.excluded.strength,
                "label": stmt.excluded.label,
                "source": stmt.excluded.source,
                "form_submission_id": stmt.excluded.form_submission_id,
                "deleted_at": None,
            },
        )
        await db.execute(stmt)

    await write_audit(
        db,
        institution_id=form.institution_id,
        actor_user_id=None,
        action="survey_form.submit",
        entity_type="survey_form_submission",
        entity_id=sub.id,
        payload={
            "form_id": str(form.id),
            "student_id": str(student.id),
            "new_student": resolved.new_student,
            "peers": len(edges),
            "extra_answers": len(extra),
        },
    )
    await db.flush()
    return SubmitResponse(submission_id=sub.id, fslsm=fslsm, dominant_axis=dominant)
