"""ICD-10-CM code validation and RxNorm CUI lookup (Task 3.4).

ICD-10 validation: loads CMS ICD-10-CM code list from
backend/data/icd10cm_codes.json if present; falls back to regex format check.

RxNorm: uses the public NLM RxNorm REST API (no API key required).
"""

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_ICD10_FORMAT = re.compile(r"^[A-Z]\d{2}(\.\d{1,4})?$")
_CMS_FILE = Path(__file__).parent.parent.parent / "data" / "icd10cm_codes.json"
_RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"


@lru_cache(maxsize=1)
def _load_icd10_index() -> dict[str, str] | None:
    if not _CMS_FILE.exists():
        logger.warning("ICD-10 CMS file not found at %s — using format-only validation", _CMS_FILE)
        return None
    try:
        data: dict[str, str] = json.loads(_CMS_FILE.read_text())
        logger.info("Loaded %d ICD-10-CM codes from CMS file", len(data))
        return data
    except Exception as exc:
        logger.error("Failed to load ICD-10 CMS file: %s", exc)
        return None


def validate_icd10(code: str) -> tuple[bool, str | None]:
    """Return (is_valid, canonical_description | None).

    Validates against local CMS index if available, otherwise regex only.
    """
    code = code.strip().upper()
    if not _ICD10_FORMAT.match(code):
        return False, None
    index = _load_icd10_index()
    if index is None:
        return True, None  # format OK, no index to check against
    description = index.get(code)
    if description is None:
        return False, None
    return True, description


async def lookup_rxnorm(drug_name: str) -> tuple[str | None, str | None]:
    """Return (rxcui, canonical_name) or (None, None) if not found."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{_RXNORM_BASE}/rxcui.json",
                params={"name": drug_name, "search": "1"},
            )
            resp.raise_for_status()
            data = resp.json()
            rxcui = data.get("idGroup", {}).get("rxnormId", [None])[0]
            if not rxcui:
                return None, None

            name_resp = await client.get(f"{_RXNORM_BASE}/rxcui/{rxcui}/properties.json")
            name_resp.raise_for_status()
            props = name_resp.json().get("properties", {})
            return rxcui, props.get("name")
    except Exception as exc:
        logger.warning("RxNorm lookup failed for %r: %s", drug_name, exc)
        return None, None


async def enrich_soap_flags(soap_dict: dict, transcript_content: str) -> dict:
    """Validate ICD-10 codes and RxNorm CUIs from a SOAP note dict.

    Returns a dict of validation flags merged into hallucination_flags.
    """
    icd10_flags: list[dict] = []
    for code_entry in soap_dict.get("assessment", {}).get("icd10_codes", []):
        code = code_entry.get("code", "")
        valid, canonical = validate_icd10(code)
        icd10_flags.append({
            "code": code,
            "valid": valid,
            "canonical_description": canonical,
            "submitted_description": code_entry.get("description", ""),
        })
        if not valid:
            logger.warning("Invalid ICD-10 code in SOAP note: %r", code)

    rxnorm_flags: list[dict] = []
    for med in soap_dict.get("plan", {}).get("medications", []):
        name = med.get("name", "")
        rxcui, canonical_name = await lookup_rxnorm(name)
        rxnorm_flags.append({
            "name": name,
            "rxcui": rxcui,
            "canonical_name": canonical_name,
            "valid": rxcui is not None,
        })
        if rxcui is None:
            logger.warning("No RxNorm CUI found for medication: %r", name)

    return {"icd10_validation": icd10_flags, "rxnorm_validation": rxnorm_flags}
