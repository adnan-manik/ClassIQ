-- Browser clients read through RLS; all mutations go through the audited API.
-- Run after schema.sql and the earlier migrations. Safe to re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.current_institution_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institution_id FROM public.auth_users
  WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_current_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.auth_users
  WHERE id = auth.uid() AND is_active = true;
$$;

DO $$
DECLARE
  table_name text;
  policy_row record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'institutions', 'departments', 'auth_users', 'academic_terms',
    'survey_instruments', 'survey_questions', 'courses', 'students', 'teachers',
    'scoring_configs', 'ingestion_jobs', 'audit_logs', 'sections',
    'survey_responses', 'survey_answers', 'student_aux_profiles',
    'teacher_profiles', 'peer_relationships', 'scenarios', 'student_profiles',
    'simulation_runs', 'user_departments', 'section_students',
    'scenario_sections', 'scenario_section_students', 'simulation_results',
    'simulation_result_factors', 'section_outcomes', 'early_warning_flags'
  ] LOOP
    -- Limit the migration to ClassIQ's explicit table inventory.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    FOR policy_row IN
      SELECT policyname, qual FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND cmd = 'ALL'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        policy_row.policyname, table_name, policy_row.qual
      );
    END LOOP;
    -- Also protects global rows (NULL institution_id) from inactive accounts.
    EXECUTE format('DROP POLICY IF EXISTS active_account ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY active_account ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.get_current_role() IN (''super_admin'', ''institution_admin'', ''hod'', ''teacher''))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
