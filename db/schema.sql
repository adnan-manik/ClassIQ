-- ============================================================================
-- ClassIQ — Supabase Postgres Schema
-- Generated from Docs/DATA_MODEL.md (draft v1, 2026-05-11)
--
-- Run order:
--   PART 1  Extensions
--   PART 2  ENUM types
--   PART 3  Tables (ordered by FK dependency, 6 layers)
--   PART 4  Partial unique indexes
--   PART 5  RLS helper functions
--   PART 6  RLS policies
--
-- Paste into Supabase SQL Editor (or run via psql). The whole script is
-- transaction-wrapped — any failure rolls back cleanly.
--
-- To re-run on a non-empty DB, see db/drop.sql (not provided yet).
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1  Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() (also built-in on PG13+)

-- ============================================================================
-- PART 2  ENUM types  (DATA_MODEL §3)
-- ============================================================================

-- NOTE: 'student' is included for forward-compat with R3 (post-FYP student login).
-- It is unused in FYP scope; role-check decorators and RLS policies don't grant
-- tenant-data reads to this role.
CREATE TYPE user_role         AS ENUM ('super_admin', 'hod', 'teacher', 'student');
CREATE TYPE section_state     AS ENUM ('draft', 'simulated', 'active', 'archived');
CREATE TYPE collab_pref       AS ENUM ('solo', 'pair', 'group');
CREATE TYPE participation_lvl AS ENUM ('low', 'medium', 'high');
CREATE TYPE interaction_lvl   AS ENUM ('low', 'medium', 'high');
CREATE TYPE pacing_pref       AS ENUM ('slow', 'moderate', 'fast');
CREATE TYPE fslsm_axis        AS ENUM (
  'active_reflective',
  'sensing_intuitive',
  'visual_verbal',
  'sequential_global'
);
CREATE TYPE fslsm_pole_a      AS ENUM ('active', 'sensing', 'visual', 'sequential');
CREATE TYPE fslsm_pole_b      AS ENUM ('reflective', 'intuitive', 'verbal', 'global');
CREATE TYPE answer_choice     AS ENUM ('A', 'B');
CREATE TYPE response_source   AS ENUM (
  'rdf_bulk_import',
  'form_app',
  'classiq_internal',
  'manual_admin'
);
CREATE TYPE relationship_type AS ENUM ('friend', 'study_partner', 'neutral', 'conflict');
CREATE TYPE relationship_src  AS ENUM ('survey', 'admin');
CREATE TYPE scenario_status   AS ENUM ('draft', 'simulated', 'applied', 'archived');
CREATE TYPE sim_run_status    AS ENUM ('queued', 'running', 'succeeded', 'failed');
CREATE TYPE factor_impact     AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE predicted_outcome AS ENUM ('high', 'medium', 'low');
CREATE TYPE social_impact     AS ENUM ('supportive', 'neutral', 'hindering');
CREATE TYPE ingestion_status  AS ENUM ('pending', 'running', 'succeeded', 'failed', 'partial');

-- ============================================================================
-- PART 3  Tables  (FK dependency order)
--
-- Layer 0 — tenant root
-- Layer 1 — direct children of institutions only
-- Layer 2 — depend on Layer 0..1
-- Layer 3 — depend on Layer 0..2
-- Layer 4 — depend on Layer 0..3
-- Layer 5 — depend on Layer 0..4
-- Layer 6 — depend on Layer 0..5
-- ============================================================================

-- ─── Layer 0 ────────────────────────────────────────────────────────────────

CREATE TABLE institutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);

-- ─── Layer 1 ────────────────────────────────────────────────────────────────

CREATE TABLE departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (institution_id, code)
);
CREATE INDEX idx_departments_institution ON departments(institution_id);

CREATE TABLE auth_users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  role            user_role NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ
);
CREATE INDEX idx_auth_users_institution_role ON auth_users(institution_id, role);

CREATE TABLE academic_terms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  starts_on       DATE NOT NULL,
  ends_on         DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, name),
  CHECK (ends_on > starts_on)
);
CREATE INDEX idx_academic_terms_institution_active ON academic_terms(institution_id, is_active);

CREATE TABLE survey_instruments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID REFERENCES institutions(id),
  name            TEXT NOT NULL,
  version         TEXT NOT NULL,
  total_questions INT NOT NULL CHECK (total_questions > 0),
  is_published    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

-- ─── Layer 2 ────────────────────────────────────────────────────────────────

