from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=["../.env", ".env"], case_sensitive=False, extra="ignore")

    # App
    environment: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000"

    # Database
    database_url: str = "postgresql+asyncpg://ambient:ambient_dev@localhost:5432/ambient_scribe"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "dev_secret_change_in_prod"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60 * 8  # 8 hours

    # Anthropic
    anthropic_api_key: str = ""

    # FHIR
    hapi_fhir_url: str = "http://localhost:8080/fhir"

    # Storage
    audio_storage_path: str = "/data/audio"

    # Startup
    seed_demo_user: bool = False
    run_migrations: bool = False


settings = Settings()
