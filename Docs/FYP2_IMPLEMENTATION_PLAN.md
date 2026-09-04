# ClassIQ — FYP-2 Implementation Plan

**Written:** 4 September 2026
**Basis:** `Docs/project.md` §7–§9, §18, §21 · `Docs/BACKEND_ARCHITECTURE.md` §4–§8, §11 ·
`Docs/DATA_MODEL.md` §10–§13 · `Docs/USE_CASE_DIAGRAM.md` · `Docs/tracker.html` (statuses
verified against the working tree, not copied from the plan).

This document turns the remaining items in the tracker into ordered build phases. Each
phase lists what is built, where it lives, and how it is verified. Items that only a human
can do (milestone demos, report writing, final presentation) are listed at the end so the
tracker stays honest.

---

## What remains (verified against code, 2026-09-04)

| Tracker item | Status before this plan | Evidence |
|---|---|---|
| Scenario comparison backend API (F5) | not started | no `backend/app/routers/scenarios.py`; `scenarios`, `scenario_sections`, `scenario_section_students` tables unused |
| What-if scenario testing UI (F5) | stub | `scenarios/page.tsx` renders a baseline; "New Scenario" has no handler |
| Survey data ingestion pipeline | partial | `ingestion_jobs` table exists; no `backend/app/ingestion/` package, no `/api/ingestion` route; the RDF file in the repo has 176 students × 44 answers |
| Institution analytics | partial | overview + trend endpoints exist; no department drill-down in the UI, no simulations-by-department endpoint |
| Course creation from the section builder | done, inconsistent | `sections/_actions.ts` inserts into `courses` directly, bypassing FastAPI and the audit log |
| Section lifecycle (`simulated → active → archived`) | missing | state machine in BACKEND_ARCHITECTURE §7 has no endpoint or button |
| `GET /api/reports/sections/{id}` | not built | spec §11 lists it; reports read Supabase directly |
| S1 Early warning | not started | no tables, no engine |
| S2 Natural-language query | deferred | `anthropic` commented out in `requirements.txt`; no `backend/app/llm/` |
| S3 Longitudinal analytics | not started | schema already supports it (versioned `student_profiles`) |
| Automated tests | not started | zero `test_*.py` / `*.test.ts*` files |

---

## Phase A — F5 What-If Scenarios (demo centrepiece)

**Goal:** an HoD composes one or more named scenarios (teacher + roster per course
section), runs the same scoring engine on every scenario section, compares each against
the live baseline side by side, and can apply a winning scenario to real sections.

**Backend**
- `models/scenario.py` — `Scenario`, `ScenarioSection`, `ScenarioSectionStudent`, `ScenarioStatus`.
- `schemas/scenarios.py` — create / update / list / detail / simulate / compare / apply shapes.
- `repositories/scenarios.py` — tenant-scoped CRUD; every referenced course, term, teacher, student is re-checked against the caller's `institution_id`.
- `services/compatibility_service.py` — extract `score_roster(...)` so sections and scenario sections share one code path (inputs loader + engine + recommendation).
- `services/scenario_service.py` — `simulate_scenario` (one `simulation_run` with `scenario_id`, one `simulation_result` per scenario section), `compare_scenario` (baseline = latest live result for the same course + term + label, deltas per factor), `apply_scenario` (copies scenario sections onto real sections, marks the scenario `applied`, audit-logged).
- `routers/scenarios.py` — `GET/POST /api/scenarios`, `GET/PATCH/DELETE /api/scenarios/{id}`, `POST /api/scenarios/{id}/simulate`, `GET /api/scenarios/{id}/compare`, `POST /api/scenarios/{id}/apply`, `POST /api/scenarios/from-section/{section_id}` (clone the current assignment as a starting point).

**Frontend**
- `lib/api.ts`, `lib/types.ts` — scenario client + shapes.
- `scenarios/page.tsx` (server) loads option lists from Supabase and scenarios/compare data from the backend; `scenarios/ScenariosView.tsx` (client) provides the builder modal, run button, side-by-side compare with factor deltas, and apply/delete actions.

**Verify:** `python -c "import app.main"`, pytest for the compare/delta helpers, `tsc --noEmit`, `eslint`.

---

## Phase B — Survey ingestion pipeline

**Goal:** the pipeline in BACKEND_ARCHITECTURE §5, source-agnostic and idempotent, able to
load the repo's RDF dump end to end and to accept ClassIQ's own survey submissions.

