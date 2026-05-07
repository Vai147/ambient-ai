import json
import logging

import anthropic

from app.core.config import settings
from app.schemas.soap_note import Assessment, ICD10Code, Medication, Plan, SOAPNoteOutput

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a clinical documentation assistant. Given a doctor-patient encounter transcript, generate a structured SOAP note in strict JSON format.

OUTPUT FORMAT (return only the JSON object, no markdown, no preamble):
{
  "subjective": "Patient's chief complaint, history of present illness, symptoms reported, duration. Written from patient perspective using their words.",
  "objective": "Vitals if mentioned, physical exam findings, lab/test results if discussed, observable findings. What the clinician observed or measured.",
  "assessment": {
    "summary": "Clinical impression and differential or confirmed diagnoses in plain language.",
    "diagnoses": ["Primary diagnosis", "Secondary diagnosis if applicable"],
    "icd10_codes": [
      {"code": "A00.0", "description": "Condition name matching the code"}
    ]
  },
  "plan": {
    "medications": [
      {"name": "Drug name", "dose": "dose amount", "frequency": "how often", "duration": "how long or null"}
    ],
    "instructions": "Patient education, lifestyle modifications, dietary instructions, activity restrictions.",
    "follow_up": "Follow-up timing or null if not mentioned",
    "referrals": ["Specialist referrals if mentioned"]
  }
}

CRITICAL RULES:
- Only include information EXPLICITLY stated or clearly implied in the transcript
- Never fabricate medications, diagnoses, dosages, or test results not present in the transcript
- ICD-10 codes must be real, valid ICD-10-CM codes that match the stated diagnosis
- If a section has no relevant information, use empty string "" or empty array []
- Return ONLY the JSON object"""


class SOAPNoteService:
    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    def generate(self, transcript: str) -> SOAPNoteOutput:
        logger.info("Generating SOAP note, transcript length=%d", len(transcript))

        message = self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": f"Generate a SOAP note from this encounter transcript:\n\n{transcript}",
                }
            ],
        )

        usage = message.usage
        logger.info(
            "SOAP generation tokens: input=%d output=%d cache_read=%d cache_create=%d",
            usage.input_tokens,
            usage.output_tokens,
            getattr(usage, "cache_read_input_tokens", 0),
            getattr(usage, "cache_creation_input_tokens", 0),
        )

        raw = message.content[0].text.strip()

        # Strip markdown code fences if Claude wraps the JSON
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)

        assessment_raw = data.get("assessment", {})
        plan_raw = data.get("plan", {})

        assessment = Assessment(
            summary=assessment_raw.get("summary", ""),
            diagnoses=assessment_raw.get("diagnoses", []),
            icd10_codes=[
                ICD10Code(code=c["code"], description=c["description"])
                for c in assessment_raw.get("icd10_codes", [])
            ],
        )

        plan = Plan(
            medications=[
                Medication(
                    name=m["name"],
                    dose=m.get("dose"),
                    frequency=m.get("frequency"),
                    duration=m.get("duration"),
                )
                for m in plan_raw.get("medications", [])
            ],
            instructions=plan_raw.get("instructions", ""),
            follow_up=plan_raw.get("follow_up"),
            referrals=plan_raw.get("referrals", []),
        )

        return SOAPNoteOutput(
            subjective=data.get("subjective", ""),
            objective=data.get("objective", ""),
            assessment=assessment,
            plan=plan,
        )

    def generate_with_usage(self, transcript: str) -> tuple[SOAPNoteOutput, dict]:
        """Like generate() but also returns Anthropic usage metadata dict."""
        logger.info("Generating SOAP note (eval mode), transcript length=%d", len(transcript))

        message = self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": f"Generate a SOAP note from this encounter transcript:\n\n{transcript}",
                }
            ],
        )

        usage_obj = message.usage
        usage = {
            "input_tokens": usage_obj.input_tokens,
            "output_tokens": usage_obj.output_tokens,
            "cache_read_input_tokens": getattr(usage_obj, "cache_read_input_tokens", 0),
            "cache_creation_input_tokens": getattr(usage_obj, "cache_creation_input_tokens", 0),
        }
        logger.info("SOAP eval tokens: %s", usage)

        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        data = json.loads(raw)
        assessment_raw = data.get("assessment", {})
        plan_raw = data.get("plan", {})

        assessment = Assessment(
            summary=assessment_raw.get("summary", ""),
            diagnoses=assessment_raw.get("diagnoses", []),
            icd10_codes=[
                ICD10Code(code=c["code"], description=c["description"])
                for c in assessment_raw.get("icd10_codes", [])
            ],
        )
        plan = Plan(
            medications=[
                Medication(
                    name=m["name"],
                    dose=m.get("dose"),
                    frequency=m.get("frequency"),
                    duration=m.get("duration"),
                )
                for m in plan_raw.get("medications", [])
            ],
            instructions=plan_raw.get("instructions", ""),
            follow_up=plan_raw.get("follow_up"),
            referrals=plan_raw.get("referrals", []),
        )

        note = SOAPNoteOutput(
            subjective=data.get("subjective", ""),
            objective=data.get("objective", ""),
            assessment=assessment,
            plan=plan,
        )
        return note, usage
