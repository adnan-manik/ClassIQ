// Run pending SQL migrations against Supabase Postgres directly.
// Uses pg's config-object form so the password doesn't have to be URL-encoded.
//
// Usage:
//   PGPASSWORD=… node db/run_migrations.mjs
// or set the env var inline:
//   PGPASSWORD='…' node db/run_migrations.mjs db/auth_trigger.sql db/seed_minimal.sql

import { Client } from "pg";
import { readFile } from "node:fs/promises";

const FILES =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ["db/auth_trigger.sql", "db/seed_minimal.sql"];

// Using the Session Pooler (IPv4) — direct host db.<ref>.supabase.co is IPv6-only.
// Session pooler supports the DDL we need (CREATE FUNCTION, CREATE TRIGGER).
const client = new Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "postgres.lfvsppanrtwywvvqoiiq",
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

console.log("Connecting to Supabase Postgres…");
await client.connect();
console.log("✓ Connected.\n");

for (const file of FILES) {
  console.log(`─── Running ${file} ───`);
  const sql = await readFile(file, "utf8");
  try {
    const result = await client.query(sql);
    if (Array.isArray(result)) {
      console.log(`✓ ${result.length} statement(s) executed.`);
      // Echo any SELECT output from the last statement
      const last = result[result.length - 1];
      if (last?.rows?.length) {
        console.log("  rows returned:");
        console.table(last.rows);
      }
    } else {
      console.log(
        `✓ command: ${result.command ?? "OK"}${
          result.rowCount != null ? ` (${result.rowCount} rows)` : ""
        }`,
      );
      if (result.rows?.length) {
        console.log("  rows returned:");
        console.table(result.rows);
      }
    }
  } catch (err) {
    console.error(`✗ FAILED on ${file}`);
    console.error(`  ${err.message}`);
    if (err.position) console.error(`  at SQL position ${err.position}`);
    if (err.detail) console.error(`  detail: ${err.detail}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    await client.end();
    process.exit(1);
  }
  console.log();
}

await client.end();
console.log("✓ All migrations applied cleanly.");
