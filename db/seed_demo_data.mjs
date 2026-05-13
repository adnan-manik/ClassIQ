// Seed demo data for the HoD frontend.
//
// Creates 2 additional teacher auth-users (via Admin API) + inserts:
//   • 1 course (CS201)
//   • 3 teachers + teacher_profiles
//   • 12 students + student_profiles (FSLSM signed scores) + student_aux_profiles
//   • 2 sections + section_students (6 per section)
//   • 14 peer_relationships
//   • 1 scoring_config (default weights)
//   • 2 simulation_runs + simulation_results + factors (so /reports & /scenarios have data)
//
// Run:
//   SUPABASE_SECRET_KEY='sb_secret_…' PGPASSWORD='…' node seed_demo_data.mjs

import { Client } from "pg";

const SUPABASE_URL = "https://lfvsppanrtwywvvqoiiq.supabase.co";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const PGPASSWORD = process.env.PGPASSWORD;

if (!SECRET_KEY || !PGPASSWORD) {
  console.error("Missing SUPABASE_SECRET_KEY or PGPASSWORD env vars.");
  process.exit(1);
}

const INST = "00000000-0000-0000-0000-000000000001";
const DEPT = "00000000-0000-0000-0000-000000000010";
const TERM = "00000000-0000-0000-0000-000000000020";

const headers = {
  apikey: SECRET_KEY,
  Authorization: `Bearer ${SECRET_KEY}`,
  "Content-Type": "application/json",
};

// ─── 1. Ensure 3 teacher auth users exist ──────────────────────────────────
const TEACHER_USERS = [
  { email: "teacher@classiq.demo", full_name: "Dr. Amir Hassan" }, // already exists
  { email: "nadia.qureshi@classiq.demo", full_name: "Prof. Nadia Qureshi" },
  { email: "kamran.siddiqui@classiq.demo", full_name: "Dr. Kamran Siddiqui" },
];

for (const t of TEACHER_USERS.slice(1)) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: t.email,
      password: "ClassIQ2026!",
      email_confirm: true,
      user_metadata: {
        institution_id: INST,
        role: "teacher",
        full_name: t.full_name,
      },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (res.ok) console.log(`✓ Auth user created: ${t.email}`);
  else if (out.code === "email_exists" || out.msg?.includes("already"))
    console.log(`• Auth user exists: ${t.email}`);
  else console.error(`✗ Auth user failed: ${t.email}`, out);
}

// ─── 2. Connect to Postgres ────────────────────────────────────────────────
const client = new Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.lfvsppanrtwywvvqoiiq",
  password: PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log("\nConnected to Postgres.\n");

// ─── 3. Update teacher full_names that were auto-set to email by trigger ──
//      (Trigger uses email when full_name not set in metadata — we passed it
//       in metadata, but the trigger uses `raw_user_meta_data ->> 'full_name'`
//       which is read at INSERT time, so it should already be correct.
//       Belt-and-braces: re-sync from metadata into auth_users.)
await client.query(`
  UPDATE public.auth_users a
  SET full_name = COALESCE(au.raw_user_meta_data->>'full_name', a.full_name)
  FROM auth.users au
  WHERE au.id = a.id
    AND a.email IN ('teacher@classiq.demo', 'nadia.qureshi@classiq.demo', 'kamran.siddiqui@classiq.demo');
`);

// ─── 4. Fetch teacher auth_user_ids ────────────────────────────────────────
const { rows: teacherUsers } = await client.query(
  `SELECT id, email FROM public.auth_users WHERE email = ANY($1::text[]) ORDER BY email`,
  [TEACHER_USERS.map((t) => t.email)],
);
const teacherIdByEmail = Object.fromEntries(
  teacherUsers.map((r) => [r.email, r.id]),
);

// ─── 5. Course ─────────────────────────────────────────────────────────────
const COURSE_ID = "00000000-0000-0000-0000-000000000100";
await client.query(
  `INSERT INTO courses (id, institution_id, department_id, code, name)
     VALUES ($1, $2, $3, 'CS201', 'Data Structures')
     ON CONFLICT (department_id, code) DO NOTHING;`,
  [COURSE_ID, INST, DEPT],
);

