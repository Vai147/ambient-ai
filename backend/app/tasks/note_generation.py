import asyncio
import logging

from celery import states
from sqlalchemy import select

from app.db.base import task_db_session
from app.models.session import Session
from app.models.soap_note import SOAPNote
from app.models.transcript import Transcript
from app.services.hallucination_detector import HallucinationDetector
from app.services.icd10 import enrich_soap_flags
from app.services.soap_note import SOAPNoteService
from app.tasks.worker import celery_app

logger = logging.getLogger(__name__)


async def _run_note_generation(session_id: str) -> dict:
    async with task_db_session() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError(f"Session {session_id} not found")

        tr_result = await db.execute(
            select(Transcript).where(Transcript.session_id == session_id)
        )
        transcript = tr_result.scalar_one_or_none()
        if not transcript:
            raise ValueError(f"No transcript for session {session_id}")

        logger.info("Generating SOAP note for session %s", session_id)
        soap_output = SOAPNoteService().generate(transcript.content)

        assessment_dict = {
            "summary": soap_output.assessment.summary,
            "diagnoses": soap_output.assessment.diagnoses,
            "icd10_codes": [
                {"code": c.code, "description": c.description}
                for c in soap_output.assessment.icd10_codes
            ],
        }
        plan_dict = {
            "medications": [
                {
                    "name": m.name,
                    "dose": m.dose,
                    "frequency": m.frequency,
                    "duration": m.duration,
                }
                for m in soap_output.plan.medications
            ],
            "instructions": soap_output.plan.instructions,
            "follow_up": soap_output.plan.follow_up,
            "referrals": soap_output.plan.referrals,
        }

        # Run hallucination detection (3-layer: exact → fuzzy → semantic)
        hal_result = HallucinationDetector().check(soap_output, transcript.content)

        # ICD-10 + RxNorm enrichment
        icd_rxnorm_flags = await enrich_soap_flags(
            {"assessment": assessment_dict, "plan": plan_dict},
            transcript.content,
        )

        hallucination_flags = {
            **hal_result.to_dict(),
            **icd_rxnorm_flags,
        }

        existing = await db.execute(
            select(SOAPNote).where(SOAPNote.session_id == session_id)
        )
        note = existing.scalar_one_or_none()

        if note:
            note.subjective = soap_output.subjective
            note.objective = soap_output.objective
            note.assessment = assessment_dict
            note.plan = plan_dict
            note.hallucination_flags = hallucination_flags
        else:
            note = SOAPNote(
                session_id=session_id,
                subjective=soap_output.subjective,
                objective=soap_output.objective,
                assessment=assessment_dict,
                plan=plan_dict,
                hallucination_flags=hallucination_flags,
            )
            db.add(note)

        session.status = "note_generated"
        await db.commit()

        logger.info(
            "SOAP note saved for session %s — hal_risk=%s unverified=%d",
            session_id,
            hal_result.hallucination_risk,
            len(hal_result.unverified),
        )
        return {
            "session_id": session_id,
            "note_id": note.id,
            "hallucination_risk": hal_result.hallucination_risk,
        }


async def _mark_session_failed(session_id: str) -> None:
    async with task_db_session() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if session:
            session.status = "transcribed"  # allow retry
            await db.commit()


@celery_app.task(bind=True, name="tasks.generate_soap_note")
def generate_soap_note(self, session_id: str) -> dict:
    try:
        return asyncio.run(_run_note_generation(session_id))
    except Exception as exc:
        logger.error("Note generation failed for session %s: %s", session_id, exc)
        asyncio.run(_mark_session_failed(session_id))
        self.update_state(state=states.FAILURE, meta={"error": str(exc)})
        raise
