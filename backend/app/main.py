"""FastAPI app factory + entrypoint.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, me, sections, students, teachers


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

    return app


app = create_app()
