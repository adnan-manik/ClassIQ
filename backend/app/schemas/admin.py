"""Response shapes for /api/admin/* (super_admin only)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.models.auth_user import UserRole
from app.models.ingestion_job import IngestionStatus
from app.schemas.common import APIModel


class InstitutionListItem(APIModel):
    id: UUID
    name: str
    slug: str
    created_at: datetime
    department_count: int = 0
    user_count: int = 0
    student_count: int = 0


class InstitutionCreate(APIModel):
    name: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1, pattern=r"^[a-z0-9][a-z0-9-]*$")
    admin_email: EmailStr
    admin_full_name: str = Field(..., min_length=1)
    admin_password: str | None = Field(default=None, min_length=8)
    # if password is None we send an invite, else we create with password
    mode: str = Field(default="invite", pattern=r"^(invite|password)$")


class AdminUserShape(APIModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole


class InstitutionCreateResponse(APIModel):
    institution: InstitutionListItem
    admin_user: AdminUserShape


class InstitutionDetail(InstitutionListItem):
    departments: list["DepartmentRef"]


class DepartmentRef(APIModel):
    id: UUID
    name: str
    code: str


class InstitutionPatch(APIModel):
    name: str | None = None
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]*$")


class RoleCount(APIModel):
    role: UserRole
    count: int


class SystemOverview(APIModel):
    institutions: int
    users_by_role: list[RoleCount]
    students: int
    teachers: int
    sections: int
    simulations_last_30d: int


class AuditEntry(APIModel):
    id: UUID
    institution_id: UUID
    institution_name: str | None
    actor_user_id: UUID | None
    actor_email: str | None
    action: str
    entity_type: str
    entity_id: UUID | None
    payload: dict | None
    created_at: datetime


class IngestionJobItem(APIModel):
    id: UUID
    institution_id: UUID
    institution_name: str | None
    source: str
    status: IngestionStatus
    started_at: datetime | None
    finished_at: datetime | None
    summary: dict | None
    created_at: datetime


InstitutionDetail.model_rebuild()
