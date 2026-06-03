"""ORM model for the public.auth_users table (extends Supabase auth.users)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    institution_admin = "institution_admin"
    hod = "hod"
    teacher = "teacher"
    student = "student"


class AuthUser(Base):
    __tablename__ = "auth_users"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID, primary_key=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(PG_UUID, nullable=False)
    # `create_type=False` — the enum already exists in the DB (created by schema.sql)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", create_type=False),
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
