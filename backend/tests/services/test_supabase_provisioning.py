"""Mock transport checks: no live accounts or emails are created."""

import json
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest

from app.services import supabase_admin


@pytest.mark.parametrize("mode", ["password", "invite"])
async def test_provisioning_uses_trusted_metadata_and_invite_endpoint(monkeypatch, mode):
    requests = []
    uid, institution = uuid4(), uuid4()
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"id": str(uid)})
    client_class = httpx.AsyncClient
    monkeypatch.setattr(supabase_admin.settings, "SUPABASE_SECRET_KEY", "test-only-key")
    monkeypatch.setattr(supabase_admin.httpx, "AsyncClient",
                        lambda **kwargs: client_class(transport=httpx.MockTransport(respond), **kwargs))
    args = dict(email="new@example.com", institution_id=institution, role="teacher", full_name="New Teacher")
    if mode == "password":
        result = await supabase_admin.create_user_with_password(**args, password="test-password")
    else:
        result = await supabase_admin.invite_user_by_email(**args)
    assert result["id"] == str(uid)
    body = json.loads(requests[0].content)
    assert body["app_metadata"] == {"institution_id": str(institution), "role": "teacher"}
    assert body["user_metadata"] == {"full_name": "New Teacher"}
    assert len(requests) == (2 if mode == "invite" else 1)
    if mode == "invite":
        assert requests[1].url.path == "/auth/v1/invite"
        assert json.loads(requests[1].content) == {"email": "new@example.com"}


async def test_failed_invite_is_reported_as_partial_provisioning(monkeypatch):
    uid = uuid4()
    monkeypatch.setattr(supabase_admin, "_post_user", AsyncMock(return_value={"id": str(uid)}))
    monkeypatch.setattr(supabase_admin.settings, "SUPABASE_SECRET_KEY", "test-only-key")
    client_class = httpx.AsyncClient
    monkeypatch.setattr(supabase_admin.httpx, "AsyncClient", lambda **kwargs:
        client_class(transport=httpx.MockTransport(lambda request: httpx.Response(429)), **kwargs))
    with pytest.raises(supabase_admin.SupabaseAdminError) as error:
        await supabase_admin.invite_user_by_email(email="new@example.com", institution_id=uuid4(),
                                                 role="teacher", full_name="New Teacher")
    assert error.value.body["user_id"] == str(uid)
    assert "Account created" in error.value.body["message"]
