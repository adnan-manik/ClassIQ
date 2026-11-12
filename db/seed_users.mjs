// Create 3 demo accounts via Supabase Auth Admin API.
// The auth.users → public.auth_users trigger picks up institution_id + role
// from trusted app_metadata and creates the matching public.auth_users row.
//
// Run:
//   SUPABASE_SECRET_KEY='sb_secret_…' node seed_users.mjs

const SUPABASE_URL = "https://lfvsppanrtwywvvqoiiq.supabase.co";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const INSTITUTION_ID = "00000000-0000-0000-0000-000000000001";

if (!SECRET_KEY) {
  console.error("Missing SUPABASE_SECRET_KEY env var.");
  process.exit(1);
}

const USERS = [
  {
    email: "admin@classiq.demo",
    password: "ClassIQ2026!",
    role: "super_admin",
    full_name: "Demo Super Admin",
  },
  {
    email: "hod@classiq.demo",
    password: "ClassIQ2026!",
    role: "hod",
    full_name: "Dr. Imran (Demo HoD)",
  },
  {
    email: "teacher@classiq.demo",
    password: "ClassIQ2026!",
    role: "teacher",
    full_name: "Dr. Hassan (Demo Teacher)",
  },
];

const headers = {
  apikey: SECRET_KEY,
  Authorization: `Bearer ${SECRET_KEY}`,
  "Content-Type": "application/json",
};

for (const u of USERS) {
  const body = {
    email: u.email,
    password: u.password,
    email_confirm: true,
    app_metadata: {
      institution_id: INSTITUTION_ID,
      role: u.role,
    },
    user_metadata: {
      full_name: u.full_name,
    },
  };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result = await res.json().catch(() => ({}));

  if (res.ok) {
    console.log(`✓ Created ${u.email}  (role: ${u.role}, id: ${result.id})`);
  } else if (result.code === "email_exists" || result.msg?.includes("already")) {
    console.log(`• Already exists: ${u.email}  (skipped)`);
  } else {
    console.error(`✗ Failed ${u.email}:`);
    console.error(`  status: ${res.status}`);
    console.error(`  body: ${JSON.stringify(result)}`);
  }
}

console.log("\nDemo accounts ready. Password for all three: ClassIQ2026!");
