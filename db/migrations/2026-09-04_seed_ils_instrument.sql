-- Migration: seed the default FSLSM instrument (Felder-Soloman ILS, 44 questions)
-- Date: 2026-09-04
--
-- Generated from backend/app/ingestion/ils_instrument.py -- keep the two in sync
-- (regenerate: see Docs/DATA_MODEL.md section 18).
--
-- Idempotent: the instrument is matched on (name, version) and every question on
-- (instrument_id, sequence_no). Safe to re-run. The backend also seeds these rows
-- on first ingestion if they are missing, so this file is for fresh databases and
-- for environments where the API has never run an import.

BEGIN;

INSERT INTO survey_instruments (id, institution_id, name, version, total_questions, is_published)
VALUES ('00000000-0000-0000-0000-000000000400', NULL, 'FSLSM-ILS-Algorithms', '27Jan24', 44, true)
ON CONFLICT (name, version) DO NOTHING;

WITH inst AS (
  SELECT id FROM survey_instruments WHERE name = 'FSLSM-ILS-Algorithms' AND version = '27Jan24'
)
INSERT INTO survey_questions (instrument_id, sequence_no, question_text, axis, rdf_property, answer_a_pole, answer_b_pole)
SELECT inst.id, v.seq, v.text, v.axis::fslsm_axis, v.prop, v.pole_a::fslsm_pole_a, v.pole_b::fslsm_pole_b
FROM inst, (VALUES
  (1, 'I understand the algorithm better After I — (A) try it out / (B) think it through', 'active_reflective', 'I_understand_the_algorithm_better_After_I', 'active', 'reflective'),
  (2, 'I would try to learn algorithms trough by — (A) innovative / (B) realistic', 'sensing_intuitive', 'I_would_try_to_learn_algorithms_trough_by', 'sensing', 'intuitive'),
  (3, 'When I think about yesterday''s Algorithms class — (A) get a picture / (B) get words', 'visual_verbal', 'When_I_think_about_yesterdays_Algorithms_class', 'visual', 'verbal'),
  (4, 'When I learn about Algorithms — (A) understand details first, may be fuzzy on the overall structure / (B) understand the overall structure, may be fuzzy on details', 'sequential_global', 'When_I_learn_about_Algorithms', 'sequential', 'global'),
  (5, 'When I am learn new algorithms — (A) talk about it / (B) think about it', 'active_reflective', 'When_I_am_learn_new_algorithms', 'active', 'reflective'),
  (6, 'If I were the teacher of Algorithms then — (A) teach that deals with facts and real-life situations / (B) teach that deals with ideas and theories', 'sensing_intuitive', 'If_I_were_the_teacher_of_Algorithms_then', 'sensing', 'intuitive'),
  (7, 'I acquire new information about algorithms — (A) pictures, diagrams, graphs, or maps / (B) written directions or verbal information', 'visual_verbal', 'I_acquire_new_information_about_algorithms', 'visual', 'verbal'),
  (8, 'I understand the algorithm through — (A) all of the parts, then the whole / (B) the whole thing, then the parts', 'sequential_global', 'I_understand_the_algorithm_through', 'sequential', 'global'),
  (9, 'During the group study on algorithms — (A) jump in and contribute ideas / (B) sit back and listen', 'active_reflective', 'During_the_group_study_on_algorithms', 'active', 'reflective'),
  (10, 'In learning algorithms I find it easier — (A) to learn facts / (B) to learn concepts', 'sensing_intuitive', 'In_learning_algorithms_i_find_it_easier', 'sensing', 'intuitive'),
  (11, 'While reading books with figures — (A) look over the figures carefully / (B) focus on the written text', 'visual_verbal', 'While_reading_books_with_figures', 'visual', 'verbal'),
  (12, 'When I solve some mathematical problems I usually solve it — (A) work my way to the solution one step at a time / (B) see the solutions but then struggle to figure out the steps', 'sequential_global', 'When_I_solve_some_mathematical_problems_i_usually_solve_it', 'sequential', 'global'),
  (13, 'In class do you easily socialize with classmates — (A) get to know many of the students / (B) rarely get to know many students', 'active_reflective', 'In_class_do_you_easily_socialize_with_classmates', 'active', 'reflective'),
  (14, 'When I am reading the reference or text book I prefer those books that teachers me — (A) something new / (B) new ways to do things I already know', 'sensing_intuitive', 'When_I_am_reading_the_reference_or_text_book_I_prefer_those_books_that_teachers_me', 'sensing', 'intuitive'),
  (15, 'When studying computer algorithms I prefer instructors who — (A) put a lot of diagrams on the board / (B) spend a lot of time explaining', 'visual_verbal', 'When_studying_computer_algorithms_I_prefer_instructors_who', 'visual', 'verbal'),
  (16, 'When I''m analyzing a story or a novel — (A) think of the incidents and try to put them together to figure out the themes / (B) just know what the themes are when I finish reading and go back', 'sequential_global', 'When_Im_analyzing_a_story_or_a_novel', 'sequential', 'global'),
  (17, 'When I start a homework problem I am more likely to — (A) start working on the solution immediately / (B) try to fully understand the problem first', 'active_reflective', 'When_I_start_a_homework_problem_I_am_more_likely_to', 'active', 'reflective'),
  (18, 'Which type of algorithmic concepts do you prefer — (A) certainty / (B) theory', 'sensing_intuitive', 'Which_type_of_algorithmic_concepts_do_you_prefer', 'sensing', 'intuitive'),
  (19, 'I remember concepts best — (A) what I see / (B) what I hear', 'visual_verbal', 'I_remember_concepts_best', 'visual', 'verbal'),
  (20, 'It is more important to me that an instructor — (A) lay out the material in clear sequential steps / (B) give an overall picture and relate the material to other subjects', 'sequential_global', 'It_is_more_important_to_me_that_an_instructor', 'sequential', 'global'),
  (21, 'When studying computer algorithms I prefer to — (A) study in a group / (B) study alone', 'active_reflective', 'When_studying_computer_algorithms_I_prefer_to', 'active', 'reflective'),
  (22, 'I am more likely to be considered — (A) careful about the details of my work / (B) creative about how to do my work', 'sensing_intuitive', 'I_am_more_likely_to_be_considered', 'sensing', 'intuitive'),
  (23, 'When I get directions to a new place I prefer — (A) a map / (B) written instructions', 'visual_verbal', 'When_I_get_directions_to_a_new_place_I_prefer', 'visual', 'verbal'),
  (24, 'How can I effectively learn — (A) at a fairly regular pace; if I study hard, I''ll get it / (B) in fits and starts; then it suddenly clicks', 'sequential_global', 'How_can_I_effectively_learn', 'sequential', 'global'),
  (25, 'When approaching a problem which method do you prefer to employ first — (A) try things out / (B) think about how I''m going to do it', 'active_reflective', 'When_approaching_a_problem_which_method_do_you_prefer_to_employ_first', 'active', 'reflective'),
  (26, 'When I am reading for enjoyment I like writers to — (A) clearly say what they mean / (B) say things in creative, interesting ways', 'sensing_intuitive', 'When_I_am_reading_for_enjoyment_I_like_writers_to', 'sensing', 'intuitive'),
  (27, 'When I encounter a diagram or sketch related to computer algorithms I tend to remember — (A) the picture / (B) what the instructor said about it', 'visual_verbal', 'When_I_encounter_a_diagram_or_sketch_related_to_computer_algorithms_I_tend_to_remember', 'visual', 'verbal'),
  (28, 'When approaching a complex algorithm my tendency is to — (A) focus on details and miss the big picture / (B) try to understand the big picture before the details', 'sequential_global', 'When_approaching_a_complex_algorithm_my_tendency_is_to', 'sequential', 'global'),
  (29, 'I can easily recall specific types of information — (A) something I have done / (B) something I have thought a lot about', 'active_reflective', 'I_can_easily_recall_specific_types_of_information', 'active', 'reflective'),
  (30, 'When I have solve the problem — (A) master one way of doing it / (B) come up with new ways of doing it', 'sensing_intuitive', 'When_I_have_solve_the_problem', 'sensing', 'intuitive'),
  (31, 'When someone is showing me data I prefer — (A) charts or graphs / (B) text summarizing the results', 'visual_verbal', 'When_someone_is_showing_me_data_I_prefer', 'visual', 'verbal'),
  (32, 'When working on implementing algorithms I am more likely to — (A) work on the beginning and progress forward / (B) work on different parts and then order them', 'sequential_global', 'When_working_on_implementing_algorithms_I_am_more_likely_to', 'sequential', 'global'),
  (33, 'When approaching a collaborative algorithm development task — (A) have group brainstorming where everyone contributes ideas / (B) brainstorm individually and then compare ideas', 'active_reflective', 'When_approaching_a_collaborative_algorithm_development_task', 'active', 'reflective'),
  (34, 'I consider it higher praise to call someone — (A) sensible / (B) imaginative', 'sensing_intuitive', 'I_consider_it_higher_praise_to_call_someone', 'sensing', 'intuitive'),
  (35, 'When I meet people at a party I am more likely to remember — (A) what they looked like / (B) what they said about themselves', 'visual_verbal', 'When_I_meet_people_at_a_party_I_am_more_likely_to_remember', 'visual', 'verbal'),
  (36, 'When I am learning a new subject I prefer to — (A) stay focused on that subject, learning as much as I can / (B) try to make connections between that subject and related subjects', 'sequential_global', 'When_I_am_learning_a_new_subject_I_prefer_to', 'sequential', 'global'),
  (37, 'I am more likely to be considered — (A) outgoing / (B) reserved', 'active_reflective', 'I_am_more_likely_to_be_considered', 'active', 'reflective'),
  (38, 'Which type of courses do you favor — (A) that deal with concrete material / (B) that deal with abstract material', 'sensing_intuitive', 'Which_type_of_courses_do_you_favor', 'sensing', 'intuitive'),
  (39, 'For entertainment I prefer to — (A) watch television / (B) read a book', 'visual_verbal', 'For_entertainment_I_prefer_to', 'visual', 'verbal'),
  (40, 'Some teachers start their lectures with an outline of what they will cover Such outlines are — (A) somewhat helpful to me / (B) very helpful to me', 'sequential_global', 'Some_teachers_start_their_lectures_with_an_outline_of_what_they_will_cover_Such_outlines_are', 'sequential', 'global'),
  (41, 'The idea of doing homework in groups with one grade for the entire group — (A) appeals to me / (B) does not appeal to me', 'active_reflective', 'The_idea_of_doing_homework_in_groups_with_one_grade_for_the_entire_group', 'active', 'reflective'),
  (42, 'When I am doing long calculations — (A) repeat all my steps and check my work carefully / (B) find checking my work tiresome and have to force myself to do it', 'sensing_intuitive', 'When_I_am_doing_long_calculations', 'sensing', 'intuitive'),
  (43, 'I tend to picture places I have been — (A) easily and fairly accurately / (B) with difficulty and without much detail', 'visual_verbal', 'I_tend_to_picture_places_I_have_been', 'visual', 'verbal'),
  (44, 'When solving problems in a group I would be more likely to — (A) think of the steps in the solution process / (B) think of possible consequences or applications of the solution in a wide range of areas', 'sequential_global', 'When_solving_problems_in_a_group_I_would_be_more_likely_to', 'sequential', 'global')
) AS v(seq, text, axis, prop, pole_a, pole_b)
ON CONFLICT (instrument_id, sequence_no) DO NOTHING;

COMMIT;

-- Verify:
--   SELECT count(*) FROM survey_questions sq
--   JOIN survey_instruments si ON si.id = sq.instrument_id
--   WHERE si.name = 'FSLSM-ILS-Algorithms' AND si.version = '27Jan24';   -- expect 44
