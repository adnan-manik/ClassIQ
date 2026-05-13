"""Response shapes for /api/students."""

from datetime import datetime
from uuid import UUID

from app.models.student import CollabPref, FslsmAxis, ParticipationLevel
from app.schemas.common import APIModel


class StudentProfileShape(APIModel):
    version: int
    is_current: bool
    scored_at: datetime
    scoring_engine_version: str
    active_reflective_score: int
    sensing_intuitive_score: int
    visual_verbal_score: int
    sequential_global_score: int
    dominant_axis: FslsmAxis | None


class StudentAuxShape(APIModel):
    collaboration_pref: CollabPref | None
    participation_level: ParticipationLevel | None


class StudentListItem(APIModel):
    """Compact shape for the /api/students list view."""

    id: UUID
    full_name: str
    external_id: str | None
    email: str | None
    dominant_axis: FslsmAxis | None
    collaboration_pref: CollabPref | None
    participation_level: ParticipationLevel | None


class StudentDetail(APIModel):
    """Full detail for /api/students/{id}."""

    id: UUID
    full_name: str
    external_id: str | None
    email: str | None
    profile: StudentProfileShape | None
    aux: StudentAuxShape | None
