"""/api/teachers — list + detail for the HoD's institution."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.repositories import teachers as teachers_repo
from app.schemas.teachers import TeacherDetail, TeacherListItem, TeacherProfileShape

router = APIRouter(prefix="/teachers", tags=["teachers"])

# Roster views are staff-only.
_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


@router.get("", response_model=list[TeacherListItem])
async def list_teachers(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeacherListItem]:
    rows = await teachers_repo.list_teachers_with_current_profile(
        db, user.institution_id
    )
    return [
        TeacherListItem(
            id=t.id,
            full_name=t.full_name,
            email=t.email,
            profile=TeacherProfileShape.model_validate(p) if p else None,
        )
        for (t, p) in rows
    ]


@router.get("/{teacher_id}", response_model=TeacherDetail)
async def get_teacher(
    teacher_id: UUID,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeacherDetail:
    row = await teachers_repo.get_teacher_with_current_profile(
        db, user.institution_id, teacher_id
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found"
        )
    teacher, profile = row
    return TeacherDetail(
        id=teacher.id,
        full_name=teacher.full_name,
        email=teacher.email,
        profile=TeacherProfileShape.model_validate(profile) if profile else None,
    )