// ─── 6. Teachers + teacher_profiles ────────────────────────────────────────
const TEACHERS = [
  {
    id: "00000000-0000-0000-0000-000000000201",
    auth_email: "teacher@classiq.demo",
    full_name: "Dr. Amir Hassan",
    email: "amir.hassan@maju.edu",
    teaching_style: "Interactive / Discussion-Based",
    interaction_level: "high",
    pacing: "moderate",
    approach: "Uses group activities, case studies, and Socratic questioning.",
  },
  {
    id: "00000000-0000-0000-0000-000000000202",
    auth_email: "nadia.qureshi@classiq.demo",
    full_name: "Prof. Nadia Qureshi",
    email: "nadia.qureshi@maju.edu",
    teaching_style: "Lecture-Heavy / Visual",
    interaction_level: "medium",
    pacing: "fast",
    approach: "Relies on structured slides, diagrams, and demonstrations.",
  },
  {
    id: "00000000-0000-0000-0000-000000000203",
    auth_email: "kamran.siddiqui@classiq.demo",
    full_name: "Dr. Kamran Siddiqui",
    email: "kamran.siddiqui@maju.edu",
    teaching_style: "Hands-On / Lab-Oriented",
    interaction_level: "high",
    pacing: "slow",
    approach: "Emphasizes practical exercises, coding labs, and experimentation.",
  },
];

for (const t of TEACHERS) {
  const authId = teacherIdByEmail[t.auth_email];
  if (!authId) {
    console.error(`! Skipping ${t.full_name} — auth_user missing.`);
    continue;
  }
  await client.query(
    `INSERT INTO teachers (id, institution_id, department_id, full_name, email, auth_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (institution_id, email) DO UPDATE SET full_name = EXCLUDED.full_name;`,
    [t.id, INST, DEPT, t.full_name, t.email, authId],
  );
  await client.query(
    `INSERT INTO teacher_profiles (institution_id, teacher_id, version, is_current,
                                    teaching_style, interaction_level, pacing, approach)
       VALUES ($1, $2, 1, true, $3, $4, $5, $6)
       ON CONFLICT (teacher_id, version) DO NOTHING;`,
    [INST, t.id, t.teaching_style, t.interaction_level, t.pacing, t.approach],
  );
}
console.log(`✓ ${TEACHERS.length} teachers seeded.`);

// ─── 7. Students + profiles ────────────────────────────────────────────────
// FSLSM scores: odd integers in [-11, +11].
// Sign: positive = pole A (active / sensing / visual / sequential)
//       negative = pole B (reflective / intuitive / verbal / global)
// Each student gets a stable UUID for idempotent reseeding.
const STUDENTS = [
  { id: "00000000-0000-0000-0000-000000000301", name: "Ahmed Khan",   ext: "SP23-BSCS-101", ar:  7, si: -3, vv:  9, sg:  1, dom: "visual_verbal",    pref: "group", part: "high"   },
  { id: "00000000-0000-0000-0000-000000000302", name: "Sara Ali",     ext: "SP23-BSCS-102", ar:  1, si:  5, vv: -7, sg: -3, dom: "visual_verbal",    pref: "pair",  part: "medium" },
  { id: "00000000-0000-0000-0000-000000000303", name: "Bilal Ahmed",  ext: "SP23-BSCS-103", ar: -5, si:  3, vv: -9, sg:  5, dom: "visual_verbal",    pref: "solo",  part: "low"    },
  { id: "00000000-0000-0000-0000-000000000304", name: "Fatima Noor",  ext: "SP23-BSCS-104", ar:  9, si:  7, vv:  3, sg: -5, dom: "active_reflective",pref: "group", part: "high"   },
  { id: "00000000-0000-0000-0000-000000000305", name: "Usman Tariq",  ext: "SP23-BSCS-105", ar:  3, si: -1, vv:  5, sg:  3, dom: "visual_verbal",    pref: "pair",  part: "medium" },
  { id: "00000000-0000-0000-0000-000000000306", name: "Ayesha Malik", ext: "SP23-BSCS-106", ar: -3, si:  9, vv: -5, sg: -1, dom: "sensing_intuitive",pref: "solo",  part: "medium" },
  { id: "00000000-0000-0000-0000-000000000307", name: "Hassan Raza",  ext: "SP23-BSCS-107", ar:  9, si:  5, vv:  1, sg:  7, dom: "active_reflective",pref: "group", part: "high"   },
  { id: "00000000-0000-0000-0000-000000000308", name: "Zainab Shah",  ext: "SP23-BSCS-108", ar:  1, si: -3, vv:  9, sg: -1, dom: "visual_verbal",    pref: "pair",  part: "medium" },
  { id: "00000000-0000-0000-0000-000000000309", name: "Omar Farooq",  ext: "SP23-BSCS-109", ar: 11, si:  3, vv: -3, sg:  5, dom: "active_reflective",pref: "group", part: "high"   },
  { id: "00000000-0000-0000-0000-000000000310", name: "Hira Butt",    ext: "SP23-BSCS-110", ar:  5, si:  7, vv:  1, sg: -7, dom: "sequential_global",pref: "pair",  part: "medium" },
  { id: "00000000-0000-0000-0000-000000000311", name: "Danish Iqbal", ext: "SP23-BSCS-111", ar: -7, si: -1, vv:  5, sg:  1, dom: "active_reflective",pref: "solo",  part: "low"    },
  { id: "00000000-0000-0000-0000-000000000312", name: "Maryam Javed", ext: "SP23-BSCS-112", ar:  3, si:  5, vv: -7, sg:  3, dom: "visual_verbal",    pref: "pair",  part: "medium" },
];

