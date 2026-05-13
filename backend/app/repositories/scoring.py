"""scoring_configs — load the institution's default weights."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import Column, String, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ScoringConfig(Base):
    __tablename__ = "scoring_configs"

    id: Mapped[UUID] = mapped_column(PG_UUID, primary_key=True)
    institution_id: Mapped[UUID | None] = mapped_column(PG_UUID)
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False)


async def get_default_config(
    db: AsyncSession,
    institution_id: UUID,
) -> ScoringConfig | None:
    """Pick the institution's default config; falls back to global (NULL institution)."""
    stmt = (
        select(ScoringConfig)
        .where(ScoringConfig.is_default.is_(True))
        .where(
            (ScoringConfig.institution_id == institution_id)
            | (ScoringConfig.institution_id.is_(None))
        )
        .order_by(ScoringConfig.institution_id.desc().nulls_last())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()
