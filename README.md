# ClassIQ

**Classroom Intelligence Platform** — an AI-powered "digital twin" of a classroom that
profiles students with the Felder–Silverman Learning Style Model (FSLSM), models the
social graph of a cohort, and scores section compositions for compatibility.

**Readiness review (26 October 2026):** this is a working prototype with automated
tests, not yet a verified production release. See
[the review and paid-product roadmap](Docs/PRODUCT_READINESS_REVIEW.md) for fixes,
remaining launch blockers, and a proposed paid pilot. Compatibility scores are
heuristic decision-support indicators, not validated predictions of grades.

This repo is a monorepo with three pieces:

| Folder      | Stack                                              | Runs on |
|-------------|----------------------------------------------------|---------|
| `frontend/` | Next.js 16 (App Router) + React 19 + Tailwind v4   | `:3000` |
| `backend/`  | FastAPI + SQLAlchemy (async) + asyncpg             | `:8000` |
| `db/`       | SQL schema, migrations & Node seed scripts         | Supabase Postgres |

Auth and the database are hosted on **Supabase**. The frontend reads tenant-scoped data
directly from Supabase (protected by RLS) and routes all writes through the FastAPI
backend; the backend connects to Postgres via the session pooler and verifies Supabase
JWTs. See [`Docs/BACKEND_ARCHITECTURE.md`](Docs/BACKEND_ARCHITECTURE.md) and
[`Docs/DATA_MODEL.md`](Docs/DATA_MODEL.md) for the full design.

---

## Prerequisites

- **Python 3.12+** (tested on 3.14)
- **Node.js 20+** (tested on 25) and npm
- A **Supabase project** (URL, keys, JWT secret, and DB password). The example env files
  point at the team's shared dev project; use a separate project for testing migrations.

---

## Run it — start to end

You'll run **three things in order**: the database (once), then the backend, then the
frontend. Use two terminals for the two long-running servers.

### 0. Clone & enter the repo

```bash
git clone <repo-url>
cd FYP-ClassIQ
```

### 1. Database — apply schema, auth trigger & seed (one-time)

The schema, the `auth.users → public.users` sync trigger, and demo data live in `db/`.
Run them against Supabase Postgres with the bundled Node runner. `PGPASSWORD` is your
Supabase database password (Dashboard → Settings → Database).

```bash
cd db
npm ci                            # migration runner + isolated SQL tests

# Apply core schema, then the auth trigger + minimal seed
PGPASSWORD='<db-password>' node run_migrations.mjs schema.sql
PGPASSWORD='<db-password>' node run_migrations.mjs migration_institution_admin.sql auth_trigger.sql seed_minimal.sql migrations/2026-09-04_seed_ils_instrument.sql migrations/2026-09-04_early_warning.sql migrations/2026-10-25_browser_read_only.sql migrations/2026-10-26_ingestion_scope.sql migrations/2026-11-07_simulation_read_indexes.sql

# (optional) richer demo cohort for dashboards
PGPASSWORD='<db-password>' node seed_demo_data.mjs
```

> Already provisioned by a teammate? You can skip this — the shared Supabase project
> keeps its schema and seed data between runs.

The October security and ingestion migrations are **prepared locally, not applied
to the shared project by this review**. For existing installations, apply
`auth_trigger.sql`, then the two October migrations above before releasing the
matching backend changes. Provision role and institution through trusted
`app_metadata`; `user_metadata` is only for display information. See the review
for deployment order and verification. The command examples above use Bash;
in PowerShell set `$env:PGPASSWORD = '<db-password>'` before running `node`.

### 2. Backend — FastAPI on `:8000`

