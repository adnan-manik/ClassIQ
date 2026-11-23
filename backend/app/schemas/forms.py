"""Shapes for /api/forms (staff builder) and /api/public/forms (no-auth survey)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.models.peer_relationship import RelationshipType
from app.models.student import CollabPref, ParticipationLevel
from app.models.survey_form import SurveyFormStatus
from app.schemas.common import APIModel

_KEY = r"^[a-z0-9][a-z0-9_-]{0,39}$"

QuestionKind = Literal[
    "short_text", "long_text", "single_choice", "multi_choice", "scale", "number"
]
CHOICE_KINDS = ("single_choice", "multi_choice")

MAX_EXTRA_QUESTIONS = 50
MAX_PEER_OPTIONS = 12


# ─── Builder pieces ─────────────────────────────────────────────────────────

class ExtraQuestion(APIModel):
    """A custom question appended to the form. Answers are stored, not scored."""

    id: str = Field(pattern=_KEY)
    prompt: str = Field(min_length=1, max_length=500)
    kind: QuestionKind
    options: list[str] = Field(default_factory=list, max_length=20)
    required: bool = False
    scale_max: int = Field(default=5, ge=2, le=10)

    @model_validator(mode="after")
    def _options_match_kind(self) -> ExtraQuestion:
        self.options = [o.strip() for o in self.options if o and o.strip()]
        if any(len(o) > 200 for o in self.options):
            raise ValueError("Each option must be at most 200 characters")
        if self.kind in CHOICE_KINDS:
            if len(self.options) < 2:
                raise ValueError(f"'{self.prompt[:40]}' needs at least two options")
            if len(set(self.options)) != len(self.options):
                raise ValueError(f"'{self.prompt[:40]}' has duplicate options")
        else:
            self.options = []
        return self


class PeerOption(APIModel):
    """One relation a respondent can pick for a classmate ("Lab partner").
    `base_type` + `strength` are what the social-cohesion factor scores."""

    key: str = Field(pattern=_KEY)
    label: str = Field(min_length=1, max_length=60)
    base_type: RelationshipType
    strength: int = Field(default=3, ge=1, le=5)


DEFAULT_PEER_OPTIONS: list[dict] = [
    {"key": "friend", "label": "Friend", "base_type": "friend", "strength": 4},
    {"key": "study_partner", "label": "Good study partner", "base_type": "study_partner", "strength": 4},
    {"key": "avoid", "label": "Prefer not to work with", "base_type": "conflict", "strength": 3},
]


def _unique(items: list, attr: str, what: str) -> None:
    keys = [getattr(i, attr) for i in items]
    if len(set(keys)) != len(keys):
        raise ValueError(f"Duplicate {what} ids")


class FormSettings(APIModel):
    """Every editable field. Used whole on create and partially on PATCH."""

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    department_id: UUID | None = None
    section_id: UUID | None = None
    academic_term_id: UUID | None = None
    include_ils: bool = True
    ils_wording: Literal["rdf", "standard"] = "rdf"
    collect_collaboration: bool = True
    collect_participation: bool = True
    collect_peers: bool = False
    peer_options: list[PeerOption] = Field(default_factory=list, max_length=MAX_PEER_OPTIONS)
    max_peer_picks: int = Field(default=5, ge=0, le=30)
    extra_questions: list[ExtraQuestion] = Field(
        default_factory=list, max_length=MAX_EXTRA_QUESTIONS
    )
    allow_new_students: bool = False
    closes_at: datetime | None = None

    @model_validator(mode="after")
    def _ids_unique(self) -> FormSettings:
        _unique(self.extra_questions, "id", "question")
        _unique(self.peer_options, "key", "relation option")
        return self


class FormCreate(FormSettings):
    pass


class FormUpdate(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    department_id: UUID | None = None
    section_id: UUID | None = None
    academic_term_id: UUID | None = None
    status: SurveyFormStatus | None = None
    include_ils: bool | None = None
    ils_wording: Literal["rdf", "standard"] | None = None
    collect_collaboration: bool | None = None
    collect_participation: bool | None = None
    collect_peers: bool | None = None
    peer_options: list[PeerOption] | None = Field(default=None, max_length=MAX_PEER_OPTIONS)
    max_peer_picks: int | None = Field(default=None, ge=0, le=30)
    extra_questions: list[ExtraQuestion] | None = Field(
        default=None, max_length=MAX_EXTRA_QUESTIONS
    )
    allow_new_students: bool | None = None
    closes_at: datetime | None = None

    @model_validator(mode="after")
    def _ids_unique(self) -> FormUpdate:
        if self.extra_questions:
            _unique(self.extra_questions, "id", "question")
        if self.peer_options:
            _unique(self.peer_options, "key", "relation option")
        return self


class FormShape(APIModel):
    id: UUID
    code: str
    title: str
    description: str | None
    status: SurveyFormStatus
    department_id: UUID | None
    section_id: UUID | None
    academic_term_id: UUID | None
    include_ils: bool
    ils_wording: str
    collect_collaboration: bool
    collect_participation: bool
    collect_peers: bool
    peer_options: list[PeerOption]
    max_peer_picks: int
    extra_questions: list[ExtraQuestion]
    allow_new_students: bool
    closes_at: datetime | None
    created_at: datetime
    updated_at: datetime
    submission_count: int = 0


class FormMeta(APIModel):
    """What the builder can offer."""

    wordings: list[str]
    relationship_types: list[str]
    question_kinds: list[str]
    default_peer_options: list[PeerOption]
    max_extra_questions: int = MAX_EXTRA_QUESTIONS
    max_peer_options: int = MAX_PEER_OPTIONS


class SubmissionShape(APIModel):
    id: UUID
    student_id: UUID
    student_name: str
    student_external_id: str | None
    submitted_at: datetime
    voided_at: datetime | None
    profile: dict[str, Any]
    peers: list[dict[str, Any]]
    extra_answers: dict[str, Any]
    fslsm: dict[str, int] | None = None


# ─── Public survey ──────────────────────────────────────────────────────────

class PublicQuestion(APIModel):
    sequence_no: int
    prompt: str
    answer_a: str
    answer_b: str


class PublicPeerOption(APIModel):
    key: str
    label: str


class PublicForm(APIModel):
    code: str
    title: str
    description: str | None
    institution_name: str
    include_ils: bool
    questions: list[PublicQuestion]
    collect_collaboration: bool
    collect_participation: bool
    collect_peers: bool
    peer_options: list[PublicPeerOption]
    max_peer_picks: int
    extra_questions: list[ExtraQuestion]
    allow_new_students: bool
    closes_at: datetime | None


class Identity(APIModel):
    external_id: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=254)
    full_name: str | None = Field(default=None, max_length=200)


class Classmate(APIModel):
    id: UUID
    name: str


class IdentifyResponse(APIModel):
    student_name: str
    new_student: bool
    already_submitted: bool
    classmates: list[Classmate]


class PeerPick(APIModel):
    student_id: UUID
    option: str = Field(max_length=40)


class PublicSubmission(Identity):
    answers: dict[int, Literal["A", "B"]] = Field(default_factory=dict, max_length=44)
    collaboration_pref: CollabPref | None = None
    participation_level: ParticipationLevel | None = None
    peers: list[PeerPick] = Field(default_factory=list, max_length=60)
    extra_answers: dict[str, Any] = Field(default_factory=dict, max_length=MAX_EXTRA_QUESTIONS)


class SubmitResponse(APIModel):
    submission_id: UUID
    fslsm: dict[str, int] | None
    dominant_axis: str | None
