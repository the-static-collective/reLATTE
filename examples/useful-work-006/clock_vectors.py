"""Independent Kernel 006 identity/sampling vectors from the README contract.

No imports from TypeScript or the worker. Integer-only policies use this small
JCS subset (ASCII field names, valid Unicode string values, no floating numbers).
stdin: [{policy,event_id,slot_index,emitted_at}, ...] -> corresponding vectors.
freeze <history.json> <new-fixture.json> retains existing signatures/nonces;
signature authentication belongs to the fixture test, not this vector utility.
"""
import copy
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def jcs(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def h(domain, value):
    return hashlib.sha256(domain.encode() + jcs(value)).hexdigest()


def dt(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def slot(policy, index):
    identity = "useful-work-audit-plan-v1:" + h("UsefulWork-AuditPlan-v1|", policy)
    s = policy["schedule"]
    start = dt(s["starts_at"]) + timedelta(milliseconds=index * s["cadence_ms"])
    return {"index": index, "slot_id": "useful-work-audit-slot-v1:" + h("UsefulWork-AuditSlot-v1|", {"plan_id": identity, "index": index}),
            "scheduled_at": iso(start), "issue_deadline": iso(start + timedelta(milliseconds=s["issue_window_ms"])),
            "response_deadline": iso(start + timedelta(milliseconds=s["issue_window_ms"] + s["response_window_ms"])),
            "expected_randomness_sequence": policy["randomness_rule"]["first_sequence"] + index}


def samples(work_id, challenge_id, population, count):
    chosen, swaps, counter = [], {}, 0
    for remaining in range(population, population - count, -1):
        limit = (2**32 // remaining) * remaining
        while True:
            data = f"UsefulWork-SampleCoordinates-v1|{work_id}|{challenge_id}|{counter}"
            word = int.from_bytes(hashlib.sha256(data.encode()).digest()[:4], "big")
            counter += 1
            if word < limit:
                break
        position = word % remaining
        chosen.append(swaps.get(position, position))
        swaps[position] = swaps.get(remaining - 1, remaining - 1)
    return sorted(chosen)


def vector(value):
    p, index, event_id = value["policy"], value["slot_index"], value["event_id"]
    identity = "useful-work-audit-plan-v1:" + h("UsefulWork-AuditPlan-v1|", p)
    scheduled = slot(p, index)
    nonce = h("UsefulWork-ScheduledChallenge-v1|", {"plan_id": identity, "slot_id": scheduled["slot_id"], "randomness_event_id": event_id})
    payload = {"schema": "useful-work.merkle-challenge/v1", "work_crossing_id": p["work_crossing_id"], "result_id": p["result_id"], "sample_count": p["sample_count"], "nonce": nonce}
    descriptor = {"schema": "relatte.organ-adapter-descriptor/v0", "family_ref": "organ:useful-work/merkle-challenge-v1",
                  "donor_contract_ref": "contract:useful-work/merkle-challenge-v1", "artifact_kind": "useful-work-merkle-challenge",
                  "donor_claims": {"merkle_challenge": payload, "ownership_asserted": False, "economic_value_asserted": False},
                  "laws": ["DONOR SEMANTICS != SUBSTRATE SEMANTICS", "ADAPTER != DONOR AUTHORITY", "CROSSING != DONOR INTERPRETATION", "PAYLOAD TYPE != ADMISSION LAW"]}
    descriptor["adapter_id"] = "relatte-organ-adapter-v0:" + h("reLATTE-OrganAdapter-v0|", descriptor)
    body = {"schema": "relatte.crossing-envelope/v0", "protocol_version": "0", "source_particular": "particular:useful-work:merkle-challenge",
            "source_world": p["challenger"]["world_id"], "source_history_head": None, "parents": [], "declared_kind": "OPAQUE_ORGAN_ARTIFACT",
            "payload_refs": [{"address": "sha256:" + h("", payload), "role": "merkle-challenge", "media_type": "application/json"}],
            "requested_effect": {"kind": "candidate-ingress", "authority": "receiver-local"}, "capability_ref": None,
            "privacy_policy": None, "audience_policy": None, "return_address": None, "created_at": value["emitted_at"],
            "signing": {"algorithm": "ECDSA-P256-SHA256", "public_key": p["challenger"]["public_key"], "domain": "relatte.crossing-signature/v0"}, "extensions": {"organ_adapter": descriptor}}
    challenge_id = "relatte-crossing-v0:" + h("reLATTE-CrossingEnvelope-v0|", body)
    return {"plan_id": identity, "slot": scheduled, "nonce": nonce, "challenge_id": challenge_id,
            "indices": samples(p["work_crossing_id"], challenge_id, value["population"], p["sample_count"])}


def claims(crossing, kind):
    return crossing["extensions"]["organ_adapter"]["donor_claims"][kind]


def freeze(history):
    policy = claims(history["plan"], "audit_clock_plan")["policy"]
    population = history["job_spec"]["width"] * history["job_spec"]["height"]
    events = {e["crossing_id"]: e for e in history["events"]}
    vectors = []
    for issue in history["issues"]:
        payload = claims(issue["issuance"], "audit_clock_issuance")
        event = events[payload["randomness_event_id"]]
        vectors.append(vector({"policy": policy, "slot_index": payload["slot_index"], "event_id": event["crossing_id"], "emitted_at": event["created_at"], "population": population}))
    responses = {claims(r, "merkle_response")["challenge_id"] for r in history["responses"]}
    checked = {r["extensions"]["useful_work_native"]["scope"]["challenge_id"] for r in history["receipts"] if r["extensions"]["useful_work_native"]["checked_count"]}
    as_of = dt(claims(history["cut"], "audit_clock_cut")["observed_at"])
    statuses, issued_slots, answered_slots, completed_slots = [], 0, 0, 0
    for index in range(policy["schedule"]["rounds"]):
        scheduled = slot(policy, index)
        challenge_ids = {i["challenge"]["crossing_id"] for i in history["issues"] if claims(i["issuance"], "audit_clock_issuance")["slot_index"] == index}
        obs = [claims(o, "audit_clock_observation") for o in history["observations"] if claims(o, "audit_clock_observation")["slot_index"] == index]
        issued_slots += bool(challenge_ids)
        answered_slots += bool(challenge_ids & responses)
        completed_slots += bool(challenge_ids & checked)
        if challenge_ids & responses:
            status = "ANSWERED"
        elif challenge_ids and as_of > dt(scheduled["response_deadline"]):
            status = "EXPIRED"
        elif any(o["kind"] == "UNAVAILABLE_REPORTED" for o in obs):
            status = "WITHHELD / UNKNOWN"
        elif challenge_ids:
            status = "ISSUED"
        elif any(o["kind"] == "MISS_REPORTED" for o in obs):
            status = "MISSED"
        elif as_of > dt(scheduled["issue_deadline"]):
            status = "WITHHELD / UNKNOWN"
        else:
            status = "PLANNED"
        statuses.append(status)
    expected = {"plan_id": vectors[0]["plan_id"], "challenge_vectors": vectors, "statuses": statuses,
                "planned_slots": len(statuses), "issued_slots": issued_slots, "answered_slots": answered_slots,
                "completed_observation_slots": completed_slots}
    return {"provenance": "Real-clock four-slot demo: two answered slots checked by TypeScript/Python, one unanswered expired issuance, one unobservable issuance. Three retained signed observer cuts. Independent clock_vectors.py calculates plan/slot/nonce/full crossing identity, sampled coordinates and schedule accounting. No private keys.",
            "history": history, "expected": expected}


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "freeze":
        fixture = freeze(json.loads(Path(sys.argv[2]).read_text()))
        with Path(sys.argv[3]).open("x") as output:
            json.dump(fixture, output, ensure_ascii=False, separators=(",", ":"))
            output.write("\n")
    else:
        json.dump([vector(v) for v in json.load(sys.stdin)], sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")
