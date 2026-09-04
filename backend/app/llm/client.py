"""Claude API wrapper for the S2 natural-language query interface.

- Backend-only key (ANTHROPIC_API_KEY) — never exposed to the browser.
- Two cached system blocks: the static instructions and the tenant snapshot
  (prompt caching = prefix match, so the volatile question comes last).
- Per-query output cap via LLM_MAX_OUTPUT_TOKENS.
- Refusal-aware: `stop_reason == "refusal"` is surfaced, not treated as an error.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.llm.prompts import SYSTEM_STATIC


class LLMUnavailable(Exception):
    """No API key configured, or the SDK is missing."""


class LLMUpstreamError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class LLMAnswer:
    text: str
    model: str
    refusal: bool
    stop_reason: str | None
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    request_id: str | None


def is_enabled() -> bool:
    return bool(settings.ANTHROPIC_API_KEY)


def _client():
    if not settings.ANTHROPIC_API_KEY:
        raise LLMUnavailable("ANTHROPIC_API_KEY is not configured on the backend")
    try:
        import anthropic  # noqa: WPS433 — optional dependency (S2 stretch goal)
    except ImportError as exc:  # pragma: no cover — dependency missing
        raise LLMUnavailable("The `anthropic` package is not installed") from exc
    return anthropic, anthropic.AsyncAnthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=float(settings.LLM_TIMEOUT_SECONDS),
        max_retries=2,
    )


async def ask(
    *,
    question: str,
    snapshot_json: str,
    history: list[dict[str, str]] | None = None,
) -> LLMAnswer:
    """One Messages API call. `history` is prior (role, content) turns, oldest first."""
    anthropic, client = _client()

    system: list[dict[str, Any]] = [
        {"type": "text", "text": SYSTEM_STATIC, "cache_control": {"type": "ephemeral"}},
        {
            "type": "text",
            "text": "DATA SNAPSHOT (JSON):\n" + snapshot_json,
            "cache_control": {"type": "ephemeral"},
        },
    ]
    messages: list[dict[str, Any]] = []
    for turn in history or []:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    if messages and messages[0]["role"] != "user":
        messages = messages[1:]
    messages.append({"role": "user", "content": question.strip()})

    params: dict[str, Any] = {
        "model": settings.ANTHROPIC_MODEL,
        "max_tokens": int(settings.LLM_MAX_OUTPUT_TOKENS),
        "system": system,
        "messages": messages,
        "output_config": {"effort": settings.LLM_EFFORT},
    }

    try:
        # Opus 5 / Fable 5.1 code opts into server-side refusal fallbacks by default;
        # older SDKs without the parameter fall through to the plain call.
        try:
            response = await client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                **params,
            )
        except TypeError:
            response = await client.messages.create(**params)
    except anthropic.AuthenticationError as exc:
        raise LLMUpstreamError(502, "The Claude API rejected the backend's API key") from exc
    except anthropic.RateLimitError as exc:
        raise LLMUpstreamError(429, "The Claude API is rate-limiting us — try again shortly") from exc
    except anthropic.APIStatusError as exc:
        raise LLMUpstreamError(502, f"Claude API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMUpstreamError(503, "Could not reach the Claude API") from exc

    refusal = response.stop_reason == "refusal"
    text = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
    if refusal and not text:
        text = "I can't help with that request. Please rephrase it around section planning, teachers, students or scenarios."
    if response.stop_reason == "max_tokens":
        text += "\n\n(Answer truncated at the per-query token cap.)"

    usage = response.usage
    return LLMAnswer(
        text=text,
        model=response.model,
        refusal=refusal,
        stop_reason=response.stop_reason,
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
        cache_read_input_tokens=int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        cache_creation_input_tokens=int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
        request_id=getattr(response, "_request_id", None),
    )
