import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.base import get_db
from app.models.audit_log import AuditLog
from app.models.session import Session
from app.models.soap_note import SOAPNote
from app.models.transcript import Transcript
from app.models.user import User
from app.schemas.session import CreateSessionRequest, SessionListResponse, SessionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def _write_audit(
    db: AsyncSession,
    action: str,
    user_id: str,
    resource_id: str | None = None,
    ip: str | None = None,
) -> None:
    log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type="session",
        resource_id=resource_id,
        ip_address=ip,
    )
    db.add(log)
    await db.commit()


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = Session(
        clinician_id=current_user.id,
        status="recording",
        patient_name=body.patient_name,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    await _write_audit(db, "session_created", current_user.id, session.id, request.client.host)
    return SessionResponse.model_validate(session)


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionListResponse:
    result = await db.execute(
        select(Session)
        .where(Session.clinician_id == current_user.id)
        .order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()
    return SessionListResponse(
        sessions=[SessionResponse.model_validate(s) for s in sessions],
        total=len(sessions),
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.clinician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    await _write_audit(db, "session_viewed", current_user.id, session.id, request.client.host)
    return SessionResponse.model_validate(session)


@router.get("/{session_id}/status")
async def get_session_status(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.tasks.worker import celery_app

    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.clinician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return {"session_id": session_id, "status": session.status}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.clinician_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Remove the audio file from disk (best effort — never block the delete).
    audio_path = session.audio_file_path
    if audio_path and os.path.isfile(audio_path):
        try:
            os.remove(audio_path)
        except OSError as exc:
            logger.warning("Failed to remove audio file %s: %s", audio_path, exc)

    # Delete child rows first — FKs from transcripts/soap_notes block the parent.
    await db.execute(delete(SOAPNote).where(SOAPNote.session_id == session_id))
    await db.execute(delete(Transcript).where(Transcript.session_id == session_id))
    await db.delete(session)
    await db.commit()

    await _write_audit(db, "session_deleted", current_user.id, session_id, request.client.host)
