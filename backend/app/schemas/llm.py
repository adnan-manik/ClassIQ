"""Request + response shapes for /api/llm (S2)."""

from __future__ import annotations

from uuid import UUID

from pydantic import Field

from app.schemas.common import APIModel


class ChatTurn(APIModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class LLMQueryRequest(APIModel):
    question: str = Field(..., min_length=2, max_length=4000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=12)
    department_id: UUID | None = None


class LLMUsage(APIModel):
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int


class LLMContextSummary(APIModel):
    sections: int
    teachers: int
    scenarios: int
    open_flags: int
    profiles: int


class LLMQueryResponse(APIModel):
    answer: str
    model: str
    refusal: bool
    stop_reason: str | None
    usage: LLMUsage
    context: LLMContextSummary
    request_id: str | None


class LLMStatus(APIModel):
    enabled: bool
    model: str
    max_output_tokens: int
    reason: str | None = None
