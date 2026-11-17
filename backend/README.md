# ClassIQ Backend

FastAPI + SQLAlchemy + Supabase Postgres. See [Docs/BACKEND_ARCHITECTURE.md](../Docs/BACKEND_ARCHITECTURE.md).

## Quick start

```bash
cd backend

# 1. Create + activate a virtualenv (Windows PowerShell shown)
python -m venv .venv
.venv\Scripts\Activate.ps1
# Or on bash / WSL:
# source .venv/bin/activate

# 2. Install deps
pip install -r requirements.txt

# 3. Configure env
copy .env.example .env
# Edit .env — at minimum fill SUPABASE_JWT_SECRET and the DB password in DATABASE_URL

# 4. Run dev server (auto-reload)
uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000/docs> for the live OpenAPI explorer.

## What's wired today

| Router | Prefix | Purpose |
|---|---|---|
| `health` | `/health`, `/ready` | liveness / DB readiness |
| `me` | `/api/me` | current user + role + institution |
| `students`, `teachers` | `/api/students`, `/api/teachers` | rosters + profiles; `/api/students/{id}/profile-history` (S3) |
| `sections` | `/api/sections` | create / edit / roster / simulate / activate / archive / reopen / delete (audited) |
| `scenarios` | `/api/scenarios` | F5 what-if: create, clone from section, simulate, compare, apply |
| `ingestion` | `/api/ingestion` | RDF / CSV (dry-run + commit), form-app JSON, manual entry, jobs, instrument |
| `reports` | `/api/reports/sections/{id}` | F6 report payload (staff, or the assigned teacher) |
| `longitudinal` | `/api/analytics/longitudinal` | S3 cohort drift per term / version, top shifts |
| `early_warning` | `/api/early-warning` | S1 outcomes, evaluate, flags, overview |
| `llm` | `/api/llm` | S2 Ask ClassIQ (`status`, `query`) — needs the `LLM_PROVIDER` key (`GROQ_API_KEY` or `ANTHROPIC_API_KEY`) |
| `admin_*` | `/api/admin/*` | super-admin: institutions, system overview / audit / ingestion jobs |
| `institution_*` | `/api/institution/*` | departments, users (+ CSV import), courses, analytics, audit |

Every mutation writes an `audit_logs` row. See `Docs/BACKEND_ARCHITECTURE.md` §11 for the
full table and `tests/` for the executable spec.

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q                       # engines, adapters, auth path — no DB needed
TEST_DATABASE_URL=… pytest tests/rls -q   # RLS isolation against a real Postgres
```

## Where to find the JWT secret

`Supabase Dashboard → Project Settings → API → JWT Settings → "JWT Secret"` (or "Legacy JWT Secret" on newer projects). It's a long HMAC string starting with random characters — NOT the publishable or secret API keys.

## Layered architecture

```
routers/ → services/ → repositories/ (or engines/)
       ↑
       deps.py — auth dependencies, current_user, DB session
```

- **Routers** are thin — they validate input via Pydantic schemas and call services.
- **Services** orchestrate business logic.
- **Repositories** own DB access via SQLAlchemy.
- **Engines** own pure computation (FSLSM scoring, NetworkX graph metrics, compatibility pipeline).

## Database access

The backend connects directly to Supabase Postgres via the **session pooler** (IPv4) using SQLAlchemy async + asyncpg. It bypasses RLS (connects as `postgres`), so application code is responsible for adding `WHERE institution_id = current_user.institution_id` to every tenant-scoped query. RLS still protects the DB as defense-in-depth.

## Verifying JWTs

Supabase signs user access tokens with HS256 using the project's JWT secret. The backend verifies with [`python-jose`](https://github.com/mpdavis/python-jose) — see [app/core/security.py](app/core/security.py).

For projects using the newer asymmetric (RS256/ES256) signing keys, swap the verification to use the JWKS endpoint at `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`. The dependency shape in `deps.py` doesn't need to change — only the internals of `verify_jwt`.
