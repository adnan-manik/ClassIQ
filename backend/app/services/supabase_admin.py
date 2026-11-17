"""Async HTTP client for Supabase Auth Admin API.

Mirrors the header + body shape of db/seed_users.mjs. The auth trigger at
db/auth_trigger.sql writes public.auth_users from raw_app_meta_data, so we
just POST to /auth/v1/admin/users and the public.auth_users row appears.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx

from app.core.config import settings


class SupabaseAdminError(Exception):
    """Raised when the Supabase Admin API returns a non-2xx response."""

    def __init__(self, status: int, body: Any) -> None:
        super().__init__(f"Supabase admin API {status}: {body}")
        self.status = status
        self.body = body


def _require_key() -> str:
    if not settings.SUPABASE_SECRET_KEY:
        raise SupabaseAdminError(500, "SUPABASE_SECRET_KEY is not configured")
    return settings.SUPABASE_SECRET_KEY


def _headers() -> dict[str, str]:
    key = _require_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


async def _post_user(body: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(url, headers=_headers(), json=body)
    if res.status_code >= 300:
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": res.text}
        raise SupabaseAdminError(res.status_code, payload)
    return res.json()


async def invite_user_by_email(
    *,
    email: str,
    institution_id: UUID,
    role: str,
    full_name: str,
) -> dict[str, Any]:
    """Provision trusted metadata, then explicitly request an invitation email.

    Admin create-user does not send email. The invite endpoint supports existing,
    unconfirmed users, allowing the insert trigger to trust app_metadata only.
    """
    user = await _post_user(
        {
            "email": email,
            "email_confirm": False,
            "app_metadata": {
                "institution_id": str(institution_id),
                "role": role,
            },
            "user_metadata": {"full_name": full_name},
        }
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/invite",
            headers=_headers(),
            params={"redirect_to": f"{settings.FRONTEND_URL.rstrip('/')}/login"},
            json={"email": email},
        )
    if res.status_code >= 300:
        raise SupabaseAdminError(
            res.status_code,
            {"message": "Account created but invitation could not be sent; resend it from Auth administration",
             "user_id": user["id"]},
        )
    return user


async def create_user_with_password(
    *,
    email: str,
    password: str,
    institution_id: UUID,
    role: str,
    full_name: str,
) -> dict[str, Any]:
    """Create a user with an admin-set password (no email confirmation needed)."""
    return await _post_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": {
                "institution_id": str(institution_id),
                "role": role,
            },
            "user_metadata": {"full_name": full_name},
        }
    )


async def update_user_metadata(
    *, auth_user_id: UUID, metadata: dict[str, Any]
) -> dict[str, Any]:
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        res = await client.put(
            url, headers=_headers(), json={"user_metadata": metadata}
        )
    if res.status_code >= 300:
        try:
            payload = res.json()
        except Exception:
            payload = {"raw": res.text}
        raise SupabaseAdminError(res.status_code, payload)
    return res.json()