// Map "last-3-digits" → student UUID (used by the peer-relationships table at the bottom).
const studentUuid = (lastThree) =>
  STUDENTS.find((s) => s.id.endsWith(lastThree))?.id ??
  (() => { throw new Error(`No student with suffix ${lastThree}`); })();

// We'll need a fake survey_response row for derived_from_response_id FK.
// Insert a default survey_instrument first (FK target).
const INSTRUMENT_ID = "00000000-0000-0000-0000-000000000400";
await client.query(
  `INSERT INTO survey_instruments (id, name, version, total_questions, is_published)
     VALUES ($1, 'FSLSM-ILS-Algorithms', '27Jan24', 44, true)
     ON CONFLICT (name, version) DO NOTHING;`,
  [INSTRUMENT_ID],
);

for (const s of STUDENTS) {
  const studentId = s.id;
  await client.query(
    `INSERT INTO students (id, institution_id, department_id, external_id, full_name, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (institution_id, external_id) DO UPDATE SET full_name = EXCLUDED.full_name;`,
    [studentId, INST, DEPT, s.ext, s.name, `${s.ext.toLowerCase()}@maju.edu`],
  );

  // Survey response (one per student for demo) — derive a stable UUID from student
  const responseId = s.id.slice(0, -3) + "9" + s.id.slice(-2);
  await client.query(
    `INSERT INTO survey_responses (id, institution_id, student_id, instrument_id, academic_term_id,
                                    submitted_at, source, external_response_id)
       VALUES ($1, $2, $3, $4, $5, now(), 'manual_admin', $6)
       ON CONFLICT (instrument_id, external_response_id) DO NOTHING;`,
    [responseId, INST, studentId, INSTRUMENT_ID, TERM, `seed-${s.ext}`],
  );

  // Student profile (FSLSM scores)
  // Set all other versions to not current first
  await client.query(
    `UPDATE student_profiles SET is_current = false WHERE student_id = $1;`,
    [studentId],
  );
  await client.query(
    `INSERT INTO student_profiles (institution_id, student_id, derived_from_response_id, version,
                                    is_current, scoring_engine_version,
                                    active_reflective_score, sensing_intuitive_score,
                                    visual_verbal_score, sequential_global_score, dominant_axis)
       VALUES ($1, $2, $3, 1, true, '1.0.0-demo', $4, $5, $6, $7, $8)
       ON CONFLICT (student_id, version) DO UPDATE SET
         is_current = true,
         active_reflective_score = EXCLUDED.active_reflective_score,
         sensing_intuitive_score = EXCLUDED.sensing_intuitive_score,
         visual_verbal_score = EXCLUDED.visual_verbal_score,
         sequential_global_score = EXCLUDED.sequential_global_score,
         dominant_axis = EXCLUDED.dominant_axis;`,
    [INST, studentId, responseId, s.ar, s.si, s.vv, s.sg, s.dom],
  );

  // Aux profile
  await client.query(
    `UPDATE student_aux_profiles SET is_current = false
       WHERE student_id = $1 AND academic_term_id = $2;`,
    [studentId, TERM],
  );
  await client.query(
    `INSERT INTO student_aux_profiles (institution_id, student_id, academic_term_id,
                                        collaboration_pref, participation_level, is_current)
       VALUES ($1, $2, $3, $4, $5, true);`,
    [INST, studentId, TERM, s.pref, s.part],
  );
}
console.log(`✓ ${STUDENTS.length} students seeded with FSLSM profiles + aux profiles.`);

