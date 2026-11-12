"""Survey instrument + raw responses (Group D/E in DATA_MODEL.md).

Raw answers are stored verbatim so FSLSM scores can be recomputed when the
scorer evolves — never collect again.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.ingestion_job import ResponseSource
from app.models.student import FslsmAxis


class FslsmPoleA(str, enum.Enum):
    active = "active"
    sensing = "sensing"
    visual = "visual"
    sequential = "sequential"


class FslsmPoleB(str, enum.Enum):
    reflective = "reflective"
    intuitive = "intuitive"
    verbal = "verbal"
    global_ = "global"


class AnswerChoice(str, enum.Enum):
    A = "A"
    B = "B"


class SurveyInstrument(Base):
    __tablename__ = "survey_instruments"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("institutions.id")
    )  # NULL = global (default FSLSM ILS)
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (UniqueConstraint("name", "version"),)


class SurveyQuestion(Base):
    __tablename__ = "survey_questions"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    instrument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("survey_instruments.id"), nullable=False
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(String, nullable=False)
    axis: Mapped[FslsmAxis] = mapped_column(
        Enum(FslsmAxis, name="fslsm_axis", create_type=False), nullable=False
    )
    rdf_property: Mapped[str | None] = mapped_column(String)
    answer_a_pole: Mapped[FslsmPoleA] = mapped_column(
        Enum(FslsmPoleA, name="fslsm_pole_a", create_type=False), nullable=False
    )
    answer_b_pole: Mapped[FslsmPoleB] = mapped_column(
        Enum(
            FslsmPoleB,
            name="fslsm_pole_b",
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (UniqueConstraint("instrument_id", "sequence_no"),)


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, primary_key=True, default=uuid.uuid4
    )
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    instrument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("survey_instruments.id"), nullable=False
    )
    academic_term_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id")
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    source: Mapped[ResponseSource] = mapped_column(
        Enum(ResponseSource, name="response_source", create_type=False),
        nullable=False,
    )
    ingestion_job_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("ingestion_jobs.id")
    )
    external_response_id: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint(
        "institution_id", "instrument_id", "external_response_id",
        name="uq_survey_response_tenant_external",
    ),)


class SurveyAnswer(Base):
    __tablename__ = "survey_answers"

    response_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("survey_responses.id"), primary_key=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("survey_questions.id"), primary_key=True
    )
    choice: Mapped[AnswerChoice] = mapped_column(
        Enum(AnswerChoice, name="answer_choice", create_type=False), nullable=False
    )
