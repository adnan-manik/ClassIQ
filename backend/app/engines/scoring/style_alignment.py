"""Style Alignment factor — teacher's teaching style vs. class FSLSM distribution.

The compatibility model is intentionally heuristic for the FYP. Each teaching
trait (interaction_level, pacing) maps to expected affinity with each FSLSM
axis. We compute a 0..100 score from how well the class's distribution
matches the teacher's strengths.
"""

from dataclasses import dataclass

from app.models.student import FslsmAxis, StudentProfile
from app.models.teacher import InteractionLevel, PacingPref, TeacherProfile


@dataclass(frozen=True)
class _AxisAffinity:
    # How well this teacher trait suits the POLE-A side of each axis.
    # Each value is in [-1, +1].
    active_reflective: float  # +1 = perfect for active learners
    sensing_intuitive: float  # +1 = perfect for sensing
    visual_verbal: float      # +1 = perfect for visual
    sequential_global: float  # +1 = perfect for sequential


# Interaction level → axis affinity
# High interaction supports active learners (need discussion).
# Low interaction supports reflective learners (need quiet thinking time).
_INTERACTION: dict[InteractionLevel, _AxisAffinity] = {
    InteractionLevel.high:   _AxisAffinity( +0.8, +0.2, +0.1, +0.0),
    InteractionLevel.medium: _AxisAffinity( +0.2, +0.0, +0.0, +0.0),
    InteractionLevel.low:    _AxisAffinity( -0.6, +0.0, -0.1, +0.0),
}

# Pacing → axis affinity
# Slow pacing supports global learners (need time to integrate big picture)
# and visual learners (diagrams take longer than verbal lecture).
# Fast pacing supports sensing (likes concrete steps moving forward).
_PACING: dict[PacingPref, _AxisAffinity] = {
    PacingPref.fast:     _AxisAffinity( +0.1, +0.5, -0.2, +0.4),
    PacingPref.moderate: _AxisAffinity( +0.0, +0.2, +0.1, +0.1),
    PacingPref.slow:     _AxisAffinity( -0.1, -0.4, +0.4, -0.5),
}


def _class_axis_mean(profiles: list[StudentProfile], axis: FslsmAxis) -> float:
    """Mean of signed scores on `axis`, normalized to [-1, +1]."""
    if not profiles:
        return 0.0
    field = f"{axis.value}_score"
    values = [getattr(p, field) for p in profiles]
    return sum(values) / (len(values) * 11.0)  # raw is in [-11, +11]


def score(profiles: list[StudentProfile], teacher: TeacherProfile | None) -> int:
    """Return a 0..100 score for style alignment.

    If there's no teacher profile, return 50 (neutral — no signal).
    If the class has no profiles, return 0 (can't reason).
    """
    if not profiles:
        return 0
    if teacher is None:
        return 50

    # Affinity of this teacher per FSLSM axis (sum of contributions).
    int_aff = _INTERACTION[teacher.interaction_level]
    pace_aff = _PACING[teacher.pacing]

    affinities = {
        FslsmAxis.active_reflective: int_aff.active_reflective + pace_aff.active_reflective,
        FslsmAxis.sensing_intuitive: int_aff.sensing_intuitive + pace_aff.sensing_intuitive,
        FslsmAxis.visual_verbal: int_aff.visual_verbal + pace_aff.visual_verbal,
        FslsmAxis.sequential_global: int_aff.sequential_global + pace_aff.sequential_global,
    }

    # Class mean per axis, also signed in [-1, +1].
    class_means = {axis: _class_axis_mean(profiles, axis) for axis in FslsmAxis}

    # Alignment per axis = affinity × class_mean (rewarded when signs agree).
    # Range of one term is roughly [-2, +2] (affinity span × class_mean span).
    aligned = sum(affinities[axis] * class_means[axis] for axis in FslsmAxis)
    # Range overall ≈ [-8, +8] before normalization
    normalized = (aligned + 8.0) / 16.0  # → [0, 1]

    return max(0, min(100, round(normalized * 100)))
