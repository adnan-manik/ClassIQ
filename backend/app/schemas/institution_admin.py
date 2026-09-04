"""Response shapes for /api/institution/* (institution_admin or super_admin)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field

from app.models.auth_user import UserRole
from app.models.ingestion_job import IngestionStatus
from app.schemas.common import APIModel


# ─── Departments ────────────────────────────────────────────────────────────

class DepartmentCreate(APIModel):
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1, max_length=16)
    hod_auth_user_id: UUID | None = None


class DepartmentPatch(APIModel):
    name: str | None = None
    code: str | None = Field(default=None, min_length=1, max_length=16)


class HodRef(APIModel):
    auth_user_id: UUID
    full_name: str
    email: str


class DepartmentListItem(APIModel):
    id: UUID
    name: str
    code: str
    created_at: datetime
    member_count: int = 0
    teacher_count: int = 0
    student_count: int = 0
    course_count: int = 0
    hods: list[HodRef] = []


class DepartmentDetail(DepartmentListItem):
    pass


class AssignHodRequest(APIModel):
    auth_user_id: UUID


# ─── Users ──────────────────────────────────────────────────────────────────

class UserListItem(APIModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    department_codes: list[str] = []


class UserCreate(APIModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1)
    role: UserRole  # validated: must not be super_admin
    external_id: str | None = None  # Student ID
    department_id: UUID | None = None
    mode: str = Field(default="invite", pattern=r"^(invite|password)$")
    password: str | None = Field(default=None, min_length=8)


class UserPatch(APIModel):
    full_name: str | None = None
    is_active: bool | None = None


# ─── CSV import ─────────────────────────────────────────────────────────────

class UserImportPreviewRow(APIModel):
    line: int
    email: str
    full_name: str
    role: str
    department_code: str | None
    password: str | None


class UserImportPreviewError(APIModel):
    line: int
    field: str
    message: str


class UserImportPreview(APIModel):
    total: int
    valid: list[UserImportPreviewRow]
    errors: list[UserImportPreviewError]


class UserImportResult(APIModel):
    ingestion_job_id: UUID
    total: int
    created: int
    failed: int
    status: IngestionStatus
    errors: list[UserImportPreviewError]


# ─── Courses ────────────────────────────────────────────────────────────────

class CourseCreate(APIModel):
    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=160)
    # Optional — HoDs default to their own department, admins to the first one.
    department_id: UUID | None = None


class CoursePatch(APIModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=1, max_length=160)


class CourseListItem(APIModel):
    id: UUID
    code: str
    name: str
    department_id: UUID
    department_code: str | None
    department_name: str | None
    section_count: int = 0
    created_at: datetime
