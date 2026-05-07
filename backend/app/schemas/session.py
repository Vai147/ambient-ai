from datetime import datetime

from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    patient_name: str | None = None


class SessionResponse(BaseModel):
    id: str
    clinician_id: str
    status: str
    audio_file_path: str | None
    patient_name: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    total: int
