"""Scoring many rosters must load the shared inputs once, and change nothing.

`load_roster_inputs` can now be handed a `ScoringContext` (the scoring config
and the teacher candidates, which are per-institution) and a `RosterPreload`
(profiles, aux rows and peer edges for the union of several rosters) instead of
querying them per roster. That feeds the compatibility engine, so the slices
have to reproduce the per-roster filters exactly — above all the peer-edge rule,
where an edge only counts when BOTH endpoints are in that roster.

These tests run each roster down both paths and compare the RosterInputs.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.models.student import StudentAuxProfile
from app.services import compatibility_service as compat

TERM = uuid4()
INSTITUTION = uuid4()
NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


class _Scalars:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalars(self):
        return _Scalars(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class FakeSession:
    """Replays canned result sets in order and counts the statements."""

    def __init__(self, results):
        self.calls = 0
        self._results = list(results)

    async def execute(self, _stmt):
        self.calls += 1
        if not self._results:
            raise AssertionError(f"unexpected query #{self.calls}")
        return _Result(self._results.pop(0))


def profile(student_id: UUID):
    return SimpleNamespace(student_id=student_id, kind="profile")


def aux(student_id: UUID, term: UUID | None, collected: datetime):
    return StudentAuxProfile(
        id=uuid4(), student_id=student_id, academic_term_id=term, collected_at=collected
    )


def edge(a: UUID, b: UUID):
    return SimpleNamespace(from_student_id=a, to_student_id=b)


def config(weights):
    return SimpleNamespace(id=uuid4(), weights=weights)


# Two rosters, plus one student in neither, and an edge that crosses rosters.
S1, S2, S3, S4 = uuid4(), uuid4(), uuid4(), uuid4()
ROSTER_A = [S1, S2]
ROSTER_B = [S3, S4]

PROFILES = {s: profile(s) for s in (S1, S2, S3, S4)}
AUX_ROWS = [
    aux(S1, TERM, NOW),                      # term-specific wins for S1
    aux(S1, None, NOW - timedelta(days=1)),
    aux(S2, None, NOW),
    aux(S3, TERM, NOW),
]
EDGE_IN_A = edge(S1, S2)
EDGE_IN_B = edge(S3, S4)
EDGE_ACROSS = edge(S2, S3)
ALL_EDGES = [EDGE_IN_A, EDGE_ACROSS, EDGE_IN_B]


def per_roster_session(roster, teacher_profile=None, weights=None):
    """What the old path saw: its own queries, already filtered by Postgres.

    With no teacher_id there is no teacher-profile query, so that slot is
    omitted rather than left empty.
    """
    in_roster = set(roster)
    return FakeSession(
        ([[teacher_profile]] if teacher_profile else [])
        + [
            [PROFILES[s] for s in roster],
            [a for a in AUX_ROWS if a.student_id in in_roster],
            [
                e
                for e in ALL_EDGES
                if e.from_student_id in in_roster and e.to_student_id in in_roster
            ],
            [config(weights or {"w": 1.0})],
        ]
    )


def union_preload():
    aux_by_student: dict[UUID, list] = {}
    for a in AUX_ROWS:
        aux_by_student.setdefault(a.student_id, []).append(a)
    return compat.RosterPreload(
        academic_term_id=TERM,
        student_profiles=dict(PROFILES),
        aux_profiles=aux_by_student,
        peer_relationships=list(ALL_EDGES),
    )


async def load(session, roster, **kw):
    return await compat.load_roster_inputs(
        session,
        institution_id=INSTITUTION,
        academic_term_id=TERM,
        teacher_id=None,
        student_ids=roster,
        **kw,
    )


# ── equivalence ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("roster", [ROSTER_A, ROSTER_B])
async def test_preload_matches_the_per_roster_queries(roster):
    weights = {"style_alignment": 0.4}
    cfg_id = uuid4()
    queried = await load(per_roster_session(roster, weights=weights), roster)
    preloaded = await load(
        FakeSession([]),
        roster,
        context=compat.ScoringContext(
            scoring_config_id=cfg_id, weights=weights, teacher_candidates=[]
        ),
        preload=union_preload(),
    )

    assert {p.student_id for p in preloaded.student_profiles} == {
        p.student_id for p in queried.student_profiles
    }
    assert {a.id for a in preloaded.aux_profiles} == {a.id for a in queried.aux_profiles}
    assert [(e.from_student_id, e.to_student_id) for e in preloaded.peer_relationships] == [
        (e.from_student_id, e.to_student_id) for e in queried.peer_relationships
    ]
    assert preloaded.student_ids == queried.student_ids
    assert preloaded.weights == queried.weights == weights
    assert preloaded.scoring_config_id == cfg_id


async def test_a_cross_roster_edge_counts_for_neither_roster():
    """The engine's social-cohesion factor must not see an edge leaving the roster."""
    pre = union_preload()
    ctx = compat.ScoringContext(
        scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
    )
    a = await load(FakeSession([]), ROSTER_A, context=ctx, preload=pre)
    b = await load(FakeSession([]), ROSTER_B, context=ctx, preload=pre)

    assert [e.from_student_id for e in a.peer_relationships] == [S1]
    assert [e.from_student_id for e in b.peer_relationships] == [S3]
    for inputs in (a, b):
        assert EDGE_ACROSS not in inputs.peer_relationships


