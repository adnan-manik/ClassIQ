"""Response shapes for S3 — longitudinal learning-style analytics."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from app.models.student import FslsmAxis
from app.schemas.common import APIModel


class AxisScores(APIModel):
    active_reflective: float
    sensing_intuitive: float
    visual_verbal: float
    sequential_global: float


class ProfileVersion(APIModel):
    """One row of a student's versioned FSLSM history."""

    id: UUID
    version: int
    is_current: bool
    scored_at: datetime
    scoring_engine_version: str
    active_reflective_score: int
    sensing_intuitive_score: int
    visual_verbal_score: int
    sequential_global_score: int
    dominant_axis: FslsmAxis | None
    academic_term_id: UUID | None
    academic_term_name: str | None
    source: str | None
    submitted_at: datetime | None


class StudentProfileHistory(APIModel):
    student_id: UUID
    full_name: str
    external_id: str | None
    versions: list[ProfileVersion]
    shift: AxisScores | None  # latest − first, None when < 2 versions


class TermBucket(APIModel):
    academic_term_id: UUID | None
    academic_term_name: str
    starts_on: date | None
    profiles: int
    students: int
    mean: AxisScores
    pole_a_share: AxisScores  # % of profiles leaning to pole A per axis


class VersionBucket(APIModel):
    version: int
    profiles: int
    mean: AxisScores


class StudentShift(APIModel):
    student_id: UUID
    full_name: str
    external_id: str | None
    versions: int
    first_scored_at: datetime
    latest_scored_at: datetime
    first: AxisScores
    latest: AxisScores
    delta: AxisScores
    magnitude: float  # L1 distance across the four axes
    dominant_from: FslsmAxis | None
    dominant_to: FslsmAxis | None


class LongitudinalOverview(APIModel):
    department_id: UUID | None
    students_total: int
    students_with_history: int
    versions_total: int
    by_term: list[TermBucket]
    by_version: list[VersionBucket]
    axis_drift: AxisScores | None  # mean (latest − first) over students with history
    dominant_changed: int  # students whose dominant axis differs first→latest
    top_shifts: list[StudentShift]