CREATE TABLE user_departments (
  auth_user_id   UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (auth_user_id, department_id)
);
CREATE INDEX idx_user_departments_department ON user_departments(department_id);

CREATE TABLE courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (department_id, code)
);
CREATE INDEX idx_courses_institution ON courses(institution_id);
CREATE INDEX idx_courses_department  ON courses(department_id);

CREATE TABLE students (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id         UUID REFERENCES departments(id),
  external_id           TEXT,
  full_name             TEXT NOT NULL,
  email                 TEXT,
  linked_auth_user_id   UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  UNIQUE (institution_id, external_id)
);
CREATE INDEX idx_students_institution ON students(institution_id);
CREATE INDEX idx_students_department  ON students(department_id);
CREATE INDEX idx_students_email       ON students(email) WHERE email IS NOT NULL;

CREATE TABLE teachers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id         UUID REFERENCES departments(id),
  full_name             TEXT NOT NULL,
  email                 TEXT NOT NULL,
  auth_user_id          UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  UNIQUE (institution_id, email)
);
CREATE INDEX idx_teachers_institution ON teachers(institution_id);
CREATE INDEX idx_teachers_auth_user   ON teachers(auth_user_id);

CREATE TABLE survey_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id   UUID NOT NULL REFERENCES survey_instruments(id) ON DELETE CASCADE,
  sequence_no     INT NOT NULL,
  question_text   TEXT NOT NULL,
  axis            fslsm_axis NOT NULL,
  rdf_property    TEXT,
  answer_a_pole   fslsm_pole_a NOT NULL,
  answer_b_pole   fslsm_pole_b NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, sequence_no)
);
CREATE INDEX idx_survey_questions_instrument_axis ON survey_questions(instrument_id, axis);

CREATE TABLE scoring_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID REFERENCES institutions(id),
  name            TEXT NOT NULL,
  version         TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  weights         JSONB NOT NULL,
  created_by      UUID REFERENCES auth_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, name, version)
);

CREATE TABLE ingestion_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source          response_source NOT NULL,
  status          ingestion_status NOT NULL DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  file_path       TEXT,
  summary         JSONB,
  triggered_by    UUID REFERENCES auth_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  actor_user_id   UUID REFERENCES auth_users(id),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_institution_time ON audit_logs(institution_id, created_at DESC);
CREATE INDEX idx_audit_entity           ON audit_logs(entity_type, entity_id);

-- ─── Layer 3 ────────────────────────────────────────────────────────────────

CREATE TABLE sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  academic_term_id  UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  teacher_id        UUID REFERENCES teachers(id) ON DELETE SET NULL,
  label             TEXT NOT NULL,
  state             section_state NOT NULL DEFAULT 'draft',
  created_by        UUID NOT NULL REFERENCES auth_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  UNIQUE (course_id, academic_term_id, label)
);
CREATE INDEX idx_sections_term_state  ON sections(academic_term_id, state);
CREATE INDEX idx_sections_teacher     ON sections(teacher_id);
CREATE INDEX idx_sections_institution ON sections(institution_id);

CREATE TABLE survey_responses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id       UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  instrument_id        UUID NOT NULL REFERENCES survey_instruments(id),
  academic_term_id     UUID REFERENCES academic_terms(id),
  submitted_at         TIMESTAMPTZ NOT NULL,
  source               response_source NOT NULL,
  ingestion_job_id     UUID REFERENCES ingestion_jobs(id),
  external_response_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ,
  UNIQUE (instrument_id, external_response_id)
);
CREATE INDEX idx_survey_responses_student ON survey_responses(student_id, submitted_at DESC);
CREATE INDEX idx_survey_responses_inst    ON survey_responses(institution_id);

CREATE TABLE student_aux_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id         UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_term_id       UUID REFERENCES academic_terms(id),
  collaboration_pref     collab_pref,
  participation_level    participation_lvl,
  preferred_peers        UUID[],
  distracting_peers      UUID[],
  notes                  TEXT,
  is_current             BOOLEAN NOT NULL DEFAULT false,
  collected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);

CREATE TABLE teacher_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  teacher_id          UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  version             INT NOT NULL CHECK (version > 0),
  is_current          BOOLEAN NOT NULL DEFAULT false,
  teaching_style      TEXT NOT NULL,
  interaction_level   interaction_lvl NOT NULL,
  pacing              pacing_pref NOT NULL,
  approach            TEXT,
  collected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  UNIQUE (teacher_id, version)
);