async def test_preload_keeps_the_term_specific_aux_row():
    """select_aux_profiles still runs, on the sliced rows."""
    inputs = await load(
        FakeSession([]),
        ROSTER_A,
        context=compat.ScoringContext(
            scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
        ),
        preload=union_preload(),
    )
    by_student = {a.student_id: a for a in inputs.aux_profiles}
    # S1 has both a term row and a generic row; the term row wins
    assert by_student[S1].academic_term_id == TERM
    assert by_student[S2].academic_term_id is None


async def test_a_student_without_a_profile_is_simply_absent():
    pre = compat.RosterPreload(
        academic_term_id=TERM,
        student_profiles={S1: PROFILES[S1]},
        aux_profiles={},
        peer_relationships=[],
    )
    inputs = await load(
        FakeSession([]),
        ROSTER_A,
        context=compat.ScoringContext(
            scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
        ),
        preload=pre,
    )
    assert [p.student_id for p in inputs.student_profiles] == [S1]
    assert inputs.student_ids == ROSTER_A


async def test_a_preload_for_another_term_is_refused():
    with pytest.raises(compat.SimulateError, match="different term"):
        await load(
            FakeSession([]),
            ROSTER_A,
            context=compat.ScoringContext(
                scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
            ),
            preload=compat.RosterPreload(
                academic_term_id=uuid4(),
                student_profiles={},
                aux_profiles={},
                peer_relationships=[],
            ),
        )


# ── query counts ──────────────────────────────────────────────────────────


async def test_without_the_shared_inputs_the_count_is_unchanged():
    session = per_roster_session(ROSTER_A)
    await load(session, ROSTER_A)
    # profiles, aux, peers, config — no teacher id, so no teacher-profile query
    assert session.calls == 4


async def test_with_the_shared_inputs_a_roster_costs_nothing():
    session = FakeSession([])
    await load(
        session,
        ROSTER_A,
        context=compat.ScoringContext(
            scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
        ),
        preload=union_preload(),
    )
    assert session.calls == 0


async def test_a_teacher_profile_is_still_fetched_per_roster():
    tp = SimpleNamespace(teacher_id=uuid4())
    session = FakeSession([[tp]])
    inputs = await compat.load_roster_inputs(
        session,
        institution_id=INSTITUTION,
        academic_term_id=TERM,
        teacher_id=tp.teacher_id,
        student_ids=ROSTER_A,
        context=compat.ScoringContext(
            scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
        ),
        preload=union_preload(),
    )
    assert session.calls == 1
    assert inputs.teacher_profile is tp


async def test_load_roster_preload_is_three_queries_and_skips_an_empty_roster():
    session = FakeSession(
        [
            [PROFILES[S1], PROFILES[S2]],
            [a for a in AUX_ROWS if a.student_id in {S1, S2}],
            [EDGE_IN_A],
        ]
    )
    pre = await compat.load_roster_preload(
        session,
        institution_id=INSTITUTION,
        academic_term_id=TERM,
        student_ids=[S1, S2, S1],
    )
    assert session.calls == 3
    assert set(pre.student_profiles) == {S1, S2}
    assert pre.peer_relationships == [EDGE_IN_A]

    empty = FakeSession([])
    blank = await compat.load_roster_preload(
        empty, institution_id=INSTITUTION, academic_term_id=TERM, student_ids=[]
    )
    assert empty.calls == 0
    assert blank.student_profiles == {}


async def test_an_empty_roster_still_raises_before_any_query():
    session = FakeSession([])
    with pytest.raises(compat.SimulateError, match="No enrolled students"):
        await load(session, [])
    assert session.calls == 0


# ── recommend_teacher ─────────────────────────────────────────────────────


