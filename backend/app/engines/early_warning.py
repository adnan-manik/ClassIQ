"""S1 Early Warning — pure comparator of predicted outcome vs. actual data.

No DB access. The service loads the section's predicted outcome and the
recorded outcomes, this module turns them into flag drafts.

Expectation bands (what a class predicted High / Medium / Low should show
once the semester is running). They are deliberately simple, tunable
thresholds — this is decision support, not a grade predictor.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

# predicted_outcome → (min attendance %, min grade %, min engagement level index)
_LEVEL_INDEX = {"low": 0, "medium": 1, "high": 2}
EXPECTED: dict[str, tuple[float, float, int]] = {
    "high": (85.0, 70.0, 1),
    "medium": (75.0, 55.0, 1),
    "low": (65.0, 45.0, 0),
}
DEFAULT_EXPECTED = EXPECTED["medium"]

RECENT_WEEKS = 3  # average the last N recorded weeks per student


@dataclass(frozen=True)
class OutcomeSample:
    student_id: UUID | None  # None = section aggregate row
    week_no: int
    attendance_pct: float | None
    grade_pct: float | None
    engagement_level: str | None  # low | medium | high


@dataclass(frozen=True)
class FlagDraft:
    student_id: UUID | None
    type: str  # engagement | performance | compatibility
    severity: str  # low | medium | high
    message: str
    metric_name: str
    expected_value: float | None
    actual_value: float | None
    deviation: float | None
    week_no: int | None


def severity_for(deviation: float) -> str:
    """Severity from how far BELOW expectation the actual value is (points)."""
    gap = -deviation
    if gap >= 20:
        return "high"
    if gap >= 10:
        return "medium"
    return "low"


def _recent(samples: list[OutcomeSample]) -> list[OutcomeSample]:
    ordered = sorted(samples, key=lambda s: s.week_no)
    return ordered[-RECENT_WEEKS:]


def _avg(values: list[float | None]) -> float | None:
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def evaluate(
    *,
    predicted_outcome: str | None,
    compatibility_score: int | None,
    samples: list[OutcomeSample],
    roster_size: int,
    names: dict[UUID, str] | None = None,
) -> list[FlagDraft]:
    """Compare recorded outcomes with the prediction and return flag drafts.

    Per student: attendance below band → `engagement`; grade below band →
    `performance`; engagement level below band → `engagement` (medium).
    Section-level: when ≥40 % of assessed students carry a performance flag,
    or the class-mean grade sits ≥10 points under the band, raise one
    `compatibility` flag — the assignment itself is under-delivering.
    """
    names = names or {}
    exp_att, exp_grade, exp_level = EXPECTED.get(predicted_outcome or "", DEFAULT_EXPECTED)
    flags: list[FlagDraft] = []

    by_student: dict[UUID | None, list[OutcomeSample]] = defaultdict(list)
    for s in samples:
        by_student[s.student_id].append(s)

    assessed = 0
    perf_flagged = 0
    class_grades: list[float] = []

    for sid, rows in by_student.items():
        if sid is None:
            continue  # aggregate rows handled below
        recent = _recent(rows)
        week = recent[-1].week_no if recent else None
        att = _avg([r.attendance_pct for r in recent])
        grade = _avg([r.grade_pct for r in recent])
        level = next((r.engagement_level for r in reversed(recent) if r.engagement_level), None)
        who = names.get(sid, "Student")
        if att is not None or grade is not None or level is not None:
            assessed += 1
        if grade is not None:
            class_grades.append(grade)

        if att is not None and att < exp_att:
            dev = round(att - exp_att, 2)
            flags.append(
                FlagDraft(
                    student_id=sid,
                    type="engagement",
                    severity=severity_for(dev),
                    message=f"{who}: attendance {att:.0f}% is below the {exp_att:.0f}% expected for a predicted-{predicted_outcome or 'medium'} section",
                    metric_name="attendance_pct",
                    expected_value=exp_att,
                    actual_value=att,
                    deviation=dev,
                    week_no=week,
                )
            )
        if grade is not None and grade < exp_grade:
            dev = round(grade - exp_grade, 2)
            perf_flagged += 1
            flags.append(
                FlagDraft(
                    student_id=sid,
                    type="performance",
                    severity=severity_for(dev),
                    message=f"{who}: average grade {grade:.0f}% is below the {exp_grade:.0f}% expected for a predicted-{predicted_outcome or 'medium'} section",
                    metric_name="grade_pct",
                    expected_value=exp_grade,
                    actual_value=grade,
                    deviation=dev,
                    week_no=week,
                )
            )
        if level is not None and _LEVEL_INDEX.get(level, 1) < exp_level:
            flags.append(
                FlagDraft(
                    student_id=sid,
                    type="engagement",
                    severity="medium" if (predicted_outcome == "high") else "low",
                    message=f"{who}: engagement reported as {level} — below what the prediction assumed",
                    metric_name="engagement",
                    expected_value=float(exp_level),
                    actual_value=float(_LEVEL_INDEX.get(level, 1)),
                    deviation=float(_LEVEL_INDEX.get(level, 1) - exp_level),
                    week_no=week,
                )
            )

    # Section aggregate rows (student_id NULL) contribute to the class picture.
    agg_recent = _recent(by_student.get(None, []))
    agg_grade = _avg([r.grade_pct for r in agg_recent])
    agg_att = _avg([r.attendance_pct for r in agg_recent])
    agg_week = agg_recent[-1].week_no if agg_recent else None

    class_mean = _avg(class_grades) if class_grades else agg_grade
    latest_week = max([f.week_no for f in flags if f.week_no] + ([agg_week] if agg_week else []) or [None])

    section_reasons: list[str] = []
    dev_for_severity = 0.0
    if assessed and perf_flagged / assessed >= 0.4:
        share = round(100 * perf_flagged / assessed)
        section_reasons.append(f"{share}% of assessed students are under the expected grade band")
        dev_for_severity = min(dev_for_severity, -(10 if share < 60 else 20))
    if class_mean is not None and class_mean < exp_grade - 10:
        section_reasons.append(f"class mean grade {class_mean:.0f}% vs {exp_grade:.0f}% expected")
        dev_for_severity = min(dev_for_severity, round(class_mean - exp_grade, 2))
    if agg_att is not None and agg_att < exp_att - 10:
        section_reasons.append(f"section attendance {agg_att:.0f}% vs {exp_att:.0f}% expected")
        dev_for_severity = min(dev_for_severity, round(agg_att - exp_att, 2))

    if section_reasons:
        score_txt = f" (compatibility score {compatibility_score})" if compatibility_score is not None else ""
        flags.append(
            FlagDraft(
                student_id=None,
                type="compatibility",
                severity=severity_for(dev_for_severity),
                message=(
                    f"Predicted {predicted_outcome or 'medium'} outcome{score_txt} but the section is trending below: "
                    + "; ".join(section_reasons)
                    + ". Revisit the teacher assignment or roster."
                ),
                metric_name="class_grade" if class_mean is not None else "attendance_pct",
                expected_value=exp_grade if class_mean is not None else exp_att,
                actual_value=class_mean if class_mean is not None else agg_att,
                deviation=dev_for_severity,
                week_no=latest_week,
            )
        )

    return flags
