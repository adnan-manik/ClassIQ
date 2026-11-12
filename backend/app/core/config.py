"""Application settings loaded from environment variables / .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Runtime
    APP_ENV: str = "development"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SECRET_KEY: str | None = None

    # Database (SQLAlchemy + asyncpg)
    DATABASE_URL: str
    # Echo every SQL statement to stdout. Off by default: it used to follow
    # APP_ENV, which made every dev request pay console I/O per query.
    SQL_ECHO: bool = False

    # LLM — S2 natural-language query interface (backend-only key).
    # LLM_PROVIDER selects which vendor `app.llm.client` talks to; each vendor
    # keeps its own key + model so switching is a one-line .env change.
    LLM_PROVIDER: str = "anthropic"  # anthropic | groq
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-opus-5"
    GROQ_API_KEY: str | None = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    LLM_MAX_OUTPUT_TOKENS: int = 4096
    LLM_EFFORT: str = "medium"  # low | medium | high | xhigh | max (Anthropic only)
    LLM_TIMEOUT_SECONDS: int = 120

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000"

    # Frontend URL (for email links, invitations, etc.)
    FRONTEND_URL: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.APP_ENV.lower() == "development"

    # ── LLM provider resolution ─────────────────────────────────────────────
    # Everything downstream reads these instead of the vendor-specific vars, so
    # the router, the status endpoint and the audit payload stay provider-blind.

    @property
    def llm_provider(self) -> str:
        return (self.LLM_PROVIDER or "anthropic").strip().lower()

    @property
    def llm_api_key(self) -> str | None:
        if self.llm_provider == "groq":
            return self.GROQ_API_KEY
        return self.ANTHROPIC_API_KEY

    @property
    def llm_model(self) -> str:
        if self.llm_provider == "groq":
            return self.GROQ_MODEL
        return self.ANTHROPIC_MODEL

    @property
    def llm_key_var(self) -> str:
        """Name of the env var that holds the active provider's key — used in
        the `not configured` message so the UI names the right variable."""
        return "GROQ_API_KEY" if self.llm_provider == "groq" else "ANTHROPIC_API_KEY"


settings = Settings()  # type: ignore[call-arg]  # env-loaded
