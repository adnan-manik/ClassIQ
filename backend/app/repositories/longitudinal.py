"""S3 — queries over versioned student_profiles (DATA_MODEL §14 Q4 generalised)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.institution import AcademicTerm
from app.models.section import SectionStudent
from app.models.student import FslsmAxis, Student, StudentProfile
from app.models.survey import SurveyResponse

AXES = ("active_reflective", "sensing_intuitive", "visual_verbal", "sequential_global")


@dataclass(slots=True)
class ProfileRow:
    profile: StudentProfile
    student: Student
    term_id: UUID | None
    term_name: str | None
    term_start: date | None
    source: str | None
    submitted_at: datetime | None

    def scores(self) -> dict[str, int]:
        return {a: int(getattr(self.profile, f"{a}_score")) for a in AXES}


async def profile_rows(
    db: AsyncSession,
    institution_id: UUID,
    *,
    student_id: UUID | None = None,
    department_id: UUID | None = None,
    section_id: UUID | None = None,
) -> list[ProfileRow]:
    """Every (non-deleted) profile version with its student, term and source."""
    stmt = (
        select(
            StudentProfile,
            Student,
            SurveyResponse.academic_term_id,
            AcademicTerm.name,
            AcademicTerm.starts_on,
            SurveyResponse.source,
            SurveyResponse.submitted_at,
        )
        .join(Student, Student.id == StudentProfile.student_id)
        .outerjoin(SurveyResponse, SurveyResponse.id == StudentProfile.derived_from_response_id)
        .outerjoin(AcademicTerm, AcademicTerm.id == SurveyResponse.academic_term_id)
        .where(StudentProfile.institution_id == institution_id)
        .where(StudentProfile.deleted_at.is_(None))
        .where(Student.deleted_at.is_(None))
        .order_by(Student.full_name, StudentProfile.student_id, StudentProfile.version)
    )
    if student_id is not None:
        stmt = stmt.where(StudentProfile.student_id == student_id)
    if department_id is not None:
        stmt = stmt.where(Student.department_id == department_id)
    if section_id is not None:
        # Students currently on the section's roster.
        stmt = stmt.where(
            Student.id.in_(
                select(SectionStudent.student_id)
                .where(SectionStudent.section_id == section_id)
                .where(SectionStudent.removed_at.is_(None))
            )
        )
    rows = (await db.execute(stmt)).all()
    return [
        ProfileRow(
            profile=r[0],
            student=r[1],
            term_id=r[2],
            term_name=r[3],
            term_start=r[4],
            source=r[5].value if hasattr(r[5], "value") else (r[5] if r[5] else None),
            submitted_at=r[6],
        )
        for r in rows
    ]


def group_by_student(rows: list[ProfileRow]) -> dict[UUID, list[ProfileRow]]:
    out: dict[UUID, list[ProfileRow]] = defaultdict(list)
    for r in rows:
        out[r.student.id].append(r)
    for lst in out.values():
        lst.sort(key=lambda x: x.profile.version)
    return out


def mean_scores(rows: list[ProfileRow]) -> dict[str, float]:
    if not rows:
        return {a: 0.0 for a in AXES}
    return {a: round(sum(r.scores()[a] for r in rows) / len(rows), 2) for a in AXES}


def pole_a_share(rows: list[ProfileRow]) -> dict[str, float]:
    if not rows:
        return {a: 0.0 for a in AXES}
    return {
        a: round(100.0 * sum(1 for r in rows if r.scores()[a] > 0) / len(rows), 1) for a in AXES
    }


def dominant(profile: StudentProfile) -> FslsmAxis | None:
    return profile.dominant_axis
