"""S1 Early Warning — section_outcomes + early_warning_flags.

See db/migrations/2026-09-04_early_warning.sql.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.simulation import PredictedOutcome
from app.models.student import ParticipationLevel


class WarningType(str, enum.Enum):
    engagement = "engagement"
    performance = "performance"
    compatibility = "compatibility"


class WarningSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class WarningStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"


class SectionOutcome(Base):
    __tablename__ = "section_outcomes"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("sections.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("students.id"))
    week_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    attendance_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    grade_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    engagement_level: Mapped[ParticipationLevel | None] = mapped_column(
        Enum(ParticipationLevel, name="participation_lvl", create_type=False)
    )
    notes: Mapped[str | None] = mapped_column(String)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("auth_users.id"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class EarlyWarningFlag(Base):
    __tablename__ = "early_warning_flags"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("sections.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("students.id"))
    type: Mapped[WarningType] = mapped_column(
        Enum(WarningType, name="warning_type", create_type=False), nullable=False
    )
    severity: Mapped[WarningSeverity] = mapped_column(
        Enum(WarningSeverity, name="warning_severity", create_type=False), nullable=False
    )
    status: Mapped[WarningStatus] = mapped_column(
        Enum(WarningStatus, name="warning_status", create_type=False),
        nullable=False,
        default=WarningStatus.open,
    )
    message: Mapped[str] = mapped_column(String, nullable=False)
    predicted_outcome: Mapped[PredictedOutcome | None] = mapped_column(
        Enum(PredictedOutcome, name="predicted_outcome", create_type=False)
    )
    metric_name: Mapped[str | None] = mapped_column(String)
    expected_value: Mapped[float | None] = mapped_column(Numeric(6, 2))
    actual_value: Mapped[float | None] = mapped_column(Numeric(6, 2))
    deviation: Mapped[float | None] = mapped_column(Numeric(6, 2))
    week_no: Mapped[int | None] = mapped_column(SmallInteger)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id")
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