```bash
cd backend

# Create + activate a virtualenv
python -m venv .venv
.venv\Scripts\Activate.ps1         # PowerShell
# source .venv/bin/activate        # bash / WSL

# Install deps
pip install -r requirements.txt

# Configure env (copy the example, then fill it in)
copy .env.example .env             # `cp` on bash
#   SUPABASE_JWT_SECRET — Dashboard → Settings → API → "JWT Secret"
#   DATABASE_URL        — fill the <password> for the session pooler URL

# Run (auto-reload)
uvicorn app.main:app --reload --port 8000
```

Verify it's up:

- Health: <http://localhost:8000/health> → `{"status":"ok"}`
- Interactive API docs: <http://localhost:8000/docs>

### 3. Frontend — Next.js on `:3000`

In a second terminal:

```bash
cd frontend

# Install deps
npm install

# Configure env
copy .env.example .env.local       # `cp` on bash
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
#   SUPABASE_SECRET_KEY            (server-only)
#   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Run dev server
npm run dev
```

Open <http://localhost:3000>. Unauthenticated visits redirect to `/login`. Sign in with a
seeded user to reach the dashboards.

> **First load is slow** on this repo because `.next` lives on the `D:` drive — Turbopack
> warns about the "slow filesystem" and the first compile of each route can take 10–30s.
> Subsequent loads are instant.

---

## Environment variables

