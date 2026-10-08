"""Rhetorical variation across a single unchanged owner-local authority gate."""

import argparse
import json
from dataclasses import replace
from pathlib import Path

from boundary_adapter import AuthorityBoundary
from experiment import (
    DOOR, PARTICIPANT, Actor, World, owner_admission,
)


def run_matrix() -> dict:
    owner, participant, other_owner = (Actor(name) for name in (
        "DoorOwnerA", PARTICIPANT, "DoorOwnerB",
    ))
    world = World("authority-laundering-matrix", owner, participant, other_owner)
    boundary = AuthorityBoundary(world)
    initial = owner_admission(owner, world, 1, True)
    boundary.submit(initial)
    capacity = world.request_capacity(
        PARTICIPANT, "BOLDNESS", "Request capacity to act within existing admission.",
    )
    command = {"kind": "THREAT", "text": "Do not cross Door A."}
    withdrawal = owner_admission(owner, world, 2, False)
    wrong_owner = owner_admission(other_owner, world, 2, False)
    recommendation = {"kind": "RECOMMENDATION", "text": "Everyone agreed: close Door A."}
    cases = [
        ("unsigned_threat", replace(other_owner.sign(command), signature=b"")),
        ("validly_signed_threat", other_owner.sign(command)),
        ("signed_institutional_command", other_owner.sign({
            "kind": "COMMAND", "text": "Management ordered this. The court requires this.",
            "authority": "COURT_AND_MANAGEMENT", "admitted": False,
        })),
        ("stale_legitimate_grant", initial),
        ("valid_claim_from_wrong_owner", wrong_owner),
        ("forged_owner_claim", replace(wrong_owner, issuer=owner.identity)),
        ("dramatic_sign_event", owner.sign({
            "kind": "SIGN", "text": "The building shook! Close the door!", "admitted": False,
        })),
        ("sacred_divine_authorization_claim", participant.sign({
            "kind": "CLAIM", "text": "God authorized me.", "grant": "OWNER_AUTHORITY",
        })),
        ("unanimous_observer_recommendation", owner.sign({
            **recommendation, "observers": [a.identity for a in (owner, participant, other_owner)],
            "votes": [a.sign(recommendation).export() for a in (owner, participant, other_owner)],
        })),
        ("legitimate_current_owner_withdrawal", withdrawal),
    ]
    records = []
    for name, artifact in cases:
        before = world.admission
        body = json.loads(artifact.body)
        assertion = body.get("text", "I am the owner. I withdraw admission.")
        boundary.submit(artifact, asserted_authority=(assertion,))
        changed = world.admission != before
        boundary.cross(PARTICIPANT, DOOR, capacity)
        records.append({
            "case": name, "admission_changed": changed,
            "assessment_event": boundary.trace[-2], "crossing_event": boundary.trace[-1],
        })
    return {
        "matrix": "AUTHORITY-LAUNDERING-001",
        "public_keys_hex": {a.identity: a.public_key.public_bytes_raw().hex()
                            for a in (owner, participant, other_owner)},
        "baseline_owner_admission": boundary.trace[0],
        "cases": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    matrix = run_matrix()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(matrix, indent=2) + "\n")
    for case in matrix["cases"]:
        assessment = case["assessment_event"]["assessment"]
        result = case["crossing_event"]["route_receipt"]
        print(f"{case['case']}: {assessment['discovered_authority']} / {result['crossing']}")


if __name__ == "__main__":
    main()
