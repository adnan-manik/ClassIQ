"""FastAPI app factory + entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.security import _get_jwks  # noqa: F401 — pre-warm JWKS on import
from app.routers import (
    admin_institutions,
    admin_system,
    health,
    institution_analytics,
    institution_audit,
    institution_departments,
    institution_users,
    institution_users_import,
    me,
    sections,
    students,
    teachers,
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="ClassIQ API",
        description=(
            "Classroom Intelligence Platform — backend for the AI-powered "
            "digital twin and section-compatibility scoring engine. "
            "See Docs/BACKEND_ARCHITECTURE.md for design."
        ),
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Top-level: health + readiness
    app.include_router(health.router)

    # Authenticated user-scope routes live under /api/*
    app.include_router(me.router, prefix="/api")
    app.include_router(students.router, prefix="/api")
    app.include_router(teachers.router, prefix="/api")
    app.include_router(sections.router, prefix="/api")

    # Super Admin (platform-wide)
    app.include_router(admin_institutions.router, prefix="/api")
    app.include_router(admin_system.router, prefix="/api")

    # Institution Admin (tenant-scoped)
    app.include_router(institution_departments.router, prefix="/api")
    app.include_router(institution_users.router, prefix="/api")
    app.include_router(institution_users_import.router, prefix="/api")
    app.include_router(institution_analytics.router, prefix="/api")
    app.include_router(institution_audit.router, prefix="/api")

    return app


app = create_app()

# Pre-warm the JWKS cache so the first authed request doesn't pay the
# ~3-5s sync HTTP fetch cost.
_get_jwks()
