"""FSLSM scorer — 44-question ILS → four odd scores in −11…+11."""

import pytest

from app.engines.fslsm.scorer import FslsmAxis, axis_for_question, score_responses


def test_axis_cycle_matches_ils_layout():
    assert axis_for_question(1) == FslsmAxis.active_reflective
    assert axis_for_question(2) == FslsmAxis.sensing_intuitive
    assert axis_for_question(3) == FslsmAxis.visual_verbal
    assert axis_for_question(4) == FslsmAxis.sequential_global
    assert axis_for_question(44) == FslsmAxis.sequential_global
    assert axis_for_question(41) == FslsmAxis.active_reflective


@pytest.mark.parametrize("bad", [0, 45, -1])
def test_axis_rejects_out_of_range(bad):
    with pytest.raises(ValueError):
        axis_for_question(bad)


def test_all_a_gives_plus_eleven_everywhere():
    s = score_responses({q: "A" for q in range(1, 45)})
    assert s.as_dict() == {
        "active_reflective": 11,
        "sensing_intuitive": 11,
        "visual_verbal": 11,
        "sequential_global": 11,
    }


def test_all_b_gives_minus_eleven_everywhere():
    s = score_responses({q: "B" for q in range(1, 45)})
    assert set(s.as_dict().values()) == {-11}


def test_scores_are_always_odd_for_complete_responses():
    answers = {q: ("A" if q % 3 else "B") for q in range(1, 45)}
    s = score_responses(answers)
    for v in s.as_dict().values():
        assert -11 <= v <= 11
        assert v % 2 != 0


def test_dominant_axis_is_largest_magnitude_with_canonical_tiebreak():
    # active_reflective: all A (+11); others balanced-ish
    answers = {}
    for q in range(1, 45):
        axis = axis_for_question(q)
        if axis == FslsmAxis.active_reflective:
            answers[q] = "A"
        elif axis == FslsmAxis.visual_verbal:
            answers[q] = "B"
        else:
            answers[q] = "A" if (q // 4) % 2 == 0 else "B"
    s = score_responses(answers)
    assert s.dominant_axis() == FslsmAxis.active_reflective  # tie |+11| vs |−11| → canonical first


def test_dominant_axis_none_when_no_signal():
    s = score_responses({})
    assert s.dominant_axis() is None


def test_rejects_non_ab_answer():
    with pytest.raises(ValueError):
        score_responses({1: "C"})
