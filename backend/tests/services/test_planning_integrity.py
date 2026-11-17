"""Lifecycle, roster integrity, atomic application and teacher ranking."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.models.scenario import Scenario, ScenarioStatus
from app.models.section import Section, SectionState
from app.models.student import StudentAuxProfile
from app.repositories import sections, scenarios
from app.services import compatibility_service as compat, scenario_service


def session_with(value):
    db = AsyncMock()
    db.add = Mock()
    db.add_all = Mock()
    db.execute.return_value.scalar_one_or_none = Mock(return_value=value)
    return db


def scripted_session(*scalar_batches):
    """Answer each execute() with the next list of scalars, in order."""
    batches = list(scalar_batches)

    def _execute(_stmt):
        rows = batches.pop(0)
        return Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=rows))))

    db = AsyncMock()
    db.add = Mock()
    db.execute = AsyncMock(side_effect=_execute)
    return db


@pytest.mark.parametrize("state", [SectionState.active, SectionState.archived])
async def test_locked_sections_cannot_be_edited(state):
    section = Section(id=uuid4(), label="A", state=state)
    db = session_with(section)
    with pytest.raises(sections.SectionRefError):
        await sections.update_section(
            db, institution_id=uuid4(), section_id=section.id,
            set_label=True, label="Changed", set_teacher=False, teacher_id=None,
        )
    assert section.label == "A"
    db.commit.assert_not_awaited()


async def test_invalid_roster_does_not_remove_existing_students(monkeypatch):
    section = Section(id=uuid4(), state=SectionState.simulated)
    valid, foreign = uuid4(), uuid4()
    monkeypatch.setattr(sections, "_valid_student_ids", AsyncMock(return_value=[valid]))
    db = AsyncMock()
    with pytest.raises(sections.SectionRefError):
        await sections.reconcile_roster(db, institution_id=uuid4(), section=section,
                                       student_ids=[valid, foreign], now=datetime.now(timezone.utc))
    db.execute.assert_not_awaited()
    assert section.state == SectionState.simulated


async def test_create_rejects_incomplete_roster_before_writing(monkeypatch):
    for helper in ("_course_in_institution", "_term_in_institution"):
        monkeypatch.setattr(sections, helper, AsyncMock(return_value=True))
    monkeypatch.setattr(sections, "_valid_student_ids", AsyncMock(return_value=[]))
    db = session_with(None)
    with pytest.raises(sections.SectionRefError):
        await sections.create_section(db, institution_id=uuid4(), created_by=uuid4(),
            course_id=uuid4(), academic_term_id=uuid4(), label="A", teacher_id=None,
            student_ids=[uuid4()])
    db.add.assert_not_called()


async def test_scenario_rejects_foreign_roster():
    # _validate_sections resolves courses, teachers and students in that order,
    # one query each for the whole payload: the course and teacher are in the
    # tenant, the rostered student is not.
    course = SimpleNamespace(id=uuid4(), code="CS101")
    teacher_id = uuid4()
    db = scripted_session([course], [teacher_id], [])
    with pytest.raises(scenarios.ScenarioRefError):
        await scenarios._validate_sections(db, uuid4(), [{
            "course_id": course.id, "teacher_id": teacher_id, "label": "A",
            "student_ids": [uuid4()],
        }])
    assert db.execute.await_count == 3


async def test_scenario_validation_is_one_query_per_reference_kind():
    """Three sections must still cost three queries, not nine."""
    courses = [SimpleNamespace(id=uuid4(), code=f"CS10{i}") for i in range(3)]
    teachers = [uuid4() for _ in courses]
    students = [uuid4() for _ in courses]
    db = scripted_session(courses, teachers, students)
    out = await scenarios._validate_sections(db, uuid4(), [
        {"course_id": c.id, "teacher_id": t, "label": " A ", "student_ids": [sid, sid]}
        for c, t, sid in zip(courses, teachers, students)
    ])
    assert db.execute.await_count == 3
    assert [s["label"] for s in out] == ["A", "A", "A"]
    # duplicate ids in the request collapse, caller order preserved
    assert [s["student_ids"] for s in out] == [[sid] for sid in students]


async def test_scenario_rejects_duplicate_course_label_pair():
    course = SimpleNamespace(id=uuid4(), code="CS101")
    teacher_id = uuid4()
    db = scripted_session([course], [teacher_id], [])
    with pytest.raises(scenarios.ScenarioRefError, match="Duplicate section"):
        await scenarios._validate_sections(db, uuid4(), [
            {"course_id": course.id, "teacher_id": teacher_id, "label": "A", "student_ids": []},
            {"course_id": course.id, "teacher_id": teacher_id, "label": "A", "student_ids": []},
        ])


async def test_best_teacher_wins_even_if_only_one_point_above_previous_best(monkeypatch):
    candidates = [(SimpleNamespace(id=uuid4()), SimpleNamespace(score=s)) for s in (73, 74, 72)]
    db = AsyncMock()
    db.execute.return_value.all = Mock(return_value=candidates)
    monkeypatch.setattr(compat, "run_engine", lambda inputs, teacher_profile:
                        SimpleNamespace(compatibility_score=teacher_profile.score))
    result = await compat.recommend_teacher(db, institution_id=uuid4(), inputs=None, current_score=70)
    assert result == candidates[1][0].id


def test_term_participation_overrides_generic_without_double_counting():
    term, student, other = uuid4(), uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    def profile(sid, term_id, collected):
        return StudentAuxProfile(id=uuid4(), student_id=sid, academic_term_id=term_id, collected_at=collected)
    generic = profile(student, None, now)
    specific = profile(student, term, now - timedelta(days=1))
    other_generic = profile(other, None, now)
    foreign_term = profile(other, uuid4(), now)
    selected = compat.select_aux_profiles([generic, specific, other_generic, foreign_term], term)
    assert {p.student_id: p.id for p in selected} == {student: specific.id, other: other_generic.id}


async def test_archived_section_cannot_be_resimulated():
    section = Section(id=uuid4(), state=SectionState.archived)
    db = session_with(section)
    with pytest.raises(compat.SimulateError, match="archived"):
        await compat.simulate_section(db, institution_id=uuid4(), section_id=section.id, triggered_by=uuid4())
    db.add.assert_not_called()


def setup_scenario(monkeypatch, state=None):
    scenario = Scenario(id=uuid4(), academic_term_id=uuid4(), status=ScenarioStatus.simulated)
    course = SimpleNamespace(id=uuid4(), code="CS101", name="Intro")
    rows = [(SimpleNamespace(id=uuid4(), teacher_id=uuid4(), label=label), course, None, None)
            for label in ("A", "B")]
    monkeypatch.setattr(scenario_service.repo, "list_scenario_sections", AsyncMock(return_value=rows))
    # Apply now takes every scenario section's roster in one query, and loads
    # the shared scoring inputs once rather than per section.
    monkeypatch.setattr(
        scenario_service.repo,
        "student_ids_by_scenario_section",
        AsyncMock(return_value={ss.id: [uuid4()] for ss, *_rest in rows}),
    )
    monkeypatch.setattr(
        compat,
        "load_scoring_context",
        AsyncMock(
            return_value=compat.ScoringContext(
                scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
            )
        ),
    )
    baseline = (Section(id=uuid4(), state=state), None, None) if state else None
    monkeypatch.setattr(scenario_service.repo, "baseline_section_for", AsyncMock(return_value=baseline))
    monkeypatch.setattr(scenario_service, "write_audit", AsyncMock())
    return scenario


@pytest.mark.parametrize("state", [SectionState.active, SectionState.archived])
async def test_scenario_cannot_overwrite_locked_section(monkeypatch, state):
    scenario = setup_scenario(monkeypatch, state)
    db = session_with(None)
    with pytest.raises(scenario_service.ScenarioError, match=state.value):
        await scenario_service.apply_scenario(db, institution_id=uuid4(), user_id=uuid4(), scenario=scenario)
    db.commit.assert_not_awaited()


async def test_failed_rescore_rolls_back_whole_scenario(monkeypatch):
    scenario = setup_scenario(monkeypatch)
    db = session_with(None)
    monkeypatch.setattr(compat, "simulate_section", AsyncMock(side_effect=[
        (None, SimpleNamespace(compatibility_score=75), []), compat.SimulateError("No enrolled students"),
    ]))
    with pytest.raises(scenario_service.ScenarioError, match="Could not apply"):
        await scenario_service.apply_scenario(db, institution_id=uuid4(), user_id=uuid4(), scenario=scenario)
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


async def test_successful_apply_commits_after_all_rescores(monkeypatch):
    scenario = setup_scenario(monkeypatch)
    db = session_with(None)
    async def rescore(*args, **kwargs):
        db.commit.assert_not_awaited()
        return None, SimpleNamespace(compatibility_score=75), []
    scorer = AsyncMock(side_effect=rescore)
    monkeypatch.setattr(compat, "simulate_section", scorer)
    result = await scenario_service.apply_scenario(db, institution_id=uuid4(), user_id=uuid4(), scenario=scenario)
    assert scorer.await_count == 2
    assert [s.compatibility_score for s in result.applied] == [75, 75]
    db.commit.assert_awaited_once()
