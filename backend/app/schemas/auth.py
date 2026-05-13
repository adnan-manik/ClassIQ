"""Pydantic schemas for /api/me and related auth-shaped responses."""

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.auth_user import UserRole


class MeResponse(BaseModel):
    id: UUID
    institution_id: UUID
    role: UserRole
    full_name: str
    email: EmailStr = Field(..., description="From public.auth_users")
