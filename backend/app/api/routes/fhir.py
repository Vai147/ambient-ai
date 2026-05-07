import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.base import get_db
from app.models.session import Session
from app.models.soap_note import SOAPNote
from app.models.user import User
from app.services.fhir_export import export_session_to_fhir

logger = logging.getLogger(__name__)

router = APIRouter()

_HAPI_BASE = getattr(settings, "hapi_fhir_url", "http://localhost:8080/fhir")


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


@router.post("/{session_id}/export-fhir")
async def export_fhir(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = await _get_owned_session(session_id, current_user, db)

    if session.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session must be approved before FHIR export (status: {session.status})",
        )

    result = await db.execute(select(SOAPNote).where(SOAPNote.session_id == session_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOAP note not found")

    note_dict = {
        "subjective": note.subjective,
        "objective": note.objective,
        "assessment": note.assessment,
        "plan": note.plan,
        "hallucination_flags": note.hallucination_flags,
    }

    export = await export_session_to_fhir(
        session_id=session_id,
        patient_name=session.patient_name,
        session_created_at=session.created_at,
        note=note_dict,
    )
    return export


@router.get("/Composition/{composition_id}")
async def get_composition(
    composition_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{_HAPI_BASE}/Composition/{composition_id}",
                headers={"Accept": "application/fhir+json"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="HAPI FHIR error") from exc
    except Exception as exc:
        logger.error("HAPI FHIR proxy error: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="HAPI FHIR unavailable") from exc
