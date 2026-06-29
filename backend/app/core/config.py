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
    redis_url: str

    # Auth
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60 * 1  # 1 hour

    # Anthropic
    anthropic_api_key: str = ""

    # Transcription — Whisper model size (tiny/base/small/medium/large).
    # "base" balances speed/memory for CPU; "medium" needs ~5GB RAM.
    whisper_model: str = "base"
    # Force transcription language to avoid mis-detection + hallucination
    # on short clips. Empty string = let Whisper auto-detect.
    whisper_language: str = "en"

    # FHIR — empty means no HAPI server is configured. When unset, FHIR
    # validation runs locally (in-codebase) only and bundles are never posted,
    # so prod without a HAPI service makes no doomed localhost calls.
    # docker-compose sets HAPI_FHIR_URL to the in-network HAPI service.
    hapi_fhir_url: str = ""
    # Persist (POST) bundles to HAPI only when explicitly enabled. Keep this
    # False for any external/public HAPI (e.g. https://hapi.fhir.org/baseR4),
    # which would otherwise store PHI on a server you don't control. $validate
    # never persists and is governed by hapi_enabled alone.
    hapi_persist: bool = False

    @property
    def hapi_enabled(self) -> bool:
        return bool(self.hapi_fhir_url.strip())

    # Storage
    audio_storage_path: str = "/data/audio"

    # Startup
    seed_demo_user: bool = False
    run_migrations: bool = False


settings = Settings()
