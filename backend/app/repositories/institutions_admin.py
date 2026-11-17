"""Tenant-scoped queries for the Institution Admin panel."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.auth_user import AuthUser, UserRole
from app.models.institution import Course, Department
from app.models.student import Student
from app.models.teacher import Teacher
from app.models.user_department import UserDepartment


# ─── Departments ────────────────────────────────────────────────────────────

async def list_departments_with_counts(
    db: AsyncSession, institution_id: UUID
) -> list[tuple[Department, int, int, int, int]]:
    """Each department with (member_count, teacher_count, student_count, course_count)."""
    member_subq = (
        select(func.count())
        .where(UserDepartment.department_id == Department.id)
        .correlate(Department)
        .scalar_subquery()
    )
    teacher_subq = (
        select(func.count())
        .where(Teacher.department_id == Department.id)
        .where(Teacher.deleted_at.is_(None))
        .correlate(Department)
        .scalar_subquery()
    )
    student_subq = (
        select(func.count())
        .where(Student.department_id == Department.id)
        .where(Student.deleted_at.is_(None))
        .correlate(Department)
        .scalar_subquery()
    )
    course_subq = (
        select(func.count())
        .where(Course.department_id == Department.id)
        .where(Course.deleted_at.is_(None))
        .correlate(Department)
        .scalar_subquery()
    )
    stmt = (
        select(Department, member_subq, teacher_subq, student_subq, course_subq)
        .where(Department.institution_id == institution_id)
        .where(Department.deleted_at.is_(None))
        .order_by(Department.name)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1] or 0, r[2] or 0, r[3] or 0, r[4] or 0) for r in rows]


async def get_department(
    db: AsyncSession, institution_id: UUID, department_id: UUID
) -> Department | None:
    stmt = (
        select(Department)
        .where(Department.id == department_id)
        .where(Department.institution_id == institution_id)
        .where(Department.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_hods_of_department(
    db: AsyncSession, department_id: UUID
) -> list[AuthUser]:
    stmt = (
        select(AuthUser)
        .join(UserDepartment, UserDepartment.auth_user_id == AuthUser.id)
        .where(UserDepartment.department_id == department_id)
        .where(AuthUser.role == UserRole.hod)
        .order_by(AuthUser.full_name)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_hods_of_departments(
    db: AsyncSession, department_ids: Sequence[UUID]
) -> dict[UUID, list[AuthUser]]:
    """HODs grouped by department, in one query rather than one per department."""
    ids = list(department_ids)
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(UserDepartment.department_id, AuthUser)
            .join(AuthUser, AuthUser.id == UserDepartment.auth_user_id)
            .where(UserDepartment.department_id.in_(ids))
            .where(AuthUser.role == UserRole.hod)
            .order_by(AuthUser.full_name)
        )
    ).all()
    out: dict[UUID, list[AuthUser]] = {}
    for department_id, hod in rows:
        out.setdefault(department_id, []).append(hod)
    return out


async def department_code_exists(
    db: AsyncSession, institution_id: UUID, code: str
) -> bool:
    stmt = (
        select(func.count())
        .select_from(Department)
        .where(Department.institution_id == institution_id)
        .where(Department.code == code)
        .where(Department.deleted_at.is_(None))
    )
    return ((await db.execute(stmt)).scalar_one() or 0) > 0


async def department_codes_to_ids(
    db: AsyncSession, institution_id: UUID, codes: Sequence[str]
) -> dict[str, UUID]:
    """Resolve several department codes at once, exact-match as before.

    A code with no live department is simply absent from the result, so callers
    still get None from `.get(code)`.
    """
    wanted = list(dict.fromkeys(codes))
    if not wanted:
        return {}
    rows = (
        await db.execute(
            select(Department.code, Department.id)
            .where(Department.institution_id == institution_id)
            .where(Department.code.in_(wanted))
            .where(Department.deleted_at.is_(None))
        )
    ).all()
    return {code: department_id for code, department_id in rows}


# ─── Users ──────────────────────────────────────────────────────────────────

async def list_users(
    db: AsyncSession,
    institution_id: UUID,
    *,
    role: UserRole | None = None,
) -> list[tuple[AuthUser, list[str]]]:
    """Auth users in the institution, with their department codes flattened."""
    stmt = (
        select(AuthUser)
        .where(AuthUser.institution_id == institution_id)
        .order_by(AuthUser.full_name)
    )
    if role is not None:
        stmt = stmt.where(AuthUser.role == role)
    users = list((await db.execute(stmt)).scalars().all())

    if not users:
        return []
    user_ids = [u.id for u in users]
    dept_stmt = (
        select(UserDepartment.auth_user_id, Department.code)
        .join(Department, Department.id == UserDepartment.department_id)
        .where(UserDepartment.auth_user_id.in_(user_ids))
        .where(Department.deleted_at.is_(None))
    )
    rows = (await db.execute(dept_stmt)).all()
    by_user: dict[UUID, list[str]] = {}
    for uid, code in rows:
        by_user.setdefault(uid, []).append(code)
    return [(u, by_user.get(u.id, [])) for u in users]


async def get_auth_user(
    db: AsyncSession, institution_id: UUID, auth_user_id: UUID
) -> AuthUser | None:
    stmt = (
        select(AuthUser)
        .where(AuthUser.id == auth_user_id)
        .where(AuthUser.institution_id == institution_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def auth_user_by_email(
    db: AsyncSession, institution_id: UUID, email: str
) -> AuthUser | None:
    stmt = (
        select(AuthUser)
        .where(AuthUser.institution_id == institution_id)
        .where(AuthUser.email == email)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def existing_auth_user_emails(
    db: AsyncSession, institution_id: UUID, emails: Sequence[str]
) -> set[str]:
    """Which of `emails` already have an auth_users row in this institution.

    Matched exactly, like `auth_user_by_email`, so the bulk import rejects the
    same rows it did when it asked one query at a time.
    """
    wanted = list(dict.fromkeys(emails))
    if not wanted:
        return set()
    return set(
        (
            await db.execute(
                select(AuthUser.email)
                .where(AuthUser.institution_id == institution_id)
                .where(AuthUser.email.in_(wanted))
            )
        )
        .scalars()
        .all()
    )


# ─── Audit tail (tenant-scoped) ─────────────────────────────────────────────

async def list_audit_tail(
    db: AsyncSession,
    institution_id: UUID,
    *,
    limit: int = 100,
) -> list[tuple[AuditLog, str | None]]:
    """Recent audit entries with actor email joined."""
    stmt = (
        select(AuditLog, AuthUser.email)
        .join(AuthUser, AuthUser.id == AuditLog.actor_user_id, isouter=True)
        .where(AuditLog.institution_id == institution_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [(r[0], r[1]) for r in rows]


# ─── Tenant-scoped audit-log writer helper ──────────────────────────────────

def now_utc() -> datetime:
    return datetime.now(timezone.utc)
