// Real PostgreSQL semantics via PGlite for the batched dashboard reads.
//
// The API now asks for "the newest row per section / scenario section /
// scenario" in a single DISTINCT ON statement, and for the FSLSM poles as
// COUNT(*) FILTER aggregates, instead of looping a query per row. Those shapes
// are only checked by the Python unit tests at the statement-count level — the
// SQL itself never runs there, because the suite has no database.
//
// This file runs the real statements against real Postgres: the DISTINCT ON
// ordering, the enum casts, and the index support the migration adds.
// No network, credentials or production database are used.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sqlFile = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

const institution = randomUUID();
const department = randomUUID();
const course = randomUUID();
const term = randomUUID();
const teacher = randomUUID();
const actor = randomUUID();
const teacherUser = randomUUID();
const sectionA = randomUUID();
const sectionB = randomUUID();
const sectionC = randomUUID();
const scenario = randomUUID();
const scenSectionA = randomUUID();
const scenSectionB = randomUUID();

// Oldest first, so "newest wins" is a real assertion rather than insert order.
const ts = (minutes) => new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString();

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
  for (const file of [
    "schema.sql",
    "migration_institution_admin.sql",
    "auth_trigger.sql",
    "migrations/2026-09-04_early_warning.sql",
    "migrations/2026-10-25_browser_read_only.sql",
    "migrations/2026-10-26_ingestion_scope.sql",
    "migrations/2026-11-07_simulation_read_indexes.sql",
  ]) {
    await db.exec(await sqlFile(file));
  }

  await db.query("INSERT INTO institutions(id,name,slug) VALUES ($1,'Test','test')", [institution]);
  await db.query("INSERT INTO departments(id,institution_id,name,code) VALUES ($1,$2,'Computing','CS')",
    [department, institution]);
  for (const [id, email, role] of [
    [actor, "admin@example.test", "institution_admin"],
    [teacherUser, "ada@example.test", "teacher"],
  ]) {
    await db.query(`INSERT INTO auth.users(id,email,raw_app_meta_data)
      VALUES ($1,$2,$3)`,
      [id, email, JSON.stringify({ institution_id: institution, role })]);
  }
  await db.query("INSERT INTO courses(id,institution_id,department_id,code,name) VALUES ($1,$2,$3,'CS101','Intro')",
    [course, institution, department]);
  await db.query(`INSERT INTO academic_terms(id,institution_id,name,starts_on,ends_on,is_active)
    VALUES ($1,$2,'Fall 2026','2026-09-01','2026-12-31',true)`, [term, institution]);
  await db.query(`INSERT INTO teachers(id,institution_id,department_id,full_name,email,auth_user_id)
    VALUES ($1,$2,$3,'Ada','ada@example.test',$4)`,
    [teacher, institution, department, teacherUser]);

  for (const [id, label] of [[sectionA, "A"], [sectionB, "B"], [sectionC, "C"]]) {
    await db.query(`INSERT INTO sections(id,institution_id,course_id,academic_term_id,label,teacher_id,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, institution, course, term, label, teacher, actor]);
  }
  await db.query(`INSERT INTO scenarios(id,institution_id,department_id,academic_term_id,name,created_by,status)
    VALUES ($1,$2,$3,$4,'What-if',$5,'simulated')`, [scenario, institution, department, term, actor]);
  for (const [id, label] of [[scenSectionA, "A"], [scenSectionB, "B"]]) {
    await db.query(`INSERT INTO scenario_sections(id,scenario_id,course_id,teacher_id,label)
      VALUES ($1,$2,$3,$4,$5)`, [id, scenario, course, teacher, label]);
  }

  const config = randomUUID();
  await db.query("INSERT INTO scoring_configs(id,name,version,weights) VALUES ($1,'Global','1','{}')", [config]);

  // Two successful runs for the scenario, and one live run. The later run must
  // win every "latest" query below.
  const runOld = randomUUID(), runNew = randomUUID(), runLive = randomUUID();
  for (const [id, scenarioId, sectionId, at, status] of [
    [runOld, scenario, null, ts(10), "succeeded"],
    [runNew, scenario, null, ts(40), "succeeded"],
    [runLive, null, sectionA, ts(20), "succeeded"],
  ]) {
    await db.query(`INSERT INTO simulation_runs
      (id,institution_id,scenario_id,section_id,scoring_config_id,engine_version,status,finished_at,triggered_by,created_at)
      VALUES ($1,$2,$3,$4,$5,'v1',$6,$7,$8,$7)`,
      [id, institution, scenarioId, sectionId, config, status, at, actor]);
  }

  // section A: two results, newest scoring 90. section B: one. section C: none.
  const resOld = randomUUID(), resNew = randomUUID(), resB = randomUUID();
  const resScenA1 = randomUUID(), resScenA2 = randomUUID(), resScenB = randomUUID();
  for (const [id, runId, sectionId, scenSectionId, score, at] of [
    [resOld, runLive, sectionA, null, 50, ts(20)],
    [resNew, runLive, sectionA, null, 90, ts(30)],
    [resB, runLive, sectionB, null, 70, ts(25)],
    [resScenA1, runOld, null, scenSectionA, 40, ts(10)],
    [resScenA2, runNew, null, scenSectionA, 80, ts(40)],
    [resScenB, runNew, null, scenSectionB, 60, ts(40)],
  ]) {
    await db.query(`INSERT INTO simulation_results
      (id,simulation_run_id,section_id,scenario_section_id,compatibility_score,
       predicted_outcome,social_graph_impact,style_distribution,recommended_teacher_id,created_at)
      VALUES ($1,$2,$3,$4,$5,'high','supportive','{}',$6,$7)`,
      [id, runId, sectionId, scenSectionId, score, teacher, at]);
  }
  for (const [resultId, name, score] of [
    [resNew, "style_alignment", 90],
    [resNew, "participation", 70],
    [resOld, "style_alignment", 50],
  ]) {
    await db.query(`INSERT INTO simulation_result_factors
      (simulation_result_id,factor_name,score,weight,impact)
      VALUES ($1,$2,$3,0.25,'positive')`, [resultId, name, score]);
  }

  // Four current FSLSM profiles, one belonging to a soft-deleted student.
  const instrument = randomUUID();
  await db.query("INSERT INTO survey_instruments(id,name,version,total_questions) VALUES ($1,'ILS','1',44)",
    [instrument]);
  for (const [name, ar, si, vv, sg, deleted] of [
    ["S1", 5, 5, 5, 5, false],
    ["S2", -3, 7, -1, 3, false],
    ["S3", 1, -9, 1, -5, false],
    ["S4", 7, 7, 7, 7, true],
  ]) {
    const student = randomUUID();
    await db.query("INSERT INTO students(id,institution_id,department_id,full_name) VALUES ($1,$2,$3,$4)",
      [student, institution, department, name]);
    if (deleted) {
      await db.query("UPDATE students SET deleted_at=now() WHERE id=$1", [student]);
    }
    const resp = randomUUID();
    await db.query(`INSERT INTO survey_responses
      (id,institution_id,student_id,instrument_id,submitted_at,source)
      VALUES ($1,$2,$3,$4,now(),'manual_admin')`, [resp, institution, student, instrument]);
    await db.query(`INSERT INTO student_profiles
      (institution_id,student_id,derived_from_response_id,version,is_current,scoring_engine_version,
       active_reflective_score,sensing_intuitive_score,visual_verbal_score,sequential_global_score)
      VALUES ($1,$2,$3,1,true,'v1',$4,$5,$6,$7)`,
      [institution, student, resp, ar, si, vv, sg]);
  }
});

after(async () => { await db.close(); });

// ── the DISTINCT ON families ────────────────────────────────────────────────

test("latest result per live section comes back newest-first, one row each", async () => {
  // repositories/sections.latest_results_for_sections
  const { rows } = await db.query(`
    SELECT DISTINCT ON (simulation_results.section_id)
           simulation_results.section_id, simulation_results.compatibility_score
    FROM simulation_results
    LEFT OUTER JOIN teachers ON teachers.id = simulation_results.recommended_teacher_id
    WHERE simulation_results.section_id IN ($1,$2,$3)
    ORDER BY simulation_results.section_id, simulation_results.created_at DESC
  `, [sectionA, sectionB, sectionC]);

  const byId = new Map(rows.map((r) => [r.section_id, r.compatibility_score]));
  assert.equal(rows.length, 2, "section C has no result and must be absent");
  assert.equal(byId.get(sectionA), 90, "the 90 at ts(30) must beat the 50 at ts(20)");
  assert.equal(byId.get(sectionB), 70);
  assert.equal(byId.has(sectionC), false);
});

test("latest prediction per section selects columns it does not order by", async () => {
  // early_warning_service.latest_predictions — created_at is in ORDER BY only,
  // which Postgres allows for DISTINCT ON but rejects for plain DISTINCT.
  const { rows } = await db.query(`
    SELECT DISTINCT ON (simulation_results.section_id)
           simulation_results.section_id, simulation_results.predicted_outcome,
           simulation_results.compatibility_score
    FROM simulation_results
    WHERE simulation_results.section_id IN ($1,$2)
    ORDER BY simulation_results.section_id, simulation_results.created_at DESC
  `, [sectionA, sectionB]);

  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.section_id === sectionA).compatibility_score, 90);
  assert.equal(rows.find((r) => r.section_id === sectionA).predicted_outcome, "high");
});

test("latest result per scenario section keys on the scenario column", async () => {
  // repositories/scenarios.latest_results_for_scenario_sections
  const { rows } = await db.query(`
    SELECT DISTINCT ON (simulation_results.scenario_section_id)
           simulation_results.id, simulation_results.scenario_section_id,
           simulation_results.compatibility_score
    FROM simulation_results
    LEFT OUTER JOIN teachers ON teachers.id = simulation_results.recommended_teacher_id
    WHERE simulation_results.scenario_section_id IN ($1,$2)
    ORDER BY simulation_results.scenario_section_id, simulation_results.created_at DESC
  `, [scenSectionA, scenSectionB]);

  const byId = new Map(rows.map((r) => [r.scenario_section_id, r.compatibility_score]));
  assert.equal(byId.get(scenSectionA), 80, "the 80 at ts(40) must beat the 40 at ts(10)");
  assert.equal(byId.get(scenSectionB), 60);

  // and the factor rows for those results fetch in one IN (...)
  const ids = rows.map((r) => r.id);
  const factors = await db.query(`
    SELECT simulation_result_id, factor_name FROM simulation_result_factors
    WHERE simulation_result_id = ANY($1::uuid[]) ORDER BY factor_name
  `, [ids]);
  assert.equal(factors.rows.length, 0, "scenario results in this fixture have no factors");
});

test("factors for several results group by their own result", async () => {
  const { rows } = await db.query(`
    SELECT DISTINCT ON (section_id) id FROM simulation_results
    WHERE section_id IN ($1,$2) ORDER BY section_id, created_at DESC
  `, [sectionA, sectionB]);
  const { rows: factors } = await db.query(`
    SELECT simulation_result_id, factor_name FROM simulation_result_factors
    WHERE simulation_result_id = ANY($1::uuid[])
    ORDER BY factor_name
  `, [rows.map((r) => r.id)]);

  // only the newest section-A result's factors, in factor_name order
  assert.deepEqual(factors.map((f) => f.factor_name), ["participation", "style_alignment"]);
});

test("scenario scores average over the latest result per section", async () => {
  // repositories/scenarios.latest_scores_by_scenario
  const { rows } = await db.query(`
    SELECT scenario_sections.scenario_id, simulation_results.compatibility_score
    FROM simulation_results
    JOIN scenario_sections ON scenario_sections.id = simulation_results.scenario_section_id
    WHERE scenario_sections.scenario_id IN ($1)
    ORDER BY simulation_results.scenario_section_id, simulation_results.created_at DESC
  `, [scenario]);
  assert.ok(rows.length >= 2);

  const { rows: distinct } = await db.query(`
    SELECT DISTINCT ON (simulation_results.scenario_section_id)
           scenario_sections.scenario_id, simulation_results.compatibility_score
    FROM simulation_results
    JOIN scenario_sections ON scenario_sections.id = simulation_results.scenario_section_id
    WHERE scenario_sections.scenario_id IN ($1)
    ORDER BY simulation_results.scenario_section_id, simulation_results.created_at DESC
  `, [scenario]);

  const scores = distinct.map((r) => r.compatibility_score).sort((a, b) => a - b);
  // 80 (newest for A, not 40) and 60 for B → mean 70, which is what the list shows
  assert.deepEqual(scores, [60, 80]);
  assert.equal(scores.reduce((a, b) => a + b, 0) / scores.length, 70);
});

test("last successful run per scenario picks the newest", async () => {
  // repositories/scenarios.last_simulated_at_by_scenario
  const { rows } = await db.query(`
    SELECT DISTINCT ON (scenario_id) scenario_id, finished_at
    FROM simulation_runs
    WHERE scenario_id IN ($1) AND status = 'succeeded'
    ORDER BY scenario_id, created_at DESC
  `, [scenario]);
  assert.equal(rows.length, 1);
  assert.equal(new Date(rows[0].finished_at).toISOString(), ts(40));
});

// ── the FILTER aggregate ────────────────────────────────────────────────────

test("FSLSM poles come back as one row of FILTER aggregates", async () => {
  // repositories/analytics.fslsm_distribution
  const { rows } = await db.query(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE student_profiles.active_reflective_score > 0) AS ar_a,
           count(*) FILTER (WHERE student_profiles.active_reflective_score < 0) AS ar_b,
           count(*) FILTER (WHERE student_profiles.sensing_intuitive_score > 0) AS si_a,
           count(*) FILTER (WHERE student_profiles.sensing_intuitive_score < 0) AS si_b
    FROM student_profiles
    JOIN students ON students.id = student_profiles.student_id
    WHERE student_profiles.institution_id = $1
      AND student_profiles.is_current IS true
      AND student_profiles.deleted_at IS NULL
      AND students.deleted_at IS NULL
  `, [institution]);

  const r = rows[0];
  // S4 is soft-deleted, so three profiles count: AR +5, -3, +1 and SI +5, +7, -9
  assert.equal(Number(r.total), 3);
  assert.equal(Number(r.ar_a), 2);
  assert.equal(Number(r.ar_b), 1);
  assert.equal(Number(r.si_a), 2);
  assert.equal(Number(r.si_b), 1);
});

