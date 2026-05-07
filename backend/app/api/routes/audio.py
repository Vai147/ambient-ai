import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.base import get_db
from app.models.session import Session
from app.models.transcript import Transcript
from app.models.user import User
from app.schemas.session import SessionResponse
from app.schemas.transcript import TaskStatusResponse, TranscriptResponse
from app.tasks.transcription import transcribe_audio

router = APIRouter()

ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/mpeg",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
}
MAX_AUDIO_BYTES = 500 * 1024 * 1024  # 500 MB


async def _get_owned_session(
    session_id: str,
    current_user: User,
    db: AsyncSession,
) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.clinician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return session


@router.post("/{session_id}/audio", response_model=SessionResponse)
async def upload_audio(
    session_id: str,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_owned_session(session_id, current_user, db)

    if session.status not in ("recording", "uploading"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot upload audio for session in status '{session.status}'",
        )

    if file.content_type and file.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio type: {file.content_type}",
        )

    os.makedirs(settings.audio_storage_path, exist_ok=True)
    ext = (file.filename or "audio.webm").rsplit(".", 1)[-1]
    dest = os.path.join(settings.audio_storage_path, f"{session_id}.{ext}")

    data = await file.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio file exceeds 500 MB limit",
        )

    with open(dest, "wb") as f:
        f.write(data)

    session.audio_file_path = dest
    session.status = "uploading"
    await db.commit()
    await db.refresh(session)

    return SessionResponse.model_validate(session)


@router.post("/{session_id}/transcribe", response_model=TaskStatusResponse)
async def trigger_transcription(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskStatusResponse:
    session = await _get_owned_session(session_id, current_user, db)

    if not session.audio_file_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No audio uploaded for this session",
        )
    if session.status == "transcribing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transcription already in progress",
        )
    if session.status in ("transcribed", "generating", "note_generated", "approved"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session already past transcription (status: {session.status})",
        )

    session.status = "transcribing"
    await db.commit()

    task = transcribe_audio.delay(session_id)

    return TaskStatusResponse(task_id=task.id, status="PENDING")


@router.get("/{session_id}/transcript", response_model=TranscriptResponse)
async def get_transcript(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TranscriptResponse:
    await _get_owned_session(session_id, current_user, db)

    result = await db.execute(
        select(Transcript).where(Transcript.session_id == session_id)
    )
    transcript = result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript not yet available",
        )
    return TranscriptResponse.model_validate(transcript)
