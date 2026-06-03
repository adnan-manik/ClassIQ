"""/api/institution/audit — tenant-scoped audit log tail."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.repositories import institutions_admin as ia_repo
from app.schemas.admin import AuditEntry

router = APIRouter(prefix="/institution/audit", tags=["institution: audit"])

_admin_gate = require_role(UserRole.institution_admin, UserRole.super_admin)


@router.get("", response_model=list[AuditEntry])
async def list_audit(
    actor: Annotated[AuthUser, Depends(_admin_gate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AuditEntry]:
    rows = await ia_repo.list_audit_tail(db, actor.institution_id, limit=limit)
    return [
        AuditEntry(
            id=audit.id,
            institution_id=audit.institution_id,
            institution_name=None,
            actor_user_id=audit.actor_user_id,
            actor_email=actor_email,
            action=audit.action,
            entity_type=audit.entity_type,
            entity_id=audit.entity_id,
            payload=audit.payload,
            created_at=audit.created_at,
        )
        for audit, actor_email in rows
    ]
