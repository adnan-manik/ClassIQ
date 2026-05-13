"""/api/students — list + detail for the HoD's institution."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import current_user
from app.db.session import get_db
from app.models.auth_user import AuthUser
from app.repositories import students as students_repo
from app.schemas.students import (
    StudentAuxShape,
    StudentDetail,
    StudentListItem,
    StudentProfileShape,
)

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[StudentListItem])
async def list_students(
    user: Annotated[AuthUser, Depends(current_user)],
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
    user: Annotated[AuthUser, Depends(current_user)],
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
