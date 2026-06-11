from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=["../.env", ".env"], case_sensitive=False, extra="ignore")

    # App
    environment: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000"

    # Database
    database_url: str = "postgresql+asyncpg://ambient:ambient_dev@localhost:5432/ambient_scribe"

    @model_validator(mode="after")
    def _ensure_async_pg_url(self) -> "Settings":
        """Rewrite postgresql:// to postgresql+asyncpg:// for SQLAlchemy async engine."""
        url = self.database_url
        if url.startswith("postgresql://"):
            self.database_url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            self.database_url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return self

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "dev_secret_change_in_prod"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60 * 8  # 8 hours

    # Anthropic
    anthropic_api_key: str = ""

    # Transcription — Whisper model size (tiny/base/small/medium/large).
    # "base" balances speed/memory for CPU; "medium" needs ~5GB RAM.
    whisper_model: str = "base"
    # Force transcription language to avoid mis-detection + hallucination
    # on short clips. Empty string = let Whisper auto-detect.
    whisper_language: str = "en"

    # FHIR
    hapi_fhir_url: str = "http://localhost:8080/fhir"

    # Storage
    audio_storage_path: str = "/data/audio"

    # Startup
    seed_demo_user: bool = False
    run_migrations: bool = False


settings = Settings()
