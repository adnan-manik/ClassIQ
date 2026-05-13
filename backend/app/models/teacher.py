"""Teacher + TeacherProfile."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class InteractionLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class PacingPref(str, enum.Enum):
    slow = "slow"
    moderate = "moderate"
    fast = "fast"


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("departments.id")
    )
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    auth_user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("institution_id", "email"),)


class TeacherProfile(Base):
    __tablename__ = "teacher_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("teachers.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(nullable=False, default=False)
    teaching_style: Mapped[str] = mapped_column(String, nullable=False)
    interaction_level: Mapped[InteractionLevel] = mapped_column(
        Enum(InteractionLevel, name="interaction_lvl", create_type=False),
        nullable=False,
    )
    pacing: Mapped[PacingPref] = mapped_column(
        Enum(PacingPref, name="pacing_pref", create_type=False), nullable=False
    )
    approach: Mapped[str | None] = mapped_column(String)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("teacher_id", "version"),
        CheckConstraint("version > 0", name="ck_teacher_profile_version_pos"),
    )
