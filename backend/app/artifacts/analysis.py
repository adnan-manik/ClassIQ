"""Turn an instructional artifact into an FSLSM profile, and compare it to a class.

Three steps, each with a decision worth stating out loud.

1. Per chunk, per axis, the model returns a distribution over its own label set.
   Some of those labels belong to other axes. Rather than laundering that away,
   the in-axis mass is renormalised and the foreign mass is reported as
   `foreign_mass` — a confidence penalty the caller can see and the thesis can
   quote.

2. An axis score is `P(pole A) - P(pole B)` in [-1, +1], matching the sign
   convention in `app.engines.fslsm.scorer` so material and class profiles are
   directly comparable. The combined class ("Visual/Verbal") contributes to
   neither side; material that genuinely serves both should read as balanced,
   not as a weak lean.

3. The gap is the signed distance between what the class needs and what the
   material offers. Note what this does NOT claim: not that matching styles
   raises attainment — that's the meshing hypothesis and it doesn't survive
   controlled testing. The claim is narrower and defensible: material presented
   in a single mode underserves the part of the room that reads the other way,
   and here is where that happens.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.artifacts.chunking import Chunk
from app.artifacts.labels import AXES, AxisSpec, Role, role_for
from app.artifacts.model import get_axis_model

# Below this, too much probability sits on out-of-axis labels to trust the score.
FOREIGN_MASS_LIMIT = 0.35

# Below this absolute score, material is treated as balanced on that axis rather
# than leaning. Avoids reporting noise as a finding.
LEAN_THRESHOLD = 0.15


@dataclass(frozen=True)
class AxisReading:
    """One axis's verdict for one chunk or one document."""

    axis: str
    score: float           # -1 (pole B) .. +1 (pole A)
    pole_a_prob: float
    pole_b_prob: float
    both_prob: float
    foreign_mass: float    # share of probability on out-of-axis labels
    trustworthy: bool

    @property
    def lean(self) -> str:
        spec = next(a for a in AXES if a.key == self.axis)
        if not self.trustworthy:
            return "uncertain"
        if self.score > LEAN_THRESHOLD:
            return spec.pole_a_name
        if self.score < -LEAN_THRESHOLD:
            return spec.pole_b_name
        return "balanced"


@dataclass(frozen=True)
class ChunkReading:
    chunk: Chunk
    axes: dict[str, AxisReading]


@dataclass
class MaterialProfile:
    """A whole artifact, aggregated from its chunks."""

    axes: dict[str, AxisReading] = field(default_factory=dict)
    chunks: list[ChunkReading] = field(default_factory=list)
    n_chunks: int = 0
    total_words: int = 0


def _read_axis(spec: AxisSpec, probs: np.ndarray, classes: tuple[str, ...]) -> AxisReading:
    """Collapse one model's raw distribution onto its axis."""
    mass = {Role.pole_a: 0.0, Role.pole_b: 0.0, Role.both: 0.0, Role.foreign: 0.0}
    for label, p in zip(classes, probs):
        mass[role_for(spec, label)] += float(p)

    in_axis = mass[Role.pole_a] + mass[Role.pole_b] + mass[Role.both]
    if in_axis <= 0:
        # Every bit of probability landed on foreign labels. No signal at all.
        return AxisReading(spec.key, 0.0, 0.0, 0.0, 0.0, 1.0, trustworthy=False)

    a = mass[Role.pole_a] / in_axis
    b = mass[Role.pole_b] / in_axis
    both = mass[Role.both] / in_axis
    return AxisReading(
        axis=spec.key,
        score=a - b,
        pole_a_prob=a,
        pole_b_prob=b,
        both_prob=both,
        foreign_mass=mass[Role.foreign],
        trustworthy=mass[Role.foreign] < FOREIGN_MASS_LIMIT,
    )


