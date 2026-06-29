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
from app.services.fhir_validation import validate_bundle

logger = logging.getLogger(__name__)

_HAPI_BASE = getattr(settings, "hapi_fhir_url", "http://localhost:8080/fhir")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _patient_ref(patient_name: str | None) -> dict:
    return {"display": patient_name or "Unknown Patient"}


def _build_encounter(resource_id: str, patient_name: str | None, created_at: datetime) -> dict:
    return {
        "resourceType": "Encounter",
        "id": resource_id,
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


def _build_condition(
    icd_entry: dict, resource_id: str, patient_name: str | None, encounter_ref: str
) -> dict | None:
    code = icd_entry.get("code", "").strip()
    description = icd_entry.get("description") or icd_entry.get("canonical_description") or code
    if not code:
        return None
    return {
        "resourceType": "Condition",
        "id": resource_id,
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
        "encounter": {"reference": encounter_ref},
    }


def _build_medication_request(
    med: dict, resource_id: str, patient_name: str | None, encounter_ref: str
) -> dict | None:
    name = med.get("name", "").strip()
    if not name:
        return None
    dosage = []
    dose_text = " ".join(filter(None, [med.get("dose"), med.get("frequency"), med.get("duration")])).strip()
    if dose_text:
        dosage = [{"text": dose_text}]
    return {
        "resourceType": "MedicationRequest",
        "id": resource_id,
        "status": "active",
        "intent": "order",
        "medicationCodeableConcept": {
            "text": name,
        },
        "subject": _patient_ref(patient_name),
        "encounter": {"reference": encounter_ref},
        "dosageInstruction": dosage,
    }


def _build_composition(
    resource_id: str,
    patient_name: str | None,
    note: dict,
    condition_refs: list[str],
    medreq_refs: list[str],
    encounter_ref: str,
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
        "id": resource_id,
        "status": "final",
        "type": {
            "coding": [{
                "system": "http://loinc.org",
                "code": "11488-4",
                "display": "Consult note",
            }]
        },
        "subject": _patient_ref(patient_name),
        "encounter": {"reference": encounter_ref},
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

    # Each resource gets a real UUID. In a document Bundle, resources reference
    # each other by their entry fullUrl (urn:uuid:<id>), not by "#local" syntax
    # (which is only for contained resources) — HAPI rejects the latter.
    encounter_id = str(uuid4())
    encounter_ref = f"urn:uuid:{encounter_id}"
    encounter = _build_encounter(encounter_id, patient_name, session_created_at)

    conditions: list[dict] = []
    condition_refs: list[str] = []
    for entry in icd_entries:
        cid = str(uuid4())
        condition = _build_condition(entry, cid, patient_name, encounter_ref)
        if condition:
            conditions.append(condition)
            condition_refs.append(f"urn:uuid:{cid}")

    med_requests: list[dict] = []
    medreq_refs: list[str] = []
    for med in meds:
        mid = str(uuid4())
        medreq = _build_medication_request(med, mid, patient_name, encounter_ref)
        if medreq:
            med_requests.append(medreq)
            medreq_refs.append(f"urn:uuid:{mid}")

    composition = _build_composition(
        str(uuid4()), patient_name, note, condition_refs, medreq_refs, encounter_ref
    )

    entries = [composition, encounter] + conditions + med_requests

    bundle_id = str(uuid4())
    bundle: dict = {
        "resourceType": "Bundle",
        "id": bundle_id,
        # bdl-9: a document Bundle SHALL carry an identifier (system + value).
        "identifier": {"system": "urn:ietf:rfc:3986", "value": f"urn:uuid:{bundle_id}"},
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
    """Build Bundle, validate, then post to HAPI only when valid.

    Returns {"bundle_id", "bundle", "validation", "posted"}. The three outcomes
    are kept distinct: an invalid bundle is never posted, and an unreachable
    HAPI never masquerades as an invalid bundle.
    """
    bundle = build_fhir_bundle(session_id, patient_name, session_created_at, note)
    # validate_bundle gates the HAPI $validate layer on settings.hapi_enabled;
    # with no HAPI configured this is pure in-codebase validation, no network.
    result = await validate_bundle(bundle)

    posted = False
    if not result.valid:
        error_count = sum(1 for i in result.issues if i.severity == "error")
        logger.warning("FHIR Bundle invalid; not posting. errors=%d", error_count)
    elif settings.hapi_enabled and settings.hapi_persist:
        # Persist only to an owned HAPI. Never auto-POST to an external/public
        # server (would store PHI off-system) — that is what hapi_persist gates.
        try:
            bundle_id = await post_to_hapi(bundle)
            bundle["id"] = bundle_id
            posted = True
            logger.info("FHIR Bundle posted to HAPI: %s", bundle_id)
        except Exception as exc:
            logger.warning("FHIR Bundle valid but HAPI post failed: %s", exc)

    return {
        "bundle_id": bundle["id"],
        "bundle": bundle,
        "validation": result.to_dict(),
        "posted": posted,
    }
