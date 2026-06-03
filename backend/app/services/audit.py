"""Audit-log writer used by every mutating endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def write_audit(
    db: AsyncSession,
    *,
    institution_id: UUID,
    actor_user_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> AuditLog:
    """Insert one audit_logs row. Caller is responsible for committing."""
    row = AuditLog(
        id=uuid.uuid4(),
        institution_id=institution_id,
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row
