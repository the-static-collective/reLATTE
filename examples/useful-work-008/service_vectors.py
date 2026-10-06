"""Independent service identities, chunk proofs, byte accounting and slot vectors.

Standard library only. Reuses the independent 006 schedule/sampling specification;
imports neither mathematical implementations nor TypeScript. Signature checks
belong to Node. stdin: one portable history; freeze <history> <new-fixture>.
"""
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("clock", Path(__file__).parent.parent / "useful-work-006/clock_vectors.py")
clock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clock)
jcs, h = clock.jcs, clock.h


def claim(crossing, kind):
    return crossing["extensions"]["organ_adapter"]["donor_claims"][kind]


def challenge_id(payload, policy, at):
    descriptor = {"schema": "relatte.organ-adapter-descriptor/v0", "family_ref": "organ:useful-work/service-challenge-v1",
                  "donor_contract_ref": "contract:useful-work/service-v1", "artifact_kind": "service-challenge",
                  "donor_claims": {"service_challenge": payload, "ownership_asserted": False, "authority_asserted": False, "economic_value_asserted": False},
                  "laws": ["DONOR SEMANTICS != SUBSTRATE SEMANTICS", "ADAPTER != DONOR AUTHORITY", "CROSSING != DONOR INTERPRETATION", "PAYLOAD TYPE != ADMISSION LAW"]}
    descriptor["adapter_id"] = "relatte-organ-adapter-v0:" + h("reLATTE-OrganAdapter-v0|", descriptor)
    body = {"schema": "relatte.crossing-envelope/v0", "protocol_version": "0", "source_particular": "particular:useful-work:service-challenge",
            "source_world": policy["challenger"]["world_id"], "source_history_head": None, "parents": [], "declared_kind": "OPAQUE_ORGAN_ARTIFACT",
            "payload_refs": [{"address": "sha256:" + h("", payload), "role": "service-challenge", "media_type": "application/json"}],
            "requested_effect": {"kind": "candidate-ingress", "authority": "receiver-local"}, "capability_ref": None,
            "privacy_policy": None, "audience_policy": None, "return_address": None, "created_at": at,
            "signing": {"algorithm": "ECDSA-P256-SHA256", "public_key": policy["challenger"]["public_key"], "domain": "relatte.crossing-signature/v0"},
            "extensions": {"organ_adapter": descriptor}}
    return "relatte-crossing-v0:" + h("reLATTE-CrossingEnvelope-v0|", body)


def chunks(header, identity, requested, entries, iterations):
    evidence, total = [], 0
    assert identity == "useful-work-merkle-result-v1:" + h("UsefulWork-MerkleResult-v1|", header)
    for entry in entries:
        data = base64.b64decode(entry["bytes_base64"], validate=True)
        total += len(data)
        canonical, verified = False, False
        try:
            leaf = json.loads(data)
            canonical = set(leaf) == {"index", "count"} and leaf["index"] == entry["index"] and data == jcs(leaf)
            canonical = canonical and type(leaf["count"]) is int and 0 <= leaf["count"] <= iterations
            index, proof = entry["index"], entry["proof"]
            if canonical and type(proof) is list and len(proof) == (header["width"] * header["height"] - 1).bit_length():
                node = hashlib.sha256(b"UsefulWork-NativePixel-v1|" + data).digest()
                for sibling in proof:
                    assert type(sibling) is str and len(sibling) == 64 and all(c in "0123456789abcdef" for c in sibling)
                    side = bytes.fromhex(sibling)
                    node = hashlib.sha256(b"UsefulWork-NativeNode-v1|" + (side + node if index & 1 else node + side)).digest()
                    index >>= 1
                verified = node.hex() == header["counts_root"]
        except (ValueError, TypeError, KeyError, AssertionError):
            pass
        evidence.append(dict(index=entry["index"], byte_length=len(data), canonical_chunk=canonical, proof_verified=verified))
    all_proven = bool(evidence) and all(e["proof_verified"] for e in evidence)
    return dict(bytes_returned=total, artifact_chunk_proof_verified=all_proven,
                requested_bytes_matched=all_proven and [e["index"] for e in evidence] == requested, evidence=evidence)