**Backend**
- `models/survey.py` — `SurveyInstrument`, `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer`.
- `ingestion/` — `types.py` (the internal `InternalResponse` shape), `rdf_parser.py` (OWL/RDF-XML: one `owl:NamedIndividual` per student, answers encoded as `A<n>`/`B<n>`), `csv_adapter.py` (`classiq_internal` exports: `external_id,full_name,email,q1..q44`), `form_app_adapter.py` (JSON submissions), `manual_admin_adapter.py`, `ils_instrument.py` (the 44-question ILS definition with axis + RDF property mapping, used to seed `survey_instruments`/`survey_questions` when absent).
- `services/ingestion_service.py` — job row → validate → upsert students → insert responses (idempotent on `external_response_id`) → 44 answers → FSLSM scorer → new `student_profiles` version with `is_current` flip → job summary.
- `routers/ingestion.py` — `POST /api/ingestion/rdf`, `POST /api/ingestion/csv` (both with `dry_run`), `POST /api/ingestion/form`, `POST /api/ingestion/manual`, `GET /api/ingestion/jobs`, `GET /api/ingestion/jobs/{id}`, `GET /api/ingestion/instrument`.
- `db/migrations/2026-09-04_seed_ils_instrument.sql` — idempotent seed of the instrument + 44 questions.

**Frontend**
- `/ingestion` page (HoD + institution admin): file upload with dry-run preview then commit, manual survey entry (44 A/B rows grouped by axis), job history with summaries.

**Verify:** pytest parses the real RDF file (176 responses, 44 answers each, odd scores in −11…+11); CSV and form adapters unit-tested; `tsc`, `eslint`.

---

## Phase C — Consistency and lifecycle gaps

- `routers/institution_courses.py` — `GET/POST /api/institution/courses` with audit; `sections/_actions.ts` switched to call it.
- Section lifecycle — `POST /api/sections/{id}/activate` (`simulated → active`) and `POST /api/sections/{id}/archive` (`active → archived`) per §7, with buttons in the Section Builder.
- `routers/reports.py` — `GET /api/reports/sections/{id}` (F6 payload per §11).
- Institution analytics — `GET /api/institution/analytics/simulations-by-department`, department drill-down selector on `/admin/analytics`.

---

## Phase D — Stretch goals (S3 → S1 → S2)

**S3 Longitudinal analytics** — `GET /api/students/{id}/profile-history`,
`GET /api/analytics/longitudinal` (per-term mean axis scores, students with ≥2 versions,
largest shifts); `/longitudinal` page with a Recharts timeline and a shift table; profile
history in the student detail panel.

**S1 Early warning** — migration `2026-09-04_early_warning.sql` adds `section_outcomes`
(actual attendance / grade / engagement per student per section, recorded weekly) and
`early_warning_flags` (type: engagement | performance | compatibility; severity: low |
medium | high; status: open | acknowledged | resolved) with RLS. `engines/early_warning.py`
is a pure comparator of predicted outcome vs actuals. Endpoints: record outcomes, list
outcomes, evaluate a section, list / acknowledge / resolve flags. Teachers record actuals
from their dashboard; HoDs see flags at `/early-warning`.

**S2 Natural-language query** — `anthropic` dependency enabled; `llm/client.py`
(backend-only key, cached system prompt, per-query token cap), `llm/context.py`
(tenant-scoped snapshot: sections + latest results + factors, teachers + profiles,
scenarios, FSLSM distribution — names only, no emails), `llm/prompts.py`;
`POST /api/llm/query`; `/ask` page for HoD and institution admin. Returns 503 cleanly when
no key is configured.

---

## Phase E — Automated tests

- Backend: `requirements-dev.txt` (pytest, pytest-asyncio); `tests/` covering the
  FSLSM scorer, scoring pipeline and factors, NetworkX metrics, RDF/CSV/form adapters,
  scenario compare maths, early-warning comparator, and the auth path (`/health`, `/api/me`
  401 / 200 with a forged HS256 token and an overridden DB session). `tests/rls/` holds the
  isolation test from DATA_MODEL §14 Q5, skipped unless `TEST_DATABASE_URL` is set.
- Frontend: Vitest for pure helpers (`strengthLabel`, scenario delta maths, distribution
  helpers).

---

## Phase F — Documentation and tracker

Update `Docs/project.md` (§21 status, changelog), `Docs/USE_CASE_DIAGRAM.md` (traceability,
caveats), `Docs/BACKEND_ARCHITECTURE.md` (§11 API table, §13 open items),
`Docs/DATA_MODEL.md` (§18 migrations, new S1 tables), `README.md`, `backend/README.md`,
and `Docs/tracker.html` (ITEMS + API table), then republish the tracker artifact.

---

## Outcome (4 September 2026)

Phases A–F are implemented in the working tree: 69 backend tests pass (`pytest -q`, RLS
suite skipped without a database), 8 Vitest tests pass, `tsc --noEmit` and `eslint` are
clean. The two new migrations were applied to the shared Supabase project later the same
day, once it became reachable (PostgreSQL 17.6; 44 questions seeded, S1 tables + RLS live).

## Out of reach for this pass

- Integration testing against real data: the shared Supabase project was unreachable for
  most of the build day; migrations were applied once it came back, but the write paths
  (scenarios, ingestion, early warning) have not yet been exercised end to end against it.
- Phase 3 / Phase 4 milestone demos, FYP report writing, demo preparation, final
  presentation — team activities.
