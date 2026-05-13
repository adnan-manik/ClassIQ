-- ============================================================================
-- ClassIQ — Minimal Seed (1 institution + 1 department)
--
-- Run AFTER db/schema.sql and db/auth_trigger.sql.
--
-- This gives you the bare minimum needed to invite demo accounts via
-- Supabase Dashboard. After running this, copy the printed institution_id
-- into the user_metadata when creating users.
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
-- Next: create 3 demo accounts via Supabase Dashboard → Auth → Users → Invite
--
--   ┌─────────────────────────┬────────────────────────────┬─────────────┐
--   │ email                   │ user_metadata              │ → role      │
--   ├─────────────────────────┼────────────────────────────┼─────────────┤
--   │ admin@classiq.demo      │ { "institution_id": "...", │ super_admin │
--   │                         │   "role": "super_admin",   │             │
--   │                         │   "full_name": "Admin" }   │             │
--   ├─────────────────────────┼────────────────────────────┼─────────────┤
--   │ hod@classiq.demo        │ { ..., "role": "hod",      │ hod         │
--   │                         │   "full_name": "Dr. Imran"}│             │
--   ├─────────────────────────┼────────────────────────────┼─────────────┤
--   │ teacher@classiq.demo    │ { ..., "role": "teacher",  │ teacher     │
--   │                         │   "full_name": "Dr.Hassan"}│             │
--   └─────────────────────────┴────────────────────────────┴─────────────┘
--
-- Replace the "..." in institution_id with the UUID printed by the SELECT
-- above (00000000-0000-0000-0000-000000000001 if you used the default).
--
-- The trigger from db/auth_trigger.sql creates the matching public.auth_users
-- row automatically on invite.
--
-- For the teacher role, you'll also want to insert a teachers row that points
-- to the auth_users.id — handle that separately once the user is created.
-- ============================================================================
