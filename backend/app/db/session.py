"""Async SQLAlchemy engine + session factory.

Connects directly to Supabase Postgres via the session pooler (IPv4-safe,
supports the DDL we need). The backend connects as `postgres`, which BYPASSES
RLS — application code is responsible for tenant scoping on every query.
RLS still protects the DB as defense in depth.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


_engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.is_dev,
)

_session_factory = async_sessionmaker(
    _engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a session, rolls back on exception."""
    async with _session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
