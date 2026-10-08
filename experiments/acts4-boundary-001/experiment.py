"""ACTS-4-BOUNDARY-001: an executable reference model, not a theology engine."""

from __future__ import annotations

import argparse
import hashlib
import json
import secrets
from dataclasses import asdict, dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

EXPERIMENT = "ACTS-4-BOUNDARY-001"
WORLD_OWNER = "WORLD_OWNER"
PARTICIPANT = "PARTICIPANT"
PRESSURING_ACTOR = "PRESSURING_ACTOR"
DOOR = "Door A"
CROSS = "CROSS"
PRAYER = (
    "Lord, consider their threats and enable your servants to speak "
    "with great boldness…"
)
STEPS = ("ORIENT", "RECALL", "NAME", "BOUND", "REQUEST", "ACT", "RECEIVE")


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@dataclass(frozen=True)
class SignedArtifact:
    issuer: str
    body: str
    signature: bytes

    def signed_bytes(self) -> bytes:
        # Bind the claimed issuer and a protocol domain as well as the payload.
        return canonical([EXPERIMENT, self.issuer, self.body]).encode()

    @property
    def artifact_hash(self) -> str:
        return hashlib.sha256(self.signed_bytes() + self.signature).hexdigest()

    def export(self) -> dict:
        return {
            "issuer": self.issuer,
            "body": json.loads(self.body),
            "signature_hex": self.signature.hex(),
            "artifact_hash": self.artifact_hash,
        }


class Actor:
    def __init__(self, identity: str):
        self.identity = identity
        self.__key = Ed25519PrivateKey.generate()

    @property
    def public_key(self) -> Ed25519PublicKey:
        return self.__key.public_key()

    def sign(self, body: Mapping) -> SignedArtifact:
        unsigned = SignedArtifact(self.identity, canonical(dict(body)), b"")
        return SignedArtifact(
            self.identity, unsigned.body, self.__key.sign(unsigned.signed_bytes())
        )


@dataclass(frozen=True)
class ThreatWitnessReceipt:
    threat_source: str
    threat_artifact_hash: str
    threat_verified: bool
    authority_discovered: bool = False
    threat_authority: str = "NONE"
    threat_effect: str = "witnessed_not_admitted"


@dataclass(frozen=True)
class Admission:
    revision: int
    admitted: bool
    artifact_hash: str


@dataclass(frozen=True)
class CapacityReceipt:
    receipt_id: str
    participant: str
    requested_capacity: str
    assistance_received: str
    grant_hash: str | None
    bounded_operations: tuple[str, ...]
    authority_created: bool = False


@dataclass(frozen=True)
class RouteReceipt:
    participant: str
    route: str
    result: str
    crossing: str
    reason: str
    admission_hash: str | None
    admission_revision: int | None
    certainty_promised: bool = False


