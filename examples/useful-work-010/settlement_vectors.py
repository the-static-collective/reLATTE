"""Independent public-fixture arithmetic/identity oracle, not a signature verifier.

Node authenticates and reconstructs 004–009 evidence. This oracle independently
checks 010 hashes, local thresholds, offerer window, and external ledger deltas.
It imports no TypeScript, collector, worker, private key, or provider code.
stdin: settlement bundle. freeze <bundle-path> <new-fixture-path>.
The frozen vectors use the integer/string subset of RFC 8785.
"""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import sys


def jcs(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def identifier(prefix, domain, value):
    return prefix + hashlib.sha256(domain.encode() + jcs(value)).hexdigest()


def number(r):
    return Fraction(int(r["numerator"]), int(r["denominator"]))


def signer(v):
    key = v["signing"]["public_key"]
    return dict(world_id=v.get("source_world", v.get("world_id")), public_key={k: key[k] for k in ["kty", "crv", "x", "y"]})


def payload(v, kind):
    return v["extensions"]["organ_adapter"]["donor_claims"]["settlement_" + kind]


def check(bundle):
    body = {k: v for k, v in bundle.items() if k != "bundle_id"}
    assert bundle["bundle_id"] == identifier("useful-work-settlement-bundle-v1:", "UsefulWork-SettlementBundle-v1|", body)
    x = bundle["exchange"]; offer = payload(x["offer"], "offer"); evidence = x["evidence"]
    assert evidence["evidence_id"] == identifier("useful-work-offer-evidence-v1:", "UsefulWork-OfferEvidence-v1|", {k: v for k, v in evidence.items() if k != "evidence_id"})
    policy = offer["policy"]
    assert offer["acceptance_policy_id"] == identifier("useful-work-acceptance-policy-v1:", "UsefulWork-AcceptancePolicy-v1|", policy)
    p = payload(x["presentation"], "presentation"); d = x["decision"]["extensions"]["useful_work_offer_decision"]
    assert d["evidence"] == p["evidence"] and d["offer_id"] == x["offer"]["crossing_id"] and d["presentation_id"] == x["presentation"]["crossing_id"]
    checks = []
    for c in policy["clauses"]:
        kind = c["kind"]; present = False; passed = False
        if kind == "resource":
            adapter = {"cpu_time_observed": "cpu", "energy_watt_hours_observed": "energy", "logical_file_bytes_observed": "storage",
                       "filesystem_allocated_bytes_observed": "storage", "interface_rx_bytes_observed": "network", "interface_tx_bytes_observed": "network"}[c["metric"]]
            entries = [] if evidence["resources"] is None else evidence["resources"]["observations"]
            for entry in entries:
                m = entry["measurement"]; claim = m["extensions"]["organ_adapter"]["donor_claims"].get("resource_" + adapter)
                if not claim: continue
                present = True
                admitted = signer(m) == c["collector"] and signer(entry["receipt"]) == c["replayer"] and claim["provenance"]["capture_mode"] in c["allowed_capture_modes"]
                observed = claim["observed"][c["metric"]]; amount = number(observed) if isinstance(observed, dict) else Fraction(int(observed))
                if adapter == "cpu":
                    a, b = claim["evidence"]["start"], claim["evidence"]["end"]
                    def ticks(s):
                        f = s["proc_stat"][s["proc_stat"].rindex(") ") + 2:].split()
                        return int(f[11]) + int(f[12])
                    assert amount == Fraction((ticks(b) - ticks(a)) * 1000, int(a["clock_ticks_per_second"]))
                if adapter == "energy": admitted = admitted and claim["observed"]["reading_origin"] in c["allowed_reading_origins"]
                passed = passed or (admitted and amount >= number(c["minimum"]) and (c["maximum"] is None or amount <= number(c["maximum"])))
        elif kind == "valuation":
            for v in evidence["valuations"]:
                present = True; r = v["receipt"]["extensions"]["useful_work_valuation"]
                passed = passed or (signer(v["crossing"]) == c["evaluator"] and r["scope"]["policy_id"] == c["policy_id"] and r["scope"]["unit"] == c["unit"] and number(r["calculation"]["amount"]) >= number(c["minimum_amount"]))
        elif kind == "audit":
            a = evidence["audit"]; present = a is not None
            if a:
                admitted = {s["receipt"]["receipt_id"] for s in a["submissions"] if signer(s["receipt"]) in c["verifiers"]}
                matched = sum(bool(admitted.intersection(p["matching_receipt_ids"])) for p in a["summary"]["per_index"])
                passed = matched >= c["minimum_matching_entries"] and (not c["reject_contradictions"] or not a["summary"]["contradictions"])
        elif kind == "audit-history":
            h = evidence["audit_history"]; present = h is not None
            if h: passed = signer(h["cut"]) == c["observer"] and h["summary"]["schedule_accounting"]["completed_observation_slots"] >= c["minimum_completed_slots"]
        elif kind == "service":
            h = evidence["service_history"]; present = h is not None
            if h: passed = signer(h["cut"]) == c["observer"] and signer(h["commitment"]) == c["host"] and h["summary"]["schedule_accounting"]["in_window_verified_slots"] >= c["minimum_in_window_verified_slots"]
        else: raise AssertionError("unsupported vector clause")
        checks.append("MISSING" if not present else "PASS" if passed else "FAIL")
    assert checks == [c["status"] for c in d["policy_evaluation"]["checks"]]
    assert d["conditions"]["within_offerer_observed_window"] == (d["observed_at"] < offer["present_before"])
    reports = []
    for entry in bundle["observations"]:
        r = entry["receipt"]["extensions"]["useful_work_settlement"]; kind = r["adapter"]
        o = payload(entry["observation"], "observation-" + kind)
        t = o["transfer"]; e = o["evidence"]
        assert o["provenance"]["record_sha256"] == hashlib.sha256(jcs(dict(transfer=t, record_ref=o["record_ref"], evidence=e))).hexdigest()
        assert o["scope"]["decision_id"] == x["decision"]["receipt_id"] and o["scope"]["evidence_id"] == evidence["evidence_id"]
        if kind == "credit-ledger":
            assert number(e["debit"]["before"]) - number(e["debit"]["after"]) == number(t["amount"])
            assert number(e["credit"]["after"]) - number(e["credit"]["before"]) == number(t["amount"])
        comparable = {k: v for k, v in t.items() if k != "amount"} == {k: v for k, v in offer["transfer"].items() if k != "amount"}
        assert r["terms_match"] == (comparable and number(t["amount"]) == number(offer["transfer"]["amount"]))
        assert not r["claims"]["transfer_performed_by_relatte"] and not r["claims"]["universal_finality_asserted"] and not r["claims"]["ownership_verified"]
        reports.append(dict(adapter=kind, terms_match=r["terms_match"], amount_relation=r["amount_relation"]))
    return dict(bundle_id=bundle["bundle_id"], decision=d["choice"], policy_checks=checks, external_observations=reports)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "freeze":
        bundle = json.loads(Path(sys.argv[2]).read_text()); expected = check(bundle)
        with Path(sys.argv[3]).open("x") as f:
            json.dump(dict(schema="useful-work.settlement-golden/v1", provenance="Public demo exchange; separate local demo ledger changed, no financial payment; no private keys.", bundle=bundle, expected=expected), f, indent=2, ensure_ascii=False); f.write("\n")
    else:
        print(json.dumps(check(json.load(sys.stdin)), sort_keys=True))
