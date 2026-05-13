"""SimulationRun + SimulationResult + SimulationResultFactor."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, SmallInteger, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SimRunStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class PredictedOutcome(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class SocialImpact(str, enum.Enum):
    supportive = "supportive"
    neutral = "neutral"
    hindering = "hindering"


class FactorImpact(str, enum.Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    scenario_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID)
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("sections.id")
    )
    scoring_config_id: Mapped[uuid.UUID] = mapped_column(PG_UUID, nullable=False)
    engine_version: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[SimRunStatus] = mapped_column(
        Enum(SimRunStatus, name="sim_run_status", create_type=False),
        nullable=False,
        default=SimRunStatus.queued,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(String)
    triggered_by: Mapped[uuid.UUID] = mapped_column(PG_UUID, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class SimulationResult(Base):
    __tablename__ = "simulation_results"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    simulation_run_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("simulation_runs.id"), nullable=False
    )
    scenario_section_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID)
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("sections.id")
    )
    compatibility_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    predicted_outcome: Mapped[PredictedOutcome] = mapped_column(
        Enum(PredictedOutcome, name="predicted_outcome", create_type=False),
        nullable=False,
    )
    social_graph_impact: Mapped[SocialImpact] = mapped_column(
        Enum(SocialImpact, name="social_impact", create_type=False),
        nullable=False,
    )
    style_distribution: Mapped[dict] = mapped_column(JSONB, nullable=False)
    recommended_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("teachers.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class SimulationResultFactor(Base):
    __tablename__ = "simulation_result_factors"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    simulation_result_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("simulation_results.id"), nullable=False
    )
    factor_name: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False)
    impact: Mapped[FactorImpact] = mapped_column(
        Enum(FactorImpact, name="factor_impact", create_type=False),
        nullable=False,
    )

    __table_args__ = (UniqueConstraint("simulation_result_id", "factor_name"),)
