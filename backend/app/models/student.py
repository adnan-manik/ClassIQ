"""Student + StudentProfile + StudentAuxProfile.

Profiles are versioned; the partial-unique-index `is_current` flag picks
out the latest scored profile per student per axis.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FslsmAxis(str, enum.Enum):
    active_reflective = "active_reflective"
    sensing_intuitive = "sensing_intuitive"
    visual_verbal = "visual_verbal"
    sequential_global = "sequential_global"


class CollabPref(str, enum.Enum):
    solo = "solo"
    pair = "pair"
    group = "group"


class ParticipationLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Student(Base):
    __tablename__ = "students"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("departments.id")
    )
    external_id: Mapped[str | None] = mapped_column(String)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(String)
    program: Mapped[str | None] = mapped_column(String)
    batch: Mapped[str | None] = mapped_column(String)
    current_semester: Mapped[int | None] = mapped_column(SmallInteger)
    linked_auth_user_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("institution_id", "external_id"),)


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    derived_from_response_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(nullable=False, default=False)
    scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    scoring_engine_version: Mapped[str] = mapped_column(String, nullable=False)
    active_reflective_score: Mapped[int] = mapped_column(Integer, nullable=False)
    sensing_intuitive_score: Mapped[int] = mapped_column(Integer, nullable=False)
    visual_verbal_score: Mapped[int] = mapped_column(Integer, nullable=False)
    sequential_global_score: Mapped[int] = mapped_column(Integer, nullable=False)
    dominant_axis: Mapped[FslsmAxis | None] = mapped_column(
        Enum(FslsmAxis, name="fslsm_axis", create_type=False)
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("student_id", "version"),
        # Plus CHECK constraints in the DB enforcing odd scores in [-11, 11];
        # we don't redeclare them in ORM since they live in schema.sql.
        CheckConstraint("version > 0", name="ck_student_profile_version_pos"),
    )


class StudentAuxProfile(Base):
    __tablename__ = "student_aux_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    academic_term_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id")
    )
    collaboration_pref: Mapped[CollabPref | None] = mapped_column(
        Enum(CollabPref, name="collab_pref", create_type=False)
    )
    participation_level: Mapped[ParticipationLevel | None] = mapped_column(
        Enum(ParticipationLevel, name="participation_lvl", create_type=False)
    )
    preferred_peers: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(PG_UUID))
    distracting_peers: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(PG_UUID))
    notes: Mapped[str | None] = mapped_column(String)
    is_current: Mapped[bool] = mapped_column(nullable=False, default=False)
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
