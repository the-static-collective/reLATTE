"""Freeze signed demo history with aggregate expectations derived without the accumulator.

Usage: python3 -B examples/useful-work-005/freeze_golden.py <audit.json> <new-fixture.json>
Signatures/nonces are retained, not regenerated. This tool does not authenticate evidence;
the TypeScript fixture test independently authenticates every saved signed exchange.
"""
import collections
import json
import math
import sys
from pathlib import Path


def freeze(audit):
    submissions = audit["submissions"]
    receipts = {s["receipt"]["receipt_id"]: s["receipt"] for s in submissions}
    reports = [r["extensions"]["useful_work_native"] for r in receipts.values()]
    challenges = {r["scope"]["challenge_id"]: r["scope"]["indices"] for r in reports}
    requested = sorted({i for draw in challenges.values() for i in draw})
    counts = collections.Counter()
    predictions = collections.defaultdict(set)
    for report in reports:
        for e in report["evidence"]:
            counts[e["index"]] += 1
            v = e["verifier"]
            predictions[e["index"]].add((v["count"], v["final_real_q"], v["final_imag_q"]))
    n = audit["job_spec"]["width"] * audit["job_spec"]["height"]
    b = audit["model"]["bad_entry_count"]
    # Exact integer binomial coefficients, separately implemented from the JS log model.
    numerator = math.prod(math.comb(n - b, len(draw)) for draw in challenges.values())
    denominator = math.prod(math.comb(n, len(draw)) for draw in challenges.values())
    factor = math.gcd(numerator, denominator)
    expected = {
        "audit_id": audit["audit_id"], "result_id": audit["result_id"],
        "submission_count": len(submissions), "unique_receipt_count": len(receipts),
        "replayed_receipt_submissions": len(submissions) - len(receipts),
        "unique_challenge_count": len(challenges), "requested_indices": requested,
        "observed_indices": sorted(counts),
        "per_index_observation_counts": [{"index": i, "count": counts[i]} for i in sorted(counts)],
        "unique_challenge_sample_slots": sum(map(len, challenges.values())),
        "repeated_slots": sum(map(len, challenges.values())) - len(requested),
        "indices_shared_by_challenges": [i for i in requested if sum(i in draw for draw in challenges.values()) > 1],
        "verifier_disagreement_indices": sorted(i for i, variants in predictions.items() if len(variants) > 1),
        "conditional_miss_fraction": {"numerator": numerator // factor, "denominator": denominator // factor},
    }
    return {"provenance": "Three fresh 4-of-12 signed Kernel 004 challenges, two honest worlds, one exact replay, one same-key recheck and an actual Python terminal-state mutation. Expected aggregates derived from signed reports by freeze_golden.py, without importing the accumulator. No private keys.",
            "audit": audit, "expected": expected}


if __name__ == "__main__":
    with Path(sys.argv[1]).open() as source:
        fixture = freeze(json.load(source))
    with Path(sys.argv[2]).open("x") as target:
        json.dump(fixture, target, ensure_ascii=False, separators=(",", ":"))
        target.write("\n")