CREATE TABLE peer_relationships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_term_id  UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  from_student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  to_student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type              relationship_type NOT NULL,
  strength          SMALLINT NOT NULL CHECK (strength BETWEEN 1 AND 5),
  source            relationship_src NOT NULL DEFAULT 'survey',
  created_by        UUID REFERENCES auth_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CHECK (from_student_id <> to_student_id),
  UNIQUE (academic_term_id, from_student_id, to_student_id, type)
);
CREATE INDEX idx_peer_rel_from ON peer_relationships(from_student_id, academic_term_id);
CREATE INDEX idx_peer_rel_to   ON peer_relationships(to_student_id, academic_term_id);
CREATE INDEX idx_peer_rel_term ON peer_relationships(academic_term_id);

CREATE TABLE scenarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  department_id     UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  academic_term_id  UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  notes             TEXT,
  status            scenario_status NOT NULL DEFAULT 'draft',
  scoring_config_id UUID REFERENCES scoring_configs(id),
  created_by        UUID NOT NULL REFERENCES auth_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ
);
CREATE INDEX idx_scenarios_dept_term ON scenarios(department_id, academic_term_id);

-- ─── Layer 4 ────────────────────────────────────────────────────────────────

CREATE TABLE section_students (
  section_id   UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at   TIMESTAMPTZ,
  PRIMARY KEY (section_id, student_id)
);
CREATE INDEX idx_section_students_student ON section_students(student_id);

CREATE TABLE survey_answers (
  response_id   UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES survey_questions(id),
  choice        answer_choice NOT NULL,
  PRIMARY KEY (response_id, question_id)
);
CREATE INDEX idx_survey_answers_question ON survey_answers(question_id);

CREATE TABLE student_profiles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id              UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id                  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  derived_from_response_id    UUID NOT NULL REFERENCES survey_responses(id),
  version                     INT NOT NULL CHECK (version > 0),
  is_current                  BOOLEAN NOT NULL DEFAULT false,
  scored_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  scoring_engine_version      TEXT NOT NULL,
  active_reflective_score     INT NOT NULL CHECK (active_reflective_score BETWEEN -11 AND 11 AND active_reflective_score % 2 <> 0),
  sensing_intuitive_score     INT NOT NULL CHECK (sensing_intuitive_score BETWEEN -11 AND 11 AND sensing_intuitive_score % 2 <> 0),
  visual_verbal_score         INT NOT NULL CHECK (visual_verbal_score BETWEEN -11 AND 11 AND visual_verbal_score % 2 <> 0),
  sequential_global_score     INT NOT NULL CHECK (sequential_global_score BETWEEN -11 AND 11 AND sequential_global_score % 2 <> 0),
  dominant_axis               fslsm_axis,
  deleted_at                  TIMESTAMPTZ,
  UNIQUE (student_id, version)
);
CREATE INDEX idx_student_profiles_institution ON student_profiles(institution_id);

CREATE TABLE scenario_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id  UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id),
  teacher_id   UUID NOT NULL REFERENCES teachers(id),
  label        TEXT NOT NULL,
  UNIQUE (scenario_id, course_id, label)
);

CREATE TABLE simulation_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  scenario_id         UUID REFERENCES scenarios(id) ON DELETE CASCADE,
  section_id          UUID REFERENCES sections(id) ON DELETE CASCADE,
  scoring_config_id   UUID NOT NULL REFERENCES scoring_configs(id),
  engine_version      TEXT NOT NULL,
  status              sim_run_status NOT NULL DEFAULT 'queued',
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  error_message       TEXT,
  triggered_by        UUID NOT NULL REFERENCES auth_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scenario_id IS NOT NULL) OR (section_id IS NOT NULL))
);
CREATE INDEX idx_sim_runs_scenario ON simulation_runs(scenario_id);
CREATE INDEX idx_sim_runs_section  ON simulation_runs(section_id);

-- ─── Layer 5 ────────────────────────────────────────────────────────────────

CREATE TABLE scenario_section_students (
  scenario_section_id  UUID NOT NULL REFERENCES scenario_sections(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (scenario_section_id, student_id)
);

CREATE TABLE simulation_results (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_run_id        UUID NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
  scenario_section_id      UUID REFERENCES scenario_sections(id) ON DELETE CASCADE,
  section_id               UUID REFERENCES sections(id) ON DELETE CASCADE,
  compatibility_score      SMALLINT NOT NULL CHECK (compatibility_score BETWEEN 0 AND 100),
  predicted_outcome        predicted_outcome NOT NULL,
  social_graph_impact      social_impact NOT NULL,
  style_distribution       JSONB NOT NULL,
  recommended_teacher_id   UUID REFERENCES teachers(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scenario_section_id IS NOT NULL) OR (section_id IS NOT NULL))
);
CREATE INDEX idx_sim_results_run          ON simulation_results(simulation_run_id);
CREATE INDEX idx_sim_results_scenario_sec ON simulation_results(scenario_section_id);
CREATE INDEX idx_sim_results_section      ON simulation_results(section_id);

