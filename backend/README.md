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

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /health` | public | Liveness probe |
| `GET /api/me` | Bearer JWT | Returns the current user's id, role, institution, full_name, email |

The rest of the routes from [BACKEND_ARCHITECTURE §11](../Docs/BACKEND_ARCHITECTURE.md) are stubbed by the folder layout (`app/routers/`, `app/services/`, `app/engines/`, etc.) and land in subsequent passes.

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