async def test_recommend_teacher_reuses_the_context_candidates(monkeypatch):
    best = SimpleNamespace(id=uuid4())
    worse = SimpleNamespace(id=uuid4())
    profiles = {best.id: SimpleNamespace(score=90), worse.id: SimpleNamespace(score=60)}
    monkeypatch.setattr(
        compat,
        "run_engine",
        lambda inputs, teacher_profile=None: SimpleNamespace(
            compatibility_score=teacher_profile.score
        ),
    )
    ctx = compat.ScoringContext(
        scoring_config_id=uuid4(),
        weights={},
        teacher_candidates=[(worse, profiles[worse.id]), (best, profiles[best.id])],
    )
    session = FakeSession([])
    picked = await compat.recommend_teacher(
        session, institution_id=INSTITUTION, inputs=None, current_score=70, context=ctx
    )
    # no query, and the ≥3-point rule still decides
    assert session.calls == 0
    assert picked == best.id


async def test_recommend_teacher_without_a_context_still_queries(monkeypatch):
    teacher = SimpleNamespace(id=uuid4())
    monkeypatch.setattr(
        compat,
        "run_engine",
        lambda inputs, teacher_profile=None: SimpleNamespace(compatibility_score=95),
    )
    session = FakeSession([[(teacher, SimpleNamespace(score=95))]])
    picked = await compat.recommend_teacher(
        session, institution_id=INSTITUTION, inputs=None, current_score=70
    )
    assert session.calls == 1
    assert picked == teacher.id


# ── the scenario simulate loop ────────────────────────────────────────────


async def test_simulate_scenario_loads_the_shared_inputs_once(monkeypatch):
    """Five sections must cost one context load and one preload, not five each."""
    from unittest.mock import AsyncMock, Mock

    from app.models.scenario import Scenario, ScenarioStatus
    from app.services import scenario_service as svc

    course = SimpleNamespace(id=uuid4(), code="CS101", name="Intro")
    rows = [
        (SimpleNamespace(id=uuid4(), teacher_id=uuid4(), label=chr(65 + i)), course, None, None)
        for i in range(5)
    ]
    monkeypatch.setattr(svc.repo, "list_scenario_sections", AsyncMock(return_value=rows))
    monkeypatch.setattr(
        svc.repo,
        "student_ids_by_scenario_section",
        AsyncMock(return_value={ss.id: [uuid4()] for ss, *_rest in rows}),
    )
    ctx = compat.ScoringContext(
        scoring_config_id=uuid4(), weights={}, teacher_candidates=[]
    )
    pre = compat.RosterPreload(
        academic_term_id=TERM, student_profiles={}, aux_profiles={}, peer_relationships=[]
    )
    context_loader = AsyncMock(return_value=ctx)
    preloader = AsyncMock(return_value=pre)
    monkeypatch.setattr(svc.compat, "load_scoring_context", context_loader)
    monkeypatch.setattr(svc.compat, "load_roster_preload", preloader)

    scorer = AsyncMock(
        return_value=SimpleNamespace(
            output=None, recommended_teacher_id=None, scoring_config_id=ctx.scoring_config_id
        )
    )
    monkeypatch.setattr(svc.compat, "score_roster", scorer)
    monkeypatch.setattr(
        svc.compat, "build_result_rows", Mock(return_value=(SimpleNamespace(), []))
    )
    monkeypatch.setattr(svc, "write_audit", AsyncMock())
    monkeypatch.setattr(svc, "_sections_with_results", AsyncMock(return_value=[]))

    db = AsyncMock()
    db.add = Mock()
    db.add_all = Mock()
    scenario = Scenario(
        id=uuid4(), academic_term_id=TERM, status=ScenarioStatus.draft
    )
    await svc.simulate_scenario(
        db, institution_id=INSTITUTION, user_id=uuid4(), scenario=scenario
    )

    assert context_loader.await_count == 1
    assert preloader.await_count == 1
    assert scorer.await_count == 5
    # and every roster was scored against the shared data, not its own queries
    for call in scorer.await_args_list:
        assert call.kwargs["context"] is ctx
        assert call.kwargs["preload"] is pre


async def test_simulate_scenario_reports_a_missing_scoring_config_as_a_400(monkeypatch):
    from unittest.mock import AsyncMock

    from app.models.scenario import Scenario, ScenarioStatus
    from app.services import scenario_service as svc

    course = SimpleNamespace(id=uuid4(), code="CS101", name="Intro")
    rows = [(SimpleNamespace(id=uuid4(), teacher_id=None, label="A"), course, None, None)]
    monkeypatch.setattr(svc.repo, "list_scenario_sections", AsyncMock(return_value=rows))
    monkeypatch.setattr(
        svc.compat,
        "load_scoring_context",
        AsyncMock(side_effect=compat.SimulateError("No scoring configuration is available.")),
    )
    scenario = Scenario(id=uuid4(), academic_term_id=TERM, status=ScenarioStatus.draft)
    # Loading the config moved ahead of the loop, so this must still surface as
    # a ScenarioError the router turns into a 400, not an unhandled 500.
    with pytest.raises(svc.ScenarioError, match="No scoring configuration"):
        await svc.simulate_scenario(
            AsyncMock(), institution_id=INSTITUTION, user_id=uuid4(), scenario=scenario
        )


