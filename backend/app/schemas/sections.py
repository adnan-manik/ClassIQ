"""Response shapes for /api/sections."""

from uuid import UUID

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
