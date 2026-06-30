"""FHIR R4 Bundle validation — gives the export pipeline an explicit validity
signal instead of silently swallowing failures.

Two layers:
  - local  : structural / required-field / datatype validation via the
             ``fhir.resources`` R4B models. Always runs, needs no server, and is
             the authoritative ``valid`` signal (works in prod with no HAPI).
  - hapi   : best-effort ``$validate`` against a HAPI FHIR server for deeper
             terminology / reference / profile checks. A no-op when HAPI is
             unreachable; never flips ``valid`` to false on its own.
"""

import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Literal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_HAPI_BASE = getattr(settings, "hapi_fhir_url", "")
_HAPI_TIMEOUT = 10.0

Severity = Literal["error", "warning", "information"]
Source = Literal["local", "hapi"]


@dataclass(frozen=True)
class ValidationIssue:
    severity: Severity
    code: str
    location: str | None
    message: str
    source: Source


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    issues: list[ValidationIssue]
    validated_by: list[str]
    hapi_reachable: bool | None
    validated_at: str

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "issues": [asdict(i) for i in self.issues],
            "validated_by": self.validated_by,
            "hapi_reachable": self.hapi_reachable,
            "validated_at": self.validated_at,
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_bundle_local(bundle: dict) -> list[ValidationIssue]:
    """Validate a Bundle dict against the FHIR R4B pydantic models.

    Returns a list of structural issues; an empty list means structurally
    valid. If the validator library is unavailable, returns a single
    ``information`` issue (and logs loudly) rather than raising — a missing
    dependency is a deploy bug, not a clinical-data error.
    """
    try:
        # R4 models live under the R4B subpackage in fhir.resources 8.x;
        # the top-level Bundle is R5.
        from fhir.resources.R4B.bundle import Bundle
    except ImportError:  # pragma: no cover - deploy misconfiguration
        logger.error(
            "fhir.resources not importable — local FHIR validation unavailable"
        )
        return [
            ValidationIssue(
                severity="information",
                code="not-supported",
                location=None,
                message="Local FHIR validator unavailable (fhir.resources missing).",
                source="local",
            )
        ]

    try:
        from pydantic import ValidationError
    except ImportError:  # pragma: no cover
        from pydantic.v1 import ValidationError  # type: ignore

    try:
        Bundle.model_validate(bundle)
        return []
    except ValidationError as exc:
        return [
            ValidationIssue(
                severity="error",
                code="structure",
                location=".".join(str(part)
                                  for part in err.get("loc", ())) or None,
                message=err.get("msg", "Invalid value"),
                source="local",
            )
            for err in exc.errors()
        ]


def parse_operation_outcome(outcome: dict, source: Source = "hapi") -> list[ValidationIssue]:
    """Convert a FHIR ``OperationOutcome`` resource into ValidationIssues."""
    issues: list[ValidationIssue] = []
    for issue in outcome.get("issue", []) or []:
        severity = issue.get("severity") or "error"
        if severity == "fatal":
            severity = "error"

        location = None
        expression = issue.get("expression")
        legacy_location = issue.get("location")
        if expression:
            location = expression[0]
        elif legacy_location:
            location = legacy_location[0]

        message = issue.get("diagnostics")
        if not message:
            details = issue.get("details") or {}
            message = details.get("text") or issue.get(
                "code") or "Validation issue"

        issues.append(
            ValidationIssue(
                severity=severity,  # type: ignore[arg-type]
                code=issue.get("code", "invalid"),
                location=location,
                message=message,
                source=source,
            )
        )
    return issues


async def validate_bundle_hapi(bundle: dict) -> tuple[bool, list[ValidationIssue]]:
    """Best-effort ``$validate`` against HAPI.

    Returns ``(reachable, issues)``. Any transport error yields ``(False, [])``
    so an unreachable server never masquerades as an invalid bundle.
    """
    url = f"{_HAPI_BASE}/Bundle/$validate"
    try:
        async with httpx.AsyncClient(timeout=_HAPI_TIMEOUT) as client:
            resp = await client.post(
                url,
                json=bundle,
                headers={"Content-Type": "application/fhir+json"},
            )
        # HAPI returns the OperationOutcome in the body for both 200 and 4xx.
        outcome = resp.json()
        if outcome.get("resourceType") != "OperationOutcome":
            return True, []
        return True, parse_operation_outcome(outcome, source="hapi")
    except Exception as exc:  # noqa: BLE001 - transport failure is non-fatal
        logger.info("HAPI $validate unreachable: %s", exc)
        return False, []


async def validate_bundle(bundle: dict, *, try_hapi: bool | None = None) -> ValidationResult:
    """Validate a Bundle. Local validation is authoritative for ``valid``;
    HAPI issues are folded in as enrichment when the server is reachable.

    ``try_hapi`` defaults to whether a HAPI server is configured
    (``settings.hapi_enabled``). With no HAPI configured — prod without a HAPI
    service, or tests — validation is purely in-codebase and makes no network
    calls. Pass an explicit bool to override.
    """
    if try_hapi is None:
        try_hapi = settings.hapi_enabled

    local_issues = validate_bundle_local(bundle)
    issues = list(local_issues)
    validated_by = ["local"]
    hapi_reachable: bool | None = None

    if try_hapi:
        hapi_reachable, hapi_issues = await validate_bundle_hapi(bundle)
        if hapi_reachable:
            validated_by.append("hapi")
            issues.extend(hapi_issues)

    valid = not any(i.severity == "error" and i.source ==
                    "local" for i in issues)

    return ValidationResult(
        valid=valid,
        issues=issues,
        validated_by=validated_by,
        hapi_reachable=hapi_reachable,
        validated_at=_now_iso(),
    )
