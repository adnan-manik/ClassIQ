"""Compatibility engine — factor scorers + weighted aggregator (pure compute).

ORM classes are instantiated without a session; the engine only reads attributes.
"""

from uuid import uuid4

from app.engines.scoring import ScoringInput, score_section
from app.engines.scoring import aggregator, class_balance, participation, style_alignment
from app.engines.scoring.pipeline import DEFAULT_WEIGHTS
from app.models.peer_relationship import PeerRelationship, RelationshipType
from app.models.student import FslsmAxis, ParticipationLevel, StudentAuxProfile, StudentProfile
from app.models.teacher import InteractionLevel, PacingPref, TeacherProfile


def profile(ar=1, si=1, vv=1, sg=1, dominant=None) -> StudentProfile:
    return StudentProfile(
        id=uuid4(),
        student_id=uuid4(),
        active_reflective_score=ar,
        sensing_intuitive_score=si,
        visual_verbal_score=vv,
        sequential_global_score=sg,
        dominant_axis=dominant,
    )


def teacher(interaction=InteractionLevel.high, pacing=PacingPref.moderate) -> TeacherProfile:
    return TeacherProfile(
        id=uuid4(), teacher_id=uuid4(), interaction_level=interaction, pacing=pacing
    )


def aux(level: ParticipationLevel) -> StudentAuxProfile:
    return StudentAuxProfile(id=uuid4(), student_id=uuid4(), participation_level=level)


# ─── aggregator ─────────────────────────────────────────────────────────────

def test_aggregator_is_weighted_mean_and_clamped():
    f = [
        aggregator.WeightedFactor("a", 100, 0.5),
        aggregator.WeightedFactor("b", 0, 0.5),
    ]
    assert aggregator.aggregate(f) == 50
    assert aggregator.aggregate([]) == 0
    # weights that don't sum to 1 are normalised
    g = [aggregator.WeightedFactor("a", 80, 2.0), aggregator.WeightedFactor("b", 40, 2.0)]
    assert aggregator.aggregate(g) == 60


def test_outcome_thresholds():
    assert aggregator.classify_outcome(70) == "high"
    assert aggregator.classify_outcome(69) == "medium"
    assert aggregator.classify_outcome(50) == "medium"
    assert aggregator.classify_outcome(49) == "low"


def test_factor_impact_bands():
    assert aggregator.WeightedFactor("x", 60, 1).impact == "positive"
    assert aggregator.WeightedFactor("x", 59, 1).impact == "neutral"
    assert aggregator.WeightedFactor("x", 39, 1).impact == "negative"


# ─── style alignment ────────────────────────────────────────────────────────

def test_style_alignment_neutral_without_signal():
    assert style_alignment.score([], teacher()) == 50
    assert style_alignment.score([profile()], None) == 50


def test_high_interaction_teacher_suits_active_class():
    active = [profile(ar=11) for _ in range(5)]
    reflective = [profile(ar=-11) for _ in range(5)]
    t = teacher(InteractionLevel.high, PacingPref.moderate)
    assert style_alignment.score(active, t) > style_alignment.score(reflective, t)


def test_style_alignment_bounded():
    for ar in (-11, -1, 1, 11):
        s = style_alignment.score([profile(ar=ar, si=ar, vv=ar, sg=ar)], teacher())
        assert 0 <= s <= 100


# ─── class balance ──────────────────────────────────────────────────────────

def test_class_balance_rewards_even_spread():
    even = [profile(dominant=a) for a in FslsmAxis] * 2
    skewed = [profile(dominant=FslsmAxis.visual_verbal) for _ in range(8)]
    assert class_balance.score(even) == 100
    assert class_balance.score(skewed) == 0
    assert class_balance.score([profile()]) == 50  # too small to judge


# ─── participation ──────────────────────────────────────────────────────────

def test_participation_ideal_mix_scores_high():
    ideal = (
        [aux(ParticipationLevel.low)] * 3
        + [aux(ParticipationLevel.medium)] * 11
        + [aux(ParticipationLevel.high)] * 6
    )
    assert participation.score(ideal) >= 95
    assert participation.score([]) == 50
    all_low = [aux(ParticipationLevel.low)] * 10
    assert participation.score(all_low) < participation.score(ideal)


# ─── full pipeline ──────────────────────────────────────────────────────────

def test_pipeline_end_to_end_shape_and_weights():
    ids = [uuid4() for _ in range(4)]
    profiles = [
        StudentProfile(
            id=uuid4(), student_id=sid,
            active_reflective_score=5, sensing_intuitive_score=-3,
            visual_verbal_score=7, sequential_global_score=1,
            dominant_axis=list(FslsmAxis)[i % 4],
        )
        for i, sid in enumerate(ids)
    ]
    rels = [
        PeerRelationship(
            id=uuid4(), from_student_id=ids[0], to_student_id=ids[1],
            type=RelationshipType.friend, strength=4,
        ),
        PeerRelationship(
            id=uuid4(), from_student_id=ids[1], to_student_id=ids[2],
            type=RelationshipType.study_partner, strength=5,
        ),
    ]
    out = score_section(
        ScoringInput(
            section_student_ids=ids,
            teacher_profile=teacher(),
            student_profiles=profiles,
            aux_profiles=[aux(ParticipationLevel.medium) for _ in ids],
            peer_relationships=rels,
            weights=DEFAULT_WEIGHTS,
        )
    )
    assert 0 <= out.compatibility_score <= 100
    assert out.predicted_outcome in ("high", "medium", "low")
    assert out.social_graph_impact in ("supportive", "neutral", "hindering")
    names = [f.name for f in out.factors]
    assert names == ["Style Alignment", "Social Cohesion", "Class Balance", "Participation Mix"]
    assert abs(sum(f.weight for f in out.factors) - 1.0) < 1e-9
    # style_distribution always has both poles for all four axes
    for axis, poles in out.style_distribution.items():
        assert axis in {a.value for a in FslsmAxis}
        assert len(poles) == 2
        assert sum(poles.values()) in (0, 99, 100, 101)


def test_pipeline_merges_partial_weights_over_defaults():
    ids = [uuid4()]
    out = score_section(
        ScoringInput(
            section_student_ids=ids,
            teacher_profile=None,
            student_profiles=[profile()],
            aux_profiles=[],
            peer_relationships=[],
            weights={"style_alignment": 1.0},  # missing keys must not KeyError
        )
    )
    weights = {f.name: f.weight for f in out.factors}
    assert weights["Style Alignment"] == 1.0
    assert weights["Social Cohesion"] == DEFAULT_WEIGHTS["social_cohesion"]
