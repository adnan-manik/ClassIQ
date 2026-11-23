"""FastAPI app factory + entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.db.session import warm_pool
from app.routers import (
    admin_institutions,
    admin_system,
    early_warning,
    forms,
    health,
    ingestion,
    institution_analytics,
    institution_audit,
    institution_courses,
    institution_departments,
    institution_users,
    institution_users_import,
    llm,
    longitudinal,
    me,
    public_forms,
    reports,
    scenarios,
    sections,
    students,
    teachers,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Pay the one-off connection / JWKS costs now instead of on the first
    # user requests. Skipped under test, where there is no real DB or Auth.
    if settings.APP_ENV.lower() != "test":
        from app.core.security import _get_jwks

        await warm_pool()
        await run_in_threadpool(_get_jwks)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        lifespan=lifespan,
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
    app.include_router(scenarios.router, prefix="/api")
    app.include_router(ingestion.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(longitudinal.router, prefix="/api")
    app.include_router(early_warning.router, prefix="/api")
    app.include_router(llm.router, prefix="/api")
    app.include_router(forms.router, prefix="/api")
    # No auth: students answer survey forms by code without an account.
    app.include_router(public_forms.router, prefix="/api")

    # Super Admin (platform-wide)
    app.include_router(admin_institutions.router, prefix="/api")
    app.include_router(admin_system.router, prefix="/api")

    # Institution Admin (tenant-scoped)
    app.include_router(institution_departments.router, prefix="/api")
    app.include_router(institution_users.router, prefix="/api")
    app.include_router(institution_users_import.router, prefix="/api")
    app.include_router(institution_analytics.router, prefix="/api")
    app.include_router(institution_audit.router, prefix="/api")
    app.include_router(institution_courses.router, prefix="/api")

    return app


app = create_app()
