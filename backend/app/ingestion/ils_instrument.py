"""The default FSLSM instrument — Felder-Soloman ILS, 44 questions, as worded
in the ClassIQ / MAJU "Algorithms" survey that produced the RDF dump.

Question order matches both the standard ILS and the RDF property order, so
the axis for question n is `(n - 1) % 4` (see engines/fslsm/scorer.py). Answer
A always maps to the first pole of its axis (active / sensing / visual /
sequential), answer B to the second.

The instrument name + version match db/seed_demo_data.mjs so the demo seed
and the ingestion pipeline share one `survey_instruments` row.
"""

from dataclasses import dataclass

from app.engines.fslsm.scorer import FslsmAxis, axis_for_question

INSTRUMENT_NAME = "FSLSM-ILS-Algorithms"
INSTRUMENT_VERSION = "27Jan24"
TOTAL_QUESTIONS = 44

# RDF datatype-property local names, in question order 1..44. Q22 and Q37 share
# a property name in the source ontology (both start "I am more likely to be
# considered…"); the RDF parser disambiguates by the `A<n>`/`B<n>` value, so
# the duplicate here is intentional.
RDF_PROPERTIES: tuple[str, ...] = (
    "I_understand_the_algorithm_better_After_I",
    "I_would_try_to_learn_algorithms_trough_by",
    "When_I_think_about_yesterdays_Algorithms_class",
    "When_I_learn_about_Algorithms",
    "When_I_am_learn_new_algorithms",
    "If_I_were_the_teacher_of_Algorithms_then",
    "I_acquire_new_information_about_algorithms",
    "I_understand_the_algorithm_through",
    "During_the_group_study_on_algorithms",
    "In_learning_algorithms_i_find_it_easier",
    "While_reading_books_with_figures",
    "When_I_solve_some_mathematical_problems_i_usually_solve_it",
    "In_class_do_you_easily_socialize_with_classmates",
    "When_I_am_reading_the_reference_or_text_book_I_prefer_those_books_that_teachers_me",
    "When_studying_computer_algorithms_I_prefer_instructors_who",
    "When_Im_analyzing_a_story_or_a_novel",
    "When_I_start_a_homework_problem_I_am_more_likely_to",
    "Which_type_of_algorithmic_concepts_do_you_prefer",
    "I_remember_concepts_best",
    "It_is_more_important_to_me_that_an_instructor",
    "When_studying_computer_algorithms_I_prefer_to",
    "I_am_more_likely_to_be_considered",
    "When_I_get_directions_to_a_new_place_I_prefer",
    "How_can_I_effectively_learn",
    "When_approaching_a_problem_which_method_do_you_prefer_to_employ_first",
    "When_I_am_reading_for_enjoyment_I_like_writers_to",
    "When_I_encounter_a_diagram_or_sketch_related_to_computer_algorithms_I_tend_to_remember",
    "When_approaching_a_complex_algorithm_my_tendency_is_to",
    "I_can_easily_recall_specific_types_of_information",
    "When_I_have_solve_the_problem",
    "When_someone_is_showing_me_data_I_prefer",
    "When_working_on_implementing_algorithms_I_am_more_likely_to",
    "When_approaching_a_collaborative_algorithm_development_task",
    "I_consider_it_higher_praise_to_call_someone",
    "When_I_meet_people_at_a_party_I_am_more_likely_to_remember",
    "When_I_am_learning_a_new_subject_I_prefer_to",
    "I_am_more_likely_to_be_considered",
    "Which_type_of_courses_do_you_favor",
    "For_entertainment_I_prefer_to",
    "Some_teachers_start_their_lectures_with_an_outline_of_what_they_will_cover_Such_outlines_are",
    "The_idea_of_doing_homework_in_groups_with_one_grade_for_the_entire_group",
    "When_I_am_doing_long_calculations",
    "I_tend_to_picture_places_I_have_been",
    "When_solving_problems_in_a_group_I_would_be_more_likely_to",
)

