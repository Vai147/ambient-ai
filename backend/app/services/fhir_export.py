"""FHIR R4 export service — Task 5.1.

Builds an R4 Bundle (type=document) from an approved SOAP note:
  - Composition  (document root)
  - Encounter    (session metadata)
  - Condition    (one per verified ICD-10 code)
  - MedicationRequest (one per verified medication)

Posts the Bundle to HAPI FHIR and returns the server-assigned Bundle ID.
Falls back to returning the constructed Bundle dict if HAPI is unreachable.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_HAPI_BASE = getattr(settings, "hapi_fhir_url", "http://localhost:8080/fhir")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _patient_ref(patient_name: str | None) -> dict:
    return {"display": patient_name or "Unknown Patient"}


def _build_encounter(session_id: str, patient_name: str | None, created_at: datetime) -> dict:
    return {
        "resourceType": "Encounter",
        "id": f"encounter-{session_id}",
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "AMB",
            "display": "ambulatory",
        },
        "subject": _patient_ref(patient_name),
        "period": {
            "start": created_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }


def _build_condition(icd_entry: dict, session_id: str, patient_name: str | None) -> dict | None:
    code = icd_entry.get("code", "").strip()
    description = icd_entry.get("description") or icd_entry.get("canonical_description") or code
    if not code:
        return None
    return {
        "resourceType": "Condition",
        "id": f"condition-{session_id}-{code.replace('.', '-')}",
        "clinicalStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active",
            }]
        },
        "code": {
            "coding": [{
                "system": "http://hl7.org/fhir/sid/icd-10-cm",
                "code": code,
                "display": description,
            }],
            "text": description,
        },
        "subject": _patient_ref(patient_name),
        "encounter": {"reference": f"#encounter-{session_id}"},
    }


def _build_medication_request(med: dict, session_id: str, patient_name: str | None) -> dict | None:
    name = med.get("name", "").strip()
    if not name:
        return None
    med_id = f"medreq-{session_id}-{name.lower().replace(' ', '-')[:30]}"
    dosage = []
    dose_text = " ".join(filter(None, [med.get("dose"), med.get("frequency"), med.get("duration")])).strip()
    if dose_text:
        dosage = [{"text": dose_text}]
    return {
        "resourceType": "MedicationRequest",
        "id": med_id,
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
            "text": name,
        },
        "subject": _patient_ref(patient_name),
        "encounter": {"reference": f"#encounter-{session_id}"},
        "dosageInstruction": dosage,
    }


def _build_composition(
    session_id: str,
    patient_name: str | None,
    note: dict,
    condition_refs: list[str],
    medreq_refs: list[str],
) -> dict:
    sections = []

    if note.get("subjective"):
        sections.append({
            "title": "Subjective",
            "text": {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{note["subjective"]}</div>'},
        })
    if note.get("objective"):
        sections.append({
            "title": "Objective",
            "text": {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{note["objective"]}</div>'},
        })

    assessment = note.get("assessment", {})
    if assessment.get("summary"):
        entry_refs = [{"reference": ref} for ref in condition_refs]
        sections.append({
            "title": "Assessment",
            "text": {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{assessment["summary"]}</div>'},
            "entry": entry_refs,
        })

    plan = note.get("plan", {})
    plan_text = plan.get("instructions", "")
    if plan_text or medreq_refs:
        entry_refs = [{"reference": ref} for ref in medreq_refs]
        sections.append({
            "title": "Plan",
            "text": {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml">{plan_text or "See medication requests."}</div>'},
            "entry": entry_refs,
        })

    return {
        "resourceType": "Composition",
        "id": f"composition-{session_id}",
        "status": "final",
        "type": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "11488-4",
                "display": "Consult note",
            }]
        },
        "subject": _patient_ref(patient_name),
        "date": _now_iso(),
        "author": [{"display": "Ambient Scribe"}],
        "title": "SOAP Note",
        "section": sections,
    }


def build_fhir_bundle(
    session_id: str,
    patient_name: str | None,
    session_created_at: datetime,
    note: dict,
) -> dict:
    """Construct a FHIR R4 Bundle from an approved SOAP note dict."""
    hal_flags = note.get("hallucination_flags", {}) or {}
    verified: list[str] = hal_flags.get("verified", [])
    icd10_validation: list[dict] = hal_flags.get("icd10_validation", [])
    rxnorm_validation: list[dict] = hal_flags.get("rxnorm_validation", [])

    assessment = note.get("assessment", {})
    all_icd_codes: list[dict] = assessment.get("icd10_codes", [])

    # Include only ICD-10 codes that passed validation or have no validation entry
    validated_codes = {e["code"] for e in icd10_validation if e.get("valid", True)}
    icd_entries = [
        c for c in all_icd_codes
        if not icd10_validation or c.get("code") in validated_codes
    ]

    plan = note.get("plan", {})
    all_meds: list[dict] = plan.get("medications", [])

    # Include only medications that resolved a RxNorm CUI (or skip filter if no validation)
    resolved_meds = {e["name"] for e in rxnorm_validation if e.get("valid", True)}
    meds = [
        m for m in all_meds
        if not rxnorm_validation or m.get("name") in resolved_meds
    ]

    encounter = _build_encounter(session_id, patient_name, session_created_at)

    conditions = [c for c in (_build_condition(e, session_id, patient_name) for e in icd_entries) if c]
    med_requests = [m for m in (_build_medication_request(m, session_id, patient_name) for m in meds) if m]

    condition_refs = [f'#{c["id"]}' for c in conditions]
    medreq_refs = [f'#{m["id"]}' for m in med_requests]

    composition = _build_composition(session_id, patient_name, note, condition_refs, medreq_refs)

    entries = [composition, encounter] + conditions + med_requests

    bundle: dict = {
        "resourceType": "Bundle",
        "id": str(uuid4()),
        "type": "document",
        "timestamp": _now_iso(),
        "entry": [{"resource": r, "fullUrl": f'urn:uuid:{r["id"]}'} for r in entries],
    }
    return bundle


async def post_to_hapi(bundle: dict) -> str:
    """POST Bundle to HAPI FHIR and return the server Bundle ID."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{_HAPI_BASE}/Bundle",
            json=bundle,
            headers={"Content-Type": "application/fhir+json"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("id") or bundle["id"]


async def export_session_to_fhir(
    session_id: str,
    patient_name: str | None,
    session_created_at: datetime,
    note: dict,
) -> dict:
    """Build Bundle, post to HAPI, return {"bundle_id": ..., "bundle": {...}}."""
    bundle = build_fhir_bundle(session_id, patient_name, session_created_at, note)
    try:
        bundle_id = await post_to_hapi(bundle)
        bundle["id"] = bundle_id
        logger.info("FHIR Bundle posted to HAPI: %s", bundle_id)
    except Exception as exc:
        logger.warning("HAPI FHIR unavailable, returning local bundle: %s", exc)
    return {"bundle_id": bundle["id"], "bundle": bundle}
