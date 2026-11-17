"""/api/institution/departments — institution_admin or super_admin."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.institution import Department
from app.models.user_department import UserDepartment
from app.repositories import institutions_admin as ia_repo
from app.schemas.institution_admin import (
    AssignHodRequest,
    DepartmentCreate,
    DepartmentDetail,
    DepartmentListItem,
    DepartmentPatch,
    HodRef,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/institution/departments", tags=["institution: departments"])

_admin_gate = require_role(UserRole.institution_admin, UserRole.super_admin)


@router.get("", response_model=list[DepartmentListItem])
async def list_departments(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[DepartmentListItem]:
    rows = await ia_repo.list_departments_with_counts(db, actor.institution_id)
    # One query for every department's HODs, not one per department.
    hods_by_dept = await ia_repo.list_hods_of_departments(
        db, [dept.id for dept, *_ in rows]
    )
    items: list[DepartmentListItem] = []
    for dept, members, teachers, students, courses in rows:
        hods = hods_by_dept.get(dept.id, [])
        items.append(
            DepartmentListItem(
                id=dept.id,
                name=dept.name,
                code=dept.code,
                created_at=dept.created_at,
                member_count=members,
                teacher_count=teachers,
                student_count=students,
                course_count=courses,
                hods=[
                    HodRef(auth_user_id=h.id, full_name=h.full_name, email=h.email)
                    for h in hods
                ],
            )
        )
    return items


@router.post("", response_model=DepartmentListItem, status_code=201)
async def create_department(
    body: DepartmentCreate,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DepartmentListItem:
    if await ia_repo.department_code_exists(db, actor.institution_id, body.code):
        raise HTTPException(409, f"Department code '{body.code}' already exists")
    dept = Department(
        id=uuid.uuid4(),
        institution_id=actor.institution_id,
        name=body.name,
        code=body.code,
        created_at=datetime.now(timezone.utc),
    )
    db.add(dept)
    await db.flush()

    if body.hod_auth_user_id is not None:
        # Verify the HoD exists in the same institution
        hod = await ia_repo.get_auth_user(db, actor.institution_id, body.hod_auth_user_id)
        if not hod:
            raise HTTPException(400, "hod_auth_user_id not in this institution")
        db.add(
            UserDepartment(
                auth_user_id=hod.id,
                department_id=dept.id,
                created_at=datetime.now(timezone.utc),
            )
        )

    await write_audit(
        db,
        institution_id=actor.institution_id,
        actor_user_id=actor.id,
        action="department.create",
        entity_type="department",
        entity_id=dept.id,
        payload={
            "name": body.name,
            "code": body.code,
            "hod_auth_user_id": str(body.hod_auth_user_id)
            if body.hod_auth_user_id
            else None,
        },
    )
    await db.commit()

    hods = await ia_repo.list_hods_of_department(db, dept.id)
    return DepartmentListItem(
        id=dept.id,
        name=dept.name,
        code=dept.code,
        created_at=dept.created_at,
        member_count=len(hods),
        teacher_count=0,
        student_count=0,
        course_count=0,
        hods=[
            HodRef(auth_user_id=h.id, full_name=h.full_name, email=h.email)
            for h in hods
        ],
    )


@router.get("/{department_id}", response_model=DepartmentDetail)
async def get_department(
    department_id: UUID,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DepartmentDetail:
    dept = await ia_repo.get_department(db, actor.institution_id, department_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    rows = await ia_repo.list_departments_with_counts(db, actor.institution_id)
    counts = next((r for r in rows if r[0].id == department_id), None)
    member_count, teacher_count, student_count, course_count = (
        (counts[1], counts[2], counts[3], counts[4]) if counts else (0, 0, 0, 0)
    )
    hods = await ia_repo.list_hods_of_department(db, department_id)
    return DepartmentDetail(
        id=dept.id,
        name=dept.name,
        code=dept.code,
        created_at=dept.created_at,
        member_count=member_count,
        teacher_count=teacher_count,
        student_count=student_count,
        course_count=course_count,
        hods=[
            HodRef(auth_user_id=h.id, full_name=h.full_name, email=h.email)
            for h in hods
        ],
    )


@router.patch("/{department_id}", response_model=DepartmentListItem)
async def patch_department(
    department_id: UUID,
    body: DepartmentPatch,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DepartmentListItem:
    dept = await ia_repo.get_department(db, actor.institution_id, department_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    changes: dict[str, object] = {}
    if body.name is not None:
        dept.name = body.name
        changes["name"] = body.name
    if body.code is not None and body.code != dept.code:
        if await ia_repo.department_code_exists(db, actor.institution_id, body.code):
            raise HTTPException(409, f"Department code '{body.code}' already exists")
        dept.code = body.code
        changes["code"] = body.code
    if changes:
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="department.update",
            entity_type="department",
            entity_id=dept.id,
            payload=changes,
        )
        await db.commit()
    return await get_department(department_id, actor, db)


@router.post("/{department_id}/hods", status_code=204)
async def assign_hod(
    department_id: UUID,
    body: AssignHodRequest,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    dept = await ia_repo.get_department(db, actor.institution_id, department_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    user = await ia_repo.get_auth_user(db, actor.institution_id, body.auth_user_id)
    if not user:
        raise HTTPException(400, "User not in this institution")
    if user.role != UserRole.hod:
        raise HTTPException(400, "User is not an HoD")
    # Insert if not present
    existing = await db.get(UserDepartment, (user.id, dept.id))
    if existing is None:
        db.add(
            UserDepartment(
                auth_user_id=user.id,
                department_id=dept.id,
                created_at=datetime.now(timezone.utc),
            )
        )
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="department.assign_hod",
            entity_type="department",
            entity_id=dept.id,
            payload={"hod_auth_user_id": str(user.id)},
        )
        await db.commit()


@router.delete("/{department_id}/hods/{auth_user_id}", status_code=204)
async def remove_hod(
    department_id: UUID,
    auth_user_id: UUID,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    dept = await ia_repo.get_department(db, actor.institution_id, department_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    existing = await db.get(UserDepartment, (auth_user_id, dept.id))
    if existing is not None:
        await db.delete(existing)
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="department.remove_hod",
            entity_type="department",
            entity_id=dept.id,
            payload={"hod_auth_user_id": str(auth_user_id)},
        )
        await db.commit()
