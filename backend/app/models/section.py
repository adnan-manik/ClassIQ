"""Section + SectionStudent (enrollment join)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SectionState(str, enum.Enum):
    draft = "draft"
    simulated = "simulated"
    active = "active"
    archived = "archived"


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("courses.id"), nullable=False
    )
    academic_term_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id"), nullable=False
    )
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("teachers.id")
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[SectionState] = mapped_column(
        Enum(SectionState, name="section_state", create_type=False),
        nullable=False,
        default=SectionState.draft,
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("course_id", "academic_term_id", "label"),)


class SectionStudent(Base):
    __tablename__ = "section_students"

    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("sections.id"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), primary_key=True
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
