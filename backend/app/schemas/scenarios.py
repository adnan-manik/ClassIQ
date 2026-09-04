"""Request + response shapes for /api/scenarios (F5 what-if testing)."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.scenario import ScenarioStatus
from app.schemas.common import APIModel
from app.schemas.sections import CourseRef, SimulationResultShape, TeacherRef
from app.schemas.students import StudentListItem


# ─── Requests ───────────────────────────────────────────────────────────────

class ScenarioSectionInput(APIModel):
    """One hypothetical section inside a scenario."""

    course_id: UUID
    teacher_id: UUID
    label: str = Field(..., min_length=1, max_length=120)
    student_ids: list[UUID] = Field(default_factory=list)


class ScenarioCreate(APIModel):
    name: str = Field(..., min_length=1, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    academic_term_id: UUID
    # Optional — derived from the first section's course when absent.
    department_id: UUID | None = None
    sections: list[ScenarioSectionInput] = Field(..., min_length=1)


class ScenarioUpdate(APIModel):
    """Patch name / notes, and optionally replace the whole section list.
    Replacing sections drops the scenario back to `draft` and discards its
    previous simulation results."""

    name: str | None = Field(default=None, min_length=1, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)
    sections: list[ScenarioSectionInput] | None = Field(default=None, min_length=1)


class ScenarioCloneRequest(APIModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)


# ─── Responses ──────────────────────────────────────────────────────────────

class ScenarioSectionShape(APIModel):
    id: UUID
    course: CourseRef
    teacher: TeacherRef | None
    label: str
    student_count: int
    students: list[StudentListItem]
    latest_result: SimulationResultShape | None


class ScenarioListItem(APIModel):
    id: UUID
    name: str
    notes: str | None
    status: ScenarioStatus
    academic_term_id: UUID
    academic_term_name: str | None
    department_id: UUID
    created_at: datetime
    updated_at: datetime | None
    section_count: int
    avg_score: float | None
    last_simulated_at: datetime | None


class ScenarioDetail(ScenarioListItem):
    sections: list[ScenarioSectionShape]


class ScenarioSimulateResponse(APIModel):
    run_id: UUID
    scenario_id: UUID
    status: ScenarioStatus
    avg_score: float | None
    sections: list[ScenarioSectionShape]
    skipped: list[str] = Field(
        default_factory=list,
        description="Sections that could not be scored (e.g. empty roster) and why.",
    )


class FactorDeltaShape(APIModel):
    factor_name: str
    baseline_score: int | None
    scenario_score: int
    delta: int | None
    weight: float


class RosterDiffShape(APIModel):
    added: int
    removed: int
    kept: int


class ScenarioCompareRow(APIModel):
    scenario_section_id: UUID
    course: CourseRef
    label: str
    scenario_teacher: TeacherRef | None
    scenario_student_count: int
    scenario_result: SimulationResultShape | None
    baseline_section_id: UUID | None
    baseline_state: str | None
    baseline_teacher: TeacherRef | None
    baseline_student_count: int | None
    baseline_result: SimulationResultShape | None
    score_delta: int | None
    factor_deltas: list[FactorDeltaShape]
    roster: RosterDiffShape


class ScenarioCompareResponse(APIModel):
    scenario: ScenarioListItem
    rows: list[ScenarioCompareRow]
    baseline_avg: float | None
    scenario_avg: float | None
    avg_delta: float | None


class AppliedSectionShape(APIModel):
    section_id: UUID
    course: CourseRef
    label: str
    created: bool
    compatibility_score: int | None


class ScenarioApplyResponse(APIModel):
    scenario_id: UUID
    status: ScenarioStatus
    applied: list[AppliedSectionShape]
