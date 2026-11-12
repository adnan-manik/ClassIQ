-- ============================================================================
-- ClassIQ — auth.users → public.auth_users trigger
--
-- Run AFTER db/schema.sql.
--
-- Purpose: when Supabase creates a row in auth.users (signup or admin invite),
-- automatically create the matching public.auth_users row so the rest of the
-- platform can look up role + institution scope.
--
-- Institution and role MUST be assigned by the backend Admin API using
-- app_metadata. User-editable signup metadata is never authorization data.
-- Self-signup without a provisioned tenant and role is rejected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id UUID;
  v_role           user_role;
  v_full_name      TEXT;
BEGIN
  v_institution_id := (NEW.raw_app_meta_data ->> 'institution_id')::UUID;
  v_role := (NEW.raw_app_meta_data ->> 'role')::user_role;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email
  );

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'ClassIQ: trusted app_metadata institution_id is required';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ClassIQ: trusted app_metadata role is required';
  END IF;

  INSERT INTO public.auth_users (id, institution_id, role, full_name, email)
  VALUES (NEW.id, v_institution_id, v_role, v_full_name, NEW.email);

  RETURN NEW;
END;
$$;

-- Drop & re-create cleanly so this script is idempotent
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- Notes:
--
-- • SECURITY DEFINER means the function runs with the privileges of the
--   function owner (typically `postgres`), bypassing RLS. This is required
--   because the inserting user (auth role) cannot directly write to
--   public.auth_users under RLS.
--
-- • For super_admin bootstrap (the very first user with no institution to
--   attach to), insert the institution row directly via SQL or the Supabase
--   dashboard, then create the super_admin user with that institution_id in
--   app_metadata. See db/seed_minimal.sql.
--
-- • To test:
--     1. Run db/seed_minimal.sql to create a default institution.
--     2. Use the Admin API to create a user with app_metadata containing
--        { "institution_id": "<uuid>", "role": "hod" } and user_metadata
--        containing only { "full_name": "Test" }.
--     3. Confirm a public.auth_users row appears.
-- ============================================================================
