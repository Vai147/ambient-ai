from datetime import datetime

from pydantic import BaseModel


class TranscriptResponse(BaseModel):
    id: str
    session_id: str
    content: str
    speaker_turns: dict
    whisper_model: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str  # PENDING | STARTED | SUCCESS | FAILURE
    result: dict | None = None
    error: str | None = None
