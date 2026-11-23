"""survey_forms / survey_form_submissions — shareable, code-addressed surveys.

See db/migrations/2026-11-23_survey_forms.sql.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SurveyFormStatus(str, enum.Enum):
    draft = "draft"
    open = "open"
    closed = "closed"


class SurveyForm(Base):
    __tablename__ = "survey_forms"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("departments.id"))
    section_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("sections.id"))
    academic_term_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("academic_terms.id")
    )
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    status: Mapped[SurveyFormStatus] = mapped_column(
        Enum(SurveyFormStatus, name="survey_form_status", create_type=False),
        nullable=False,
        default=SurveyFormStatus.draft,
    )
    include_ils: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ils_wording: Mapped[str] = mapped_column(String, nullable=False, default="rdf")
    collect_collaboration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    collect_participation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    collect_peers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    peer_options: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    max_peer_picks: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=5)
    extra_questions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    allow_new_students: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("auth_users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SurveyFormSubmission(Base):
    __tablename__ = "survey_form_submissions"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("institutions.id"), nullable=False
    )
    form_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("survey_forms.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID, ForeignKey("students.id"), nullable=False
    )
    survey_response_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("survey_responses.id")
    )
    student_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("student_profiles.id")
    )
    aux_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID, ForeignKey("student_aux_profiles.id")
    )
    profile: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    peers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    extra_answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[uuid.UUID | None] = mapped_column(PG_UUID, ForeignKey("auth_users.id"))
