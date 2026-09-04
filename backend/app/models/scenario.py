"""Scenario + ScenarioSection + ScenarioSectionStudent (F5 what-if testing).

Scenarios are first-class and separate from real sections — hypotheticals never
pollute live academic data. "Applying" a scenario is an explicit copy operation
handled by services/scenario_service.py.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ScenarioStatus(str, enum.Enum):
    draft = "draft"
    simulated = "simulated"
    applied = "applied"
    archived = "archived"


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("departments.id"), nullable=False
    )
    academic_term_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    notes: Mapped[str | None] = mapped_column(String)
    status: Mapped[ScenarioStatus] = mapped_column(
        Enum(ScenarioStatus, name="scenario_status", create_type=False),
        nullable=False,
        default=ScenarioStatus.draft,
    )
    scoring_config_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID)
    created_by: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ScenarioSection(Base):
    __tablename__ = "scenario_sections"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("scenarios.id"), nullable=False
    )
    course_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("courses.id"), nullable=False
    )
    # NOT NULL in the schema — a scenario section always names its teacher.
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("teachers.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (UniqueConstraint("scenario_id", "course_id", "label"),)


class ScenarioSectionStudent(Base):
    __tablename__ = "scenario_section_students"

    scenario_section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("scenario_sections.id"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), primary_key=True
    )