def vectors(history):
    policy = claim(history["plan"], "audit_clock_plan")["policy"]
    native = history["work"]["extensions"]["organ_adapter"]["donor_claims"]["result_header"]
    commitment = history["commitment"]["crossing_id"]
    population = native["width"] * native["height"]
    events = {e["crossing_id"]: e for e in history["events"]}
    response_map = {r["crossing_id"]: r for r in history["responses"]}
    challenges, ch_map = [], {}
    for ch in history["challenges"]:
        declared = claim(ch, "service_challenge")
        slot = clock.slot(policy, declared["slot_index"])
        plan_id = "useful-work-audit-plan-v1:" + h("UsefulWork-AuditPlan-v1|", policy)
        event_id = declared["randomness_event_id"]
        nonce = h("UsefulWork-ServiceChallenge-v1|", dict(commitment_id=commitment, plan_id=plan_id, slot_id=slot["slot_id"], randomness_event_id=event_id))
        payload = dict(schema="useful-work.service-challenge/v1", commitment_id=commitment, plan_id=plan_id,
                       slot_id=slot["slot_id"], slot_index=slot["index"], result_id=policy["result_id"], randomness_event_id=event_id,
                       publication_id=history["publication"]["crossing_id"], sample_count=policy["sample_count"], nonce=nonce)
        identity = challenge_id(payload, policy, events[event_id]["created_at"])
        indices = clock.samples(commitment, identity, population, policy["sample_count"])
        vector = dict(challenge_id=identity, nonce=nonce, indices=indices, slot=slot)
        challenges.append(vector); ch_map[ch["crossing_id"]] = vector
    receipts, observed_bytes, verified_indices = [], {}, set()
    successful, in_window, both = set(), set(), set()
    for receipt in {r["receipt_id"]: r for r in history["receipts"]}.values():
        scope = receipt["extensions"]["useful_work_service"]["scope"]
        ch = ch_map[scope["challenge_id"]]
        entries = [] if scope["response_id"] is None else claim(response_map[scope["response_id"]], "service_response")["chunks"]
        checked = chunks(native, policy["result_id"], ch["indices"], entries, history["job_spec"]["iterations"])
        window = scope["response_id"] is not None and clock.dt(scope["sent_at"]) >= clock.dt(ch["slot"]["scheduled_at"]) and clock.dt(scope["observed_at"]) <= clock.dt(ch["slot"]["response_deadline"])
        receipts.append(dict(receipt_id=receipt["receipt_id"], **checked, response_observed=scope["response_id"] is not None, response_within_observer_window=window))
        if scope["response_id"] is not None:
            observed_bytes[scope["response_id"]] = checked["bytes_returned"]
            verified_indices.update(e["index"] for e in checked["evidence"] if e["proof_verified"])
        if checked["requested_bytes_matched"]: successful.add(scope["slot_index"])
        if window: in_window.add(scope["slot_index"])
        if checked["requested_bytes_matched"] and window: both.add(scope["slot_index"])
    as_of = clock.dt(history["cut"]["created_at"])
    issued = {claim(c, "service_challenge")["slot_index"] for c in history["challenges"]}
    answered = {ch_map[claim(r, "service_response")["challenge_id"]]["slot"]["index"] for r in history["responses"]}
    statuses = []
    for index in range(policy["schedule"]["rounds"]):
        slot = clock.slot(policy, index)
        statuses.append("ANSWERED" if index in answered else ("EXPIRED" if as_of > clock.dt(slot["response_deadline"]) else "ISSUED") if index in issued else "WITHHELD / UNKNOWN" if as_of > clock.dt(slot["issue_deadline"]) else "PLANNED")
    inventory = dict(job_spec=history["job_spec"], work_id=history["work"]["crossing_id"], plan_crossing_id=history["plan"]["crossing_id"],
                     commitment_id=commitment, publication_id=None if history["publication"] is None else history["publication"]["crossing_id"])
    inventory.update({k: [v["receipt_id" if k == "receipts" else "crossing_id"] for v in history[k]] for k in ["events", "challenges", "responses", "receipts", "prior_cuts"]})
    body = {k: v for k, v in history.items() if k != "history_id"}
    return dict(challenge_vectors=challenges, receipt_vectors=receipts, statuses=statuses,
                schedule_accounting=dict(planned_slots=policy["schedule"]["rounds"], issued_slots=len(issued), answered_slots=len(answered),
                                         verified_chunk_slots=len(successful), in_window_observed_slots=len(in_window), in_window_verified_slots=len(both), schedule_denominator_known=True),
                bytes_returned=sum(observed_bytes.values()), verified_chunk_indices=sorted(verified_indices),
                inventory_hash=h("", inventory), history_id="useful-work-service-history-v1:" + h("UsefulWork-ServiceHistory-v1|", body))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "freeze":
        history = json.loads(Path(sys.argv[2]).read_text())
        fixture = dict(provenance="Real HTTP observation, late answer with retained expired cut, closed endpoint attempt, unissued slot. Local demo controls all keys. No private keys. Python independently derives identities, proofs, bytes and schedule accounting; Node authenticates signatures.", history=history, expected=vectors(history))
        with Path(sys.argv[3]).open("x") as output: json.dump(fixture, output, ensure_ascii=False, separators=(",", ":")); output.write("\n")
    else:
        json.dump(vectors(json.load(sys.stdin)), sys.stdout, ensure_ascii=False, separators=(",", ":")); sys.stdout.write("\n")