# ── order invariance ──────────────────────────────────────────────────────
#
# The preload path hands the engine its lists in roster order; the per-roster
# queries handed them over in whatever order Postgres returned. If the engine
# were order-sensitive, the same roster could score differently depending on
# which path produced its inputs — a scenario simulated through the preload vs.
# the same roster re-scored through simulate_section after apply.


def _real_inputs():
    """A roster of real ORM objects, built like tests/engines fixtures."""
    from app.models.peer_relationship import PeerRelationship, RelationshipType
    from app.models.student import (
        FslsmAxis,
        ParticipationLevel,
        StudentAuxProfile,
        StudentProfile,
    )
    from app.models.teacher import InteractionLevel, PacingPref, TeacherProfile

    students = [uuid4() for _ in range(6)]
    axes = [
        FslsmAxis.active_reflective,
        FslsmAxis.sensing_intuitive,
        FslsmAxis.visual_verbal,
        FslsmAxis.sequential_global,
    ]
    profiles = [
        StudentProfile(
            id=uuid4(),
            student_id=sid,
            active_reflective_score=[5, -3, 1, 7, -9, 3][i],
            sensing_intuitive_score=[-1, 7, 3, -5, 1, 9][i],
            visual_verbal_score=[3, 3, -7, 1, 5, -1][i],
            sequential_global_score=[-5, 1, 9, -3, 7, 1][i],
            dominant_axis=axes[i % 4],
        )
        for i, sid in enumerate(students)
    ]
    levels = list(ParticipationLevel)
    auxes = [
        StudentAuxProfile(
            id=uuid4(), student_id=sid, participation_level=levels[i % len(levels)]
        )
        for i, sid in enumerate(students)
    ]
    kinds = list(RelationshipType)
    edges = [
        PeerRelationship(
            id=uuid4(),
            from_student_id=students[a],
            to_student_id=students[b],
            type=kinds[i % len(kinds)],
            strength=[1, 3, 2, 5, 4][i],
        )
        for i, (a, b) in enumerate([(0, 1), (1, 2), (2, 0), (3, 4), (4, 5)])
    ]
    return compat.RosterInputs(
        student_ids=list(students),
        teacher_profile=TeacherProfile(
            id=uuid4(),
            teacher_id=uuid4(),
            interaction_level=InteractionLevel.high,
            pacing=PacingPref.moderate,
        ),
        student_profiles=profiles,
        aux_profiles=auxes,
        peer_relationships=edges,
        weights={},
        scoring_config_id=uuid4(),
    )


def test_the_engine_scores_the_same_whatever_order_the_lists_arrive_in():
    import random

    base = _real_inputs()
    expected = compat.run_engine(base)
    assert expected.compatibility_score > 0, "fixture should produce a real score"

    def shuffled(seed):
        rng = random.Random(seed)
        return compat.RosterInputs(
            student_ids=rng.sample(base.student_ids, len(base.student_ids)),
            teacher_profile=base.teacher_profile,
            student_profiles=rng.sample(base.student_profiles, len(base.student_profiles)),
            aux_profiles=rng.sample(base.aux_profiles, len(base.aux_profiles)),
            peer_relationships=rng.sample(
                base.peer_relationships, len(base.peer_relationships)
            ),
            weights=base.weights,
            scoring_config_id=base.scoring_config_id,
        )

    reversed_inputs = compat.RosterInputs(
        student_ids=list(reversed(base.student_ids)),
        teacher_profile=base.teacher_profile,
        student_profiles=list(reversed(base.student_profiles)),
        aux_profiles=list(reversed(base.aux_profiles)),
        peer_relationships=list(reversed(base.peer_relationships)),
        weights=base.weights,
        scoring_config_id=base.scoring_config_id,
    )

    for label, variant in [("reversed", reversed_inputs)] + [
        (f"shuffle {seed}", shuffled(seed)) for seed in range(8)
    ]:
        out = compat.run_engine(variant)
        assert out.compatibility_score == expected.compatibility_score, label
        assert out.predicted_outcome == expected.predicted_outcome, label
        assert out.social_graph_impact == expected.social_graph_impact, label
        assert {f.name: (f.score, f.impact) for f in out.factors} == {
            f.name: (f.score, f.impact) for f in expected.factors
        }, label
