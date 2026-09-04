"""Request + response shapes for /api/sections."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.section import SectionState
from app.models.simulation import FactorImpact, PredictedOutcome, SocialImpact
from app.schemas.common import APIModel
from app.schemas.students import StudentListItem
from app.schemas.teachers import TeacherProfileShape


class CourseRef(APIModel):
    id: UUID
    code: str
    name: str


class TeacherRef(APIModel):
    id: UUID
    full_name: str
    email: str
    profile: TeacherProfileShape | None


class SimulationFactorShape(APIModel):
    factor_name: str
    score: int
    weight: float
    impact: FactorImpact


class SimulationResultShape(APIModel):
    id: UUID
    compatibility_score: int
    predicted_outcome: PredictedOutcome
    social_graph_impact: SocialImpact
    style_distribution: dict
    recommended_teacher_id: UUID | None
    recommended_teacher_name: str | None
    factors: list[SimulationFactorShape]


class SectionListItem(APIModel):
    """Compact shape for /api/sections — what the dashboard cards need."""

    id: UUID
    label: str
    state: SectionState
    course: CourseRef
    teacher: TeacherRef | None
    student_count: int
    latest_result: SimulationResultShape | None


class SectionDetail(SectionListItem):
    """/api/sections/{id} — adds the enrolled student roster."""

    students: list[StudentListItem]


class SectionCreate(APIModel):
    """Create a new section (starts in `draft`)."""

    course_id: UUID
    academic_term_id: UUID
    label: str = Field(..., min_length=1, max_length=120)
    teacher_id: UUID | None = None
    student_ids: list[UUID] = Field(default_factory=list)


class SectionUpdate(APIModel):
    """Patch a section. Only the fields present in the request are changed;
    editing a `simulated` section drops it back to `draft`.

    `teacher_id` may be null to unassign. Use `model_fields_set` server-side to
    distinguish "absent" (leave as-is) from null (unassign).
    """

    label: str | None = Field(default=None, min_length=1, max_length=120)
    teacher_id: UUID | None = None


class SectionRosterUpdate(APIModel):
    """Replace the enrolled roster. Editing a `simulated` section drops it to `draft`."""

    student_ids: list[UUID] = Field(default_factory=list)


class SimulationHistoryItem(SimulationResultShape):
    run_id: UUID
    created_at: datetime
    engine_version: str | None


class SectionReport(SectionDetail):
    """F6 report payload — GET /api/reports/sections/{id}."""

    academic_term_id: UUID
    academic_term_name: str | None
    department_id: UUID | None
    department_name: str | None
    history: list[SimulationHistoryItem]
    generated_at: datetime
