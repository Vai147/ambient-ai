"""Unit tests for eval harness scorer."""
import pytest

from app.eval.scorer import score_medications, score_icd10, score_hallucination


# ── Medication scoring ────────────────────────────────────────────────────────

def test_medication_perfect_match():
    gold = [{"name": "metformin"}, {"name": "lisinopril"}]
    pred = [{"name": "metformin"}, {"name": "lisinopril"}]
    result = score_medications(gold, pred)
    assert result["recall"] == 1.0
    assert result["precision"] == 1.0
    assert result["f1"] == 1.0


def test_medication_partial_recall():
    gold = [{"name": "metformin"}, {"name": "glipizide"}, {"name": "lisinopril"}]
    pred = [{"name": "metformin"}, {"name": "lisinopril"}]
    result = score_medications(gold, pred)
    assert result["recall"] == pytest.approx(2 / 3)
    assert result["fn"] == 1


def test_medication_false_positive():
    gold = [{"name": "aspirin"}]
    pred = [{"name": "aspirin"}, {"name": "ibuprofen"}]
    result = score_medications(gold, pred)
    assert result["precision"] == pytest.approx(0.5)
    assert result["fp"] == 1


def test_medication_case_insensitive():
    gold = [{"name": "Metformin"}]
    pred = [{"name": "metformin"}]
    result = score_medications(gold, pred)
    assert result["recall"] == 1.0


def test_medication_empty_gold():
    result = score_medications([], [{"name": "aspirin"}])
    assert result["recall"] == 1.0
    assert result["fp"] == 1


# ── ICD-10 scoring ────────────────────────────────────────────────────────────

def test_icd10_top1_hit():
    gold = [{"code": "E11.9"}, {"code": "I10"}]
    pred = [{"code": "E11.9"}, {"code": "Z99"}]
    result = score_icd10(gold, pred)
    assert result["top1"] is True
    assert result["top3"] is True


def test_icd10_top1_miss_top3_hit():
    gold = [{"code": "E11.9"}]
    pred = [{"code": "Z99"}, {"code": "Z98"}, {"code": "E11.9"}]
    result = score_icd10(gold, pred)
    assert result["top1"] is False
    assert result["top3"] is True


def test_icd10_no_match():
    gold = [{"code": "E11.9"}]
    pred = [{"code": "Z99"}, {"code": "Z98"}, {"code": "Z97"}]
    result = score_icd10(gold, pred)
    assert result["top1"] is False
    assert result["top3"] is False
    assert result["any_match"] is False


def test_icd10_empty_pred():
    gold = [{"code": "E11.9"}]
    result = score_icd10(gold, [])
    assert result["top1"] is False
    assert result["top3"] is False


# ── Hallucination scoring ─────────────────────────────────────────────────────

TRANSCRIPT = "Patient takes metformin 500mg twice daily and lisinopril 10mg."


def test_hallucination_all_grounded():
    meds = [{"name": "metformin"}, {"name": "lisinopril"}]
    result = score_hallucination(TRANSCRIPT, meds, None)
    assert result["hallucination_rate"] == 0.0
    assert result["transcript_unverified"] == 0


def test_hallucination_fabricated_med():
    meds = [{"name": "metformin"}, {"name": "warfarin"}]
    result = score_hallucination(TRANSCRIPT, meds, None)
    assert result["hallucination_rate"] == pytest.approx(0.5)
    assert result["transcript_unverified"] == 1


def test_hallucination_empty_meds():
    result = score_hallucination(TRANSCRIPT, [], None)
    assert result["hallucination_rate"] == 0.0
    assert result["total_medications"] == 0
