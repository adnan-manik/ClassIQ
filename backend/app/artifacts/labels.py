"""FSLSM axis taxonomy for the instructional-artifact classifiers.

Mubashir's four models were trained per axis, but their label sets leaked across
axes: `Visual_Verbal` can emit `Sensing`, `Sensing_Intuitive` can emit `Active`,
and `Active_Reflective` carries three labels that are sentence fragments from a
CSV parsed on its commas (`' logical flow'`, and friends).

Rather than pretend those classes don't exist, every label is routed to one of
four roles and the foreign probability mass is reported as a confidence penalty.
A chunk whose prediction lands mostly on out-of-axis labels is untrustworthy for
that axis, and the caller gets to see that rather than a laundered number.

Sign convention matches `app.engines.fslsm.scorer`: positive is pole A
(active / sensing / visual / sequential), negative is pole B.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    """What a raw model label means for the axis it was emitted on."""

    pole_a = "pole_a"
    pole_b = "pole_b"
    both = "both"        # e.g. "Visual/Verbal" — suits either side
    foreign = "foreign"  # belongs to another axis, or is training-data debris


@dataclass(frozen=True)
class AxisSpec:
    """One FSLSM axis and the model file that scores it."""

    key: str          # matches FslsmAxis values used across the engine
    model_stem: str   # .npz basename
    pole_a: str       # label text for the positive pole
    pole_b: str       # label text for the negative pole
    both: str         # label text for the combined class

    @property
    def pole_a_name(self) -> str:
        return self.pole_a.lower()

    @property
    def pole_b_name(self) -> str:
        return self.pole_b.lower()


AXES: tuple[AxisSpec, ...] = (
    AxisSpec("active_reflective", "Active_Reflective",
             "Active", "Reflective", "Active/Reflective"),
    AxisSpec("sensing_intuitive", "Sensing_Intuitive",
             "Sensing", "Intuitive", "Sensing/Intuitive"),
    AxisSpec("visual_verbal", "Visual_Verbal",
             "Visual", "Verbal", "Visual/Verbal"),
    AxisSpec("sequential_global", "Sequential_Global",
             "Sequential", "Global", "Sequential/Global"),
)

AXIS_BY_KEY: dict[str, AxisSpec] = {a.key: a for a in AXES}


def role_for(axis: AxisSpec, raw_label: str) -> Role:
    """Classify one of the model's raw labels for this axis.

    Comparison is case-insensitive and whitespace-stripped: the contaminated
    labels carry a leading space, and stripping them here means the debris is
    identified by content rather than by exact byte match.
    """
    label = raw_label.strip().casefold()
    if label == axis.pole_a.casefold():
        return Role.pole_a
    if label == axis.pole_b.casefold():
        return Role.pole_b
    if label == axis.both.casefold():
        return Role.both
    return Role.foreign


# Labels that are not an FSLSM pole at all — CSV debris rather than a real class
# from another axis. Tracked separately because they say something different
# about the training data, and the thesis should be able to quote the number.
def is_debris(raw_label: str) -> bool:
    """True when a label isn't any FSLSM pole on any axis."""
    label = raw_label.strip().casefold()
    known = set()
    for a in AXES:
        known.update({a.pole_a.casefold(), a.pole_b.casefold(), a.both.casefold()})
    return label not in known
