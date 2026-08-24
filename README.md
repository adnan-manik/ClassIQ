# ClassIQ

**Classroom Intelligence Platform** — an AI-powered "digital twin" of a classroom that
profiles students with the Felder–Silverman Learning Style Model (FSLSM), models the
social graph of a cohort, and scores section compositions for compatibility.

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
  point at the team's shared dev project.

---

## Run it — start to end

You'll run **three things in order**: the database (once), then the backend, then the
frontend. Use two terminals for the two long-running servers.

### 0. Clone & enter the repo

```bash
git clone <repo-url>
cd FYP-
```

### 1. Database — apply schema, auth trigger & seed (one-time)

The schema, the `auth.users → public.users` sync trigger, and demo data live in `db/`.
Run them against Supabase Postgres with the bundled Node runner. `PGPASSWORD` is your
Supabase database password (Dashboard → Settings → Database).

```bash
cd db
npm install                       # installs the `pg` driver

# Apply core schema, then the auth trigger + minimal seed
PGPASSWORD='<db-password>' node run_migrations.mjs schema.sql
PGPASSWORD='<db-password>' node run_migrations.mjs auth_trigger.sql seed_minimal.sql

# (optional) richer demo cohort for dashboards
PGPASSWORD='<db-password>' node seed_demo_data.mjs
```

> Already provisioned by a teammate? You can skip this — the shared Supabase project
> keeps its schema and seed data between runs.

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

## What works today (FYP-1 — Phases 1 & 2)

- **Phase 1 — Foundation:** project scaffolding, Supabase schema + multi-tenant RLS,
  JWT auth, and the institution-admin onboarding layer (super-admin → institution admin →
  departments/users).
- **Phase 2 — Twin Generation & Profiles:** student & teacher profile models, FSLSM
  survey ingestion, CSV bulk import, and the HoD / teacher dashboards, social graph, and
  section builder.

The backend mounts these routers (all under `/api` except health):
`health`, `me`, `students`, `teachers`, `sections`, `admin_institutions`, `admin_system`,
`institution_departments`, `institution_users`, `institution_users_import`,
`institution_analytics`, `institution_audit`.

---

## Project layout

```
FYP-/
├── frontend/        Next.js app (App Router) — see frontend/README.md
├── backend/         FastAPI service       — see backend/README.md
│   └── app/
│       ├── routers/      thin HTTP layer (validate + delegate)
│       ├── services/     business logic
│       ├── repositories/ SQLAlchemy DB access
│       ├── engines/      pure computation (FSLSM scoring, NetworkX graph)
│       ├── ingestion/    survey/CSV ingestion
│       ├── core/         config + JWT security
│       └── deps.py       auth dependencies, current_user, DB session
├── db/              schema.sql, migrations/, auth_trigger.sql, seed scripts
└── Docs/            architecture, data model, use cases, timeline
```
