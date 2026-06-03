"""/api/institution/users — single-user CRUD for institution_admin / super_admin."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.user_department import UserDepartment
from app.repositories import institutions_admin as ia_repo
from app.schemas.institution_admin import UserCreate, UserListItem, UserPatch
from app.services import supabase_admin
from app.services.audit import write_audit

router = APIRouter(prefix="/institution/users", tags=["institution: users"])

_admin_gate = require_role(UserRole.institution_admin, UserRole.super_admin, UserRole.hod)

# Roles the institution_admin is allowed to create (cannot create super_admin)
CREATABLE_ROLES = {
    UserRole.institution_admin,
    UserRole.hod,
    UserRole.teacher,
    UserRole.student,
}


@router.get("", response_model=list[UserListItem])
async def list_users(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    role: UserRole | None = Query(default=None),
) -> list[UserListItem]:
    rows = await ia_repo.list_users(db, actor.institution_id, role=role)
    return [
        UserListItem(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at,
            department_codes=dept_codes,
        )
        for u, dept_codes in rows
    ]


@router.post("", response_model=UserListItem, status_code=201)
async def create_user(
    body: UserCreate,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserListItem:
    if body.role not in CREATABLE_ROLES:
        raise HTTPException(403, f"Cannot create users with role={body.role.value}")

    # Students don't require an auth account — they're just roster rows
    if body.role == UserRole.student:
        # Store the external_id (student ID)
        student = Student(
            id=uuid.uuid4(),
            institution_id=actor.institution_id,
            department_id=body.department_id,
            external_id=body.external_id,
            full_name=body.full_name,
            email=str(body.email),
            created_at=datetime.now(timezone.utc),
        )
        db.add(student)
        await db.flush()
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="user.create",
            entity_type="student",
            entity_id=student.id,
            payload={"email": str(body.email), "role": "student", "external_id": body.external_id},
        )
        await db.commit()
        return UserListItem(
            id=student.id,
            email=student.email or "",
            full_name=student.full_name,
            role=UserRole.student,
            is_active=True,
            created_at=student.created_at,
            department_codes=[],
        )

    # Roles that need an auth account: institution_admin, hod, teacher
    existing = await ia_repo.auth_user_by_email(
        db, actor.institution_id, str(body.email)
    )
    if existing is not None:
        raise HTTPException(409, f"User {body.email} already exists")

    try:
        if body.mode == "password":
            if not body.password:
                raise HTTPException(400, "mode=password requires a password")
            sup = await supabase_admin.create_user_with_password(
                email=str(body.email),
                password=body.password,
                institution_id=actor.institution_id,
                role=body.role.value,
                full_name=body.full_name,
            )
        else:
            sup = await supabase_admin.invite_user_by_email(
                email=str(body.email),
                institution_id=actor.institution_id,
                role=body.role.value,
                full_name=body.full_name,
            )
    except supabase_admin.SupabaseAdminError as exc:
        raise HTTPException(502, f"Supabase admin API failed: {exc.body}") from exc

    new_user_id = UUID(sup["id"]) if isinstance(sup.get("id"), str) else sup["id"]
    now = datetime.now(timezone.utc)

    # Trigger writes auth_users — we can also write teacher/department links here.
    if body.department_id is not None and body.role in (
        UserRole.hod,
        UserRole.teacher,
    ):
        db.add(
            UserDepartment(
                auth_user_id=new_user_id,
                department_id=body.department_id,
                created_at=now,
            )
        )

    if body.role == UserRole.teacher:
        # Insert the public.teachers row referencing the new auth user.
        db.add(
            Teacher(
                id=uuid.uuid4(),
                institution_id=actor.institution_id,
                department_id=body.department_id,
                full_name=body.full_name,
                email=str(body.email),
                auth_user_id=new_user_id,
                created_at=now,
            )
        )

    await write_audit(
        db,
        institution_id=actor.institution_id,
        actor_user_id=actor.id,
        action="user.create",
        entity_type="auth_user",
        entity_id=new_user_id,
        payload={"email": str(body.email), "role": body.role.value, "mode": body.mode},
    )
    await db.commit()

    return UserListItem(
        id=new_user_id,
        email=str(body.email),
        full_name=body.full_name,
        role=body.role,
        is_active=True,
        created_at=now,
        department_codes=[],
    )


@router.patch("/{user_id}", response_model=UserListItem)
async def patch_user(
    user_id: UUID,
    body: UserPatch,
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserListItem:
    user = await ia_repo.get_auth_user(db, actor.institution_id, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    changes: dict[str, object] = {}
    if body.full_name is not None:
        user.full_name = body.full_name
        changes["full_name"] = body.full_name
    if body.is_active is not None:
        user.is_active = body.is_active
        changes["is_active"] = body.is_active
    if changes:
        await write_audit(
            db,
            institution_id=actor.institution_id,
            actor_user_id=actor.id,
            action="user.update",
            entity_type="auth_user",
            entity_id=user.id,
            payload=changes,
        )
        await db.commit()
    rows = await ia_repo.list_users(db, actor.institution_id)
    dept_codes = next((c for u, c in rows if u.id == user.id), [])
    return UserListItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        department_codes=dept_codes,
    )