# Standard ILS answer pairs (a | b), used for question_text and the manual form.
ANSWER_PAIRS: tuple[tuple[str, str], ...] = (
    ("try it out", "think it through"),
    ("innovative", "realistic"),
    ("get a picture", "get words"),
    ("understand details first, may be fuzzy on the overall structure", "understand the overall structure, may be fuzzy on details"),
    ("talk about it", "think about it"),
    ("teach that deals with facts and real-life situations", "teach that deals with ideas and theories"),
    ("pictures, diagrams, graphs, or maps", "written directions or verbal information"),
    ("all of the parts, then the whole", "the whole thing, then the parts"),
    ("jump in and contribute ideas", "sit back and listen"),
    ("to learn facts", "to learn concepts"),
    ("look over the figures carefully", "focus on the written text"),
    ("work my way to the solution one step at a time", "see the solutions but then struggle to figure out the steps"),
    ("get to know many of the students", "rarely get to know many students"),
    ("something new", "new ways to do things I already know"),
    ("put a lot of diagrams on the board", "spend a lot of time explaining"),
    ("think of the incidents and try to put them together to figure out the themes", "just know what the themes are when I finish reading and go back"),
    ("start working on the solution immediately", "try to fully understand the problem first"),
    ("certainty", "theory"),
    ("what I see", "what I hear"),
    ("lay out the material in clear sequential steps", "give an overall picture and relate the material to other subjects"),
    ("study in a group", "study alone"),
    ("careful about the details of my work", "creative about how to do my work"),
    ("a map", "written instructions"),
    ("at a fairly regular pace; if I study hard, I'll get it", "in fits and starts; then it suddenly clicks"),
    ("try things out", "think about how I'm going to do it"),
    ("clearly say what they mean", "say things in creative, interesting ways"),
    ("the picture", "what the instructor said about it"),
    ("focus on details and miss the big picture", "try to understand the big picture before the details"),
    ("something I have done", "something I have thought a lot about"),
    ("master one way of doing it", "come up with new ways of doing it"),
    ("charts or graphs", "text summarizing the results"),
    ("work on the beginning and progress forward", "work on different parts and then order them"),
    ("have group brainstorming where everyone contributes ideas", "brainstorm individually and then compare ideas"),
    ("sensible", "imaginative"),
    ("what they looked like", "what they said about themselves"),
    ("stay focused on that subject, learning as much as I can", "try to make connections between that subject and related subjects"),
    ("outgoing", "reserved"),
    ("that deal with concrete material", "that deal with abstract material"),
    ("watch television", "read a book"),
    ("somewhat helpful to me", "very helpful to me"),
    ("appeals to me", "does not appeal to me"),
    ("repeat all my steps and check my work carefully", "find checking my work tiresome and have to force myself to do it"),
    ("easily and fairly accurately", "with difficulty and without much detail"),
    ("think of the steps in the solution process", "think of possible consequences or applications of the solution in a wide range of areas"),
)

_POLE_A = {
    FslsmAxis.active_reflective: "active",
    FslsmAxis.sensing_intuitive: "sensing",
    FslsmAxis.visual_verbal: "visual",
    FslsmAxis.sequential_global: "sequential",
}
_POLE_B = {
    FslsmAxis.active_reflective: "reflective",
    FslsmAxis.sensing_intuitive: "intuitive",
    FslsmAxis.visual_verbal: "verbal",
    FslsmAxis.sequential_global: "global",
}


@dataclass(frozen=True)
class IlsQuestion:
    sequence_no: int
    rdf_property: str
    question_text: str
    answer_a_text: str
    answer_b_text: str
    axis: FslsmAxis
    answer_a_pole: str
    answer_b_pole: str


def _prompt(prop: str) -> str:
    """Turn the RDF property name into a readable stem."""
    text = prop.replace("_", " ").strip()
    text = text.replace(" i ", " I ").replace("Im ", "I'm ").replace("yesterdays", "yesterday's")
    return text[0].upper() + text[1:]


def ils_questions() -> list[IlsQuestion]:
    out: list[IlsQuestion] = []
    for i, prop in enumerate(RDF_PROPERTIES, start=1):
        axis = axis_for_question(i)
        a, b = ANSWER_PAIRS[i - 1]
        out.append(
            IlsQuestion(
                sequence_no=i,
                rdf_property=prop,
                question_text=f"{_prompt(prop)} — (A) {a} / (B) {b}",
                answer_a_text=a,
                answer_b_text=b,
                axis=axis,
                answer_a_pole=_POLE_A[axis],
                answer_b_pole=_POLE_B[axis],
            )
        )
    return out


assert len(RDF_PROPERTIES) == TOTAL_QUESTIONS
assert len(ANSWER_PAIRS) == TOTAL_QUESTIONS