test("the five top-line counts come back as one row of scalar subqueries", async () => {
  // repositories/analytics.institution_counts
  const { rows } = await db.query(`
    SELECT (SELECT count(*) FROM students
            WHERE institution_id = $1 AND deleted_at IS NULL) AS student_count,
           (SELECT count(*) FROM teachers
            WHERE institution_id = $1 AND deleted_at IS NULL) AS teacher_count,
           (SELECT count(*) FROM sections
            WHERE institution_id = $1 AND deleted_at IS NULL) AS section_count,
           (SELECT count(*) FROM simulation_results
            JOIN simulation_runs ON simulation_runs.id = simulation_results.simulation_run_id
            WHERE simulation_runs.institution_id = $1) AS simulation_count,
           (SELECT avg(compatibility_score) FROM simulation_results
            JOIN simulation_runs ON simulation_runs.id = simulation_results.simulation_run_id
            WHERE simulation_runs.institution_id = $1) AS avg_score
  `, [institution]);

  const r = rows[0];
  assert.equal(Number(r.student_count), 3, "the soft-deleted student is excluded");
  assert.equal(Number(r.teacher_count), 1);
  assert.equal(Number(r.section_count), 3);
  assert.equal(Number(r.simulation_count), 6);
  assert.ok(Number(r.avg_score) > 0);
});

