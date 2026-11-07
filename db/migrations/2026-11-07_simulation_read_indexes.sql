-- Index support for the batched dashboard reads.
--
-- The analytics, sections, early-warning and scenario endpoints now ask for
-- "the newest row per section / per scenario section / per scenario" in one
-- statement:
--
--   SELECT DISTINCT ON (section_id) ...
--   WHERE section_id IN (...)
--   ORDER BY section_id, created_at DESC
--
-- What the composite indexes below actually buy, per EXPLAIN (see
-- db/tests/simulation_reads.test.mjs, which asserts these plans):
--
--   * they carry created_at, so the DISTINCT ON sort reads it from the index
--     instead of revisiting the heap for every candidate row;
--   * for a single key (WHERE section_id = $1) and for the unfiltered form,
--     the plan becomes an ordered Index Scan with NO sort at all.
--
-- They do NOT remove the sort for the IN (...) form the batched readers use:
-- a multi-value `= ANY` cannot emit globally ordered rows, so Postgres adds a
-- Sort above a Bitmap Index Scan. That sort is over the requested sections
-- only, which is the point — it no longer grows with the table.
--
-- simulation_runs.institution_id had no index at all, yet every institution
-- aggregate (top-line counts, score trend, per-department rollups) joins
-- simulation_results to simulation_runs and filters on it. That one is the
-- clearest win here.
--
-- The three dropped indexes are strict leftmost prefixes of the new composites,
-- so nothing loses coverage — including the ON DELETE CASCADE lookups from
-- sections, scenario_sections and scenarios. They only cost write time.
BEGIN;

-- Latest live-section result: repositories/sections.latest_results_for_sections,
-- early_warning_service.latest_predictions.
CREATE INDEX IF NOT EXISTS idx_sim_results_section_recent
  ON public.simulation_results (section_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_sim_results_section;

-- Latest scenario-section result: repositories/scenarios.
-- latest_results_for_scenario_sections and latest_scores_by_scenario.
CREATE INDEX IF NOT EXISTS idx_sim_results_scenario_sec_recent
  ON public.simulation_results (scenario_section_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_sim_results_scenario_sec;

-- Most recent successful run per scenario:
-- repositories/scenarios.last_simulated_at_by_scenario.
CREATE INDEX IF NOT EXISTS idx_sim_runs_scenario_recent
  ON public.simulation_runs (scenario_id, created_at DESC);
DROP INDEX IF EXISTS public.idx_sim_runs_scenario;

-- Tenant scoping for every simulation aggregate in repositories/analytics.
CREATE INDEX IF NOT EXISTS idx_sim_runs_institution
  ON public.simulation_runs (institution_id);

COMMIT;
