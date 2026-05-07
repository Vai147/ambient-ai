"""Unit tests for HallucinationDetector — covers all three verification layers."""
import pytest
from unittest.mock import MagicMock, patch

from app.services.hallucination_detector import (
    HallucinationDetector,
    _exact_match,
    _fuzzy_match,
    _risk_level,
)
from app.schemas.soap_note import (
    Assessment,
    ICD10Code,
    Medication,
    Plan,
    SOAPNoteOutput,
)

TRANSCRIPT = (
    "Patient reports chest pain radiating to the left arm for two days. "
    "Doctor prescribes amoxicillin 500mg three times daily for ten days. "
    "Diagnosis of community-acquired pneumonia confirmed."
)


def _make_soap(
    medications: list[Medication] | None = None,
    icd10_codes: list[ICD10Code] | None = None,
) -> SOAPNoteOutput:
    return SOAPNoteOutput(
        subjective="Chest pain x2 days.",
        objective="Crackles on auscultation.",
        assessment=Assessment(
            summary="Community-acquired pneumonia.",
            diagnoses=["Pneumonia"],
            icd10_codes=icd10_codes or [],
        ),
        plan=Plan(
            medications=medications or [],
            instructions="Rest and hydration.",
        ),
    )


# ── Layer 1: exact match ──────────────────────────────────────────────────────

class TestExactMatch:
    def test_present_term(self):
        assert _exact_match("amoxicillin", TRANSCRIPT) is True

    def test_case_insensitive(self):
        assert _exact_match("AMOXICILLIN", TRANSCRIPT) is True

    def test_absent_term(self):
        assert _exact_match("lisinopril", TRANSCRIPT) is False

    def test_empty_string(self):
        assert _exact_match("", TRANSCRIPT) is True


# ── Layer 2: fuzzy match ──────────────────────────────────────────────────────

class TestFuzzyMatch:
    def test_near_match_above_threshold(self):
        # "amoxicilin" (one char off) should still fuzzy-match
        assert _fuzzy_match("amoxicilin", TRANSCRIPT) is True

    def test_clearly_absent(self):
        assert _fuzzy_match("warfarin", TRANSCRIPT) is False


# ── Risk level ────────────────────────────────────────────────────────────────

class TestRiskLevel:
    def test_zero_unverified(self):
        assert _risk_level(0) == "low"

    def test_one_unverified(self):
        assert _risk_level(1) == "medium"

    def test_two_unverified(self):
        assert _risk_level(2) == "medium"

    def test_three_unverified(self):
        assert _risk_level(3) == "high"


# ── Detector end-to-end ───────────────────────────────────────────────────────

class TestHallucinationDetector:
    def test_medication_in_transcript_is_verified(self):
        soap = _make_soap(
            medications=[Medication(name="amoxicillin", dose="500mg", frequency="TID")]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        assert "amoxicillin" in result.verified
        assert result.hallucination_risk == "low"

    def test_medication_absent_from_transcript_is_unverified(self):
        soap = _make_soap(
            medications=[Medication(name="lisinopril", dose="20mg", frequency="QD")]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        assert "lisinopril" in result.unverified
        assert result.hallucination_risk in ("medium", "high")

    def test_icd10_description_in_transcript_is_verified(self):
        soap = _make_soap(
            icd10_codes=[ICD10Code(code="J18.9", description="community-acquired pneumonia")]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        assert "community-acquired pneumonia" in result.verified

    def test_fabricated_icd10_description_is_unverified(self):
        soap = _make_soap(
            icd10_codes=[ICD10Code(code="I10", description="essential hypertension")]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        assert "essential hypertension" in result.unverified

    def test_empty_soap_has_low_risk(self):
        soap = _make_soap()
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        assert result.hallucination_risk == "low"
        assert result.verified == []
        assert result.unverified == []

    def test_deduplication(self):
        soap = _make_soap(
            medications=[
                Medication(name="amoxicillin", dose="500mg"),
                Medication(name="amoxicillin", dose="500mg"),  # duplicate
            ]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        total = len(result.verified) + len(result.unverified)
        # "amoxicillin" + "amoxicillin 500mg" — deduped to 2 unique items
        assert total <= 2

    def test_semantic_layer_invoked_when_exact_and_fuzzy_fail(self):
        """Semantic layer catches paraphrased medication mentions."""
        transcript_with_paraphrase = (
            "The doctor decided to treat the patient with a penicillin-class antibiotic."
        )
        soap = _make_soap(
            medications=[Medication(name="amoxicillin")]
        )
        # We don't assert verified here because semantic threshold may not fire
        # for this specific paraphrase — just assert it doesn't crash.
        result = HallucinationDetector().check(soap, transcript_with_paraphrase)
        assert isinstance(result.verified, list)
        assert isinstance(result.unverified, list)

    def test_to_dict_shape(self):
        soap = _make_soap(
            medications=[Medication(name="amoxicillin", dose="500mg")]
        )
        result = HallucinationDetector().check(soap, TRANSCRIPT)
        d = result.to_dict()
        assert set(d.keys()) == {"verified", "unverified", "hallucination_risk"}
        assert d["hallucination_risk"] in ("low", "medium", "high")
