"""Scoring utilities for eval harness."""

from __future__ import annotations

from difflib import SequenceMatcher


def _normalise(s: str) -> str:
    return s.lower().strip()


def _med_names(meds: list[dict]) -> set[str]:
    return {_normalise(m.get("name", "")) for m in meds if m.get("name")}


def _icd_codes(codes: list[dict]) -> set[str]:
    return {c.get("code", "").strip().upper() for c in codes if c.get("code")}


def score_medications(gold_meds: list[dict], pred_meds: list[dict]) -> dict:
    """Exact-name medication recall/precision."""
    gold = _med_names(gold_meds)
    pred = _med_names(pred_meds)
    if not gold:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0, "tp": 0, "fp": len(pred), "fn": 0}
    tp = len(gold & pred)
    fp = len(pred - gold)
    fn = len(gold - pred)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def score_icd10(gold_codes: list[dict], pred_codes: list[dict]) -> dict:
    """Top-1 and top-3 ICD-10 accuracy (exact code match)."""
    gold = _icd_codes(gold_codes)
    pred_list = [c.get("code", "").strip().upper() for c in pred_codes if c.get("code")]

    top1_hit = bool(pred_list) and pred_list[0] in gold
    top3_hit = bool(gold & set(pred_list[:3]))
    any_hit = bool(gold & set(pred_list))

    return {
        "top1": top1_hit,
        "top3": top3_hit,
        "any_match": any_hit,
        "gold_count": len(gold),
        "pred_count": len(pred_list),
        "correct_codes": sorted(gold & set(pred_list)),
    }


def score_hallucination(transcript: str, meds: list[dict], flags: dict | None) -> dict:
    """
    Assess hallucination risk: ratio of unverified items to total items.
    Uses simple substring check as ground truth for eval purposes.
    """
    transcript_lower = transcript.lower()
    total = len(meds)
    unverified_in_transcript = 0

    for med in meds:
        name = _normalise(med.get("name", ""))
        if name and name not in transcript_lower:
            unverified_in_transcript += 1

    hallucination_rate = unverified_in_transcript / total if total > 0 else 0.0

    detector_unverified: list[str] = []
    if flags:
        detector_unverified = flags.get("unverified", [])

    return {
        "total_medications": total,
        "transcript_unverified": unverified_in_transcript,
        "hallucination_rate": hallucination_rate,
        "detector_flagged": len(detector_unverified),
    }


def similarity_score(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()
