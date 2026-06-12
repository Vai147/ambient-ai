import asyncio
import logging

from celery import states
from sqlalchemy import select

from app.core.config import settings
from app.db.base import AsyncSessionLocal
from app.models.session import Session
from app.models.transcript import Transcript
from app.tasks.worker import celery_app

logger = logging.getLogger(__name__)

# Cache the loaded Whisper model per worker process. load_model re-reads
# weights from disk and re-inits the graph each call (~seconds), which
# dominates short-clip latency — load once and reuse across tasks.
_model_cache: dict = {}


def _get_whisper_model(model_name: str):
    cached = _model_cache.get(model_name)
    if cached is not None:
        return cached

    try:
        import whisper
    except ImportError:
        raise RuntimeError(
            "openai-whisper is not installed. Run: pip install openai-whisper"
        )

    logger.info("Loading Whisper model '%s' (first use, caching)", model_name)
    model = whisper.load_model(model_name)
    _model_cache[model_name] = model
    return model


async def _run_transcription(session_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError(f"Session {session_id} not found")
        if not session.audio_file_path:
            raise ValueError(f"Session {session_id} has no audio file")

        model_name = settings.whisper_model
        model = _get_whisper_model(model_name)

        logger.info("Transcribing %s", session.audio_file_path)
        # Segment-level timestamps only — speaker_turns below uses seg
        # start/end/text. word_timestamps adds a costly alignment pass we
        # don't consume, so leave it off to keep CPU transcription fast.
        # Force language when set to avoid mis-detection + hallucination on
        # short clips (empty string = auto-detect).
        transcribe_opts: dict = {"verbose": False}
        if settings.whisper_language:
            transcribe_opts["language"] = settings.whisper_language
        whisper_result = model.transcribe(session.audio_file_path, **transcribe_opts)

        full_text: str = whisper_result.get("text", "").strip()
        segments: list = whisper_result.get("segments", [])

        speaker_turns = [
            {
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
                "speaker": "unknown",
            }
            for seg in segments
        ]

        existing = await db.execute(
            select(Transcript).where(Transcript.session_id == session_id)
        )
        transcript = existing.scalar_one_or_none()

        if transcript:
            transcript.content = full_text
            transcript.speaker_turns = speaker_turns
            transcript.whisper_model = model_name
        else:
            transcript = Transcript(
                session_id=session_id,
                content=full_text,
                speaker_turns=speaker_turns,
                whisper_model=model_name,
            )
            db.add(transcript)

        session.status = "transcribed"
        await db.commit()

        logger.info(
            "Transcription complete for session %s (%d chars)", session_id, len(full_text)
        )
        return {"session_id": session_id, "char_count": len(full_text)}


async def _mark_session_failed(session_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if session:
            session.status = "recording"  # allow retry
            await db.commit()


@celery_app.task(bind=True, name="tasks.transcribe_audio")
def transcribe_audio(self, session_id: str) -> dict:
    try:
        return asyncio.run(_run_transcription(session_id))
    except Exception as exc:
        logger.error("Transcription failed for session %s: %s", session_id, exc)
        asyncio.run(_mark_session_failed(session_id))
        self.update_state(state=states.FAILURE, meta={"error": str(exc)})
        raise
