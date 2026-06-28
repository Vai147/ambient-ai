"""Unit tests for FHIR R4 bundle validation."""
from datetime import datetime, timezone

import pytest

from app.services.fhir_export import build_fhir_bundle
from app.services.fhir_validation import (
    parse_operation_outcome,
    validate_bundle,
    validate_bundle_local,
)


def _representative_note() -> dict:
    return {
        "subjective": "Patient reports sore throat for three days.",
        "objective": "Temp 38.1C, pharyngeal erythema.",
        "assessment": {
            "summary": "Acute pharyngitis.",
            "icd10_codes": [{"code": "J02.9", "description": "Acute pharyngitis, unspecified"}],
        },
        "plan": {
            "instructions": "Rest, fluids.",
            "medications": [{"name": "Amoxicillin", "dose": "500mg", "frequency": "BID", "duration": "7 days"}],
        },
        "hallucination_flags": {},
    }


def _valid_bundle() -> dict:
    return build_fhir_bundle(
        session_id="sess-1",
        patient_name="Jane Doe",
        session_created_at=datetime.now(timezone.utc),
        note=_representative_note(),
    )


class TestValidateBundleLocal:
    def test_built_bundle_is_valid(self):
        issues = validate_bundle_local(_valid_bundle())
        assert issues == []

    def test_missing_type_is_invalid(self):
        bundle = _valid_bundle()
        del bundle["type"]  # Bundle.type is required in R4
        issues = validate_bundle_local(bundle)
        assert any(i.severity == "error" for i in issues)
        assert any(i.location and "type" in i.location for i in issues)

    def test_wrong_resource_type_is_invalid(self):
        bundle = _valid_bundle()
        bundle["resourceType"] = "Patient"
        issues = validate_bundle_local(bundle)
        assert any(i.severity == "error" and i.source == "local" for i in issues)

    def test_incomplete_nested_resource_is_invalid(self):
        bundle = _valid_bundle()
        # Composition missing required fields beyond resourceType.
        bundle["entry"][0]["resource"] = {"resourceType": "Composition"}
        issues = validate_bundle_local(bundle)
        assert any(i.severity == "error" for i in issues)


class TestParseOperationOutcome:
    def test_maps_severity_location_message(self):
        outcome = {
            "resourceType": "OperationOutcome",
            "issue": [
                {
                    "severity": "warning",
                    "code": "code-invalid",
                    "expression": ["Bundle.entry[2].resource.code"],
                    "diagnostics": "Unknown code 'XYZ'",
                },
                {
                    "severity": "fatal",
                    "code": "structure",
                    "location": ["Bundle.entry[0]"],
                    "details": {"text": "Malformed resource"},
                },
            ],
        }
        issues = parse_operation_outcome(outcome, source="hapi")
        assert len(issues) == 2
        first, second = issues
        assert first.severity == "warning"
        assert first.location == "Bundle.entry[2].resource.code"
        assert first.message == "Unknown code 'XYZ'"
        assert first.source == "hapi"
        # fatal collapses to error; falls back to legacy location + details.text
        assert second.severity == "error"
        assert second.location == "Bundle.entry[0]"
        assert second.message == "Malformed resource"

    def test_empty_outcome(self):
        assert parse_operation_outcome({"issue": []}) == []
        assert parse_operation_outcome({}) == []


class TestValidateBundle:
    @pytest.mark.asyncio
    async def test_valid_bundle_local_only(self):
        result = await validate_bundle(_valid_bundle(), try_hapi=False)
        assert result.valid is True
        assert result.validated_by == ["local"]
        assert result.hapi_reachable is None
        assert all(i.severity != "error" for i in result.issues)

    @pytest.mark.asyncio
    async def test_invalid_bundle_local_only(self):
        bundle = _valid_bundle()
        del bundle["type"]
        result = await validate_bundle(bundle, try_hapi=False)
        assert result.valid is False
        assert any(i.severity == "error" for i in result.issues)

    @pytest.mark.asyncio
    async def test_to_dict_shape(self):
        result = await validate_bundle(_valid_bundle(), try_hapi=False)
        d = result.to_dict()
        assert set(d.keys()) == {
            "valid",
            "issues",
            "validated_by",
            "hapi_reachable",
            "validated_at",
        }
        assert isinstance(d["issues"], list)
