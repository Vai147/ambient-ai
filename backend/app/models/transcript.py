from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id"), unique=True, nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    speaker_turns: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict
    )
    whisper_model: Mapped[str] = mapped_column(
        String(50), default="medium", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
