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

    # LLM (deferred — S2 stretch)
    ANTHROPIC_API_KEY: str | None = None

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


settings = Settings()  # type: ignore[call-arg]  # env-loaded
