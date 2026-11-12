"""JWT verification for Supabase-issued access tokens.

Supports both:
  - legacy HS256 (shared JWT secret) — uses SUPABASE_JWT_SECRET
  - modern asymmetric (ES256 / RS256 / etc.) — uses the project's JWKS
    endpoint at /auth/v1/.well-known/jwks.json

We branch on the `alg` field in the unverified JWT header. JWKS is fetched
lazily and cached in memory; on a missing `kid` we refresh once before
giving up.
"""

from threading import Lock
from typing import Any, NoReturn

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


_ASYM_ALGS = {"ES256", "ES384", "ES512", "RS256", "RS384", "RS512"}

_jwks_cache: dict[str, Any] | None = None
_jwks_lock = Lock()


def _fetch_jwks() -> dict[str, Any] | None:
    try:
        res = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            timeout=10.0,
        )
        res.raise_for_status()
        return res.json()
    except Exception:
        return None


def _get_jwks() -> dict[str, Any] | None:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    with _jwks_lock:
        if _jwks_cache is None:
            _jwks_cache = _fetch_jwks()
    return _jwks_cache


def _refresh_jwks() -> dict[str, Any] | None:
    global _jwks_cache
    with _jwks_lock:
        _jwks_cache = _fetch_jwks()
    return _jwks_cache


def _find_key(jwks: dict[str, Any], kid: str | None) -> dict[str, Any] | None:
    keys = jwks.get("keys") or []
    if not keys:
        return None
    if kid is None:
        return keys[0]
    for k in keys:
        if k.get("kid") == kid:
            return k
    return None


def _raise_401(detail: str, cause: Exception | None = None) -> NoReturn:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    ) from cause


def verify_jwt(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        _raise_401("Malformed access token", exc)

    if not isinstance(header, dict):
        _raise_401("Malformed access token header")
    alg = header.get("alg")
    kid = header.get("kid")
    if not isinstance(alg, str) or alg not in _ASYM_ALGS | {"HS256"}:
        _raise_401("Unsupported token algorithm")
    if kid is not None and not isinstance(kid, str):
        _raise_401("Invalid signing key identifier")
    verification = {
        "audience": "authenticated",
        "issuer": f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1",
        "options": {"require_exp": True, "require_sub": True, "require_aud": True, "require_iss": True},
    }

    if alg in _ASYM_ALGS:
        jwks = _get_jwks()
        if not jwks:
            _raise_401("Cannot fetch JWKS for asymmetric JWT verification")
        key = _find_key(jwks, kid)
        if not key:
            jwks = _refresh_jwks()
            key = _find_key(jwks, kid) if jwks else None
        if not key:
            _raise_401("No matching signing key")
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                **verification,
            )
            return claims
        except JWTError as exc:
            _raise_401("Invalid or expired access token", exc)

    # Fallback: legacy HS256 with shared JWT secret
    if not settings.SUPABASE_JWT_SECRET:
        _raise_401("SUPABASE_JWT_SECRET is not configured (HS256 fallback)")
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            **verification,
        )
    except JWTError as exc:
        _raise_401("Invalid or expired access token", exc)