-- ─── Layer 6 ────────────────────────────────────────────────────────────────

CREATE TABLE simulation_result_factors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_result_id  UUID NOT NULL REFERENCES simulation_results(id) ON DELETE CASCADE,
  factor_name           TEXT NOT NULL,
  score                 SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  weight                NUMERIC(4,3) NOT NULL,
  impact                factor_impact NOT NULL,
  UNIQUE (simulation_result_id, factor_name)
);
CREATE INDEX idx_sim_factors_result ON simulation_result_factors(simulation_result_id);
CREATE INDEX idx_sim_factors_name   ON simulation_result_factors(factor_name);

-- ============================================================================
-- PART 4  Partial unique indexes (one current version per subject)
-- ============================================================================

CREATE UNIQUE INDEX idx_student_profiles_one_current
  ON student_profiles(student_id)
  WHERE is_current = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_student_aux_profiles_one_current
  ON student_aux_profiles(student_id, academic_term_id)
  WHERE is_current = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_teacher_profiles_one_current
  ON teacher_profiles(teacher_id)
  WHERE is_current = true AND deleted_at IS NULL;

-- ============================================================================
-- PART 5  RLS helper functions  (DATA_MODEL §12)
-- ============================================================================

CREATE OR REPLACE FUNCTION current_institution_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT institution_id FROM auth_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM auth_users WHERE id = auth.uid();
$$;

-- ============================================================================
-- PART 6  RLS Policies
--
-- Pattern:
--   * Tables with a direct `institution_id` column → standard isolation policy
--   * Join/child tables without `institution_id`   → EXISTS-based parent lookup
--   * Every tenant-scoped table also gets a super_admin override policy.
--
-- Per-role read/write matrices (HoD vs Teacher specifics) live in a follow-up
-- doc; this part establishes tenant isolation + super_admin override only.
-- ============================================================================

-- ─── Tables WITH institution_id ─────────────────────────────────────────────

ALTER TABLE institutions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_instruments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_configs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_aux_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_relationships    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_runs       ENABLE ROW LEVEL SECURITY;

-- institutions: tenants see only themselves
CREATE POLICY tenant_isolation ON institutions
  USING (id = current_institution_id())
  WITH CHECK (id = current_institution_id());