// ─── 8. Sections + section_students ────────────────────────────────────────
const SECTIONS = [
  {
    id: "00000000-0000-0000-0000-000000000501",
    teacher_id: TEACHERS[0].id,
    label: "A",
    state: "simulated",
    students: STUDENTS.slice(0, 6),
  },
  {
    id: "00000000-0000-0000-0000-000000000502",
    teacher_id: TEACHERS[1].id,
    label: "B",
    state: "simulated",
    students: STUDENTS.slice(6, 12),
  },
];

// Need an auth_user as `created_by` — use the HoD demo account
const { rows: hodRows } = await client.query(
  `SELECT id FROM auth_users WHERE email = 'hod@classiq.demo' LIMIT 1;`,
);
const HOD_ID = hodRows[0]?.id;
if (!HOD_ID) {
  console.error("! No HoD user found (hod@classiq.demo) — section.created_by will fail.");
  process.exit(1);
}

for (const sec of SECTIONS) {
  await client.query(
    `INSERT INTO sections (id, institution_id, course_id, academic_term_id,
                            teacher_id, label, state, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (course_id, academic_term_id, label) DO UPDATE SET teacher_id = EXCLUDED.teacher_id;`,
    [sec.id, INST, COURSE_ID, TERM, sec.teacher_id, sec.label, sec.state, HOD_ID],
  );
  for (const s of sec.students) {
    await client.query(
      `INSERT INTO section_students (section_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING;`,
      [sec.id, studentUuid(s.id)],
    );
  }
}
console.log(`✓ ${SECTIONS.length} sections seeded with enrolled students.`);

// ─── 9. Peer relationships ─────────────────────────────────────────────────
const EDGES = [
  ["301", "305", "friend",        4],
  ["301", "304", "study_partner", 5],
  ["302", "306", "friend",        3],
  ["302", "303", "study_partner", 4],
  ["303", "306", "study_partner", 5],
  ["304", "307", "friend",        4],
  ["304", "310", "study_partner", 3],
  ["305", "308", "friend",        3],
  ["307", "310", "friend",        5],
  ["309", "312", "study_partner", 4],
  ["311", "308", "study_partner", 3],
  ["301", "303", "conflict",      2],
  ["307", "311", "conflict",      3],
  ["309", "302", "neutral",       1],
];

await client.query(`DELETE FROM peer_relationships WHERE academic_term_id = $1;`, [TERM]);
for (const [a, b, type, strength] of EDGES) {
  await client.query(
    `INSERT INTO peer_relationships (institution_id, academic_term_id, from_student_id, to_student_id,
                                      type, strength, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'survey', $7);`,
    [
      INST,
      TERM,
      studentUuid(a),
      studentUuid(b),
      type,
      strength,
      HOD_ID,
    ],
  );
}
console.log(`✓ ${EDGES.length} peer relationships seeded.`);

// ─── 10. Scoring config + simulation runs/results/factors ──────────────────
const SCORING_ID = "00000000-0000-0000-0000-000000000700";
await client.query(
  `INSERT INTO scoring_configs (id, institution_id, name, version, is_default, weights, created_by)
     VALUES ($1, $2, 'Default', '1.0', true,
             '{"style_alignment":0.40,"social_cohesion":0.25,"class_balance":0.20,"participation":0.15}'::jsonb,
             $3)
     ON CONFLICT (institution_id, name, version) DO NOTHING;`,
  [SCORING_ID, INST, HOD_ID],
);

