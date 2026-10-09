#!/usr/bin/env python3
"""RIFF-RAFT-MINECRAFT-006: durable, byte-exact *game evidence* capsule.

Archive only one specifically pinned and independently verifiable 005 return.
No rewriting of its signed material, resigning, fake new runtime, admission,
user account control, or physical-world claim. Reopen is read-only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

SCHEMA = "relatte.riff-raft-006-black-star-capsule/v0"
BUNDLE_SCHEMA = "ghot.riff-raft-counterfactual-return-bundle/v0"
PACKET_SCHEMA = "ghot.riff-raft-counterfactual-return/v0"
SOURCE_RUN = 37994927245
SOURCE_ARTIFACT = 11646368461
SOURCE_HEAD = "c0d47a96245ec9adcff7f2b5247845c9addfd252"
RETURN_CROSSING = "relatte-crossing-v0:bceaf6c25b074b0e1eed56c157368dae7aa97c99d33c382d5d00c96ddb91dda1"
RETURN_RECEIPT = "relatte-receipt-v0:c4c8dd65fb645fded4ef8175d734d94fb1145be1cbf9b2f4fab7acf89cd856c3"
RETURN_PACKET_SHA = "1d9deb55ccda77a98d2c4c8c062fa965830077c26798b74a9344534d8657936e"
PARENT_CROSSING = "relatte-crossing-v0:0b61b9476c0ab3e2b57a5090781d2591e8c1145ac84c2eea2f67efb301d54fa3"
PARENT_RECEIPT = "relatte-receipt-v0:5ad43d10051e60ce2f5d52fca00808027785b55bc31c70ff75a88f2496a06d11"
PARENT_PACKET_SHA = "9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17"
BYTE_LIMIT = 4 * 1024 * 1024


class CustodyHold(ValueError):
    pass


def need(ok: Any, why: str) -> None:
    if not ok:
        raise CustodyHold("BLACK_STAR_HOLD:" + why)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bounded(path: Path) -> bytes:
    need(path.is_file(), "MISSING_CAPSULE_BYTES")
    need(path.stat().st_size <= BYTE_LIMIT, "CAPSULE_TOO_LARGE")
    data = path.read_bytes()
    need(0 < len(data) <= BYTE_LIMIT, "EMPTY_OR_LARGE_CAPSULE")
    return data


def inspect_source(data: bytes) -> dict[str, Any]:
    """Structural + byte-level checks; independent signature check is separate."""
    try:
        bundle = json.loads(data)
        need(isinstance(bundle, dict) and set(bundle) == {
            "schema", "packet_json", "crossing", "receipt",
            "world_evidence", "ancestral_source_004",
        }, "CAPSULE_FIELDS_DRIFT")
        need(bundle["schema"] == BUNDLE_SCHEMA, "BUNDLE_SCHEMA_CHANGED")
        need(bundle["crossing"]["crossing_id"] == RETURN_CROSSING and
             bundle["receipt"]["receipt_id"] == RETURN_RECEIPT and
             bundle["receipt"]["kind"] == "R3_HOLD",
             "RETURN_CROSSING_NOT_PINNED")
        packet_bytes = bundle["packet_json"].encode("utf-8")
        need(sha(packet_bytes) == RETURN_PACKET_SHA,
             "RETURN_PACKET_CHANGED")
        need(bundle["crossing"]["payload_refs"] == [{
            "address": "sha256:" + RETURN_PACKET_SHA,
            "media_type": "application/json",
        }] or len(bundle["crossing"]["payload_refs"]) == 1 and
             bundle["crossing"]["payload_refs"][0]["address"] ==
             "sha256:" + RETURN_PACKET_SHA,
             "RETURN_NOT_PAYLOAD_BOUND")
        packet = json.loads(bundle["packet_json"])
        need(packet["schema"] == PACKET_SCHEMA and
             packet["recommended_gHot_disposition"] == "HOLD" and
             packet["owner_admission"] is False and
             packet["no_direct_game_or_physical_actuation"] is True and
             packet["biological_restoration_verified"] is False and
             packet["ghot_energy_or_water_received"] is False,
             "SCOPE_CLAIM_ESCALATED")
        ancestor = bundle["ancestral_source_004"]
        need(ancestor["crossing"]["crossing_id"] == PARENT_CROSSING and
             ancestor["receipt"]["receipt_id"] == PARENT_RECEIPT and
             ancestor["receipt"]["kind"] == "R3_HOLD" and
             sha(ancestor["packet_json"].encode("utf-8")) == PARENT_PACKET_SHA,
             "SIGNED_004_PARENT_CHANGED")
        need(packet["observed_parent_crossing_id"] == PARENT_CROSSING and
             packet["observed_parent_receipt_id"] == PARENT_RECEIPT and
             packet["observed_parent_packet_sha256"] == PARENT_PACKET_SHA,
             "PARENT_NOT_BOUND_BY_CHILD")
        worlds = packet["worlds"]
        need(isinstance(worlds, list) and len(worlds) == 2 and
             [w["world_id"] for w in worlds] == ["A", "B"],
             "WORLD_WITNESSES_NOT_COMPLETE")
        need(set(bundle["world_evidence"]) == {"A", "B"},
             "RAW_WORLD_EVIDENCE_NOT_COMPLETE")
        observations = []
        for world in worlds:
            label = world["world_id"]
            raw = bundle["world_evidence"][label]
            composition = raw["composition_json"].encode("utf-8")
            runtime = raw["runtime_json"].encode("utf-8")
            need(sha(composition) == world["source_composition_bytes_sha256"] and
                 sha(runtime) == world["source_runtime_bytes_sha256"],
                 "RAW_WORLD_SOURCE_BYTES_REWRITTEN")
            lights = world["causal_signature"]
            expected = 5 if label == "A" else 2
            need(lights["before"] == [False] * 9 and
                 lights["reset"] == [False] * 9 and
                 lights["final"] == [True] * 9 and
                 lights["broken"] == ([True] * expected +
                                      [False] * (9 - expected)) and
                 world["candidate_disposition"] == "R3_HOLD" and
                 world["real_world_effect"] is False,
                 "OBSERVATION_DIVERGED_FROM_SIGNED_SOURCE")
            observations.append({
                "world_id": label,
                "previous_fault_lit": 3 if label == "A" else 6,
                "observed_follow_up_fault_lit": expected,
                "instance_id": world["instance_id"],
                "candidate_crossing_id": world["candidate_crossing_id"],
                "observed_game_state_sha256": world["observed_state_sha256"],
                "composition_bytes_sha256": sha(composition),
                "runtime_bytes_sha256": sha(runtime),
            })
    except (KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CustodyHold("BLACK_STAR_HOLD:MALFORMED_SOURCE") from exc

    return {
        "schema": SCHEMA,
        "custody_kind": "durable-experiment-branch-git-copy",
        "source_repository": "the-static-collective/reLATTE",
        "source_workflow_run_id": SOURCE_RUN,
        "source_workflow_head_sha": SOURCE_HEAD,
        "source_artifact_id": SOURCE_ARTIFACT,
        "archived_bundle_bytes_sha256": sha(data),
        "signed_return_packet_sha256": RETURN_PACKET_SHA,
        "signed_return_crossing_id": RETURN_CROSSING,
        "signed_return_receipt_id": RETURN_RECEIPT,
        "signed_parent_004_crossing_id": PARENT_CROSSING,
        "signed_parent_004_receipt_id": PARENT_RECEIPT,
        "signed_parent_004_packet_sha256": PARENT_PACKET_SHA,
        "worlds": observations,
        "gHot_independent_P256_reverification_required": True,
        "archive_is_evidence_not_organization_identity": True,
        "transport_copy_does_not_resign": True,
        "archive_grants_no_execution": True,
        "archive_grants_no_ownership": True,
        "receiver_disposition": "HOLD",
    }


def index_bytes(index: dict[str, Any]) -> bytes:
    return (json.dumps(index, indent=2, ensure_ascii=False) + "\n").encode()


def seal(source: Path, directory: Path) -> dict[str, Any]:
    """Refuse to overwrite any existing mismatched archive material."""
    evidence = read_bounded(source)
    index = inspect_source(evidence)
    directory.mkdir(parents=True, exist_ok=True)
    targets = {
        directory / "signed-005-return.bundle.json": evidence,
        directory / "custody-index.json": index_bytes(index),
    }
    for path, data in targets.items():
        if path.exists():
            need(path.read_bytes() == data, "CANNOT_OVERWRITE_DIFFERENT_HISTORY")
    for path, data in targets.items():
        if not path.exists():
            path.write_bytes(data)
    return index


def reopen(directory: Path) -> dict[str, Any]:
    raw = read_bounded(directory / "signed-005-return.bundle.json")
    expected = inspect_source(raw)
    index = json.loads(read_bounded(directory / "custody-index.json"))
    need(index == expected, "INDEX_NOT_BOUND_TO_SIGNED_SOURCE_BYTES")
    need(index.get("receiver_disposition") == "HOLD" and
         index.get("archive_grants_no_execution") is True and
         index.get("archive_grants_no_ownership") is True,
         "ARCHIVE_CLAIMS_AUTHORITY")
    return index


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seal", "reopen"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    if args.command == "seal":
        need(args.source is not None, "SEAL_NEEDS_ACTUAL_SIGNED_SOURCE")
        result = seal(args.source, args.directory)
    else:
        need(args.source is None, "REOPEN_NEVER_SUBSTITUTES_NEW_SOURCE")
        result = reopen(args.directory)
    print(json.dumps({"status": "VERIFIED_ARCHIVE_CANDIDATE",
                      "source_run_id": result["source_workflow_run_id"],
                      "bundle_sha256": result["archived_bundle_bytes_sha256"],
                      "worlds": result["worlds"],
                      "disposition": "HOLD"}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (CustodyHold, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
