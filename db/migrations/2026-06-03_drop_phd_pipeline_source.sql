-- Migration: remove 'phd_pipeline' from the response_source enum
-- Date: 2026-06-03
--
-- Context: there is no PhD app / external survey app. The phd_pipeline ingestion
-- source was merged into form_app (ClassIQ's own survey/form app). PostgreSQL
-- cannot drop a value from an enum in place, so we rename the old type, create
-- the trimmed type, convert every dependent column (remapping any existing
-- 'phd_pipeline' rows to 'form_app'), then drop the old type.
--
-- Dependent columns (neither has a default):
--   ingestion_jobs.source
--   survey_responses.source
--
-- Safe to run whether or not any rows currently use 'phd_pipeline' — the USING
-- CASE handles both cases. Idempotency: re-running after success is a no-op-error
-- (the old type no longer exists); run once.

BEGIN;

-- 1. Rename the current type out of the way.
ALTER TYPE response_source RENAME TO response_source_old;

-- 2. Create the new type without 'phd_pipeline'.
CREATE TYPE response_source AS ENUM (
  'rdf_bulk_import',
  'form_app',
  'classiq_internal',
  'manual_admin'
);

-- 3. Convert ingestion_jobs.source, remapping phd_pipeline -> form_app.
ALTER TABLE ingestion_jobs
  ALTER COLUMN source TYPE response_source
  USING (
    CASE source::text
      WHEN 'phd_pipeline' THEN 'form_app'
      ELSE source::text
    END
  )::response_source;

-- 4. Convert survey_responses.source, remapping phd_pipeline -> form_app.
ALTER TABLE survey_responses
  ALTER COLUMN source TYPE response_source
  USING (
    CASE source::text
      WHEN 'phd_pipeline' THEN 'form_app'
      ELSE source::text
    END
  )::response_source;

-- 5. Drop the old type (fails if any other object still references it — none should).
DROP TYPE response_source_old;

COMMIT;

-- Verify:
--   SELECT enum_range(NULL::response_source);
--     -> {rdf_bulk_import,form_app,classiq_internal,manual_admin}
--   SELECT source, count(*) FROM ingestion_jobs   GROUP BY source;
--   SELECT source, count(*) FROM survey_responses GROUP BY source;
