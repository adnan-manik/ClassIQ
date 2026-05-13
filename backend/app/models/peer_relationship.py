"""peer_relationships — term-scoped directed edges between students."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RelationshipType(str, enum.Enum):
    friend = "friend"
    study_partner = "study_partner"
    neutral = "neutral"
    conflict = "conflict"


class RelationshipSource(str, enum.Enum):
    survey = "survey"
    admin = "admin"


class PeerRelationship(Base):
    __tablename__ = "peer_relationships"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    academic_term_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id"), nullable=False
    )
    from_student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    to_student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    type: Mapped[RelationshipType] = mapped_column(
        Enum(RelationshipType, name="relationship_type", create_type=False),
        nullable=False,
    )
    strength: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    source: Mapped[RelationshipSource] = mapped_column(
        Enum(RelationshipSource, name="relationship_src", create_type=False),
        nullable=False,
        default=RelationshipSource.survey,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "academic_term_id",
            "from_student_id",
            "to_student_id",
            "type",
            name="uq_peer_relationships_quad",
        ),
        CheckConstraint(
            "from_student_id <> to_student_id",
            name="ck_peer_relationships_self_loop",
        ),
        CheckConstraint(
            "strength BETWEEN 1 AND 5", name="ck_peer_relationships_strength_range"
        ),
    )
