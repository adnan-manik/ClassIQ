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


_POOL_SIZE = 5

_engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    # No pre-ping: it costs one extra DB round-trip on EVERY checkout, which is
    # the dominant cost when the database is far away. Stale connections are
    # avoided by recycling them before the pooler's idle timeout instead.
    pool_pre_ping=False,
    pool_recycle=1500,
    pool_size=_POOL_SIZE,
    echo=settings.SQL_ECHO,
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


async def warm_pool() -> None:
    """Open the pool's connections up front.

    A fresh connection through the Supabase pooler costs several round-trips
    (TLS + SCRAM auth). Paying that at startup keeps it off the first requests.
    Best-effort: failures are swallowed, the pool just fills lazily instead.
    """
    import asyncio

    from sqlalchemy import text

    async def _one() -> None:
        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            await asyncio.sleep(0.5)  # hold it so the others open new connections

    try:
        await asyncio.wait_for(
            asyncio.gather(*(_one() for _ in range(_POOL_SIZE)), return_exceptions=True),
            timeout=30,
        )
    except Exception:
        pass