test("per-department rollups group instead of querying each department", async () => {
  // repositories/analytics.departments_rollup — sections grouped via courses
  const { rows } = await db.query(`
    SELECT courses.department_id, count(*)
    FROM sections JOIN courses ON courses.id = sections.course_id
    WHERE sections.institution_id = $1 AND sections.deleted_at IS NULL
    GROUP BY courses.department_id
  `, [institution]);
  assert.deepEqual(rows.map((r) => [r.department_id, Number(r.count)]), [[department, 3]]);
});

// ── the migration's own effect ──────────────────────────────────────────────

test("the migration leaves exactly the indexes the batched reads need", async () => {
  const { rows } = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('simulation_results','simulation_runs')
    ORDER BY indexname
  `);
  const names = rows.map((r) => r.indexname);

  for (const wanted of [
    "idx_sim_results_section_recent",
    "idx_sim_results_scenario_sec_recent",
    "idx_sim_runs_scenario_recent",
    "idx_sim_runs_institution",
  ]) {
    assert.ok(names.includes(wanted), `${wanted} is missing: ${names.join(", ")}`);
  }
  // the single-column versions are leftmost prefixes of the composites above
  for (const gone of [
    "idx_sim_results_section",
    "idx_sim_results_scenario_sec",
    "idx_sim_runs_scenario",
  ]) {
    assert.ok(!names.includes(gone), `${gone} should have been dropped`);
  }
});

test("the migration is idempotent", async () => {
  const sql = await sqlFile("migrations/2026-11-07_simulation_read_indexes.sql");
  await db.exec(sql);
  await db.exec(sql);
  const { rows } = await db.query(`
    SELECT count(*)::int AS n FROM pg_indexes
    WHERE schemaname='public' AND indexname='idx_sim_results_section_recent'
  `);
  assert.equal(rows[0].n, 1);
});

test("the composite index backs the DISTINCT ON, and the IN form still sorts", async () => {
  // Tiny tables make Postgres prefer a seq scan, so force the index path to
  // show which plans the index order can actually serve.
  await db.exec("SET enable_seqscan = off");
  const explain = async (where, params) => {
    const { rows } = await db.query(`
      EXPLAIN SELECT DISTINCT ON (section_id) section_id, compatibility_score
      FROM simulation_results ${where}
      ORDER BY section_id, created_at DESC
    `, params);
    return rows.map((r) => r["QUERY PLAN"]).join("\n");
  };
  try {
    // The IN (...) form the batched readers use. A multi-value `= ANY` cannot
    // emit globally ordered rows, so a Sort stays above a bitmap scan — it just
    // sorts the requested sections now instead of growing with the table.
    const batched = await explain("WHERE section_id IN ($1,$2)", [sectionA, sectionB]);
    assert.match(batched, /idx_sim_results_section_recent/,
      `expected the composite index in:\n${batched}`);
    assert.match(batched, /\bSort\b/,
      `IN (...) is expected to still sort. If it now plans without one, update
       the migration comment and this assertion together:\n${batched}`);

    // A single key, and the unfiltered form, do get an ordered index scan.
    for (const [label, where, params] of [
      ["single key", "WHERE section_id = $1", [sectionA]],
      ["unfiltered", "", []],
    ]) {
      const plan = await explain(where, params);
      assert.match(plan, /Index Scan using idx_sim_results_section_recent/,
        `${label}: expected an ordered index scan in:\n${plan}`);
      assert.doesNotMatch(plan, /\bSort\b/,
        `${label}: the index order should remove the sort:\n${plan}`);
    }
  } finally {
    await db.exec("SET enable_seqscan = on");
  }
});
