from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SOAPNote(Base):
    __tablename__ = "soap_notes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id"), unique=True, nullable=False
    )
    subjective: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    plan: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    hallucination_flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    corrections: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    fhir_validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    clinician_approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
