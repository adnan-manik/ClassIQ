-- Shareable survey forms: staff build a form (ILS + profiling + peer relations +
-- custom questions), students open it by code or link with no account.
--
-- Public submissions are written only by the FastAPI backend (which connects as
-- postgres). Browsers get staff-only SELECT, no writes, and nothing for anon.
-- Run after schema.sql and the earlier migrations. Safe to re-run.
BEGIN;

DO $$ BEGIN
  CREATE TYPE survey_form_status AS ENUM ('draft', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── survey_forms ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_forms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  -- Optional roster scope. Who may answer, and whom they may name as peers.
  department_id         UUID REFERENCES departments(id) ON DELETE SET NULL,
  section_id            UUID REFERENCES sections(id) ON DELETE SET NULL,
  academic_term_id      UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  code                  TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,12}$'),
  title                 TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description           TEXT,
  status                survey_form_status NOT NULL DEFAULT 'draft',
  include_ils           BOOLEAN NOT NULL DEFAULT true,
  ils_wording           TEXT NOT NULL DEFAULT 'rdf' CHECK (ils_wording IN ('rdf', 'standard')),
  collect_collaboration BOOLEAN NOT NULL DEFAULT true,
  collect_participation BOOLEAN NOT NULL DEFAULT true,
  collect_peers         BOOLEAN NOT NULL DEFAULT false,
  -- [{key, label, base_type: friend|study_partner|neutral|conflict, strength 1..5}]
  peer_options          JSONB NOT NULL DEFAULT '[]',
  max_peer_picks        SMALLINT NOT NULL DEFAULT 5 CHECK (max_peer_picks BETWEEN 0 AND 30),
  -- [{id, prompt, kind, options[], required, scale_max}]
  extra_questions       JSONB NOT NULL DEFAULT '[]',
  allow_new_students    BOOLEAN NOT NULL DEFAULT false,
  closes_at             TIMESTAMPTZ,
  created_by            UUID REFERENCES auth_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_survey_forms_institution ON survey_forms(institution_id, created_at DESC);

-- ─── survey_form_submissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_form_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  form_id             UUID NOT NULL REFERENCES survey_forms(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  survey_response_id  UUID REFERENCES survey_responses(id) ON DELETE SET NULL,
  student_profile_id  UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
  aux_profile_id      UUID REFERENCES student_aux_profiles(id) ON DELETE SET NULL,
  profile             JSONB NOT NULL DEFAULT '{}',   -- collaboration_pref, participation_level
  peers               JSONB NOT NULL DEFAULT '[]',   -- [{student_id, option}] as answered
  extra_answers       JSONB NOT NULL DEFAULT '{}',   -- {question_id: value}
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at           TIMESTAMPTZ,
  voided_by           UUID REFERENCES auth_users(id)
);
-- One live submission per student per form; a voided one frees the slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_submission_student
  ON survey_form_submissions(form_id, student_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON survey_form_submissions(form_id, submitted_at DESC);

-- ─── peer_relationships: keep the form's own wording and provenance ─────────
ALTER TABLE peer_relationships ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE peer_relationships ADD COLUMN IF NOT EXISTS form_submission_id UUID
  REFERENCES survey_form_submissions(id) ON DELETE SET NULL;

-- ─── ILS Q2 label order ─────────────────────────────────────────────────────
-- Q2 scores A as sensing. The stored text showed (A) innovative, an intuitive
-- trait; the standard ILS and this repo's code now show (A) realistic.
UPDATE survey_questions
SET question_text = replace(question_text, '(A) innovative / (B) realistic', '(A) realistic / (B) innovative')
WHERE sequence_no = 2 AND question_text LIKE '%(A) innovative / (B) realistic%';

-- ─── RLS: staff-only reads, no browser writes ───────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['survey_forms', 'survey_form_submissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR SELECT TO authenticated USING (institution_id = public.current_institution_id())', t);
    EXECUTE format('DROP POLICY IF EXISTS super_admin_all ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY super_admin_all ON public.%I FOR SELECT TO authenticated USING (public.get_current_role() = ''super_admin'')', t);
    -- Submissions hold peer conflict answers: teachers do not read them.
    EXECUTE format('DROP POLICY IF EXISTS active_staff ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY active_staff ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.get_current_role() IN (''super_admin'', ''institution_admin'', ''hod''))', t);
  END LOOP;
END $$;

COMMIT;

-- Let PostgREST (browser reads) pick up the new tables and columns.
NOTIFY pgrst, 'reload schema';
