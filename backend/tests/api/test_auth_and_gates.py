"""HTTP-level tests with the DB dependency overridden.

Exercises the real auth path (Bearer → verify_jwt HS256 → current_user →
require_role) without Postgres: `get_db` yields a stub session whose
`execute()` returns whatever AuthUser the test asks for.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.auth_user import AuthUser, UserRole


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class StubSession:
    """Just enough AsyncSession for deps.current_user."""

    def __init__(self, user: AuthUser | None):
        self.user = user

    async def execute(self, _stmt):
        return _Result(self.user)

    async def rollback(self):
        pass

    async def commit(self):
        pass


def make_user(role: UserRole, active: bool = True) -> AuthUser:
    return AuthUser(
        id=uuid.uuid4(),
        institution_id=uuid.uuid4(),
        role=role,
        full_name="Test User",
        email="test@example.com",
        is_active=active,
        created_at=datetime.now(timezone.utc),
    )


def token_for(user: AuthUser, *, expired: bool = False) -> str:
    now = datetime.now(timezone.utc)
    exp = now - timedelta(minutes=5) if expired else now + timedelta(minutes=30)
    return jwt.encode(
        {"sub": str(user.id), "aud": "authenticated", "exp": exp, "iat": now, "role": "authenticated"},
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def use_user(user: AuthUser | None):
    async def _get_db():
        yield StubSession(user)

    app.dependency_overrides[get_db] = _get_db


def test_health_is_public(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_me_requires_bearer(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.headers.get("www-authenticate") == "Bearer"


def test_me_rejects_garbage_token(client):
    r = client.get("/api/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_me_rejects_expired_token(client):
    user = make_user(UserRole.hod)
    use_user(user)
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(user, expired=True)}"})
    assert r.status_code == 401


def test_me_returns_profile_for_valid_token(client):
    user = make_user(UserRole.hod)
    use_user(user)
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(user.id)
    assert body["role"] == "hod"
    assert body["institution_id"] == str(user.institution_id)


def test_inactive_account_is_forbidden(client):
    user = make_user(UserRole.hod, active=False)
    use_user(user)
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 403


def test_unknown_subject_is_404(client):
    user = make_user(UserRole.hod)
    use_user(None)  # trigger never created the auth_users row
    r = client.get("/api/me", headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 404


@pytest.mark.parametrize(
    "path",
    ["/api/scenarios", "/api/students", "/api/teachers", "/api/sections", "/api/early-warning/overview", "/api/analytics/longitudinal", "/api/llm/status", "/api/ingestion/jobs"],
)
def test_staff_routes_reject_teacher_role(client, path):
    user = make_user(UserRole.teacher)
    use_user(user)
    r = client.get(path, headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 403, (path, r.text)


@pytest.mark.parametrize("path", ["/api/admin/system/overview", "/api/admin/institutions"])
def test_super_admin_routes_reject_hod(client, path):
    user = make_user(UserRole.hod)
    use_user(user)
    r = client.get(path, headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 403


def test_llm_status_reports_unconfigured_key(client):
    user = make_user(UserRole.hod)
    use_user(user)
    r = client.get("/api/llm/status", headers={"Authorization": f"Bearer {token_for(user)}"})
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["model"] == settings.ANTHROPIC_MODEL


def test_manual_ingestion_validates_answers_before_touching_db(client):
    user = make_user(UserRole.hod)
    use_user(user)
    r = client.post(
        "/api/ingestion/manual",
        headers={"Authorization": f"Bearer {token_for(user)}"},
        json={"external_id": "S1", "answers": {"1": "A"}},
    )
    assert r.status_code == 422
    assert "44" in r.text


def test_openapi_lists_every_planned_route(client):
    spec = client.get("/openapi.json").json()
    paths = set(spec["paths"])
    for p in [
        "/api/scenarios/{scenario_id}/compare",
        "/api/scenarios/{scenario_id}/apply",
        "/api/ingestion/rdf",
        "/api/reports/sections/{section_id}",
        "/api/sections/{section_id}/activate",
        "/api/institution/courses",
        "/api/early-warning/flags",
        "/api/analytics/longitudinal",
        "/api/students/{student_id}/profile-history",
        "/api/llm/query",
    ]:
        assert p in paths, p
