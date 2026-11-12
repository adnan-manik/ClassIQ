"""Authorization regressions discovered in the product-readiness review."""

import base64
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core.config import settings
from app.core.security import verify_jwt
from app.models.auth_user import UserRole
from app.routers import institution_users
from app.schemas.institution_admin import UserCreate, UserPatch
from tests.api.test_auth_and_gates import client, make_user, token_for, use_user


@pytest.mark.parametrize("claim", ["exp", "sub", "iss", "aud"])
def test_access_token_requires_security_claims(claim):
    claims = {
        "sub": str(uuid4()), "aud": "authenticated",
        "iss": f"{settings.SUPABASE_URL}/auth/v1",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    del claims[claim]
    token = jwt.encode(claims, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as error:
        verify_jwt(token)
    assert error.value.status_code == 401


def test_access_token_rejects_wrong_issuer():
    token = jwt.encode({
        "sub": str(uuid4()), "aud": "authenticated", "iss": "https://other-project/auth/v1",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    with pytest.raises(HTTPException) as error:
        verify_jwt(token)
    assert error.value.status_code == 401


@pytest.mark.parametrize("header", [{"alg": []}, {"alg": {"bad": "value"}}, {"alg": "ES256", "kid": []}])
def test_malformed_header_fields_return_unauthorized(header):
    encoded = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    with pytest.raises(HTTPException) as error:
        verify_jwt(f"{encoded}.e30.c2ln")
    assert error.value.status_code == 401


@pytest.mark.parametrize("role", ["institution_admin", "hod", "super_admin"])
def test_hod_cannot_provision_privileged_account(client, role):
    actor = make_user(UserRole.hod)
    use_user(actor)
    response = client.post("/api/institution/users", json={
        "email": "new@example.com", "full_name": "New User", "role": role,
    }, headers={"Authorization": f"Bearer {token_for(actor)}"})
    assert response.status_code == 403


def test_hod_cannot_deactivate_an_account(client):
    actor = make_user(UserRole.hod)
    use_user(actor)
    response = client.patch(f"/api/institution/users/{uuid4()}", json={"is_active": False},
                            headers={"Authorization": f"Bearer {token_for(actor)}"})
    assert response.status_code == 403


async def test_foreign_department_rejected_before_auth_provisioning(monkeypatch):
    actor = make_user(UserRole.institution_admin)
    db = AsyncMock()
    provision = AsyncMock()
    monkeypatch.setattr(institution_users.refs, "department_in_institution", AsyncMock(return_value=False))
    monkeypatch.setattr(institution_users.supabase_admin, "invite_user_by_email", provision)
    with pytest.raises(HTTPException) as error:
        await institution_users.create_user(UserCreate(
            email="new@example.com", full_name="New", role=UserRole.teacher,
            department_id=uuid4(),
        ), actor, db)
    assert error.value.status_code == 400
    provision.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.parametrize("own_account", [False, True])
async def test_admin_cannot_disable_super_admin_or_self(monkeypatch, own_account):
    actor = make_user(UserRole.institution_admin)
    target = actor if own_account else make_user(UserRole.super_admin)
    monkeypatch.setattr(institution_users.ia_repo, "get_auth_user", AsyncMock(return_value=target))
    db = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await institution_users.patch_user(target.id, UserPatch(is_active=False), actor, db)
    assert error.value.status_code == (400 if own_account else 403)
    assert target.is_active is True
    db.commit.assert_not_awaited()
