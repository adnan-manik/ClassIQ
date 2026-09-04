"""/api/institution/courses — course catalogue, audited.

Replaces the direct Supabase insert the Section Builder used to do from a
server action (which bypassed FastAPI and the audit log).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.institution import Course, Department
from app.models.section import Section
from app.models.user_department import UserDepartment
from app.repositories import refs
from app.schemas.institution_admin import CourseCreate, CourseListItem, CoursePatch
from app.services.audit import write_audit

router = APIRouter(prefix="/institution/courses", tags=["institution: courses"])

_gate = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


async def _list(db: AsyncSession, institution_id: UUID) -> list[CourseListItem]:
    section_count = (
        select(func.count())
        .where(Section.course_id == Course.id)
        .where(Section.deleted_at.is_(None))
        .correlate(Course)
        .scalar_subquery()
    )
    stmt = (
        select(Course, Department.code, Department.name, section_count)
        .outerjoin(Department, Department.id == Course.department_id)
        .where(Course.institution_id == institution_id)
        .where(Course.deleted_at.is_(None))
        .order_by(Course.code)
    )
    rows = (await db.execute(stmt)).all()
    return [
        CourseListItem(
            id=c.id,
            code=c.code,
            name=c.name,
            department_id=c.department_id,
            department_code=dcode,
            department_name=dname,
            section_count=n or 0,
            created_at=c.created_at,
        )
        for c, dcode, dname, n in rows
    ]


async def _default_department(db: AsyncSession, actor: AuthUser) -> UUID | None:
    """HoD → their first department; otherwise the institution's first department."""
    if actor.role == UserRole.hod:
        mine = (
            await db.execute(
                select(UserDepartment.department_id)
                .join(Department, Department.id == UserDepartment.department_id)
                .where(UserDepartment.auth_user_id == actor.id)
                .where(Department.deleted_at.is_(None))
                .order_by(Department.name)
                .limit(1)
            )
        ).scalar_one_or_none()
        if mine:
            return mine
    return (
        await db.execute(
            select(Department.id)
            .where(Department.institution_id == actor.institution_id)
            .where(Department.deleted_at.is_(None))
            .order_by(Department.name)
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("", response_model=list[CourseListItem])
async def list_courses(
    actor: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CourseListItem]:
    return await _list(db, actor.institution_id)


@router.post("", response_model=CourseListItem, status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreate,
    actor: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseListItem:
    department_id = body.department_id
    if department_id is not None:
        if not await refs.department_in_institution(db, department_id, actor.institution_id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Department not found in your institution")
    else:
        department_id = await _default_department(db, actor)
        if department_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No departments exist yet — ask an admin to create one first",
            )

    code = body.code.strip().upper()
    dup = (
        await db.execute(
            select(func.count())
            .select_from(Course)
            .where(Course.department_id == department_id)
            .where(func.upper(Course.code) == code)
            .where(Course.deleted_at.is_(None))
        )
    ).scalar_one()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Course code '{code}' already exists in that department")

    course = Course(
        id=uuid.uuid4(),
        institution_id=actor.institution_id,
        department_id=department_id,
        code=code,
        name=body.name.strip(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(course)
    await write_audit(
        db,
        institution_id=actor.institution_id,
        actor_user_id=actor.id,
        action="course.create",
        entity_type="course",
        entity_id=course.id,
        payload={"code": code, "name": course.name, "department_id": str(department_id)},
    )
    await db.commit()
    items = await _list(db, actor.institution_id)
    return next(i for i in items if i.id == course.id)


@router.patch("/{course_id}", response_model=CourseListItem)
async def patch_course(
    course_id: UUID,
    body: CoursePatch,
    actor: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CourseListItem:
    course = await refs.get_course_in_institution(db, course_id, actor.institution_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    changes: dict[str, object] = {}
    if body.code is not None and body.code.strip().upper() != course.code:
        course.code = body.code.strip().upper()
        changes["code"] = course.code
    if body.name is not None and body.name.strip() != course.name:
        course.name = body.name.strip()
        changes["name"] = course.name
    if changes:
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="course.update",
            entity_type="course",
            entity_id=course.id,
            payload=changes,
        )
        await db.commit()
    items = await _list(db, actor.institution_id)
    return next(i for i in items if i.id == course.id)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: UUID,
    actor: Annotated[AuthUser, Depends(_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    course = await refs.get_course_in_institution(db, course_id, actor.institution_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    live = (
        await db.execute(
            select(func.count())
            .select_from(Section)
            .where(Section.course_id == course.id)
            .where(Section.deleted_at.is_(None))
        )
    ).scalar_one()
    if live:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Course has {live} section(s); archive or delete them first"
        )
    course.deleted_at = datetime.now(timezone.utc)
    await write_audit(
        db,
        institution_id=actor.institution_id,
        actor_user_id=actor.id,
        action="course.delete",
        entity_type="course",
        entity_id=course.id,
        payload={"code": course.code},
    )
    await db.commit()
