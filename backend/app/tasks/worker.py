from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "ambient_scribe",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)

# Import task modules to register them
celery_app.autodiscover_tasks(["app.tasks.transcription", "app.tasks.note_generation"])
