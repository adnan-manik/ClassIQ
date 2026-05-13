-- ============================================================================
-- ClassIQ — auth.users → public.auth_users trigger
--
-- Run AFTER db/schema.sql.
--
-- Purpose: when Supabase creates a row in auth.users (signup or admin invite),
-- automatically create the matching public.auth_users row so the rest of the
-- platform can look up role + institution scope.
--
-- For ClassIQ the institution must be assigned. Two flows:
--   (1) Invitation: super_admin invites a user with institution_id + role in
--       the invite metadata (user_metadata or app_metadata).
--   (2) Self-signup: the signup form passes institution_id and role.
--
-- The trigger reads `raw_user_meta_data` (user_metadata) for `institution_id`
-- and `role`. If either is missing, the trigger raises an error so we never
-- end up with orphaned auth.users rows.
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
  -- Pull from user_metadata; super_admin can override via app_metadata.
  v_institution_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'institution_id')::UUID,
    (NEW.raw_user_meta_data ->> 'institution_id')::UUID
  );

  v_role := COALESCE(
    (NEW.raw_app_meta_data ->> 'role')::user_role,
    (NEW.raw_user_meta_data ->> 'role')::user_role
  );

  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email
  );

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'ClassIQ: cannot create auth_users row — institution_id missing in user_metadata for auth.users.id=%', NEW.id;
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'ClassIQ: cannot create auth_users row — role missing in user_metadata for auth.users.id=%', NEW.id;
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
--     2. In Supabase Dashboard → Auth → Users → Invite,
--        attach raw_user_meta_data like
--          { "institution_id": "<uuid>", "role": "hod", "full_name": "Test" }
--     3. Confirm a public.auth_users row appears.
-- ============================================================================
