"""Response shapes for /api/teachers."""

from datetime import datetime
from uuid import UUID

from app.models.teacher import InteractionLevel, PacingPref
from app.schemas.common import APIModel


class TeacherProfileShape(APIModel):
    version: int
    is_current: bool
    teaching_style: str
    interaction_level: InteractionLevel
    pacing: PacingPref
    approach: str | None
    collected_at: datetime


class TeacherListItem(APIModel):
    id: UUID
    full_name: str
    email: str
    profile: TeacherProfileShape | None


class TeacherDetail(TeacherListItem):
    """Same as list for now — extend later when we add scheduling info."""
