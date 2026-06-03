"""Felder-Silverman Learning Style Model scorer.

The FSLSM ILS has 44 questions split across 4 bipolar axes (11 questions each):
    Q1, 5, 9, …, 41 → Active / Reflective
    Q2, 6, 10, …, 42 → Sensing / Intuitive
    Q3, 7, 11, …, 43 → Visual / Verbal
    Q4, 8, 12, …, 44 → Sequential / Global

Each answer is 'A' or 'B'. The score per axis is `count(A) − count(B)`.
With 11 questions per axis, the result is always an ODD integer in
[−11, +11]. Sign convention:
    +  → leans toward pole A (active / sensing / visual / sequential)
    −  → leans toward pole B (reflective / intuitive / verbal / global)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Literal


class FslsmAxis(str, Enum):
    active_reflective = "active_reflective"
    sensing_intuitive = "sensing_intuitive"
    visual_verbal = "visual_verbal"
    sequential_global = "sequential_global"


AxisKey = Literal[
    "active_reflective",
    "sensing_intuitive",
    "visual_verbal",
    "sequential_global",
]

Answer = Literal["A", "B"]

# Question-number (1..44) → axis. The pattern is `(n - 1) % 4`.
_AXIS_BY_INDEX: tuple[FslsmAxis, FslsmAxis, FslsmAxis, FslsmAxis] = (
    FslsmAxis.active_reflective,
    FslsmAxis.sensing_intuitive,
    FslsmAxis.visual_verbal,
    FslsmAxis.sequential_global,
)


def axis_for_question(question_no: int) -> FslsmAxis:
    """Return the FSLSM axis that question_no (1..44) scores."""
    if not 1 <= question_no <= 44:
        raise ValueError(f"question_no must be 1..44, got {question_no}")
    return _AXIS_BY_INDEX[(question_no - 1) % 4]


@dataclass(frozen=True)
class FslsmScore:
    """A complete FSLSM profile derived from one survey response."""

    active_reflective: int
    sensing_intuitive: int
    visual_verbal: int
    sequential_global: int

    def dominant_axis(self) -> FslsmAxis | None:
        """Axis with the greatest |score|.

        Ties are broken deterministically by canonical FSLSM axis order
        (active_reflective → sensing_intuitive → visual_verbal →
        sequential_global) rather than discarded — Python's sort is stable, so
        the canonically-first axis wins among equal magnitudes. Returns ``None``
        only when there is no signal at all (every axis is 0, i.e. perfectly
        balanced), in which case there is no dominant style to report.
        """
        scores = [
            (FslsmAxis.active_reflective, abs(self.active_reflective)),
            (FslsmAxis.sensing_intuitive, abs(self.sensing_intuitive)),
            (FslsmAxis.visual_verbal, abs(self.visual_verbal)),
            (FslsmAxis.sequential_global, abs(self.sequential_global)),
        ]
        scores.sort(key=lambda x: x[1], reverse=True)
        if scores[0][1] == 0:
            return None
        return scores[0][0]

    def as_dict(self) -> dict[AxisKey, int]:
        return {
            "active_reflective": self.active_reflective,
            "sensing_intuitive": self.sensing_intuitive,
            "visual_verbal": self.visual_verbal,
            "sequential_global": self.sequential_global,
        }


def score_responses(answers: dict[int, Answer]) -> FslsmScore:
    """Score one full set of ILS answers.

    `answers` is a mapping of question_no (1..44) → 'A' | 'B'. Missing
    questions are treated as absent (drop from tally). For a clean profile
    expect exactly 44 entries.
    """
    counts: dict[FslsmAxis, list[int]] = {axis: [0, 0] for axis in FslsmAxis}
    for q, ans in answers.items():
        axis = axis_for_question(q)
        if ans == "A":
            counts[axis][0] += 1
        elif ans == "B":
            counts[axis][1] += 1
        else:
            raise ValueError(f"Answer for Q{q} must be 'A' or 'B', got {ans!r}")

    return FslsmScore(
        active_reflective=counts[FslsmAxis.active_reflective][0]
        - counts[FslsmAxis.active_reflective][1],
        sensing_intuitive=counts[FslsmAxis.sensing_intuitive][0]
        - counts[FslsmAxis.sensing_intuitive][1],
        visual_verbal=counts[FslsmAxis.visual_verbal][0]
        - counts[FslsmAxis.visual_verbal][1],
        sequential_global=counts[FslsmAxis.sequential_global][0]
        - counts[FslsmAxis.sequential_global][1],
    )