class World:
    """Trusted in-process reference monitor with an out-of-band owner binding.

    Artifacts are untrusted inputs. Signing keys remain with their actors. The
    ledger, receipt registry, and owner/key bindings belong to the monitor.
    """

    def __init__(self, world_id: str, owner: Actor, participant: Actor, pressure: Actor):
        if len({owner.identity, participant.identity, pressure.identity}) != 3:
            raise ValueError("Actor identities must be distinct in the trusted setup")
        self.__world_id = world_id
        self.__owner = owner.identity
        self.__participant = participant.identity
        self.__keys = MappingProxyType({
            actor.identity: actor.public_key for actor in (owner, participant, pressure)
        })
        self.__admission: Admission | None = None
        self.__capacities: dict[str, CapacityReceipt] = {}
        self.__events: list[str] = []

    @property
    def world_id(self) -> str:
        return self.__world_id

    @property
    def participant(self) -> str:
        return self.__participant

    @property
    def owner(self) -> str:
        return self.__owner

    @property
    def admission(self) -> Admission | None:
        return self.__admission

    @property
    def history(self) -> tuple[dict, ...]:
        # Return fresh decoded values so a reader cannot edit the stored history.
        return tuple(json.loads(event) for event in self.__events)

    def record(self, event: str, **fields: object) -> None:
        self.__events.append(canonical({"event": event, **fields}))

    def verify(self, artifact: SignedArtifact) -> bool:
        key = self.__keys.get(artifact.issuer)
        if key is None:
            return False
        try:
            key.verify(artifact.signature, artifact.signed_bytes())
            return True
        except (InvalidSignature, ValueError):
            return False

    def apply_admission(self, artifact: SignedArtifact) -> bool:
        """The ONLY artifact path that can alter admission."""
        reason = "ACCEPTED"
        body = None
        if not self.verify(artifact):
            reason = "INVALID_SIGNATURE"
        elif artifact.issuer != self.__owner:
            reason = "NOT_PINNED_OWNER"
        else:
            try:
                body = json.loads(artifact.body)
            except (ValueError, TypeError):
                reason = "INVALID_BODY"
            required = {"kind", "world", "route", "subject", "operation", "revision", "admitted"}
            if reason == "ACCEPTED" and (
                not isinstance(body, dict)
                or set(body) != required
                or body["kind"] != "OWNER_ADMISSION"
                or body["world"] != self.world_id
                or body["route"] != DOOR
                or body["subject"] != self.participant
                or body["operation"] != CROSS
                or type(body["revision"]) is not int
                or body["revision"] < 1
                or type(body["admitted"]) is not bool
            ):
                reason = "INVALID_SCOPE_OR_KIND"
            if reason == "ACCEPTED" and self.__admission is not None:
                if body["revision"] <= self.__admission.revision:
                    reason = "STALE_REVISION"
        if reason != "ACCEPTED":
            self.record("AUTHORITY_INPUT_REJECTED", artifact_hash=artifact.artifact_hash, reason=reason)
            return False
        self.__admission = Admission(body["revision"], body["admitted"], artifact.artifact_hash)
        self.record("OWNER_ADMISSION_UPDATED", **asdict(self.__admission))
        return True

    def witness(self, artifact: SignedArtifact) -> ThreatWitnessReceipt:
        receipt = ThreatWitnessReceipt(
            artifact.issuer, artifact.artifact_hash, self.verify(artifact)
        )
        self.record("THREAT_WITNESSED", **asdict(receipt))
        self.record("THREAT_AUTHORITY", value="NONE", artifact_hash=artifact.artifact_hash)
        return receipt

    def observe(self, category: str, artifact: SignedArtifact) -> None:
        if category not in {"PATTERN", "SIGN", "DIVINE_CLAIM"}:
            raise ValueError("Unsupported observation category")
        self.record(
            f"{category}_RECORDED", artifact=artifact.export(),
            signature_verified=self.verify(artifact), authority_effect="NONE",
            evidence_scope="PATTERN_ONLY" if category == "PATTERN" else "CLAIM_ONLY",
        )

    def observe_threat_presence(self, present: bool) -> None:
        self.record("THREAT_PRESENCE_OBSERVED", present=present, authority_effect="NONE")

    def request_capacity(self, participant: str, capacity: str, prayer: str) -> CapacityReceipt:
        if participant != self.participant or capacity != "BOLDNESS":
            raise ValueError("Capacity request outside this experiment's scope")
        current = self.admission
        admitted = current is not None and current.admitted
        receipt = CapacityReceipt(
            secrets.token_hex(16), participant, capacity, "BOLDNESS",
            current.artifact_hash if admitted else None,
            (CROSS,) if admitted else (),
        )
        self.__capacities[receipt.receipt_id] = receipt
        self.record("CAPACITY_REQUESTED", participant=participant, prayer=prayer, capacity=capacity)
        # A modeled assistance response, not a machine assertion of divine action.
        self.record("ASSISTANCE_RECEIVED", **asdict(receipt), source="SIMULATED_ASSISTANCE")
        return receipt

    def cross(self, participant: str, route: str, capacity: CapacityReceipt) -> RouteReceipt:
        current = self.admission
        reason = "OWNER_ADMITS"
        registered = self.__capacities.get(capacity.receipt_id)
        if participant != self.participant or route != DOOR:
            reason = "OUT_OF_SCOPE"
        elif registered is None or registered != capacity or capacity.participant != participant:
            reason = "UNRECOGNIZED_CAPACITY_RECEIPT"
        elif current is None or not current.admitted:
            reason = "OWNER_WITHDREW" if current is not None else "NO_OWNER_GRANT"
        elif CROSS not in capacity.bounded_operations or capacity.grant_hash != current.artifact_hash:
            reason = "NO_CURRENT_BOUND_GRANT"
        success = reason == "OWNER_ADMITS"
        receipt = RouteReceipt(
            participant, route, "ROUTE_SUCCESS" if success else "ROUTE_DENIED",
            "CROSSED" if success else "HOLD", reason,
            current.artifact_hash if current else None,
            current.revision if current else None,
        )
        self.record("ROUTE_RESULT", **asdict(receipt))
        return receipt


