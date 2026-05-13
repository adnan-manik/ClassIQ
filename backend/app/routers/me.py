"""/api/me — returns the JWT-bound user's profile."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.deps import current_user
from app.models.auth_user import AuthUser
from app.schemas.auth import MeResponse

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
async def get_me(user: Annotated[AuthUser, Depends(current_user)]) -> AuthUser:
    return user
