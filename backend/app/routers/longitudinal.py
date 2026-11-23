"""S3 — longitudinal learning-style analytics.

    GET /api/analytics/longitudinal?department_id=&section_id=&top=   cohort view
    GET /api/students/{id}/profile-history                   (lives in routers/students.py)

Leverages versioned `student_profiles` (`version` + `is_current`): every new
survey submission adds a version, so a student's FSLSM trajectory is one
ORDER BY version away.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import require_role
from app.models.auth_user import AuthUser, UserRole
from app.repositories import longitudinal as repo
from app.repositories import refs
from app.repositories import sections as sections_repo
from app.schemas.longitudinal import (
    AxisScores,
    LongitudinalOverview,
    StudentShift,
    TermBucket,
    VersionBucket,
)

router = APIRouter(prefix="/analytics", tags=["analytics: longitudinal"])

_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


def _axis(d: dict[str, float | int]) -> AxisScores:
    return AxisScores(**{a: float(d[a]) for a in repo.AXES})


def build_overview(
    rows: list[repo.ProfileRow],
    *,
    department_id: UUID | None,
    top: int,
    section_id: UUID | None = None,
) -> LongitudinalOverview:
    """Pure aggregation over profile rows — reused by tests."""
    by_student = repo.group_by_student(rows)

    # ── by term (profiles bucketed by the term of their survey response) ──
    term_groups: dict[UUID | None, list[repo.ProfileRow]] = {}
    for r in rows:
        term_groups.setdefault(r.term_id, []).append(r)
    by_term: list[TermBucket] = []
    for tid, group in term_groups.items():
        by_term.append(
            TermBucket(
                academic_term_id=tid,
                academic_term_name=group[0].term_name or "Unassigned term",
                starts_on=group[0].term_start,
                profiles=len(group),
                students=len({g.student.id for g in group}),
                mean=_axis(repo.mean_scores(group)),
                pole_a_share=_axis(repo.pole_a_share(group)),
            )
        )
    by_term.sort(key=lambda b: (b.starts_on is None, b.starts_on or __import__("datetime").date.min))

    # ── by version number ────────────────────────────────────────────────
    version_groups: dict[int, list[repo.ProfileRow]] = {}
    for r in rows:
        version_groups.setdefault(int(r.profile.version), []).append(r)
    by_version = [
        VersionBucket(version=v, profiles=len(g), mean=_axis(repo.mean_scores(g)))
        for v, g in sorted(version_groups.items())
    ]

    # ── per-student shifts (first → latest) ──────────────────────────────
    shifts: list[StudentShift] = []
    drift_acc = {a: 0.0 for a in repo.AXES}
    dominant_changed = 0
    for sid, versions in by_student.items():
        if len(versions) < 2:
            continue
        first, latest = versions[0], versions[-1]
        fs, ls = first.scores(), latest.scores()
        delta = {a: ls[a] - fs[a] for a in repo.AXES}
        for a in repo.AXES:
            drift_acc[a] += delta[a]
        d_from, d_to = repo.dominant(first.profile), repo.dominant(latest.profile)
        if d_from != d_to:
            dominant_changed += 1
        shifts.append(
            StudentShift(
                student_id=sid,
                full_name=first.student.full_name,
                external_id=first.student.external_id,
                versions=len(versions),
                first_scored_at=first.profile.scored_at,
                latest_scored_at=latest.profile.scored_at,
                first=_axis(fs),
                latest=_axis(ls),
                delta=_axis(delta),
                magnitude=float(sum(abs(v) for v in delta.values())),
                dominant_from=d_from,
                dominant_to=d_to,
            )
        )
    shifts.sort(key=lambda s: s.magnitude, reverse=True)
    n_hist = len(shifts)
    axis_drift = (
        _axis({a: round(drift_acc[a] / n_hist, 2) for a in repo.AXES}) if n_hist else None
    )

    return LongitudinalOverview(
        department_id=department_id,
        section_id=section_id,
        students_total=len(by_student),
        students_with_history=n_hist,
        versions_total=len(rows),
        by_term=by_term,
        by_version=by_version,
        axis_drift=axis_drift,
        dominant_changed=dominant_changed,
        top_shifts=shifts[:top],
    )


@router.get("/longitudinal", response_model=LongitudinalOverview)
async def longitudinal(
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
    department_id: UUID | None = Query(default=None),
    section_id: UUID | None = Query(default=None),
    top: int = Query(default=15, ge=1, le=100),
) -> LongitudinalOverview:
    if department_id is not None and not await refs.department_in_institution(
        db, department_id, user.institution_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")
    if section_id is not None and (
        await sections_repo.get_section_row(db, user.institution_id, section_id)
    ) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    rows = await repo.profile_rows(
        db, user.institution_id, department_id=department_id, section_id=section_id
    )
    return build_overview(rows, department_id=department_id, section_id=section_id, top=top)