def profile_chunks(chunks: list[Chunk], embeddings: np.ndarray) -> MaterialProfile:
    """Score pre-embedded chunks across all four axes."""
    if not chunks:
        return MaterialProfile()
    if len(chunks) != embeddings.shape[0]:
        raise ValueError(
            f"{len(chunks)} chunks but {embeddings.shape[0]} embeddings"
        )

    per_axis_probs: dict[str, np.ndarray] = {}
    per_axis_classes: dict[str, tuple[str, ...]] = {}
    for spec in AXES:
        model = get_axis_model(spec.model_stem)
        per_axis_probs[spec.key] = model.predict_proba(embeddings)
        per_axis_classes[spec.key] = model.classes

    chunk_readings: list[ChunkReading] = []
    for i, chunk in enumerate(chunks):
        readings = {
            spec.key: _read_axis(spec, per_axis_probs[spec.key][i], per_axis_classes[spec.key])
            for spec in AXES
        }
        chunk_readings.append(ChunkReading(chunk=chunk, axes=readings))

    # Document level: weight each chunk by its length, so a 150-word explanation
    # counts for more than a 15-word bullet, and drop untrustworthy readings.
    doc_axes: dict[str, AxisReading] = {}
    for spec in AXES:
        usable = [(r.chunk.word_count, r.axes[spec.key]) for r in chunk_readings
                  if r.axes[spec.key].trustworthy]
        foreign = float(np.mean([r.axes[spec.key].foreign_mass for r in chunk_readings]))
        if not usable:
            doc_axes[spec.key] = AxisReading(spec.key, 0.0, 0.0, 0.0, 0.0, foreign, False)
            continue
        weights = np.array([w for w, _ in usable], dtype=np.float64)
        weights /= weights.sum()
        doc_axes[spec.key] = AxisReading(
            axis=spec.key,
            score=float(np.dot(weights, [r.score for _, r in usable])),
            pole_a_prob=float(np.dot(weights, [r.pole_a_prob for _, r in usable])),
            pole_b_prob=float(np.dot(weights, [r.pole_b_prob for _, r in usable])),
            both_prob=float(np.dot(weights, [r.both_prob for _, r in usable])),
            foreign_mass=foreign,
            trustworthy=True,
        )

    return MaterialProfile(
        axes=doc_axes,
        chunks=chunk_readings,
        n_chunks=len(chunks),
        total_words=sum(c.word_count for c in chunks),
    )


@dataclass(frozen=True)
class CoverageGap:
    """A pole that a real share of the class sits on and the material barely serves."""

    axis: str
    pole: str                  # the underserved pole, e.g. "verbal"
    class_share: float         # 0..1 — fraction of the cohort on that pole
    material_coverage: float   # 0..1 — fraction of chunks that serve it
    unserved_share: float      # class_share x (1 - coverage): the headline number
    suggestion_anchors: list[str]  # where in the artifact to add the missing mode


def find_gaps(
    material: MaterialProfile,
    class_pole_shares: dict[str, dict[str, float]],
    *,
    min_class_share: float = 0.20,
    max_coverage: float = 0.30,
) -> list[CoverageGap]:
    """Find poles the material leaves unserved.

    `class_pole_shares` is the cohort's per-axis pole split, exactly the shape
    `ScoringOutput.style_distribution` already produces:
    `{"visual_verbal": {"visual": 70, "verbal": 30}, ...}` — percentages or
    fractions, both accepted.

    This is a COVERAGE test, not a matching test, and the difference is the whole
    argument. We do not ask "does the material's average lean agree with the
    class's average lean" — that's the meshing hypothesis, and comparing two
    means also hides the case that actually matters: material uniformly in one
    mode, in front of a class that is 70/30. The mean gap there looks small; the
    30% still get nothing.

    So we ask, per pole: how much of the room sits here, and how much of the
    material serves them? A chunk serves a pole if it leans that way or covers
    both.
    """
    gaps: list[CoverageGap] = []

    for spec in AXES:
        shares = class_pole_shares.get(spec.key)
        reading = material.axes.get(spec.key)
        if not shares or reading is None or not reading.trustworthy:
            continue

        usable = [r for r in material.chunks if r.axes[spec.key].trustworthy]
        if not usable:
            continue

        total = sum(shares.values()) or 1.0
        for pole, role in ((spec.pole_a_name, Role.pole_a), (spec.pole_b_name, Role.pole_b)):
            class_share = float(shares.get(pole, 0.0)) / total
            if class_share < min_class_share:
                continue

            # A chunk serves this pole if it leans this way, or serves both sides.
            served = 0
            for r in usable:
                ar = r.axes[spec.key]
                leans_here = (ar.score > LEAN_THRESHOLD) if role is Role.pole_a \
                    else (ar.score < -LEAN_THRESHOLD)
                if leans_here or ar.both_prob > 0.5:
                    served += 1
            coverage = served / len(usable)
            if coverage > max_coverage:
                continue

            # Anchor the suggestion to the chunks leaning hardest the other way —
            # those are where adding the missing mode changes the most.
            opposite = sorted(
                usable,
                key=lambda r: r.axes[spec.key].score * (1 if role is Role.pole_a else -1),
            )[:3]
            anchors = [
                r.chunk.source_label or f"chunk {r.chunk.index + 1}" for r in opposite
            ]

            gaps.append(CoverageGap(
                axis=spec.key,
                pole=pole,
                class_share=class_share,
                material_coverage=coverage,
                unserved_share=class_share * (1.0 - coverage),
                suggestion_anchors=anchors,
            ))

    return sorted(gaps, key=lambda g: g.unserved_share, reverse=True)
