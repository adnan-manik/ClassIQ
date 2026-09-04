"""/api/llm — S2 natural-language query interface.

    GET  /api/llm/status     is the assistant configured? (model, cap)
    POST /api/llm/query      ask a question over the caller's institution data
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.deps import require_role
from app.llm import client as llm_client
from app.llm.context import build_snapshot
from app.models.auth_user import AuthUser, UserRole
from app.repositories import refs
from app.schemas.llm import (
    LLMContextSummary,
    LLMQueryRequest,
    LLMQueryResponse,
    LLMStatus,
    LLMUsage,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/llm", tags=["llm"])

_staff = require_role(UserRole.hod, UserRole.institution_admin, UserRole.super_admin)


@router.get("/status", response_model=LLMStatus)
async def llm_status(_user: Annotated[AuthUser, Depends(_staff)]) -> LLMStatus:
    enabled = llm_client.is_enabled()
    return LLMStatus(
        enabled=enabled,
        model=settings.ANTHROPIC_MODEL,
        max_output_tokens=int(settings.LLM_MAX_OUTPUT_TOKENS),
        reason=None if enabled else "ANTHROPIC_API_KEY is not set on the backend",
    )


@router.post("/query", response_model=LLMQueryResponse)
async def llm_query(
    body: LLMQueryRequest,
    user: Annotated[AuthUser, Depends(_staff)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LLMQueryResponse:
    if body.department_id is not None and not await refs.department_in_institution(
        db, body.department_id, user.institution_id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Department not found")

    snapshot, summary = await build_snapshot(
        db, user.institution_id, department_id=body.department_id
    )
    try:
        answer = await llm_client.ask(
            question=body.question,
            snapshot_json=snapshot,
            history=[t.model_dump() for t in body.history],
        )
    except llm_client.LLMUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except llm_client.LLMUpstreamError as exc:
        raise HTTPException(exc.status, str(exc)) from exc

    await write_audit(
        db,
        institution_id=user.institution_id,
        actor_user_id=user.id,
        action="llm.query",
        entity_type="llm",
        entity_id=None,
        payload={
            "question": body.question[:200],
            "model": answer.model,
            "refusal": answer.refusal,
            "input_tokens": answer.input_tokens,
            "output_tokens": answer.output_tokens,
            "cache_read_input_tokens": answer.cache_read_input_tokens,
        },
    )
    await db.commit()

    return LLMQueryResponse(
        answer=answer.text,
        model=answer.model,
        refusal=answer.refusal,
        stop_reason=answer.stop_reason,
        usage=LLMUsage(
            input_tokens=answer.input_tokens,
            output_tokens=answer.output_tokens,
            cache_read_input_tokens=answer.cache_read_input_tokens,
            cache_creation_input_tokens=answer.cache_creation_input_tokens,
        ),
        context=LLMContextSummary(
            sections=summary.sections,
            teachers=summary.teachers,
            scenarios=summary.scenarios,
            open_flags=summary.open_flags,
            profiles=summary.profiles,
        ),
        request_id=answer.request_id,
    )
