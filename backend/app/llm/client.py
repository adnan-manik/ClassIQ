"""LLM wrapper for the S2 natural-language query interface.

Two providers behind one `ask()`; `LLM_PROVIDER` picks which.

- Backend-only key — never exposed to the browser.
- Per-query output cap via LLM_MAX_OUTPUT_TOKENS.

anthropic
    Two cached system blocks: the static instructions and the tenant snapshot
    (prompt caching = prefix match, so the volatile question comes last).
    Refusal-aware: `stop_reason == "refusal"` is surfaced, not treated as an error.

groq
    OpenAI-shaped chat completions. No prompt caching and no refusal stop
    reason, so `cache_*_tokens` are always 0 and `refusal` is always False —
    the response shape stays identical so the API schema and the Ask ClassIQ
    UI need no branching.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.llm.prompts import SYSTEM_STATIC


class LLMUnavailable(Exception):
    """No API key configured, the provider is unknown, or the SDK is missing."""


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


SUPPORTED_PROVIDERS = ("anthropic", "groq")

_TRUNCATED_NOTE = "\n\n(Answer truncated at the per-query token cap.)"
_REFUSAL_TEXT = (
    "I can't help with that request. Please rephrase it around section "
    "planning, teachers, students or scenarios."
)


def is_enabled() -> bool:
    return bool(settings.llm_api_key) and settings.llm_provider in SUPPORTED_PROVIDERS


def unavailable_reason() -> str | None:
    """Why the assistant is off, or None when it's ready."""
    if settings.llm_provider not in SUPPORTED_PROVIDERS:
        return (
            f"LLM_PROVIDER={settings.LLM_PROVIDER!r} is not supported "
            f"(expected one of: {', '.join(SUPPORTED_PROVIDERS)})"
        )
    if not settings.llm_api_key:
        return f"{settings.llm_key_var} is not set on the backend"
    return None


def _normalize_history(
    question: str, history: list[dict[str, str]] | None
) -> list[dict[str, Any]]:
    """Prior turns (oldest first) + the new question. Both providers require
    the conversation to start on a user turn."""
    messages: list[dict[str, Any]] = []
    for turn in history or []:
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    if messages and messages[0]["role"] != "user":
        messages = messages[1:]
    messages.append({"role": "user", "content": question.strip()})
    return messages


def _snapshot_block(snapshot_json: str) -> str:
    return "DATA SNAPSHOT (JSON):\n" + snapshot_json


async def ask(
    *,
    question: str,
    snapshot_json: str,
    history: list[dict[str, str]] | None = None,
) -> LLMAnswer:
    """One completion against the configured provider."""
    reason = unavailable_reason()
    if reason:
        raise LLMUnavailable(reason)

    messages = _normalize_history(question, history)
    if settings.llm_provider == "groq":
        return await _ask_groq(messages, snapshot_json)
    return await _ask_anthropic(messages, snapshot_json)


# ── anthropic ───────────────────────────────────────────────────────────────


def _anthropic_client():
    try:
        import anthropic  # noqa: WPS433 — optional dependency (S2 stretch goal)
    except ImportError as exc:  # pragma: no cover — dependency missing
        raise LLMUnavailable("The `anthropic` package is not installed") from exc
    return anthropic, anthropic.AsyncAnthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=float(settings.LLM_TIMEOUT_SECONDS),
        max_retries=2,
    )


async def _ask_anthropic(
    messages: list[dict[str, Any]], snapshot_json: str
) -> LLMAnswer:
    anthropic, client = _anthropic_client()

    system: list[dict[str, Any]] = [
        {"type": "text", "text": SYSTEM_STATIC, "cache_control": {"type": "ephemeral"}},
        {
            "type": "text",
            "text": _snapshot_block(snapshot_json),
            "cache_control": {"type": "ephemeral"},
        },
    ]
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
        text = _REFUSAL_TEXT
    if response.stop_reason == "max_tokens":
        text += _TRUNCATED_NOTE

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


# ── groq ────────────────────────────────────────────────────────────────────


def _groq_client():
    try:
        import groq  # noqa: WPS433 — optional dependency (S2 stretch goal)
    except ImportError as exc:  # pragma: no cover — dependency missing
        raise LLMUnavailable("The `groq` package is not installed") from exc
    return groq, groq.AsyncGroq(
        api_key=settings.GROQ_API_KEY,
        timeout=float(settings.LLM_TIMEOUT_SECONDS),
        max_retries=2,
    )


async def _ask_groq(messages: list[dict[str, Any]], snapshot_json: str) -> LLMAnswer:
    groq, client = _groq_client()

    # Groq has no cache_control and no multi-block system field — the static
    # instructions and the snapshot collapse into one system message.
    payload = [
        {
            "role": "system",
            "content": SYSTEM_STATIC + "\n\n" + _snapshot_block(snapshot_json),
        },
        *messages,
    ]

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            max_completion_tokens=int(settings.LLM_MAX_OUTPUT_TOKENS),
            messages=payload,
        )
    except groq.AuthenticationError as exc:
        raise LLMUpstreamError(502, "The Groq API rejected the backend's API key") from exc
    except groq.RateLimitError as exc:
        raise LLMUpstreamError(429, "The Groq API is rate-limiting us — try again shortly") from exc
    except groq.APIStatusError as exc:
        raise LLMUpstreamError(502, f"Groq API error {exc.status_code}: {exc.message}") from exc
    except groq.APIConnectionError as exc:
        raise LLMUpstreamError(503, "Could not reach the Groq API") from exc

    choice = response.choices[0] if response.choices else None
    message = getattr(choice, "message", None)
    text = ((message and message.content) or "").strip()
    finish_reason = getattr(choice, "finish_reason", None)
    if finish_reason == "length":
        text += _TRUNCATED_NOTE

    usage = getattr(response, "usage", None)
    return LLMAnswer(
        text=text,
        model=getattr(response, "model", settings.GROQ_MODEL),
        # Groq exposes no refusal stop reason — a declined answer comes back as
        # ordinary assistant text, so there is nothing to flag here.
        refusal=False,
        stop_reason=finish_reason,
        input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
        # No prompt caching on Groq — kept at 0 so LLMUsage stays one shape.
        cache_read_input_tokens=0,
        cache_creation_input_tokens=0,
        request_id=getattr(response, "_request_id", None) or getattr(response, "id", None),
    )
