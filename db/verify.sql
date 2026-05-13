-- ============================================================================
-- ClassIQ — Verification Queries
-- Source: Docs/DATA_MODEL.md §14
--
-- Run these AFTER schema.sql. Each query has placeholder params ($1 etc.)
-- — replace them with real UUIDs from seeded data before running.
-- ============================================================================


-- ─── Q1  HoD lists all department sections for the active term ──────────────
-- Param: $1 = department_id (uuid)

SELECT
  s.id,
  c.code,
  c.name,
  s.label,
  s.state,
  t.full_name AS teacher_name,
  (SELECT count(*) FROM section_students ss WHERE ss.section_id = s.id) AS student_count
FROM sections s
JOIN courses c       ON c.id = s.course_id
LEFT JOIN teachers t ON t.id = s.teacher_id
JOIN academic_terms at ON at.id = s.academic_term_id
WHERE c.department_id = $1
  AND at.is_active
  AND s.deleted_at IS NULL
ORDER BY c.code, s.label;


-- ─── Q2  Teacher dashboard fetch — own class + style breakdown ──────────────
-- No params. Runs as the logged-in teacher (auth.uid()).

WITH my_section AS (
  SELECT s.*
  FROM sections s
  JOIN teachers t ON t.id = s.teacher_id
  WHERE t.auth_user_id = auth.uid()
    AND s.deleted_at IS NULL
)
SELECT
  ms.id AS section_id,
  c.code,
  c.name,
  sp.active_reflective_score,
  sp.sensing_intuitive_score,
  sp.visual_verbal_score,
  sp.sequential_global_score,
  sp.dominant_axis
FROM my_section ms
JOIN courses c          ON c.id = ms.course_id
JOIN section_students ss ON ss.section_id = ms.id
JOIN student_profiles sp ON sp.student_id = ss.student_id
                         AND sp.is_current = true
WHERE sp.deleted_at IS NULL;


-- ─── Q3  Scoring engine — pull all inputs for one section's simulation ──────
-- Param: $1 = section_id (uuid)

SELECT
  s.id AS section_id,
  json_build_object(
    'teacher',  (SELECT row_to_json(tp.*)
                   FROM teacher_profiles tp
                  WHERE tp.teacher_id = s.teacher_id AND tp.is_current = true),

    'students', (SELECT json_agg(row_to_json(sp.*))
                   FROM section_students ss
                   JOIN student_profiles sp
                        ON sp.student_id = ss.student_id
                       AND sp.is_current = true
                  WHERE ss.section_id = s.id),

    'aux',      (SELECT json_agg(row_to_json(sap.*))
                   FROM section_students ss
                   JOIN student_aux_profiles sap
                        ON sap.student_id = ss.student_id
                       AND sap.is_current = true
                  WHERE ss.section_id = s.id),

    'edges',    (SELECT json_agg(row_to_json(pr.*))
                   FROM peer_relationships pr
                  WHERE pr.academic_term_id = s.academic_term_id
                    AND pr.from_student_id IN (SELECT student_id FROM section_students WHERE section_id = s.id)
                    AND pr.to_student_id   IN (SELECT student_id FROM section_students WHERE section_id = s.id))
  ) AS inputs
FROM sections s
WHERE s.id = $1;


-- ─── Q4  S3 longitudinal — trace one student's FSLSM evolution across terms ─
-- Param: $1 = student_id (uuid)

SELECT
  sp.version,
  sp.scored_at,
  sp.active_reflective_score,
  sp.sensing_intuitive_score,
  sp.visual_verbal_score,
  sp.sequential_global_score,
  sp.dominant_axis,
  sr.academic_term_id,
  at.name AS term_name
FROM student_profiles sp
JOIN survey_responses sr   ON sr.id = sp.derived_from_response_id
LEFT JOIN academic_terms at ON at.id = sr.academic_term_id
WHERE sp.student_id = $1
ORDER BY sp.version;


-- ─── Q5  RLS isolation test ─────────────────────────────────────────────────
-- Run as a user whose auth_users.institution_id = X.
-- Expected: result contains ONLY rows belonging to institution X.
-- To test cross-tenant isolation, re-run as a user from institution Y and
-- confirm the row counts differ (and never include X's rows).

SELECT
  current_institution_id() AS my_institution,
  count(*)                 AS visible_students
FROM students;

-- ── Companion check: enumerate visible per-table row counts under RLS.
-- Useful for spotting tables that accidentally leak across tenants.
WITH counts AS (
  SELECT 'institutions'         AS table_name, count(*) FROM institutions
  UNION ALL SELECT 'departments',          count(*) FROM departments
  UNION ALL SELECT 'auth_users',           count(*) FROM auth_users
  UNION ALL SELECT 'academic_terms',       count(*) FROM academic_terms
  UNION ALL SELECT 'courses',              count(*) FROM courses
  UNION ALL SELECT 'sections',             count(*) FROM sections
  UNION ALL SELECT 'section_students',     count(*) FROM section_students
  UNION ALL SELECT 'students',             count(*) FROM students
  UNION ALL SELECT 'teachers',             count(*) FROM teachers
  UNION ALL SELECT 'survey_instruments',   count(*) FROM survey_instruments
  UNION ALL SELECT 'survey_questions',     count(*) FROM survey_questions
  UNION ALL SELECT 'survey_responses',     count(*) FROM survey_responses
  UNION ALL SELECT 'survey_answers',       count(*) FROM survey_answers
  UNION ALL SELECT 'student_profiles',     count(*) FROM student_profiles
  UNION ALL SELECT 'student_aux_profiles', count(*) FROM student_aux_profiles
  UNION ALL SELECT 'teacher_profiles',     count(*) FROM teacher_profiles
  UNION ALL SELECT 'peer_relationships',   count(*) FROM peer_relationships
  UNION ALL SELECT 'scoring_configs',      count(*) FROM scoring_configs
  UNION ALL SELECT 'scenarios',            count(*) FROM scenarios
  UNION ALL SELECT 'scenario_sections',    count(*) FROM scenario_sections
  UNION ALL SELECT 'simulation_runs',      count(*) FROM simulation_runs
  UNION ALL SELECT 'simulation_results',   count(*) FROM simulation_results
  UNION ALL SELECT 'audit_logs',           count(*) FROM audit_logs
  UNION ALL SELECT 'ingestion_jobs',       count(*) FROM ingestion_jobs
)
SELECT * FROM counts ORDER BY table_name;
