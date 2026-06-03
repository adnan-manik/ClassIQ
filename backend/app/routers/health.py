"""Liveness + readiness endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health", status_code=status.HTTP_200_OK)
async def health() -> dict:
    """Liveness — process is up."""
    return {"status": "ok"}


@router.get("/ready", status_code=status.HTTP_200_OK)
async def ready(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    """Readiness — DB reachable. Fails fast with 503 if Postgres is down."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — any DB failure means "not ready"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not reachable",
        ) from exc
    return {"status": "ready", "db": "ok"}
