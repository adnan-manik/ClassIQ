-- ============================================================================
-- ClassIQ — Minimal Seed (1 institution + 1 department)
--
-- Run AFTER db/schema.sql and db/auth_trigger.sql.
--
-- This gives you the bare minimum needed to invite demo accounts via
-- Supabase Dashboard. After running this, copy the printed institution_id
-- into trusted app_metadata when provisioning users through the Admin API.
-- ============================================================================

INSERT INTO institutions (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Muhammad Ali Jinnah University', 'maju')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO departments (id, institution_id, name, code)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Computer Science',
  'CS'
)
ON CONFLICT (institution_id, code) DO NOTHING;

INSERT INTO academic_terms (id, institution_id, name, starts_on, ends_on, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Fall 2026',
  '2026-09-01',
  '2027-01-31',
  true
)
ON CONFLICT (institution_id, name) DO NOTHING;

-- A fresh installation can simulate without loading fabricated demo results.
INSERT INTO scoring_configs (name, version, is_default, weights)
SELECT 'ClassIQ default', '1.0', true,
  '{"style_alignment":0.40,"social_cohesion":0.25,"class_balance":0.20,"participation":0.15}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM scoring_configs WHERE institution_id IS NULL AND is_default = true
);

-- Echo the IDs you'll need when inviting users
SELECT
  i.id   AS institution_id,
  i.slug AS institution_slug,
  d.id   AS cs_department_id,
  t.id   AS active_term_id
FROM institutions i
JOIN departments    d ON d.institution_id = i.id AND d.code = 'CS'
JOIN academic_terms t ON t.institution_id = i.id AND t.is_active
WHERE i.slug = 'maju';

-- ============================================================================
-- Next: create demo accounts using db/seed_users.mjs (development only).
--
-- Admin API payload:
--   app_metadata: { "institution_id": "<UUID printed above>", "role": "hod" }
--   user_metadata: { "full_name": "Dr. Imran" }
--
-- The trigger from db/auth_trigger.sql creates the matching public.auth_users
-- row on privileged account creation. For email delivery, the backend explicitly
-- invokes the invite endpoint after provisioning trusted app metadata.
--
-- For the teacher role, you'll also want to insert a teachers row that points
-- to the auth_users.id — handle that separately once the user is created.
-- ============================================================================
