"""ORM model for public.ingestion_jobs — CSV bulk imports, etc."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ResponseSource(str, enum.Enum):
    rdf_bulk_import = "rdf_bulk_import"
    form_app = "form_app"
    classiq_internal = "classiq_internal"
    manual_admin = "manual_admin"


class IngestionStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    partial = "partial"


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    source: Mapped[ResponseSource] = mapped_column(
        Enum(ResponseSource, name="response_source", create_type=False),
        nullable=False,
    )
    status: Mapped[IngestionStatus] = mapped_column(
        Enum(IngestionStatus, name="ingestion_status", create_type=False),
        nullable=False,
        default=IngestionStatus.pending,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_path: Mapped[str | None] = mapped_column(String)
    summary: Mapped[dict | None] = mapped_column(JSONB)
    triggered_by: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("auth_users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
