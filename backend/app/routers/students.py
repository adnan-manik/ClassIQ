"""/api/students — list + detail for the HoD's institution."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import require_role
from app.db.session import get_db
from app.models.auth_user import AuthUser, UserRole
from app.repositories import longitudinal as longitudinal_repo
from app.repositories import students as students_repo
from app.schemas.longitudinal import AxisScores, ProfileVersion, StudentProfileHistory
from app.schemas.students import (
    StudentAuxShape,
    StudentDetail,
    StudentListItem,
    StudentProfileShape,
)

router = APIRouter(prefix="/students", tags=["students"])

# Roster views are for staff only — teachers/students must not enumerate the
# whole institution's students.
_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


@router.get("", response_model=list[StudentListItem])
async def list_students(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[StudentListItem]:
    rows = await students_repo.list_students_with_current_profile(
        db, user.institution_id
    )
    return [
        StudentListItem(
            id=s.id,
            full_name=s.full_name,
            external_id=s.external_id,
            email=s.email,
            dominant_axis=p.dominant_axis if p else None,
            collaboration_pref=a.collaboration_pref if a else None,
            participation_level=a.participation_level if a else None,
        )
        for (s, p, a) in rows
    ]


@router.get("/{student_id}", response_model=StudentDetail)
async def get_student(
    student_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentDetail:
    row = await students_repo.get_student_with_current_profile(
        db, user.institution_id, student_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
        )
    student, profile, aux = row
    return StudentDetail(
        id=student.id,
        full_name=student.full_name,
        external_id=student.external_id,
        email=student.email,
        profile=StudentProfileShape.model_validate(profile) if profile else None,
        aux=StudentAuxShape.model_validate(aux) if aux else None,
    )


@router.get("/{student_id}/profile-history", response_model=StudentProfileHistory)
async def profile_history(
    student_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StudentProfileHistory:
    """S3 — every FSLSM profile version for one student, oldest first."""
    rows = await longitudinal_repo.profile_rows(
        db, user.institution_id, student_id=student_id
    )
    if not rows:
        row = await students_repo.get_student_with_current_profile(
            db, user.institution_id, student_id
        )
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Student not found"
            )
        student = row[0]
        return StudentProfileHistory(
            student_id=student.id,
            full_name=student.full_name,
            external_id=student.external_id,
            versions=[],
            shift=None,
        )
    student = rows[0].student
    versions = [
        ProfileVersion(
            id=r.profile.id,
            version=r.profile.version,
            is_current=r.profile.is_current,
            scored_at=r.profile.scored_at,
            scoring_engine_version=r.profile.scoring_engine_version,
            active_reflective_score=r.profile.active_reflective_score,
            sensing_intuitive_score=r.profile.sensing_intuitive_score,
            visual_verbal_score=r.profile.visual_verbal_score,
            sequential_global_score=r.profile.sequential_global_score,
            dominant_axis=r.profile.dominant_axis,
            academic_term_id=r.term_id,
            academic_term_name=r.term_name,
            source=r.source,
            submitted_at=r.submitted_at,
        )
        for r in rows
    ]
    shift = None
    if len(rows) >= 2:
        first, latest = rows[0].scores(), rows[-1].scores()
        shift = AxisScores(**{a: float(latest[a] - first[a]) for a in longitudinal_repo.AXES})
    return StudentProfileHistory(
        student_id=student.id,
        full_name=student.full_name,
        external_id=student.external_id,
        versions=versions,
        shift=shift,
    )
