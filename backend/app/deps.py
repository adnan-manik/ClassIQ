"""FastAPI dependencies — auth, DB session, current user resolution.

Layering:
    Authorization header
        → current_user_claims  (verify JWT, return claims dict)
            → current_user      (load AuthUser row from DB by claims["sub"])
                → current_institution_id  (just user.institution_id)
                → current_role            (just user.role)

Routes import what they need. Most HoD/teacher endpoints will depend on
`current_user` and use `user.institution_id` for tenant scoping.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.security import verify_jwt
from app.db.session import get_db
from app.models.auth_user import AuthUser, UserRole


async def current_user_claims(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Extract Bearer token, verify it, return the claims dict."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization[7:].strip()
    # JWKS refresh uses synchronous HTTP; never block the async request loop.
    return await run_in_threadpool(verify_jwt, token)


async def current_user(
    claims: Annotated[dict, Depends(current_user_claims)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthUser:
    """Load the public.auth_users row matching the JWT's `sub` claim."""
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing `sub` claim",
        )
    try:
        user_id = UUID(sub)
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token `sub` is not a valid UUID",
        ) from exc

    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="auth_users row not found for this JWT — trigger may not have fired",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    return user


def require_role(*roles: UserRole):
    """Build a dependency that 403s unless the current user has one of `roles`."""

    async def _checker(user: Annotated[AuthUser, Depends(current_user)]) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This endpoint requires role: {', '.join(r.value for r in roles)}",
            )
        return user

    return _checker
