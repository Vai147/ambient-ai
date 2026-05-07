import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache

from app.schemas.soap_note import SOAPNoteOutput

logger = logging.getLogger(__name__)

FUZZY_THRESHOLD = 85
SEMANTIC_THRESHOLD = 0.55


@dataclass
class HallucinationResult:
    verified: list[str] = field(default_factory=list)
    unverified: list[str] = field(default_factory=list)
    hallucination_risk: str = "low"

    def to_dict(self) -> dict:
        return {
            "verified": self.verified,
            "unverified": self.unverified,
            "hallucination_risk": self.hallucination_risk,
        }


@lru_cache(maxsize=1)
def _load_sentence_model():
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Loaded sentence-transformers model all-MiniLM-L6-v2")
        return model
    except ImportError:
        logger.warning("sentence-transformers not installed — semantic check disabled")
        return None


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.!?\n]+", text) if s.strip()]


def _exact_match(item: str, transcript: str) -> bool:
    return item.lower() in transcript.lower()


def _fuzzy_match(item: str, transcript: str) -> bool:
    try:
        from rapidfuzz import fuzz
        score = fuzz.partial_ratio(item.lower(), transcript.lower())
        return score >= FUZZY_THRESHOLD
    except ImportError:
        logger.warning("rapidfuzz not installed — fuzzy check disabled")
        return False


def _semantic_match(item: str, transcript: str) -> bool:
    model = _load_sentence_model()
    if model is None:
        return False
    try:
        import numpy as np
        sentences = _split_sentences(transcript)
        if not sentences:
            return False
        embeddings = model.encode([item] + sentences, normalize_embeddings=True)
        item_emb = embeddings[0]
        sent_embs = embeddings[1:]
        sims = (sent_embs @ item_emb).astype(float)
        return float(sims.max()) >= SEMANTIC_THRESHOLD
    except Exception as exc:
        logger.error("Semantic similarity check failed: %s", exc)
        return False


def _is_grounded(item: str, transcript: str) -> bool:
    if not item or not item.strip():
        return True
    if _exact_match(item, transcript):
        return True
    if _fuzzy_match(item, transcript):
        return True
    return _semantic_match(item, transcript)


def _risk_level(unverified_count: int) -> str:
    if unverified_count == 0:
        return "low"
    if unverified_count <= 2:
        return "medium"
    return "high"


class HallucinationDetector:
    def check(self, soap: SOAPNoteOutput, transcript: str) -> HallucinationResult:
        candidates: list[str] = []

        for med in soap.plan.medications:
            candidates.append(med.name)
            if med.dose:
                candidates.append(f"{med.name} {med.dose}".strip())

        for icd in soap.assessment.icd10_codes:
            if icd.description:
                candidates.append(icd.description)

        # Deduplicate preserving order
        seen: set[str] = set()
        items: list[str] = []
        for c in candidates:
            if c and c not in seen:
                seen.add(c)
                items.append(c)

        verified: list[str] = []
        unverified: list[str] = []

        for item in items:
            if _is_grounded(item, transcript):
                verified.append(item)
            else:
                unverified.append(item)
                logger.warning("Unverified claim in SOAP note: %r", item)

        result = HallucinationResult(
            verified=verified,
            unverified=unverified,
            hallucination_risk=_risk_level(len(unverified)),
        )
        logger.info(
            "Hallucination check: %d verified, %d unverified, risk=%s",
            len(verified),
            len(unverified),
            result.hallucination_risk,
        )
        return result
