"""Response shapes for /api/institution/analytics/*."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from app.schemas.common import APIModel


class FslsmAxisCount(APIModel):
    axis: str  # active_reflective | sensing_intuitive | visual_verbal | sequential_global
    pole_a_count: int
    pole_b_count: int
    pole_a_label: str
    pole_b_label: str


class FslsmDistribution(APIModel):
    total_profiles: int
    axes: list[FslsmAxisCount]


class DepartmentRollup(APIModel):
    department_id: UUID
    department_name: str
    department_code: str
    student_count: int
    teacher_count: int
    section_count: int
    avg_compatibility_score: float | None
    simulations_run: int


class ScoreTrendPoint(APIModel):
    bucket_start: date
    avg_score: float
    runs: int


class InstitutionAnalyticsOverview(APIModel):
    student_count: int
    teacher_count: int
    section_count: int
    simulation_count: int
    avg_compatibility_score: float | None
    fslsm: FslsmDistribution
    departments: list[DepartmentRollup]


class SimulationsByDepartment(APIModel):
    department_id: UUID
    department_name: str
    department_code: str
    runs_last_30d: int
    avg_score: float | None
