"""Chunking, label routing and coverage-gap logic.

None of these touch the encoder — they run on synthetic probability vectors, so
the suite stays fast and has no torch dependency. The encoder and the real
classifiers are exercised separately by the verification script.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.artifacts.analysis import (
    FOREIGN_MASS_LIMIT,
    CoverageGap,
    _read_axis,
    find_gaps,
    profile_chunks,
)
from app.artifacts.chunking import Chunk, chunk_text
from app.artifacts.labels import AXES, AXIS_BY_KEY, Role, is_debris, role_for

VV = AXIS_BY_KEY["visual_verbal"]
AR = AXIS_BY_KEY["active_reflective"]


# ── label routing ───────────────────────────────────────────────────────────


def test_each_axis_recognises_its_own_poles():
    for spec in AXES:
        assert role_for(spec, spec.pole_a) is Role.pole_a
        assert role_for(spec, spec.pole_b) is Role.pole_b
        assert role_for(spec, spec.both) is Role.both


def test_cross_axis_labels_are_foreign():
    # The real contamination: Visual_Verbal can emit "Sensing".
    assert role_for(VV, "Sensing") is Role.foreign
    # And Sensing_Intuitive can emit "Active".
    assert role_for(AXIS_BY_KEY["sensing_intuitive"], "Active") is Role.foreign


def test_csv_debris_labels_are_foreign_and_flagged_as_debris():
    # These three carry a LEADING SPACE in the pickle — fragments of a
    # description column split on its commas.
    for label in (" logical flow", " step-by-step navigation",
                  " highlighting the main points"):
        assert role_for(AR, label) is Role.foreign
        assert is_debris(label) is True


def test_a_real_pole_from_another_axis_is_foreign_but_not_debris():
    assert role_for(VV, "Sensing") is Role.foreign
    assert is_debris("Sensing") is False


def test_label_matching_ignores_case_and_whitespace():
    assert role_for(VV, "  visual  ") is Role.pole_a


# ── axis collapse ───────────────────────────────────────────────────────────


def _probs(mapping: dict[str, float], classes: tuple[str, ...]) -> np.ndarray:
    return np.array([mapping.get(c, 0.0) for c in classes])


def test_pure_pole_a_scores_plus_one():
    classes = ("Sensing", "Verbal", "Visual", "Visual/Verbal")
    r = _read_axis(VV, _probs({"Visual": 1.0}, classes), classes)
    assert r.score == pytest.approx(1.0)
    assert r.lean == "visual"


def test_the_combined_class_reads_as_balanced_not_as_a_weak_lean():
    """Material that genuinely serves both sides must not look like noise."""
    classes = ("Sensing", "Verbal", "Visual", "Visual/Verbal")
    r = _read_axis(VV, _probs({"Visual/Verbal": 1.0}, classes), classes)
    assert r.score == pytest.approx(0.0)
    assert r.both_prob == pytest.approx(1.0)
    assert r.lean == "balanced"


def test_foreign_mass_is_excluded_from_the_score_but_reported():
    classes = ("Sensing", "Verbal", "Visual", "Visual/Verbal")
    # Half the probability lands on a label from a different axis.
    r = _read_axis(VV, _probs({"Sensing": 0.5, "Visual": 0.5}, classes), classes)
    assert r.foreign_mass == pytest.approx(0.5)
    # In-axis mass renormalises, so the score is not diluted by the contamination...
    assert r.score == pytest.approx(1.0)
    # ...but the reading is marked untrustworthy rather than quietly used.
    assert r.trustworthy is False
    assert r.lean == "uncertain"


def test_reading_stays_trustworthy_below_the_foreign_limit():
    classes = ("Sensing", "Verbal", "Visual", "Visual/Verbal")
    small = FOREIGN_MASS_LIMIT / 2
    r = _read_axis(VV, _probs({"Sensing": small, "Visual": 1 - small}, classes), classes)
    assert r.trustworthy is True


def test_all_foreign_probability_yields_no_signal():
    classes = ("Sensing", "Verbal", "Visual", "Visual/Verbal")
    r = _read_axis(VV, _probs({"Sensing": 1.0}, classes), classes)
    assert r.trustworthy is False
    assert r.score == 0.0


# ── chunking ────────────────────────────────────────────────────────────────


def test_paragraphs_become_separate_chunks():
    text = "word " * 100 + "\n\n" + "other " * 100
    chunks = chunk_text(text)
    assert len(chunks) == 2


def test_an_overlong_paragraph_is_split_below_the_encoder_limit():
    # multi-qa-mpnet was trained on <=250 word pieces; chunks must stay under it.
    text = ("This is a sentence about instructional design. " * 80)
    chunks = chunk_text(text, target_words=150)
    assert len(chunks) > 1
    assert all(c.word_count <= 200 for c in chunks)


def test_short_fragments_are_dropped():
    chunks = chunk_text("Heading\n\nAlso short")
    assert chunks == []


def test_chunks_never_merge_across_a_source_label():
    """Merging slide 4 into slide 5 would make a finding unactionable."""
    text = "Short line one here now.\n\nShort line two here now."
    chunks = chunk_text(text, min_words=3, source_labels=["Slide 4", "Slide 5"])
    assert [c.source_label for c in chunks] == ["Slide 4", "Slide 5"]


# ── coverage gaps ───────────────────────────────────────────────────────────


def _profile_with(scores: list[float], axis: str = "visual_verbal"):
    """Build a MaterialProfile whose chunks have the given axis scores."""
    from app.artifacts.analysis import AxisReading, ChunkReading, MaterialProfile

    readings = []
    for i, s in enumerate(scores):
        axes = {
            spec.key: AxisReading(spec.key, s if spec.key == axis else 0.0,
                                  0.0, 0.0, 0.0, 0.0, True)
            for spec in AXES
        }
        readings.append(ChunkReading(Chunk(i, "x", 50, f"Slide {i + 1}"), axes))
    mean = float(np.mean(scores))
    doc = {
        spec.key: AxisReading(spec.key, mean if spec.key == axis else 0.0,
                              0.0, 0.0, 0.0, 0.0, True)
        for spec in AXES
    }
    return MaterialProfile(axes=doc, chunks=readings, n_chunks=len(scores),
                           total_words=50 * len(scores))


def test_uniformly_visual_material_underserves_a_verbal_minority():
    """The case mean-comparison hides: material entirely in one mode, in front of
    a 70/30 class. The 30% still get nothing."""
    material = _profile_with([1.0] * 10)
    gaps = find_gaps(material, {"visual_verbal": {"visual": 70, "verbal": 30}})
    assert len(gaps) == 1
    g = gaps[0]
    assert g.pole == "verbal"
    assert g.class_share == pytest.approx(0.30)
    assert g.material_coverage == pytest.approx(0.0)
    assert g.unserved_share == pytest.approx(0.30)


def test_material_covering_both_modes_raises_no_gap():
    material = _profile_with([1.0] * 5 + [-1.0] * 5)
    gaps = find_gaps(material, {"visual_verbal": {"visual": 70, "verbal": 30}})
    assert gaps == []


def test_a_tiny_minority_is_not_reported():
    material = _profile_with([1.0] * 10)
    gaps = find_gaps(material, {"visual_verbal": {"visual": 95, "verbal": 5}})
    assert gaps == []


def test_gap_anchors_point_at_the_worst_offending_chunks():
    material = _profile_with([1.0, 1.0, 0.2, -0.1])
    gaps = find_gaps(material, {"visual_verbal": {"visual": 60, "verbal": 40}})
    assert gaps[0].suggestion_anchors[:2] == ["Slide 1", "Slide 2"]


def test_fractions_and_percentages_both_work():
    material = _profile_with([1.0] * 10)
    as_pct = find_gaps(material, {"visual_verbal": {"visual": 70, "verbal": 30}})
    as_frac = find_gaps(material, {"visual_verbal": {"visual": 0.7, "verbal": 0.3}})
    assert as_pct[0].unserved_share == pytest.approx(as_frac[0].unserved_share)


def test_untrustworthy_axis_produces_no_gap():
    """A contaminated reading must not generate advice."""
    from app.artifacts.analysis import AxisReading, ChunkReading, MaterialProfile

    axes = {spec.key: AxisReading(spec.key, 1.0, 0, 0, 0, 0.9, False) for spec in AXES}
    material = MaterialProfile(
        axes=axes,
        chunks=[ChunkReading(Chunk(0, "x", 50, "Slide 1"), axes)],
        n_chunks=1, total_words=50,
    )
    assert find_gaps(material, {"visual_verbal": {"visual": 70, "verbal": 30}}) == []


# ── profile assembly ────────────────────────────────────────────────────────


def test_profile_rejects_a_chunk_embedding_mismatch():
    with pytest.raises(ValueError, match="chunks but"):
        profile_chunks([Chunk(0, "x", 10)], np.zeros((3, 768)))


def test_empty_input_is_an_empty_profile():
    p = profile_chunks([], np.zeros((0, 768)))
    assert p.n_chunks == 0 and p.axes == {}
