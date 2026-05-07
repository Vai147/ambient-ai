from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.base import get_db
from app.models.session import Session
from app.models.soap_note import SOAPNote
from app.models.user import User
from app.schemas.soap_note import SOAPNoteResponse, UpdateNoteRequest
from app.schemas.transcript import TaskStatusResponse
from app.tasks.note_generation import generate_soap_note

router = APIRouter()


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


@router.post("/{session_id}/generate-note", response_model=TaskStatusResponse)
async def trigger_note_generation(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskStatusResponse:
    session = await _get_owned_session(session_id, current_user, db)

    if session.status == "generating":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Note generation already in progress",
        )
    if session.status in ("note_generated", "approved"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Note already generated (status: {session.status})",
        )
    if session.status != "transcribed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session must be transcribed before generating note (status: {session.status})",
        )

    session.status = "generating"
    await db.commit()

    task = generate_soap_note.delay(session_id)
    return TaskStatusResponse(task_id=task.id, status="PENDING")


@router.get("/{session_id}/note", response_model=SOAPNoteResponse)
async def get_note(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SOAPNoteResponse:
    await _get_owned_session(session_id, current_user, db)

    result = await db.execute(
        select(SOAPNote).where(SOAPNote.session_id == session_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOAP note not yet available",
        )
    return SOAPNoteResponse.model_validate(note)


@router.patch("/{session_id}/note", response_model=SOAPNoteResponse)
async def update_note(
    session_id: str,
    body: UpdateNoteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SOAPNoteResponse:
    session = await _get_owned_session(session_id, current_user, db)

    if session.status not in ("note_generated", "approved"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot edit note in status '{session.status}'",
        )

    result = await db.execute(
        select(SOAPNote).where(SOAPNote.session_id == session_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SOAP note not found",
        )

    corrections: dict = dict(note.corrections or {})

    for edit in body.edits:
        sec = edit.section
        if edit.action == "reject":
            if sec == "subjective":
                note.subjective = ""
            elif sec == "objective":
                note.objective = ""
            elif sec == "assessment":
                note.assessment = {"summary": "", "diagnoses": [], "icd10_codes": []}
            elif sec == "plan":
                note.plan = {"medications": [], "instructions": "", "follow_up": None, "referrals": []}
            corrections[sec] = {"action": "reject", "edited_text": None}
        elif edit.action == "edit" and edit.edited_text is not None:
            if sec in ("subjective", "objective"):
                setattr(note, sec, edit.edited_text)
            corrections[sec] = {"action": "edit", "edited_text": edit.edited_text}
        elif edit.action == "accept":
            corrections[sec] = {"action": "accept", "edited_text": None}

    note.corrections = corrections

    if body.approve:
        note.clinician_approved_at = datetime.now(timezone.utc)
        session.status = "approved"

    await db.commit()
    await db.refresh(note)
    return SOAPNoteResponse.model_validate(note)
