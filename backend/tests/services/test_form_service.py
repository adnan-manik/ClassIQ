"""Survey forms: answer validation, peer planning, identity and access rules.

These use stub sessions; the SQL itself (constraints, RLS, the peer upsert)
is covered by db/tests/survey_forms.test.mjs.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.ingestion import ils_instrument
from app.models.student import Student
from app.models.survey_form import SurveyForm, SurveyFormStatus
from app.schemas.forms import ExtraQuestion, FormCreate, Identity, PeerPick
from app.services import form_service as svc


def make_form(**kw) -> SurveyForm:
    base = dict(
        id=uuid4(), institution_id=uuid4(), code="ABC234", title="Survey",
        status=SurveyFormStatus.open, include_ils=True, ils_wording="rdf",
        collect_collaboration=True, collect_participation=True, collect_peers=True,
        peer_options=[
            {"key": "friend", "label": "Friend", "base_type": "friend", "strength": 4},
            {"key": "lab", "label": "Lab partner", "base_type": "friend", "strength": 5},
            {"key": "avoid", "label": "Avoid", "base_type": "conflict", "strength": 3},
        ],
        max_peer_picks=2, extra_questions=[], allow_new_students=False,
        department_id=uuid4(), section_id=None, academic_term_id=uuid4(),
        closes_at=None, deleted_at=None,
    )
    base.update(kw)
    return SurveyForm(**base)


def session(*scalars):
    """Each execute() returns the next value from scalar_one_or_none()."""
    db = AsyncMock()
    db.execute = AsyncMock(
        side_effect=[Mock(scalar_one_or_none=Mock(return_value=s)) for s in scalars]
    )
    return db


# ─── Extra answers ──────────────────────────────────────────────────────────

QUESTIONS = [
    {"id": "hobby", "prompt": "Hobby", "kind": "short_text", "required": True},
    {"id": "lang", "prompt": "Language", "kind": "single_choice", "options": ["Python", "C++"]},
    {"id": "tools", "prompt": "Tools", "kind": "multi_choice", "options": ["Git", "VS Code", "Vim"]},
    {"id": "confidence", "prompt": "Confidence", "kind": "scale", "scale_max": 5},
    {"id": "hours", "prompt": "Hours a week", "kind": "number"},
]


def test_extra_answers_are_checked_per_kind():
    out = svc.validate_extra_answers(
        QUESTIONS,
        {"hobby": " chess ", "lang": "C++", "tools": ["Git", "Git", "Vim"], "confidence": 4, "hours": 7.5},
    )
    assert out == {"hobby": "chess", "lang": "C++", "tools": ["Git", "Vim"], "confidence": 4, "hours": 7.5}


@pytest.mark.parametrize(
    "answers",
    [
        {},  # required question missing
        {"hobby": "x", "lang": "Java"},
        {"hobby": "x", "tools": ["Emacs"]},
        {"hobby": "x", "confidence": 6},
        {"hobby": "x", "confidence": True},
        {"hobby": "x", "hours": "ten"},
        {"hobby": "x" * 501},
        {"hobby": "x", "not_on_form": 1},
    ],
)
def test_bad_extra_answers_are_rejected(answers):
    with pytest.raises(svc.SubmissionError):
        svc.validate_extra_answers(QUESTIONS, answers)


def test_choice_questions_need_two_distinct_options():
    with pytest.raises(ValidationError):
        ExtraQuestion(id="q1", prompt="Pick", kind="single_choice", options=["Only"])
    with pytest.raises(ValidationError):
        ExtraQuestion(id="q1", prompt="Pick", kind="multi_choice", options=["A", "A"])
    assert ExtraQuestion(id="q1", prompt="Say", kind="short_text", options=["ignored"]).options == []


def test_form_rejects_duplicate_question_and_option_ids():
    q = {"id": "q1", "prompt": "Say", "kind": "short_text"}
    with pytest.raises(ValidationError):
        FormCreate(title="x", extra_questions=[q, q])
    opt = {"key": "f", "label": "Friend", "base_type": "friend"}
    with pytest.raises(ValidationError):
        FormCreate(title="x", peer_options=[opt, opt])


# ─── Peer planning ──────────────────────────────────────────────────────────

def test_peer_picks_become_edges_keeping_the_strongest_per_type():
    form = make_form()
    me, a, b = uuid4(), uuid4(), uuid4()
    edges = svc.plan_peer_edges(
        form,
        [PeerPick(student_id=a, option="friend"), PeerPick(student_id=a, option="lab"),
         PeerPick(student_id=b, option="avoid")],
        {a, b},
        me,
    )
    by_to = {(e["to_student_id"], e["type"]): e for e in edges}
    assert len(edges) == 2
    assert by_to[(a, "friend")]["strength"] == 5 and by_to[(a, "friend")]["label"] == "Lab partner"
    assert by_to[(b, "conflict")]["strength"] == 3


@pytest.mark.parametrize("case", ["outside", "self", "option", "too_many"])
def test_invalid_peer_picks_are_rejected(case):
    form = make_form()
    me, a, b, c = uuid4(), uuid4(), uuid4(), uuid4()
    picks = {
        "outside": [PeerPick(student_id=uuid4(), option="friend")],
        "self": [PeerPick(student_id=me, option="friend")],
        "option": [PeerPick(student_id=a, option="nope")],
        "too_many": [PeerPick(student_id=s, option="friend") for s in (a, b, c)],
    }[case]
    with pytest.raises(svc.SubmissionError):
        svc.plan_peer_edges(form, picks, {a, b, c, me}, me)


def test_peers_refused_when_the_form_does_not_ask():
    form = make_form(collect_peers=False)
    with pytest.raises(svc.SubmissionError):
        svc.plan_peer_edges(form, [PeerPick(student_id=uuid4(), option="friend")], set(), None)
    assert svc.plan_peer_edges(form, [], set(), None) == []


# ─── Identity ───────────────────────────────────────────────────────────────

def student(**kw) -> Student:
    return Student(id=uuid4(), institution_id=uuid4(), full_name="Ada Lovelace", **kw)


async def test_identity_needs_the_id_and_email_on_file():
    form = make_form()
    ada = student(external_id="SP23-001", email="ada@uni.edu")
    ok = await svc.resolve_identity(
        session(ada, ada), form, Identity(external_id="sp23-001", email="ADA@uni.edu")
    )
    assert ok.student is ada and not ok.new_student

    for who in (
        Identity(external_id="SP23-001"),                       # email on file but not given
        Identity(external_id="SP23-001", email="eve@uni.edu"),  # wrong email
    ):
        with pytest.raises(svc.IdentityError):
            await svc.resolve_identity(session(ada), form, who)


async def test_identity_outside_the_form_scope_is_refused():
    form = make_form()
    ada = student(external_id="SP23-001", email=None)
    with pytest.raises(svc.IdentityError):
        await svc.resolve_identity(session(ada, None), form, Identity(external_id="SP23-001"))


async def test_unknown_respondent_only_allowed_when_the_form_accepts_new_students():
    who = Identity(external_id="SP26-999", email="new@uni.edu", full_name="New Person")
    with pytest.raises(svc.IdentityError):
        await svc.resolve_identity(session(None, None), make_form(), who)
    resolved = await svc.resolve_identity(session(None, None), make_form(allow_new_students=True), who)
    assert resolved.student is None and resolved.new_student


# ─── Opening a form ─────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "form",
    [
        None,
        make_form(status=SurveyFormStatus.draft),
        make_form(status=SurveyFormStatus.closed),
        make_form(closes_at=datetime.now(timezone.utc) - timedelta(minutes=1)),
    ],
)
async def test_unavailable_forms_all_look_the_same(form):
    with pytest.raises(svc.FormNotFound):
        await svc.open_form(session(form), "abc-234")


async def test_open_form_by_code_is_case_and_space_insensitive():
    form = make_form()
    assert await svc.open_form(session(form), " abc 234 ") is form
    with pytest.raises(svc.FormNotFound):
        await svc.open_form(session(), "ab")  # too short to be a code; no query


def test_codes_avoid_ambiguous_characters():
    codes = {svc.new_code() for _ in range(200)}
    assert all(len(c) == svc.CODE_LENGTH and not set(c) & set("0O1IL") for c in codes)


# ─── Question wording ───────────────────────────────────────────────────────

def test_rdf_wording_ships_and_scores_a_as_the_first_pole():
    items = ils_instrument.survey_items("rdf")
    assert len(items) == 44
    assert (items[1].answer_a, items[1].answer_b) == ("realistic", "innovative")


def test_standard_wording_needs_the_licensed_file(tmp_path, monkeypatch):
    ils_instrument.standard_stems.cache_clear()
    monkeypatch.setattr(ils_instrument, "STANDARD_STEMS_FILE", tmp_path / "missing.json")
    try:
        assert ils_instrument.available_wordings() == ["rdf"]
        with pytest.raises(ValueError):
            ils_instrument.survey_items("standard")

        ils_instrument.standard_stems.cache_clear()
        stems = tmp_path / "stems.json"
        stems.write_text(json.dumps([f"Stem {i}" for i in range(1, 45)]), encoding="utf-8")
        monkeypatch.setattr(ils_instrument, "STANDARD_STEMS_FILE", stems)
        assert ils_instrument.available_wordings() == ["rdf", "standard"]
        assert ils_instrument.survey_items("standard")[0].prompt == "Stem 1"

        ils_instrument.standard_stems.cache_clear()
        stems.write_text(json.dumps(["too short"]), encoding="utf-8")
        assert ils_instrument.standard_stems() is None
    finally:
        ils_instrument.standard_stems.cache_clear()
