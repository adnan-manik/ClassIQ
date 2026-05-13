"""Peer-relationship queries scoped to academic term + a set of students."""

from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.peer_relationship import PeerRelationship


async def list_relationships_in_term_among(
    db: AsyncSession,
    institution_id: UUID,
    academic_term_id: UUID,
    student_ids: Iterable[UUID],
) -> list[PeerRelationship]:
    ids = list(student_ids)
    if not ids:
        return []
    stmt = (
        select(PeerRelationship)
        .where(PeerRelationship.institution_id == institution_id)
        .where(PeerRelationship.academic_term_id == academic_term_id)
        .where(PeerRelationship.from_student_id.in_(ids))
        .where(PeerRelationship.to_student_id.in_(ids))
        .where(PeerRelationship.deleted_at.is_(None))
    )
    return list((await db.execute(stmt)).scalars().all())
