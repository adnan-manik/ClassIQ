"""JWT verification for Supabase-issued access tokens.

Supabase signs user JWTs with HS256 using the project's JWT secret (visible
under Settings → API). We verify the signature locally — no round-trip to
Supabase per request.
"""

from typing import Any

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def verify_jwt(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims.

    Raises HTTPException 401 on any failure (expired, bad signature, etc.).
    """
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
