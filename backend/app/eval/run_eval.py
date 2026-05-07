"""Eval harness — Task 5.3.

Usage (via Docker):
    docker compose exec backend python -m app.eval.run_eval

Usage (local venv):
    cd backend && python -m app.eval.run_eval

Scores SOAP generation against gold-standard labels across 5 synthetic
encounter fixtures. Prints a Markdown results table.

Metrics:
  - Medication recall / precision / F1
  - ICD-10 top-1 and top-3 accuracy
  - Hallucination rate (meds not found in transcript)
  - Prompt cache hit rate (via Anthropic usage metadata)
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

# Allow running as __main__ from repo root inside Docker or venv
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.core.config import settings  # noqa: E402 — path insertion above
from app.eval.scorer import score_hallucination, score_icd10, score_medications  # noqa: E402
from app.services.soap_note import SOAPNoteService  # noqa: E402

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent.parent / "test_data" / "fixtures"
GOLD_DIR = Path(__file__).parent.parent.parent.parent.parent / "test_data" / "gold_standard"

THRESHOLDS = {
    "med_recall": 0.90,
    "icd10_top3": 0.85,
    "hallucination_rate": 0.05,
}


def _load_json(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def _colour(ok: bool) -> str:
    return "✅" if ok else "❌"


def run() -> int:
    api_key = getattr(settings, "anthropic_api_key", None) or os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set — cannot run eval")
        return 1

    fixture_files = sorted(FIXTURES_DIR.glob("enc-*.json"))
    if not fixture_files:
        print(f"ERROR: No fixtures found in {FIXTURES_DIR}")
        return 1

    service = SOAPNoteService()

    results = []
    cache_hits = 0
    total_input_tokens = 0

    print(f"\nRunning eval against {len(fixture_files)} fixtures…\n")

    for fpath in fixture_files:
        fixture = _load_json(fpath)
        enc_id = fixture["id"]
        gold_path = GOLD_DIR / f"{enc_id}.json"

        if not gold_path.exists():
            print(f"  [{enc_id}] SKIP — no gold standard at {gold_path}")
            continue

        gold = _load_json(gold_path)
        transcript = fixture["transcript"]

        print(f"  [{enc_id}] Generating SOAP note…", end="", flush=True)
        t0 = time.time()
        try:
            note, usage = service.generate_with_usage(transcript)
            elapsed = time.time() - t0
        except Exception as exc:
            print(f" ERROR: {exc}")
            results.append({"id": enc_id, "error": str(exc)})
            continue

        if usage:
            total_input_tokens += usage.get("input_tokens", 0)
            if usage.get("cache_read_input_tokens", 0) > 0:
                cache_hits += 1

        gold_soap = gold["soap"]
        gold_meds = gold_soap["plan"]["medications"]
        gold_codes = gold_soap["assessment"]["icd10_codes"]

        pred_meds = note.plan.get("medications", []) if isinstance(note.plan, dict) else []
        pred_codes = note.assessment.get("icd10_codes", []) if isinstance(note.assessment, dict) else []

        med_score = score_medications(gold_meds, pred_meds)
        icd_score = score_icd10(gold_codes, pred_codes)
        hal_score = score_hallucination(transcript, pred_meds, None)

        print(f" done ({elapsed:.1f}s)")

        results.append({
            "id": enc_id,
            "patient": fixture.get("patient_name", ""),
            "elapsed_s": round(elapsed, 1),
            "med": med_score,
            "icd": icd_score,
            "hal": hal_score,
        })

    if not results:
        print("No results produced.")
        return 1

    # ── Summary stats ────────────────────────────────────────────────────────
    successful = [r for r in results if "error" not in r]
    if not successful:
        print("All encounters failed.")
        return 1

    avg_med_recall = sum(r["med"]["recall"] for r in successful) / len(successful)
    avg_med_f1 = sum(r["med"]["f1"] for r in successful) / len(successful)
    icd_top1_acc = sum(1 for r in successful if r["icd"]["top1"]) / len(successful)
    icd_top3_acc = sum(1 for r in successful if r["icd"]["top3"]) / len(successful)
    avg_hal_rate = sum(r["hal"]["hallucination_rate"] for r in successful) / len(successful)
    cache_pct = (cache_hits / len(successful) * 100) if successful else 0

    # ── Print Markdown table ─────────────────────────────────────────────────
    print("\n## Eval Results\n")
    print(f"{'ID':<12} {'Patient':<22} {'Med R':<8} {'Med F1':<8} {'ICD-1':<7} {'ICD-3':<7} {'Hal%':<8} {'Time':<6}")
    print("-" * 78)
    for r in results:
        if "error" in r:
            print(f"{r['id']:<12} {'ERROR':<22} {r['error']}")
            continue
        hal_pct = f"{r['hal']['hallucination_rate']*100:.0f}%"
        print(
            f"{r['id']:<12} {r['patient']:<22} "
            f"{r['med']['recall']:.0%}{'':4} {r['med']['f1']:.0%}{'':4} "
            f"{'Y' if r['icd']['top1'] else 'N':<7} {'Y' if r['icd']['top3'] else 'N':<7} "
            f"{hal_pct:<8} {r['elapsed_s']}s"
        )

    print("-" * 78)
    print(f"\n## Aggregate Scores ({len(successful)}/{len(results)} encounters)\n")
    print(f"| Metric | Score | Threshold | Pass |")
    print(f"|--------|-------|-----------|------|")
    print(f"| Medication recall  | {avg_med_recall:.0%} | ≥{THRESHOLDS['med_recall']:.0%} | {_colour(avg_med_recall >= THRESHOLDS['med_recall'])} |")
    print(f"| Medication F1      | {avg_med_f1:.0%} | —         | —    |")
    print(f"| ICD-10 top-1 acc   | {icd_top1_acc:.0%} | —         | —    |")
    print(f"| ICD-10 top-3 acc   | {icd_top3_acc:.0%} | ≥{THRESHOLDS['icd10_top3']:.0%} | {_colour(icd_top3_acc >= THRESHOLDS['icd10_top3'])} |")
    print(f"| Hallucination rate | {avg_hal_rate:.1%} | ≤{THRESHOLDS['hallucination_rate']:.0%} | {_colour(avg_hal_rate <= THRESHOLDS['hallucination_rate'])} |")
    print(f"| Prompt cache hits  | {cache_pct:.0f}%  | —         | —    |")
    print()

    all_pass = (
        avg_med_recall >= THRESHOLDS["med_recall"]
        and icd_top3_acc >= THRESHOLDS["icd10_top3"]
        and avg_hal_rate <= THRESHOLDS["hallucination_rate"]
    )
    if all_pass:
        print("✅ All thresholds met.\n")
        return 0
    else:
        print("❌ One or more thresholds not met.\n")
        return 1


if __name__ == "__main__":
    sys.exit(run())
