"""/api/admin/system — super_admin platform-wide views."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import UserRole
from app.repositories import admin as admin_repo
from app.schemas.admin import (
    AuditEntry,
    IngestionJobItem,
    RoleCount,
    SystemOverview,
)

router = APIRouter(
    prefix="/admin/system",
    tags=["admin: system"],
    dependencies=[Depends(require_role(UserRole.super_admin))],
)


@router.get("/overview", response_model=SystemOverview)
async def system_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SystemOverview:
    o = await admin_repo.system_overview(db)
    return SystemOverview(
        institutions=o["institutions"],
        users_by_role=[
            RoleCount(role=r["role"], count=r["count"]) for r in o["users_by_role"]
        ],
        students=o["students"],
        teachers=o["teachers"],
        sections=o["sections"],
        simulations_last_30d=o["simulations_last_30d"],
    )


@router.get("/audit", response_model=list[AuditEntry])
async def list_global_audit(
    db: Annotated[AsyncSession, Depends(get_db)],
    institution_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
) -> list[AuditEntry]:
    rows = await admin_repo.list_audit_global(
        db, limit=limit, institution_id=institution_id
    )
    return [
        AuditEntry(
            id=audit.id,
            institution_id=audit.institution_id,
            institution_name=inst_name,
            actor_user_id=audit.actor_user_id,
            actor_email=actor_email,
            action=audit.action,
            entity_type=audit.entity_type,
            entity_id=audit.entity_id,
            payload=audit.payload,
            created_at=audit.created_at,
        )
        for audit, inst_name, actor_email in rows
    ]


@router.get("/ingestion-jobs", response_model=list[IngestionJobItem])
async def list_ingestion_jobs(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=100, ge=1, le=500),
) -> list[IngestionJobItem]:
    rows = await admin_repo.list_ingestion_jobs_global(db, limit=limit)
    return [
        IngestionJobItem(
            id=job.id,
            institution_id=job.institution_id,
            institution_name=inst_name,
            source=job.source.value if hasattr(job.source, "value") else str(job.source),
            status=job.status,
            started_at=job.started_at,
            finished_at=job.finished_at,
            summary=job.summary,
            created_at=job.created_at,
        )
        for job, inst_name in rows
    ]
