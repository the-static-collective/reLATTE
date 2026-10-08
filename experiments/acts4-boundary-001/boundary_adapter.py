"""Additive assessment/trace adapter for the unchanged specimen monitor."""

from __future__ import annotations

import json
from dataclasses import asdict, replace
from datetime import datetime, timezone
from uuid import uuid4

from authority import (
    ArtifactAuthorityAssessment, AuthoritySource, AuthorityState,
    OperativeEffect, inspect_evidence,
)
from experiment import CROSS, DOOR, CapacityReceipt, SignedArtifact, World, canonical


class AuthorityBoundary:
    """Explain existing policy decisions; supply no new admission policy.

    Each adapter represents a local monitor incarnation. It records evidence and
    owner decisions separately from the original specimen's trace. Artifacts may
    not supply their own incarnation, owner binding, or verification timestamp.
    """

    def __init__(self, world: World):
        self.world = world
        self.incarnation_id = str(uuid4())
        self.__sources: dict[str, AuthoritySource] = {}
        self.__trace: list[str] = []

    @property
    def trace(self) -> tuple[dict, ...]:
        return tuple(json.loads(event) for event in self.__trace)

    def submit(
        self, artifact: SignedArtifact, *, asserted_authority: tuple[str, ...] = (),
    ) -> ArtifactAuthorityAssessment:
        assessment = inspect_evidence(
            artifact, verifier=self.world.verify,
            verification_method="ED25519_PINNED_KEY",
            asserted_authority=asserted_authority,
        )
        # This existing method alone evaluates authority and mutates admission.
        accepted = self.world.apply_admission(artifact)
        if accepted:
            current = self.world.admission
            source = AuthoritySource(
                self.world.owner, self.world.world_id, DOOR, self.world.participant,
                CROSS, current.artifact_hash, current.revision, self.incarnation_id,
                datetime.now(timezone.utc).isoformat(),
            )
            self.__sources[current.artifact_hash] = source
            assessment = replace(
                assessment, discovered_authority=AuthorityState.DISCOVERED,
                authority_source=source,
                operative_effect=(OperativeEffect.ADMISSION_CURRENT if current.admitted
                                  else OperativeEffect.ADMISSION_WITHDRAWN),
                decision_reason="ACCEPTED_BY_OWNER_LOCAL_PATH",
            )
        else:
            assessment = replace(
                assessment, discovered_authority=AuthorityState.NONE,
                decision_reason=self.world.history[-1]["reason"],
            )
        self.__trace.append(canonical({
            "event": "ARTIFACT_AUTHORITY_ASSESSED",
            "artifact": {"issuer": artifact.issuer, "body": artifact.body,
                         "signature_hex": artifact.signature.hex()},
            "assessment": assessment.export(),
        }))
        return assessment

    def cross(self, participant: str, route: str, capacity: CapacityReceipt) -> dict:
        result = self.world.cross(participant, route, capacity)
        source = self.__sources.get(result.admission_hash)
        provenance = AuthorityState.NONE if result.admission_hash is None else (
            AuthorityState.DISCOVERED if source is not None else AuthorityState.UNRESOLVED
        )
        explanation = {
            "event": "CROSSING_EXPLAINED", "route_receipt": asdict(result),
            "authority_provenance": provenance,
            "authority_source": asdict(source) if source is not None else None,
            "decision_reason": result.reason,
        }
        self.__trace.append(canonical(explanation))
        return explanation
