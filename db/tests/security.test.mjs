// Real PostgreSQL semantics via PGlite, with a minimal Supabase auth schema shim.
// No network, credentials, live accounts or production database are used.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const tenantA = randomUUID(), tenantB = randomUUID();
const admin = randomUUID(), teacher = randomUUID(), inactive = randomUUID();
const student = randomUUID(), superAdmin = randomUUID();
const sqlFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

async function provision(id, institution, role) {
  await db.query(`INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    VALUES ($1,$2,$3,$4)`, [id, `${id}@example.test`,
    JSON.stringify({ institution_id: institution, role }), JSON.stringify({ full_name: role })]);
}

async function asUser(id, work, role = "authenticated") {
  await db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id]);
    return await work();
  } finally {
    await db.exec("ROLLBACK;");
  }
}

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
    "migrations/2026-09-04_early_warning.sql", "migrations/2026-10-25_browser_read_only.sql",
    "migrations/2026-10-26_ingestion_scope.sql"]) {
    await db.exec(await sqlFile(file));
  }
  await db.query("INSERT INTO institutions(id,name,slug) VALUES ($1,'A','a'),($2,'B','b')", [tenantA, tenantB]);
  for (const [id, role] of [[admin, "institution_admin"], [teacher, "teacher"],
    [inactive, "hod"], [student, "student"], [superAdmin, "super_admin"]]) {
    await provision(id, tenantA, role);
  }
  await db.query("UPDATE auth_users SET is_active=false WHERE id=$1", [inactive]);
  await db.query("INSERT INTO students(institution_id,full_name) VALUES ($1,'A student'),($2,'B student')", [tenantA, tenantB]);
  await db.exec("INSERT INTO scoring_configs(name,version,weights) VALUES ('Global','1','{}')");
});

after(async () => { await db.close(); });

test("signup cannot grant itself a role or institution through user_metadata", async () => {
  await assert.rejects(db.query(`INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES ($1,'attacker@example.test',$2)`, [randomUUID(),
    JSON.stringify({ institution_id: tenantA, role: "super_admin" })]), /trusted app_metadata/);
});

test("trusted app_metadata overrides any conflicting user-controlled claims", async () => {
  const id = randomUUID();
  await db.query(`INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    VALUES ($1,'trusted@example.test',$2,$3)`, [id,
    JSON.stringify({ institution_id: tenantA, role: "teacher" }),
    JSON.stringify({ institution_id: tenantB, role: "super_admin" })]);
  const { rows } = await db.query("SELECT role,institution_id FROM auth_users WHERE id=$1", [id]);
  assert.deepEqual(rows, [{ role: "teacher", institution_id: tenantA }]);
});

test("tenant browser reads exclude foreign rows", async () => {
  await asUser(admin, async () => {
    const { rows } = await db.query("SELECT institution_id FROM students");
    assert.deepEqual(rows, [{ institution_id: tenantA }]);
  });
});

test("all 29 application tables deny browser mutations", async () => {
  const { rows } = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  assert.equal(rows.length, 29);
  for (const { tablename } of rows) {
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query(`SELECT
        has_table_privilege($1,$2,'INSERT') OR has_table_privilege($1,$2,'UPDATE')
        OR has_table_privilege($1,$2,'DELETE') OR has_table_privilege($1,$2,'TRUNCATE') AS can_write`,
      [role, `public.${tablename}`]);
      assert.equal(result.rows[0].can_write, false, `${role} can write ${tablename}`);
    }
  }
});

test("teacher cannot promote its own account", async () => {
  await assert.rejects(asUser(teacher, () => db.query(
    "UPDATE auth_users SET role='super_admin' WHERE id=$1", [teacher])), /permission denied/);
});

test("inactive users cannot read tenant or global data", async () => {
  await asUser(inactive, async () => {
    assert.equal((await db.query("SELECT * FROM students")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM scoring_configs")).rows.length, 0);
  });
});

test("future student-login role has no tenant data access", async () => {
  await asUser(student, async () => {
    assert.equal((await db.query("SELECT * FROM students")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM scoring_configs")).rows.length, 0);
  });
});

test("anonymous requests cannot read application tables", async () => {
  await assert.rejects(asUser(admin, () => db.query("SELECT * FROM students"), "anon"), /permission denied/);
});

test("super admins retain cross-tenant reads but browser writes are denied", async () => {
  await asUser(superAdmin, async () => {
    assert.equal((await db.query("SELECT * FROM students")).rows.length, 2);
  });
  await assert.rejects(asUser(superAdmin, () => db.query("DELETE FROM students")), /permission denied/);
});

test("security migration is idempotent", async () => {
  await db.exec(await sqlFile("migrations/2026-10-25_browser_read_only.sql"));
  await asUser(admin, async () => {
    assert.equal((await db.query("SELECT * FROM students")).rows.length, 1);
  });
});

test("survey identifiers are isolated per tenant and idempotent within a tenant", async () => {
  // Emulate an existing installation, then upgrade its old global constraint.
  await db.exec(`ALTER TABLE survey_responses DROP CONSTRAINT uq_survey_response_tenant_external;
    ALTER TABLE survey_responses ADD CONSTRAINT survey_responses_instrument_id_external_response_id_key
    UNIQUE (instrument_id,external_response_id);`);
  await db.exec(await sqlFile("migrations/2026-10-26_ingestion_scope.sql"));
  const instrument = randomUUID();
  await db.query(`INSERT INTO survey_instruments(id,name,version,total_questions)
    VALUES ($1,'ILS test','1',44)`, [instrument]);
  const insert = async (tenant) => {
    const { rows } = await db.query("SELECT id FROM students WHERE institution_id=$1 LIMIT 1", [tenant]);
    return db.query(`INSERT INTO survey_responses(institution_id,student_id,instrument_id,
      submitted_at,source,external_response_id) VALUES ($1,$2,$3,now(),'rdf_bulk_import','shared-id')`,
    [tenant, rows[0].id, instrument]);
  };
  await insert(tenantA);
  await insert(tenantB);
  await assert.rejects(insert(tenantA), /uq_survey_response_tenant_external/);
  await db.exec(await sqlFile("migrations/2026-10-26_ingestion_scope.sql"));
});

test("minimal seed provides exactly one reusable global default scoring config", async () => {
  await db.exec(await sqlFile("seed_minimal.sql"));
  await db.exec(await sqlFile("seed_minimal.sql"));
  const { rows } = await db.query("SELECT weights FROM scoring_configs WHERE institution_id IS NULL AND is_default=true");
  assert.deepEqual(rows, [{ weights: { style_alignment: 0.40, social_cohesion: 0.25,
    class_balance: 0.20, participation: 0.15 } }]);
});