### `backend/.env`

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_JWT_SECRET` | HMAC secret used to verify Supabase access tokens (**not** an API key) |
| `SUPABASE_SECRET_KEY` | Service key for admin ops (provisioning users) — optional |
| `DATABASE_URL` | `postgresql+asyncpg://…@…pooler.supabase.com:5432/postgres` (session pooler, IPv4) |
| `CORS_ORIGINS` | Comma-separated; include `http://localhost:3000` |
| `LLM_PROVIDER` | `groq` or `anthropic` — picks the S2 assistant's backend |
| `GROQ_API_KEY` / `ANTHROPIC_API_KEY` | Key for the selected provider only — see [Ask ClassIQ (S2)](#ask-classiq-s2) |

### `frontend/.env.local`

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (replaces legacy `anon`); RLS enforces isolation |
| `SUPABASE_SECRET_KEY` | Server-only secret key (replaces legacy `service_role`) — never exposed to the browser |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the FastAPI backend, e.g. `http://localhost:8000` |

---

## Quick smoke test

With both servers running:

```bash
curl http://localhost:8000/health        # {"status":"ok"}
curl -i http://localhost:8000/api/me      # 401 without a Bearer token (auth enforced)
curl -i http://localhost:3000/            # 307 redirect to /login when unauthenticated
```

---

## What works today (FYP-1 + FYP-2 build, September 2026)

- **Phase 1 — Foundation:** project scaffolding, Supabase schema + multi-tenant RLS,
  JWT auth, and the institution-admin onboarding layer (super-admin → institution admin →
  departments/users).
- **Phase 2 — Twin Generation & Profiles:** student & teacher profile models, the survey
  ingestion pipeline (RDF bulk import, ClassIQ CSV, form-app JSON, manual entry — all
  idempotent and scored into versioned profiles), CSV user import, and the HoD / teacher
  dashboards, social graph, and section builder.
- **Phase 3 — Scoring Engine & Section Builder:** the four-factor compatibility engine,
  NetworkX social cohesion, section lifecycle (`draft → simulated → active → archived`),
  roster editing, and **F5 what-if scenarios** (build, simulate, side-by-side compare
  against the live baseline, apply to real sections).
- **Phase 4 — Reports & Dashboards:** persisted simulation results, the report API,
  print/PDF export, teacher dashboard, institution analytics with department drill-down.
- **Phase 5 — Stretch goals:** **S1 early warning** (record attendance / grades per
  week, compare with the predicted outcome, raise and manage flags), **S2 Ask ClassIQ**
  (natural-language questions over the tenant's planning data via Groq or the
  Claude API, backend-only key), **S3 longitudinal analytics** (profile-version history per student,
  cohort drift per term).
- **Phase 6 — Tests:** `pytest` suite for the engines, adapters and the auth path
  (`backend/tests/`), an RLS-isolation test that runs when `TEST_DATABASE_URL` is set,
  and Vitest for the frontend helpers.

The backend mounts these routers (all under `/api` except health):
`health`, `me`, `students`, `teachers`, `sections`, `scenarios`, `ingestion`, `reports`,
`longitudinal` (`/analytics/longitudinal`), `early_warning`, `llm`, `admin_institutions`,
`admin_system`, `institution_departments`, `institution_users`,
`institution_users_import`, `institution_courses`, `institution_analytics`,
`institution_audit`. Open <http://localhost:8000/docs> for the live OpenAPI explorer.

### Database migrations (applied to the shared project on 4 Sep 2026)

Two migrations were added on 4 Sep 2026. They are already applied to the team's Supabase
project; on any other database run them after the schema (idempotent, safe to re-run):

```bash
cd db
PGPASSWORD='<db-password>' node run_migrations.mjs migrations/2026-09-04_seed_ils_instrument.sql migrations/2026-09-04_early_warning.sql
```

The first seeds the 44-question ILS instrument (the ingestion API also seeds it on first
use); the second adds the S1 `section_outcomes` / `early_warning_flags` tables.

> The RLS helper function is `get_current_role()` — `current_role` is a reserved word in
> Postgres, so the name in older copies of the docs (`current_role()`) never parsed.

### Running the tests

```bash
# backend
cd backend && pip install -r requirements-dev.txt && pytest -q
# RLS isolation (needs a real DB with two institutions):
TEST_DATABASE_URL='postgresql+asyncpg://…' pytest tests/rls -q

# frontend
cd frontend && npm test

# isolated PostgreSQL security + migration tests (no Supabase credentials)
cd db && npm ci && npm test
```

### Ask ClassIQ (S2)

Two providers ship; `LLM_PROVIDER` in `backend/.env` picks one. Set **only** the
selected provider's key, always backend-side — never in the frontend, where a
`NEXT_PUBLIC_` var would ship the key to the browser.

| `LLM_PROVIDER` | Key | Model var | Default |
|----------------|-----|-----------|---------|
| `groq`      | `GROQ_API_KEY`      | `GROQ_MODEL`      | `openai/gpt-oss-120b` |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-opus-5` |

`LLM_MAX_OUTPUT_TOKENS` caps each answer on both. `LLM_EFFORT` is Anthropic-only.
Restart uvicorn after editing — settings are read once at import.

Without a key the page shows a "not configured" notice naming the variable for the
active provider, and `/api/llm/query` returns 503. `GET /api/llm/status` reports
`{enabled, provider, model, max_output_tokens, reason}`.

> Groq has no prompt caching and no refusal stop reason, so `cache_read_input_tokens`
> / `cache_creation_input_tokens` are always 0 and `refusal` is always `false` on that
> provider. The response shape is identical either way, so nothing downstream branches.

## Project layout

```
FYP-/
├── frontend/        Next.js app (App Router) — see frontend/README.md
├── backend/         FastAPI service       — see backend/README.md
│   └── app/
│       ├── routers/      thin HTTP layer (validate + delegate)
│       ├── services/     business logic
│       ├── repositories/ SQLAlchemy DB access
│       ├── engines/      pure computation (FSLSM, scoring, NetworkX, compare, early warning)
│       ├── ingestion/    survey adapters: RDF, CSV, form-app JSON, manual entry
│       ├── llm/          provider client (Groq / Claude), prompts, tenant snapshot (S2)
│       ├── core/         config + JWT security
│       └── deps.py       auth dependencies, current_user, DB session
│   └── tests/        pytest: engines, ingestion adapters, auth path, RLS isolation
├── db/              schema.sql, migrations/, auth_trigger.sql, seed scripts
└── Docs/            architecture, data model, use cases, timeline, FYP2_IMPLEMENTATION_PLAN.md
```
