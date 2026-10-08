"""Verify preserved signed evidence and derive its compact non-authoritative receipt."""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from authority import AuthorityState
from boundary_adapter import AuthorityBoundary
from experiment import (
    DOOR, EXPERIMENT, PARTICIPANT, PRAYER, PRESSURING_ACTOR, STEPS, WORLD_OWNER,
    SignedArtifact, World, canonical, crossing_process,
)

ROOT = Path(__file__).resolve().parent
ORIGINAL_FILES = (
    "experiment.py", "test_experiment.py", "README.md", "requirements.txt",
    ".gitignore", "artifacts/paired-worlds.json",
)


@dataclass(frozen=True)
class KeyBinding:
    identity: str
    public_key: Ed25519PublicKey


def import_artifact(exported: dict) -> SignedArtifact:
    artifact = SignedArtifact(
        exported["issuer"], canonical(exported["body"]),
        bytes.fromhex(exported["signature_hex"]),
    )
    if artifact.artifact_hash != exported["artifact_hash"]:
        raise ValueError("Signed artifact hash mismatch")
    return artifact


def build_receipt(specimen: dict | None = None) -> dict:
    if specimen is None:
        specimen = json.loads((ROOT / "artifacts/paired-worlds.json").read_text())
    if specimen["experiment"] != EXPERIMENT or specimen["steps"] != list(STEPS):
        raise ValueError("Unexpected specimen or crossing architecture")
    bindings = {
        name: KeyBinding(name, Ed25519PublicKey.from_public_bytes(bytes.fromhex(key)))
        for name, key in specimen["public_keys_hex"].items()
    }
    artifacts = {name: import_artifact(value) for name, value in specimen["artifacts"].items()}
    world_id = json.loads(artifacts["initial_admission"].body)["world"]
    summaries = {}
    architectures = []
    witnesses = []
    escalations = 0
    for label in ("world_a", "world_b"):
        saved = specimen[label]
        world = World(world_id, bindings[WORLD_OWNER], bindings[PARTICIPANT], bindings[PRESSURING_ACTOR])
        boundary = AuthorityBoundary(world)
        # Keys are the archived fixture bindings, not authority assertions in a payload.
        for artifact in artifacts.values():
            if not world.verify(artifact):
                raise ValueError("Preserved signature verification failed")
        if boundary.submit(artifacts["initial_admission"]).discovered_authority != AuthorityState.DISCOVERED:
            raise ValueError("Initial owner admission rejected")
        if label == "world_b":
            if boundary.submit(artifacts["withdrawal"]).discovered_authority != AuthorityState.DISCOVERED:
                raise ValueError("Owner withdrawal rejected")
        world.observe_threat_presence(True)
        pattern_event = next(e for e in saved["trace"] if e["event"] == "PATTERN_RECORDED")
        pattern = import_artifact(pattern_event["artifact"])
        if not world.verify(pattern):
            raise ValueError("Preserved pattern signature verification failed")
        replay = crossing_process(world, artifacts["threat"], pattern)
        if replay["witness"] != saved["witness"] or replay["route"] != saved["route"]:
            raise ValueError("Golden witness or crossing diverged from signed-input replay")
        serialized_capacity = json.loads(json.dumps(replay["capacity"]))
        if {k: v for k, v in serialized_capacity.items() if k != "receipt_id"} != {
            k: v for k, v in saved["capacity"].items() if k != "receipt_id"
        }:
            raise ValueError("Golden capacity diverged from replay")
        saved_steps = [e for e in saved["trace"] if e["event"] in STEPS]
        replay_steps = [e for e in world.history if e["event"] in STEPS]
        if saved_steps != replay_steps or [e["event"] for e in saved_steps] != list(STEPS):
            raise ValueError("Preserved orientation/request architecture diverged from replay")
        # RECEIVE is the same operation, while its lawful outcome differs.
        architecture = [e if e["event"] != "RECEIVE" else {"event": "RECEIVE"} for e in saved_steps]
        architectures.append(architecture)
        witnesses.append(replay["witness"])
        escalations += sum(bool(e["authority_created"]) for e in world.history if e["event"] == "ASSISTANCE_RECEIVED")
        owner_effect = boundary.trace[-1]["assessment"]
        summaries[label] = {
            "owner_admission": "CURRENT" if world.admission.admitted else "WITHDRAWN",
            "route_result": replay["route"]["result"], "result": replay["route"]["crossing"],
            "authority_source": owner_effect["authority_source"],
        }
    if architectures[0] != architectures[1] or specimen["prayer"] != PRAYER:
        raise ValueError("Paired architecture or prayer differs")
    expected = (("CURRENT", "ROUTE_SUCCESS", "CROSSED"), ("WITHDRAWN", "ROUTE_DENIED", "HOLD"))
    for summary, outcome in zip(summaries.values(), expected):
        if tuple(summary[k] for k in ("owner_admission", "route_result", "result")) != outcome:
            raise ValueError("Unexpected golden outcome")
    if escalations or not all(w["threat_verified"] and w["threat_authority"] == "NONE" for w in witnesses):
        raise ValueError("Authority boundary invariant violated")
    return {
        "receipt": "ACTS_4_BOUNDARY_001_RECEIPT", "schema_version": 1,
        "verification_context": "SIGNED_SPECIMEN_REPLAY", "operative_effect": "NONE",
        "signature": "UNSIGNED_DERIVED_RECEIPT",
        "provenance_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ORIGINAL_FILES},
        "worlds": 2, "prayer_architecture_equal": True,
        "threats_verified": 2, "threat_authority_none": 2,
        "requested_capacity": "BOLDNESS", "capability_escalations": escalations,
        **summaries, "invariant": "outcome_follows_authority_not_threat",
    }


def check_receipt(saved: dict) -> None:
    regenerated = build_receipt()
    saved = json.loads(json.dumps(saved))
    for receipt in (saved, regenerated):
        incarnations = set()
        for label in ("world_a", "world_b"):
            source = receipt[label]["authority_source"]
            if datetime.fromisoformat(source["verified_at"]).utcoffset() is None:
                raise ValueError("Verification timestamp must be timezone-aware")
            incarnations.add(str(UUID(source["incarnation_id"])))
            # A fresh verification has fresh timestamps/monitor incarnations.
            del source["verified_at"], source["incarnation_id"]
        if len(incarnations) != 2:
            raise ValueError("World incarnations must remain separate")
    if saved != regenerated:
        raise ValueError("Golden receipt does not match preserved evidence and replay")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/golden-receipt.json")
    parser.add_argument("--check", action="store_true", help="Verify the existing receipt without overwriting it")
    args = parser.parse_args()
    if args.check:
        check_receipt(json.loads(args.output.read_text()))
        print("Golden receipt and preserved signed-input replay verified.")
    else:
        receipt = build_receipt()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(receipt, indent=2) + "\n")
        print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
