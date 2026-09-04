-- Migration: S1 Early Warning System — actual outcomes + flags
-- Date: 2026-09-04
--
-- Adds two tenant-scoped tables (+ three enums) so that, once a section is
-- active, staff/teachers can record real attendance / grade / engagement data
-- and the backend can compare it with the predicted outcome and raise flags.
--
-- Idempotent where Postgres allows it (IF NOT EXISTS / DO blocks). Run once.
-- Mirrors the pattern used in db/schema.sql (tenant_isolation + super_admin_all).

BEGIN;

DO $$ BEGIN
  CREATE TYPE warning_type     AS ENUM ('engagement', 'performance', 'compatibility');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE warning_severity AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE warning_status   AS ENUM ('open', 'acknowledged', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── section_outcomes — real data entered during the live semester ──────────
CREATE TABLE IF NOT EXISTS section_outcomes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  section_id        UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id        UUID REFERENCES students(id) ON DELETE CASCADE,   -- NULL = whole-section aggregate
  week_no           SMALLINT NOT NULL CHECK (week_no BETWEEN 1 AND 20),
  attendance_pct    NUMERIC(5,2) CHECK (attendance_pct BETWEEN 0 AND 100),
  grade_pct         NUMERIC(5,2) CHECK (grade_pct BETWEEN 0 AND 100),
  engagement_level  participation_lvl,
  notes             TEXT,
  recorded_by       UUID REFERENCES auth_users(id),
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (section_id, student_id, week_no)
);
CREATE INDEX IF NOT EXISTS idx_section_outcomes_section ON section_outcomes(section_id, week_no);
CREATE INDEX IF NOT EXISTS idx_section_outcomes_student ON section_outcomes(student_id);

-- ─── early_warning_flags — prediction vs reality divergence ─────────────────
CREATE TABLE IF NOT EXISTS early_warning_flags (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  section_id         UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id         UUID REFERENCES students(id) ON DELETE CASCADE,   -- NULL = section-level flag
  type               warning_type NOT NULL,
  severity           warning_severity NOT NULL,
  status             warning_status NOT NULL DEFAULT 'open',
  message            TEXT NOT NULL,
  predicted_outcome  predicted_outcome,
  metric_name        TEXT,                    -- attendance_pct | grade_pct | engagement | class_grade
  expected_value     NUMERIC(6,2),
  actual_value       NUMERIC(6,2),
  deviation          NUMERIC(6,2),            -- actual − expected (negative = below expectation)
  week_no            SMALLINT,
  evaluated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by    UUID REFERENCES auth_users(id),
  acknowledged_at    TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ew_flags_section_status ON early_warning_flags(section_id, status);
CREATE INDEX IF NOT EXISTS idx_ew_flags_institution    ON early_warning_flags(institution_id, status, severity);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE section_outcomes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_flags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON section_outcomes
    USING (institution_id = current_institution_id())
    WITH CHECK (institution_id = current_institution_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY super_admin_all ON section_outcomes
    USING (current_role() = 'super_admin')
    WITH CHECK (current_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON early_warning_flags
    USING (institution_id = current_institution_id())
    WITH CHECK (institution_id = current_institution_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY super_admin_all ON early_warning_flags
    USING (current_role() = 'super_admin')
    WITH CHECK (current_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Verify:
--   SELECT unnest(enum_range(NULL::warning_type));
--   \d section_outcomes
--   \d early_warning_flags
