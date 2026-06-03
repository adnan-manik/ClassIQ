"""JWT verification for Supabase-issued access tokens.

Supports both:
  - legacy HS256 (shared JWT secret) — uses SUPABASE_JWT_SECRET
  - modern asymmetric (ES256 / RS256 / etc.) — uses the project's JWKS
    endpoint at /auth/v1/.well-known/jwks.json

We branch on the `alg` field in the unverified JWT header. JWKS is fetched
lazily and cached in memory; on a missing `kid` we refresh once before
giving up.
"""

import sys
from threading import Lock
from typing import Any, NoReturn

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def _log(msg: str) -> None:
    print(f"[verify_jwt] {msg}", file=sys.stderr, flush=True)


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
        _log(f"FAILED get_unverified_header: {exc}")
        _raise_401(f"Malformed JWT: {exc}", exc)

    alg = header.get("alg")
    kid = header.get("kid")
    _log(f"alg={alg} kid={kid} len={len(token)}")

    if alg in _ASYM_ALGS:
        jwks = _get_jwks()
        if not jwks:
            _log("JWKS fetch returned None")
            _raise_401("Cannot fetch JWKS for asymmetric JWT verification")
        key = _find_key(jwks, kid)
        if not key:
            _log(f"No key match in cache for kid={kid}, refreshing")
            jwks = _refresh_jwks()
            key = _find_key(jwks, kid) if jwks else None
        if not key:
            _log(f"Still no key match after refresh for kid={kid}")
            _raise_401(f"No matching key in JWKS for kid={kid}")
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
            )
            _log(f"OK sub={claims.get('sub')} role(meta)={claims.get('user_metadata', {}).get('role')}")
            return claims
        except JWTError as exc:
            _log(f"FAILED decode (asym): {exc}")
            _raise_401(f"Invalid or expired token: {exc}", exc)

    # Fallback: legacy HS256 with shared JWT secret
    if not settings.SUPABASE_JWT_SECRET:
        _log("HS256 fallback but no SUPABASE_JWT_SECRET configured")
        _raise_401("SUPABASE_JWT_SECRET is not configured (HS256 fallback)")
    try:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        _log(f"FAILED decode (HS256): {exc}")
        _raise_401(f"Invalid or expired token: {exc}", exc)
