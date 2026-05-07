from datetime import datetime

from pydantic import BaseModel


class ICD10Code(BaseModel):
    code: str
    description: str


class Medication(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    duration: str | None = None


class Assessment(BaseModel):
    summary: str = ""
    diagnoses: list[str] = []
    icd10_codes: list[ICD10Code] = []


class Plan(BaseModel):
    medications: list[Medication] = []
    instructions: str = ""
    follow_up: str | None = None
    referrals: list[str] = []


class SOAPNoteOutput(BaseModel):
    subjective: str = ""
    objective: str = ""
    assessment: Assessment = Assessment()
    plan: Plan = Plan()


class HallucinationResult(BaseModel):
    verified: list[str] = []
    unverified: list[str] = []
    hallucination_risk: str = "low"  # low | medium | high


class SOAPNoteResponse(BaseModel):
    id: str
    session_id: str
    subjective: str | None
    objective: str | None
    assessment: dict
    plan: dict
    hallucination_flags: dict | None
    corrections: dict | None
    clinician_approved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteSectionEdit(BaseModel):
    section: str  # subjective | objective | assessment | plan
    action: str   # accept | edit | reject
    edited_text: str | None = None


class UpdateNoteRequest(BaseModel):
    edits: list[NoteSectionEdit]
    approve: bool = False