const SIM_RESULTS = [
  {
    runId:   "00000000-0000-0000-0000-000000000801",
    resultId:"00000000-0000-0000-0000-000000000901",
    sectionId: SECTIONS[0].id,
    score: 78,
    outcome: "high",
    socialImpact: "supportive",
    recommended: TEACHERS[0].id,
    factors: [
      { name: "Style Alignment",  score: 82, weight: 0.40, impact: "positive" },
      { name: "Social Cohesion",  score: 75, weight: 0.25, impact: "positive" },
      { name: "Class Balance",    score: 71, weight: 0.20, impact: "positive" },
      { name: "Participation Mix",score: 80, weight: 0.15, impact: "positive" },
    ],
    distribution: {
      active_reflective: { active: 65, reflective: 35 },
      sensing_intuitive: { sensing: 58, intuitive: 42 },
      visual_verbal:     { visual: 72, verbal: 28 },
      sequential_global: { sequential: 55, global: 45 },
    },
  },
  {
    runId:   "00000000-0000-0000-0000-000000000802",
    resultId:"00000000-0000-0000-0000-000000000902",
    sectionId: SECTIONS[1].id,
    score: 54,
    outcome: "medium",
    socialImpact: "neutral",
    recommended: TEACHERS[2].id, // Dr. Kamran (hands-on) would be a better fit
    factors: [
      { name: "Style Alignment",  score: 48, weight: 0.40, impact: "negative" },
      { name: "Social Cohesion",  score: 60, weight: 0.25, impact: "neutral"  },
      { name: "Class Balance",    score: 55, weight: 0.20, impact: "neutral"  },
      { name: "Participation Mix",score: 65, weight: 0.15, impact: "positive" },
    ],
    distribution: {
      active_reflective: { active: 78, reflective: 22 },
      sensing_intuitive: { sensing: 52, intuitive: 48 },
      visual_verbal:     { visual: 48, verbal: 52 },
      sequential_global: { sequential: 60, global: 40 },
    },
  },
];

await client.query(
  `DELETE FROM simulation_runs WHERE institution_id = $1;`,
  [INST],
);

for (const r of SIM_RESULTS) {
  await client.query(
    `INSERT INTO simulation_runs (id, institution_id, section_id, scoring_config_id,
                                   engine_version, status, started_at, finished_at, triggered_by)
       VALUES ($1, $2, $3, $4, '1.0.0-demo', 'succeeded', now() - interval '1 hour',
               now() - interval '59 minutes', $5);`,
    [r.runId, INST, r.sectionId, SCORING_ID, HOD_ID],
  );
  await client.query(
    `INSERT INTO simulation_results (id, simulation_run_id, section_id, compatibility_score,
                                      predicted_outcome, social_graph_impact, style_distribution,
                                      recommended_teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8);`,
    [
      r.resultId,
      r.runId,
      r.sectionId,
      r.score,
      r.outcome,
      r.socialImpact,
      JSON.stringify(r.distribution),
      r.recommended,
    ],
  );
  for (const f of r.factors) {
    await client.query(
      `INSERT INTO simulation_result_factors (simulation_result_id, factor_name, score, weight, impact)
         VALUES ($1, $2, $3, $4, $5);`,
      [r.resultId, f.name, f.score, f.weight, f.impact],
    );
  }
}
console.log(`✓ ${SIM_RESULTS.length} simulation runs + results + factors seeded.`);

// ─── Summary ───────────────────────────────────────────────────────────────
const { rows: counts } = await client.query(`
  SELECT
    (SELECT count(*) FROM teachers)            AS teachers,
    (SELECT count(*) FROM students)            AS students,
    (SELECT count(*) FROM student_profiles WHERE is_current) AS profiles,
    (SELECT count(*) FROM sections)            AS sections,
    (SELECT count(*) FROM section_students)    AS section_students,
    (SELECT count(*) FROM peer_relationships)  AS relationships,
    (SELECT count(*) FROM simulation_runs)     AS runs,
    (SELECT count(*) FROM simulation_results)  AS results,
    (SELECT count(*) FROM simulation_result_factors) AS factors;
`);
console.log("\nFinal counts:");
console.table(counts);

await client.end();
console.log("\n✓ Demo data ready.");