def owner_admission(owner: Actor, world: World, revision: int, admitted: bool) -> SignedArtifact:
    return owner.sign({
        "kind": "OWNER_ADMISSION", "world": world.world_id, "route": DOOR,
        "subject": world.participant, "operation": CROSS,
        "revision": revision, "admitted": admitted,
    })


def make_world(world_id: str = "shared-specimen-world") -> tuple[World, Actor, Actor, Actor]:
    owner, participant, pressure = (Actor(name) for name in (WORLD_OWNER, PARTICIPANT, PRESSURING_ACTOR))
    return World(world_id, owner, participant, pressure), owner, participant, pressure


def crossing_process(world: World, threat: SignedArtifact, pattern: SignedArtifact) -> dict:
    """The same prayer architecture is used regardless of owner admission."""
    world.record("ORIENT", world=world.world_id, participant=world.participant, route=DOOR, owner=world.owner)
    world.record("RECALL", basis="Acts 4:24–31", scope="PATTERN_ONLY")
    world.observe("PATTERN", pattern)
    world.record("NAME", condition="HOSTILE_PRESSURE")
    witness = world.witness(threat)
    world.record("BOUND", threat_authority="NONE", authority_basis="PINNED_OWNER_ADMISSION")
    world.record("REQUEST", capacity="BOLDNESS", prayer=PRAYER)
    capacity = world.request_capacity(world.participant, "BOLDNESS", PRAYER)
    world.record("ACT", operation=CROSS, route=DOOR)
    result = world.cross(world.participant, DOOR, capacity)
    world.record("RECEIVE", result=result.result, crossing=result.crossing, certainty_promised=False)
    return {"witness": asdict(witness), "capacity": asdict(capacity), "route": asdict(result)}


def paired_specimen() -> dict:
    # Shared keys and inputs; two independent monitors receive identical initial
    # admission. B then receives the one meaningful difference: owner withdrawal.
    first, owner, participant, pressure = make_world()
    second = World(first.world_id, owner, participant, pressure)
    initial = owner_admission(owner, first, 1, True)
    threat = pressure.sign({"kind": "THREAT", "text": "Do not cross Door A."})
    pattern = participant.sign({"kind": "PATTERN", "reference": "Acts 4:24–31", "text": PRAYER})
    for world in (first, second):
        accepted = world.apply_admission(initial)
        if not accepted:
            raise RuntimeError("Specimen initial admission rejected")
        world.observe_threat_presence(True)
    withdrawal = owner_admission(owner, second, 2, False)
    if not second.apply_admission(withdrawal):
        raise RuntimeError("Specimen withdrawal rejected")
    a = crossing_process(first, threat, pattern)
    b = crossing_process(second, threat, pattern)
    assert a["route"]["result"] == "ROUTE_SUCCESS"
    assert b["route"]["result"] == "ROUTE_DENIED"
    assert b["route"]["crossing"] == "HOLD"
    return {
        "experiment": EXPERIMENT,
        "scope": "Standalone reLATTE reference experiment; no upstream runtime integration",
        "prayer": PRAYER, "steps": STEPS,
        "artifacts": {"threat": threat.export(), "initial_admission": initial.export(), "withdrawal": withdrawal.export()},
        "public_keys_hex": {
            actor.identity: actor.public_key.public_bytes_raw().hex()
            for actor in (owner, participant, pressure)
        },
        "world_a": {**a, "trace": first.history},
        "world_b": {**b, "trace": second.history},
        "conclusion": "Same prayer; owner admission determines the available crossing. Threat persists in both worlds.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Save both signed execution traces as JSON")
    args = parser.parse_args()
    specimen = paired_specimen()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(specimen, indent=2, ensure_ascii=False) + "\n")
    print(EXPERIMENT)
    for label in ("world_a", "world_b"):
        result = specimen[label]["route"]
        print(f"{label}: {result['result']} / {result['crossing']} ({result['reason']})")
    print("THREAT_WITNESSED; THREAT_AUTHORITY = NONE; DIVINE_CLAIM != MACHINE_AUTHORITY")


if __name__ == "__main__":
    main()
