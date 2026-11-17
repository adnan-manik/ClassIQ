"""Provider dispatch + response mapping for app.llm.client.

The Groq path is the one with real translation work: an OpenAI-shaped
`choices[0].message.content` response has to come back as the same `LLMAnswer`
the Anthropic path produces, so `/api/llm/query` and the Ask ClassIQ UI never
branch on provider.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.llm import client as llm_client


# ── fakes matching the shape each SDK returns ───────────────────────────────


class _FakeUsage:
    def __init__(self, prompt_tokens: int, completion_tokens: int) -> None:
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class _FakeMessage:
    def __init__(self, content: str | None) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str | None, finish_reason: str) -> None:
        self.message = _FakeMessage(content)
        self.finish_reason = finish_reason


class _FakeGroqResponse:
    def __init__(self, content: str | None, finish_reason: str = "stop") -> None:
        self.choices = [_FakeChoice(content, finish_reason)]
        self.model = "llama-3.3-70b-versatile"
        self.usage = _FakeUsage(120, 34)
        self.id = "req_abc123"


class _FakeCompletions:
    def __init__(self, response: _FakeGroqResponse) -> None:
        self._response = response
        self.seen: dict = {}

    async def create(self, **kwargs):
        self.seen = kwargs
        return self._response


class _FakeGroqClient:
    def __init__(self, response: _FakeGroqResponse) -> None:
        self.chat = type("_Chat", (), {"completions": _FakeCompletions(response)})()


class _FakeGroqModule:
    """Stands in for the `groq` module's exception classes."""

    class AuthenticationError(Exception):
        pass

    class RateLimitError(Exception):
        pass

    class APIStatusError(Exception):
        pass

    class APIConnectionError(Exception):
        pass


@pytest.fixture
def groq_enabled(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk-test-key")
    monkeypatch.setattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")


def _install_fake_groq(monkeypatch, response: _FakeGroqResponse) -> _FakeGroqClient:
    fake = _FakeGroqClient(response)
    monkeypatch.setattr(
        llm_client, "_groq_client", lambda: (_FakeGroqModule, fake)
    )
    return fake


# ── enablement ──────────────────────────────────────────────────────────────


def test_groq_key_enables_the_assistant(groq_enabled):
    assert llm_client.is_enabled() is True
    assert llm_client.unavailable_reason() is None


def test_missing_groq_key_names_groq_not_anthropic(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", None)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-live-key")

    # An Anthropic key must NOT satisfy the Groq provider.
    assert llm_client.is_enabled() is False
    assert "GROQ_API_KEY" in llm_client.unavailable_reason()


def test_unknown_provider_is_refused_even_with_keys_present(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk-test-key")

    assert llm_client.is_enabled() is False
    assert "not supported" in llm_client.unavailable_reason()


# ── groq response mapping ───────────────────────────────────────────────────


async def test_groq_answer_maps_onto_the_shared_shape(groq_enabled, monkeypatch):
    _install_fake_groq(monkeypatch, _FakeGroqResponse("Section A looks balanced."))

    answer = await llm_client.ask(question="How is Section A?", snapshot_json="{}")

    assert answer.text == "Section A looks balanced."
    assert answer.model == "llama-3.3-70b-versatile"
    assert answer.input_tokens == 120
    assert answer.output_tokens == 34
    assert answer.stop_reason == "stop"
    # Groq has neither prompt caching nor a refusal stop reason — these stay
    # fixed so LLMUsage keeps one shape across providers.
    assert answer.refusal is False
    assert answer.cache_read_input_tokens == 0
    assert answer.cache_creation_input_tokens == 0
    assert answer.request_id == "req_abc123"


async def test_groq_collapses_system_blocks_and_appends_the_question(
    groq_enabled, monkeypatch
):
    fake = _install_fake_groq(monkeypatch, _FakeGroqResponse("ok"))

    await llm_client.ask(
        question="  Which section needs attention?  ",
        snapshot_json='{"sections": 3}',
        history=[
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
    )

    sent = fake.chat.completions.seen["messages"]
    # Anthropic's two cached system blocks become a single system message.
    assert sent[0]["role"] == "system"
    assert '{"sections": 3}' in sent[0]["content"]
    assert [m["role"] for m in sent[1:]] == ["user", "assistant", "user"]
    assert sent[-1]["content"] == "Which section needs attention?"
    assert fake.chat.completions.seen["max_completion_tokens"] == int(
        settings.LLM_MAX_OUTPUT_TOKENS
    )


async def test_groq_history_must_open_on_a_user_turn(groq_enabled, monkeypatch):
    fake = _install_fake_groq(monkeypatch, _FakeGroqResponse("ok"))

    await llm_client.ask(
        question="and now?",
        snapshot_json="{}",
        history=[{"role": "assistant", "content": "dangling opener"}],
    )

    sent = fake.chat.completions.seen["messages"]
    assert [m["role"] for m in sent] == ["system", "user"]


async def test_groq_flags_a_truncated_answer(groq_enabled, monkeypatch):
    _install_fake_groq(monkeypatch, _FakeGroqResponse("A partial ans", "length"))

    answer = await llm_client.ask(question="Summarise everything", snapshot_json="{}")

    assert answer.stop_reason == "length"
    assert "truncated" in answer.text


async def test_groq_empty_content_does_not_crash(groq_enabled, monkeypatch):
    _install_fake_groq(monkeypatch, _FakeGroqResponse(None))

    answer = await llm_client.ask(question="?", snapshot_json="{}")

    assert answer.text == ""


async def test_ask_refuses_when_no_key_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "GROQ_API_KEY", None)

    with pytest.raises(llm_client.LLMUnavailable):
        await llm_client.ask(question="hi", snapshot_json="{}")
