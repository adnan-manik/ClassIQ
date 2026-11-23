// Survey forms migration: DDL, RLS and the peer-edge upsert the backend relies on.
// Real PostgreSQL semantics via PGlite; no network or live database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const tenantA = randomUUID(), tenantB = randomUUID();
const hod = randomUUID(), teacher = randomUUID(), hodB = randomUUID();
const sqlFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");
let formA, studentA1, studentA2, termA, submissionA;

async function provision(id, institution, role) {
  await db.query(`INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    VALUES ($1,$2,$3,$4)`, [id, `${id}@example.test`,
    JSON.stringify({ institution_id: institution, role }), JSON.stringify({ full_name: role })]);
}

async function asUser(id, work, role = "authenticated") {
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id ?? ""]);
    return await work();
  } finally {
    await db.exec("ROLLBACK;");
  }
}

// PGlite has no LISTEN/NOTIFY consumer; the trailing NOTIFY is harmless but
// keep the test independent of it.
const withoutNotify = (sql) => sql.replace(/^NOTIFY .*$/m, "");

before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text,
      raw_app_meta_data jsonb DEFAULT '{}', raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  `);
  for (const file of ["schema.sql", "migration_institution_admin.sql", "auth_trigger.sql",
    "migrations/2026-09-04_seed_ils_instrument.sql",
    "migrations/2026-09-04_early_warning.sql", "migrations/2026-10-25_browser_read_only.sql",
    "migrations/2026-10-26_ingestion_scope.sql"]) {
    await db.exec(await sqlFile(file));
  }
  const forms = withoutNotify(await sqlFile("migrations/2026-11-23_survey_forms.sql"));
  await db.exec(forms);
  await db.exec(forms); // safe to re-run

  await db.query("INSERT INTO institutions(id,name,slug) VALUES ($1,'A','a'),($2,'B','b')", [tenantA, tenantB]);
  await provision(hod, tenantA, "hod");
  await provision(teacher, tenantA, "teacher");
  await provision(hodB, tenantB, "hod");
  termA = (await db.query(`INSERT INTO academic_terms(institution_id,name,starts_on,ends_on,is_active)
    VALUES ($1,'Fall','2026-09-01','2026-12-31',true) RETURNING id`, [tenantA])).rows[0].id;
  [studentA1, studentA2] = (await db.query(`INSERT INTO students(institution_id,full_name)
    VALUES ($1,'Ada'),($1,'Ben') RETURNING id`, [tenantA])).rows.map((r) => r.id);
  formA = (await db.query(`INSERT INTO survey_forms(institution_id,academic_term_id,code,title)
    VALUES ($1,$2,'ABC234','Fall survey') RETURNING id`, [tenantA, termA])).rows[0].id;
  submissionA = (await db.query(`INSERT INTO survey_form_submissions(institution_id,form_id,student_id)
    VALUES ($1,$2,$3) RETURNING id`, [tenantA, formA, studentA1])).rows[0].id;
});

after(async () => { await db.close(); });

test("form codes are upper-case alphanumeric and unique", async () => {
  await assert.rejects(db.query(`INSERT INTO survey_forms(institution_id,code,title)
    VALUES ($1,'abc234','x')`, [tenantA]), /check/);
  await assert.rejects(db.query(`INSERT INTO survey_forms(institution_id,code,title)
    VALUES ($1,'ABC234','x')`, [tenantB]), /unique|duplicate/);
});

test("one live submission per student per form; voiding frees the slot", async () => {
  await assert.rejects(db.query(`INSERT INTO survey_form_submissions(institution_id,form_id,student_id)
    VALUES ($1,$2,$3)`, [tenantA, formA, studentA1]), /unique|duplicate/);
  await db.exec("BEGIN");
  await db.query("UPDATE survey_form_submissions SET voided_at=now() WHERE id=$1", [submissionA]);
  await db.query(`INSERT INTO survey_form_submissions(institution_id,form_id,student_id)
    VALUES ($1,$2,$3)`, [tenantA, formA, studentA1]);
  await db.exec("ROLLBACK");
});

test("revived peer edge: ON CONFLICT updates a soft-deleted row and keeps the label", async () => {
  await db.query(`INSERT INTO peer_relationships(institution_id,academic_term_id,from_student_id,
    to_student_id,type,strength,deleted_at) VALUES ($1,$2,$3,$4,'friend',2,now())`,
    [tenantA, termA, studentA1, studentA2]);
  await db.query(`INSERT INTO peer_relationships(institution_id,academic_term_id,from_student_id,
      to_student_id,type,strength,label,form_submission_id,source)
    VALUES ($1,$2,$3,$4,'friend',4,'Lab partner',$5,'survey')
    ON CONFLICT (academic_term_id,from_student_id,to_student_id,type)
    DO UPDATE SET strength=EXCLUDED.strength, label=EXCLUDED.label,
      form_submission_id=EXCLUDED.form_submission_id, source=EXCLUDED.source, deleted_at=NULL`,
    [tenantA, termA, studentA1, studentA2, submissionA]);
  const { rows } = await db.query(`SELECT strength,label,deleted_at,form_submission_id
    FROM peer_relationships WHERE from_student_id=$1`, [studentA1]);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].strength, rows[0].label, rows[0].deleted_at], [4, "Lab partner", null]);
  assert.equal(rows[0].form_submission_id, submissionA);
});

test("staff read their own tenant's forms and submissions only", async () => {
  const own = await asUser(hod, () => db.query("SELECT id FROM survey_forms"));
  assert.deepEqual(own.rows.map((r) => r.id), [formA]);
  const subs = await asUser(hod, () => db.query("SELECT id FROM survey_form_submissions"));
  assert.equal(subs.rows.length, 1);
  const other = await asUser(hodB, () => db.query("SELECT id FROM survey_forms"));
  assert.equal(other.rows.length, 0);
});

test("teachers cannot read forms or submissions (peer conflict answers)", async () => {
  const forms = await asUser(teacher, () => db.query("SELECT id FROM survey_forms"));
  const subs = await asUser(teacher, () => db.query("SELECT id FROM survey_form_submissions"));
  assert.equal(forms.rows.length + subs.rows.length, 0);
});

test("browsers cannot write, and anon cannot read", async () => {
  await assert.rejects(asUser(hod, () => db.query(`INSERT INTO survey_forms(institution_id,code,title)
    VALUES ($1,'ZZZ999','x')`, [tenantA])), /permission denied/);
  await assert.rejects(asUser(hod, () => db.query(
    "UPDATE survey_form_submissions SET voided_at=now()")), /permission denied/);
  await assert.rejects(asUser(null, () => db.query("SELECT id FROM survey_forms"), "anon"),
    /permission denied/);
  await assert.rejects(asUser(null, () => db.query("SELECT id FROM survey_form_submissions"), "anon"),
    /permission denied/);
});

test("ILS Q2 label now shows the sensing answer as A", async () => {
  const { rows } = await db.query(`SELECT question_text FROM survey_questions WHERE sequence_no=2`);
  assert.ok(rows.length >= 1);
  for (const r of rows) assert.match(r.question_text, /\(A\) realistic \/ \(B\) innovative/);
});
