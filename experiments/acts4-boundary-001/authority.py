"""Evidence-only authority assessments, independent of rhetoric and theology.

An assessment is a record, never a grant or a capability. Only an existing
owner-local authority path may supply a discovered operative authority.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Callable, Protocol


class Authenticity(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    VERIFIED = "VERIFIED"
    UNVERIFIED = "UNVERIFIED"


class AuthorityState(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    UNRESOLVED = "UNRESOLVED"
    NONE = "NONE"
    DISCOVERED = "DISCOVERED"


class OperativeEffect(str, Enum):
    NONE = "NONE"
    ADMISSION_CURRENT = "ADMISSION_CURRENT"
    ADMISSION_WITHDRAWN = "ADMISSION_WITHDRAWN"


class EvidenceArtifact(Protocol):
    issuer: str
    body: str
    signature: bytes

    @property
    def artifact_hash(self) -> str: ...


@dataclass(frozen=True)
class AuthoritySource:
    owner: str
    world_id: str
    route: str
    subject: str
    operation: str
    grant_id: str
    revision: int
    incarnation_id: str
    verified_at: str


@dataclass(frozen=True)
class ArtifactAuthorityAssessment:
    artifact_id: str
    authenticity: Authenticity
    verification_method: str | None
    artifact_source: str
    artifact_semantics: str
    artifact_claims: str
    asserted_authority: tuple[str, ...]
    discovered_authority: AuthorityState
    authority_source: AuthoritySource | None = None
    operative_effect: OperativeEffect = OperativeEffect.NONE
    decision_reason: str = "AUTHORITY_NOT_CHECKED"

    def __post_init__(self) -> None:
        if self.discovered_authority == AuthorityState.DISCOVERED:
            if (
                self.authenticity != Authenticity.VERIFIED
                or self.authority_source is None
                or self.authority_source.grant_id != self.artifact_id
                or self.operative_effect == OperativeEffect.NONE
            ):
                raise ValueError("Discovered effect requires verified owner-path provenance")
        elif self.authority_source is not None or self.operative_effect != OperativeEffect.NONE:
            raise ValueError("Unexamined, unresolved and NONE assessments have no operative effect")

    def export(self) -> dict:
        return asdict(self)


def inspect_evidence(
    artifact: EvidenceArtifact,
    *,
    verifier: Callable[[EvidenceArtifact], bool] | None = None,
    verification_method: str | None = None,
    asserted_authority: tuple[str, ...] = (),
) -> ArtifactAuthorityAssessment:
    """Preserve claims and assess integrity; do not assess or execute authority.

    Source and semantics are asserted metadata until separately verified. Exact
    signed body text is retained, including arbitrary claims and malformed JSON.
    asserted_authority is supplied explicitly, without a theological parser.
    """
    authenticity = Authenticity.NOT_CHECKED
    if verifier is not None:
        if not verification_method:
            raise ValueError("Name the verification method when supplying a verifier")
        authenticity = Authenticity.VERIFIED if verifier(artifact) else Authenticity.UNVERIFIED
    semantics = "UNPARSED"
    try:
        body = json.loads(artifact.body)
        semantics = body.get("kind", "UNSPECIFIED") if isinstance(body, dict) else "UNSPECIFIED"
        if not isinstance(semantics, str):
            semantics = "UNSPECIFIED"
    except ValueError:
        pass
    return ArtifactAuthorityAssessment(
        artifact.artifact_hash, authenticity, verification_method,
        artifact.issuer, semantics, artifact.body, tuple(asserted_authority),
        AuthorityState.NOT_CHECKED,
    )