CREATE POLICY super_admin_all ON institutions
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- Helper macro-style: same body for every `institution_id`-bearing table
-- (Postgres doesn't have CREATE POLICY templating, so we emit them explicitly.)

CREATE POLICY tenant_isolation ON departments
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON departments
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON auth_users
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON auth_users
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON academic_terms
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON academic_terms
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- survey_instruments: institution_id may be NULL (= global default)
CREATE POLICY tenant_or_global ON survey_instruments
  USING (institution_id IS NULL OR institution_id = current_institution_id())
  WITH CHECK (institution_id IS NULL OR institution_id = current_institution_id());
CREATE POLICY super_admin_all ON survey_instruments
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON courses
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON courses
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON students
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON students
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON teachers
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON teachers
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- scoring_configs: nullable institution_id (global default) same as instruments
CREATE POLICY tenant_or_global ON scoring_configs
  USING (institution_id IS NULL OR institution_id = current_institution_id())
  WITH CHECK (institution_id IS NULL OR institution_id = current_institution_id());
CREATE POLICY super_admin_all ON scoring_configs
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON ingestion_jobs
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON ingestion_jobs
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON audit_logs
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON audit_logs
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON sections
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON sections
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON survey_responses
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON survey_responses
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON student_aux_profiles
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON student_aux_profiles
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON teacher_profiles
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON teacher_profiles
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON peer_relationships
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON peer_relationships
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON scenarios
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON scenarios
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON student_profiles
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON student_profiles
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

CREATE POLICY tenant_isolation ON simulation_runs
  USING (institution_id = current_institution_id())
  WITH CHECK (institution_id = current_institution_id());
CREATE POLICY super_admin_all ON simulation_runs
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- ─── Tables WITHOUT institution_id (child/join tables) ──────────────────────

ALTER TABLE user_departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_section_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulation_result_factors ENABLE ROW LEVEL SECURITY;

-- user_departments: scoped by the auth_user's institution
CREATE POLICY tenant_isolation ON user_departments
  USING (EXISTS (
    SELECT 1 FROM auth_users a
    WHERE a.id = user_departments.auth_user_id
      AND a.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_users a
    WHERE a.id = user_departments.auth_user_id
      AND a.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON user_departments
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- section_students: scoped by section's institution
CREATE POLICY tenant_isolation ON section_students
  USING (EXISTS (
    SELECT 1 FROM sections s
    WHERE s.id = section_students.section_id
      AND s.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM sections s
    WHERE s.id = section_students.section_id
      AND s.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON section_students
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- survey_questions: scoped by instrument's institution (or global)
CREATE POLICY tenant_or_global ON survey_questions
  USING (EXISTS (
    SELECT 1 FROM survey_instruments si
    WHERE si.id = survey_questions.instrument_id
      AND (si.institution_id IS NULL OR si.institution_id = current_institution_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM survey_instruments si
    WHERE si.id = survey_questions.instrument_id
      AND (si.institution_id IS NULL OR si.institution_id = current_institution_id())
  ));
CREATE POLICY super_admin_all ON survey_questions
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- survey_answers: scoped by response's institution
CREATE POLICY tenant_isolation ON survey_answers
  USING (EXISTS (
    SELECT 1 FROM survey_responses r
    WHERE r.id = survey_answers.response_id
      AND r.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM survey_responses r
    WHERE r.id = survey_answers.response_id
      AND r.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON survey_answers
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- scenario_sections: scoped by scenario's institution
CREATE POLICY tenant_isolation ON scenario_sections
  USING (EXISTS (
    SELECT 1 FROM scenarios sc
    WHERE sc.id = scenario_sections.scenario_id
      AND sc.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scenarios sc
    WHERE sc.id = scenario_sections.scenario_id
      AND sc.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON scenario_sections
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- scenario_section_students: scoped by scenario_section → scenario → institution
CREATE POLICY tenant_isolation ON scenario_section_students
  USING (EXISTS (
    SELECT 1 FROM scenario_sections ss
    JOIN scenarios sc ON sc.id = ss.scenario_id
    WHERE ss.id = scenario_section_students.scenario_section_id
      AND sc.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM scenario_sections ss
    JOIN scenarios sc ON sc.id = ss.scenario_id
    WHERE ss.id = scenario_section_students.scenario_section_id
      AND sc.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON scenario_section_students
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- simulation_results: scoped by run's institution
CREATE POLICY tenant_isolation ON simulation_results
  USING (EXISTS (
    SELECT 1 FROM simulation_runs r
    WHERE r.id = simulation_results.simulation_run_id
      AND r.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM simulation_runs r
    WHERE r.id = simulation_results.simulation_run_id
      AND r.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON simulation_results
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

-- simulation_result_factors: scoped by result → run → institution
CREATE POLICY tenant_isolation ON simulation_result_factors
  USING (EXISTS (
    SELECT 1 FROM simulation_results sr
    JOIN simulation_runs r ON r.id = sr.simulation_run_id
    WHERE sr.id = simulation_result_factors.simulation_result_id
      AND r.institution_id = current_institution_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM simulation_results sr
    JOIN simulation_runs r ON r.id = sr.simulation_run_id
    WHERE sr.id = simulation_result_factors.simulation_result_id
      AND r.institution_id = current_institution_id()
  ));
CREATE POLICY super_admin_all ON simulation_result_factors
  USING (current_role() = 'super_admin')
  WITH CHECK (current_role() = 'super_admin');

COMMIT;

-- ============================================================================
-- Done.
--
-- Counts when this completes cleanly:
--   19 enum types
--   27 tables
--   ~30 indexes (incl. 3 partial unique)
--   2 RLS helper functions
--   ~46 RLS policies (tenant_isolation + super_admin_all per table)
--
-- Next steps:
--   1. Run db/verify.sql to sanity-check the schema.
--   2. Seed survey_instruments + survey_questions for the FSLSM ILS.
--   3. Wire a trigger on auth.users INSERT → public.auth_users for signups
--      (out of scope for this script — app-specific decision).
-- ============================================================================
