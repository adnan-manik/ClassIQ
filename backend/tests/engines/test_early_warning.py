"""S1 comparator — predicted outcome band vs recorded actuals."""

from uuid import uuid4

from app.engines.early_warning import OutcomeSample, evaluate, severity_for


def sample(sid, week, att=None, grade=None, level=None):
    return OutcomeSample(student_id=sid, week_no=week, attendance_pct=att, grade_pct=grade, engagement_level=level)


def test_severity_bands():
    assert severity_for(-25) == "high"
    assert severity_for(-12) == "medium"
    assert severity_for(-3) == "low"


def test_no_flags_when_actuals_meet_the_band():
    s = uuid4()
    flags = evaluate(
        predicted_outcome="high",
        compatibility_score=80,
        samples=[sample(s, 1, att=95, grade=85, level="high")],
        roster_size=1,
    )
    assert flags == []


def test_student_below_band_raises_engagement_and_performance():
    s = uuid4()
    flags = evaluate(
        predicted_outcome="high",
        compatibility_score=80,
        samples=[sample(s, 1, att=60, grade=40, level="low")],
        roster_size=3,
        names={s: "Ayesha"},
    )
    types = sorted((f.type, f.severity) for f in flags if f.student_id == s)
    assert ("engagement", "high") in types  # attendance 60 vs 85 → −25
    assert ("performance", "high") in types  # grade 40 vs 70 → −30
    assert any(f.metric_name == "engagement" for f in flags)
    assert all("Ayesha" in f.message for f in flags if f.student_id == s)


def test_recent_weeks_are_averaged():
    s = uuid4()
    # weeks 1-2 terrible, weeks 3-5 fine → last 3 weeks average passes the medium band
    samples = [sample(s, 1, grade=10), sample(s, 2, grade=10), sample(s, 3, grade=70), sample(s, 4, grade=70), sample(s, 5, grade=70)]
    flags = evaluate(predicted_outcome="medium", compatibility_score=60, samples=samples, roster_size=1)
    assert not [f for f in flags if f.type == "performance"]


def test_section_level_compatibility_flag_when_many_underperform():
    ids = [uuid4() for _ in range(5)]
    samples = [sample(i, 2, grade=30) for i in ids[:3]] + [sample(i, 2, grade=90) for i in ids[3:]]
    flags = evaluate(predicted_outcome="high", compatibility_score=78, samples=samples, roster_size=5)
    section_flags = [f for f in flags if f.student_id is None]
    assert len(section_flags) == 1
    assert section_flags[0].type == "compatibility"
    assert section_flags[0].severity in ("medium", "high")
    assert "Revisit" in section_flags[0].message


def test_aggregate_rows_feed_the_section_flag():
    flags = evaluate(
        predicted_outcome="medium",
        compatibility_score=55,
        samples=[sample(None, 3, att=50, grade=30)],
        roster_size=20,
    )
    assert [f.type for f in flags] == ["compatibility"]
    assert flags[0].week_no == 3


def test_unknown_prediction_uses_medium_band():
    s = uuid4()
    flags = evaluate(predicted_outcome=None, compatibility_score=None, samples=[sample(s, 1, grade=60)], roster_size=1)
    assert flags == []  # 60 ≥ 55 (medium band)
