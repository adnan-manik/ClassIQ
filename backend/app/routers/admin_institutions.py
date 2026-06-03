"""/api/admin/institutions — super_admin only.

Creates institutions and provisions their first institution_admin via the
Supabase Admin API. The auth.users → public.auth_users trigger handles the
profile row insert.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.models.institution import Institution
from app.repositories import admin as admin_repo
from app.repositories import institutions_admin as ia_repo
from app.schemas.admin import (
    AdminUserShape,
    DepartmentRef,
    InstitutionCreate,
    InstitutionCreateResponse,
    InstitutionDetail,
    InstitutionListItem,
    InstitutionPatch,
)
from app.services import supabase_admin
from app.services.audit import write_audit

router = APIRouter(
    prefix="/admin/institutions",
    tags=["admin: institutions"],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)


@router.get("", response_model=list[InstitutionListItem])
async def list_institutions(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[InstitutionListItem]:
    rows = await admin_repo.list_institutions_with_counts(db)
    return [
        InstitutionListItem(
            id=inst.id,
            name=inst.name,
            slug=inst.slug,
            created_at=inst.created_at,
            department_count=dept_count,
            user_count=user_count,
            student_count=student_count,
        )
        for inst, dept_count, user_count, student_count in rows
    ]


@router.post("", response_model=InstitutionCreateResponse, status_code=201)
async def create_institution(
    body: InstitutionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[AuthUser, Depends(require_role(UserRole.super_admin))],
) -> InstitutionCreateResponse:
    # 1. Ensure slug is unique
    existing = (
        await db.execute(select(Institution).where(Institution.slug == body.slug))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"slug '{body.slug}' is already in use",
        )

    # 2. Create + COMMIT the institution row so the auth-trigger (which runs
    #    in a separate transaction) can see it when it tries to insert
    #    public.auth_users with this institution_id as FK.
    inst = Institution(
        id=uuid.uuid4(),
        name=body.name,
        slug=body.slug,
        created_at=datetime.now(timezone.utc),
    )
    db.add(inst)
    await db.commit()
    await db.refresh(inst)

    # 3. Provision the institution_admin via Supabase Admin API.
    #    Trigger handles public.auth_users insert.
    try:
        if body.mode == "password":
            if not body.admin_password:
                raise HTTPException(400, "mode=password requires admin_password")
            sup = await supabase_admin.create_user_with_password(
                email=body.admin_email,
                password=body.admin_password,
                institution_id=inst.id,
                role=UserRole.institution_admin.value,
                full_name=body.admin_full_name,
            )
        else:
            sup = await supabase_admin.invite_user_by_email(
                email=body.admin_email,
                institution_id=inst.id,
                role=UserRole.institution_admin.value,
                full_name=body.admin_full_name,
            )
    except supabase_admin.SupabaseAdminError as exc:
        # Soft-delete the orphan institution since admin provisioning failed.
        inst.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Failed to provision institution_admin: {exc.body}",
        ) from exc

    new_user_id = UUID(sup["id"]) if isinstance(sup.get("id"), str) else sup["id"]

    # 4. Audit log (separate commit from the institution insert)
    await write_audit(
        db,
        institution_id=inst.id,
        actor_user_id=actor.id,
        action="institution.create",
        entity_type="institution",
        entity_id=inst.id,
        payload={"slug": inst.slug, "admin_email": body.admin_email, "mode": body.mode},
    )
    await db.commit()

    return InstitutionCreateResponse(
        institution=InstitutionListItem(
            id=inst.id,
            name=inst.name,
            slug=inst.slug,
            created_at=inst.created_at,
            department_count=0,
            user_count=1,
            student_count=0,
        ),
        admin_user=AdminUserShape(
            id=new_user_id,
            email=body.admin_email,
            full_name=body.admin_full_name,
            role=UserRole.institution_admin,
        ),
    )


@router.get("/{institution_id}", response_model=InstitutionDetail)
async def get_institution(
    institution_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionDetail:
    inst = await admin_repo.get_institution(db, institution_id)
    if not inst or inst.deleted_at is not None:
        raise HTTPException(404, "Institution not found")
    depts = await admin_repo.list_departments_for_institution(db, institution_id)
    # counts
    counts_rows = await admin_repo.list_institutions_with_counts(db)
    match = next((c for c in counts_rows if c[0].id == institution_id), None)
    dept_count = match[1] if match else len(depts)
    user_count = match[2] if match else 0
    student_count = match[3] if match else 0
    return InstitutionDetail(
        id=inst.id,
        name=inst.name,
        slug=inst.slug,
        created_at=inst.created_at,
        department_count=dept_count,
        user_count=user_count,
        student_count=student_count,
        departments=[DepartmentRef(id=d.id, name=d.name, code=d.code) for d in depts],
    )


@router.patch("/{institution_id}", response_model=InstitutionListItem)
async def patch_institution(
    institution_id: UUID,
    body: InstitutionPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[AuthUser, Depends(require_role(UserRole.super_admin))],
) -> InstitutionListItem:
    inst = await admin_repo.get_institution(db, institution_id)
    if not inst or inst.deleted_at is not None:
        raise HTTPException(404, "Institution not found")
    changes: dict[str, object] = {}
    if body.name is not None:
        inst.name = body.name
        changes["name"] = body.name
    if body.slug is not None:
        inst.slug = body.slug
        changes["slug"] = body.slug
    if changes:
        await write_audit(
            db,
            institution_id=inst.id,
            actor_user_id=actor.id,
            action="institution.update",
            entity_type="institution",
            entity_id=inst.id,
            payload=changes,
        )
        await db.commit()
    return InstitutionListItem(
        id=inst.id,
        name=inst.name,
        slug=inst.slug,
        created_at=inst.created_at,
    )
