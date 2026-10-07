# WEBZ-005 — FatherHand / FounderNode Root Kernel Implementation Plan

**Goal:** Build a network-free, auditable cryptographic specimen proving FatherHand genesis, FounderNode delegation, 3-of-5 recovery, lineage-safe kid descendants, signed succession, peer recognition, and public-only cold verification before any direct HTTPS work.

**Architecture:** Keep FatherHand as a cold root that signs independently generated child identities. Use the existing reLATTE P-256 canonical signing/verification path for public statements. Use a vetted threshold-sharing dependency for root recovery; do not implement finite-field crypto locally. Ordinary runtime gets only public statements and delegated keys. Recovery reconstructs the old root only inside a bounded ceremony and immediately creates a successor generation.

**Candidate threshold library:** pin a reviewed zero-dependency Uint8Array Shamir implementation after dependency review. The current candidate is shamir-secret-sharing 0.0.4. Its reconstruction result is not self-authenticating, so every recovered root MUST be checked against the expected FatherHand public fingerprint before it can sign anything.

**Execution method:** Native, task-by-task, RED -> GREEN -> verify -> commit. No network listener and no real user recovery material in this slice.

## Task 1 — Dependency and key-material boundary

Files:
- package.json / package-lock.json
- src/fatherhand.ts
- test/fatherhand-boundary.test.ts

Steps:
1. Add the reviewed Shamir dependency at an exact version.
2. Define private in-memory types for root recovery payload and share bytes; these must not satisfy JSON public-statement types.
3. Define a recursive leak scanner rejecting private JWK d and recovery/share/seed fields from public outputs.
4. Add tests proving public JSON serializers cannot accept/re-emit the private forms.
5. Document JavaScript zeroization limitation: best-effort Uint8Array overwrite is not a hardware/HSM guarantee.

Commit: feat(fatherhand): establish private root and vetted recovery dependency boundary

## Task 2 — Canonical FatherHand and FounderNode identities

Files:
- src/fatherhand.ts
- src/index.ts
- test/fatherhand-identity.test.ts

Public interfaces:
- createFatherHandGenesis()
- createFounderNode(fatherHand, worldId, scopes)
- verifyFatherHandFounding(statement)
- fatherHandFingerprint(publicJwk)
- founderNodeFingerprint(publicJwk)

Contracts:
- use reLATTE's existing P-256 key generation/signature primitives;
- canonical fingerprints hash canonical public JWK fields only;
- founding statement schema fatherhand.founding/v0;
- independently generated FounderNode private key, never derived from FatherHand secret;
- founding signature binds world ID, exact public key fingerprint, generation, scope and statement ID.

RED tests:
- changed world ID, scope, key, generation or fingerprint invalidates signature;
- FounderNode private material cannot verify as FatherHand identity;
- no private JWK field in public founding statement.

Commit: feat(fatherhand): sign independently generated FounderNode identity

## Task 3 — 3-of-5 FatherKids

Files:
- src/fatherhand-recovery.ts
- src/index.ts
- test/fatherhand-recovery.test.ts

Public/private split:
- issueRecoverySet(root, total=5, threshold=3)
- inspectRecoveryShare(shareEnvelope) -> PUBLIC metadata only
- reconstructFatherHand(shares, expectedFingerprint)

FatherKid envelope fields:
- schema fatherhand.recovery-share/v0
- fatherhand_fingerprint
- fatherhand_generation
- recovery_set_id
- lineage_id
- share_index
- threshold
- total
- encoded share bytes (PRIVATE envelope; never ordinary receipt/log)
- checksum/version

Tests:
- any 3 distinct valid shares reconstruct exact root fingerprint;
- any 1 or 2 cannot be accepted as recovery;
- duplicate lineage IDs refuse even if share material differs;
- mixed recovery_set_id / generation / FatherHand fingerprint refuse;
- corrupt share may reconstruct garbage but fingerprint verification must refuse it;
- recovery share alone cannot sign a valid FatherHand statement.

Commit: feat(fatherhand): recover root only from three distinct FatherKid lineages

## Task 4 — Kid descendants count once

Files:
- src/fatherhand-recovery.ts
- test/fatherhand-descendants.test.ts

Interfaces:
- createKidBackupSet(parentShare, total=3, threshold=2)
- recoverKidShare(descendants)
- normalizeFatherKidInput(candidate)

Rules:
- descendants reconstruct ONE original parent share;
- descendant metadata carries parent lineage_id;
- recovered Kid-A is deduplicated before FatherHand threshold counting;
- A1+A2+B1 is at most two FatherHand lineages, never three;
- A1+A2+B1+C1 may recover A then count A+B+C exactly once.

Tests include malicious relabeling, mixed child backup sets and duplicate descendants.

Commit: feat(fatherhand): make child redundancy one recovery-lineage vote

## Task 5 — Recovery ceremony and FatherHand succession

Files:
- src/fatherhand-ceremony.ts
- src/fatherhand.ts
- test/fatherhand-succession.test.ts

Interfaces:
- beginRecoveryCeremony(expectedPublicIdentity, candidates)
- createSuccessorFatherHand(recoveredOldRoot, reason)
- sealSuccession(oldRoot, newRootPublic, continuity)
- verifySuccession(statement)

Schema:
- fatherhand.succession/v0
- old/new fingerprints and generations
- reason
- previous lineage head
- FounderNode retained/revoked declarations
- old signature
- new countersignature

Rules:
- recovered old root never written to disk;
- ceremony exposes only a closure/capability able to sign bounded recovery statements;
- best-effort overwrite share/root Uint8Arrays on ceremony completion;
- FatherHand generation increments exactly by one;
- successor key is freshly generated, not deterministically derived from old root;
- old recovery set is marked retired in public succession evidence.

Tests:
- old-only or new-only signature is insufficient;
- altered successor key, generation or retained FounderNode list refuses;
- mixed old recovery shares cannot produce succession;
- after ceremony close, API refuses further old-root signing.

Commit: feat(fatherhand): recover only to signed successor lineage

## Task 6 — FounderNode operational delegation

Files:
- src/foundernode.ts
- test/foundernode-delegation.test.ts

Interfaces:
- delegateOperationalKey(founderNode, publicKey, scope, validity, constraints)
- verifyOperationalDelegation(statement, expectedFounderFingerprint, requiredScope, now)

Schema:
- foundernode.delegation/v0

Tests:
- exact scope, serial, expiry and public-key binding;
- expired/not-yet-valid delegation refuses;
- transport key cannot be used as reLATTE key if scope differs;
- valid replacement key doesn't imply old revocation without explicit lineage.

Commit: feat(foundernode): bounded operational key delegation

## Task 7 — FatherHand peer trust marks

Files:
- src/fatherhand-peer-trust.ts
- test/fatherhand-peer-trust.test.ts

Interfaces:
- trustPeerFounder(fatherHand, remoteWorldId, remoteFounderPublicKey, scopes, constraints)
- verifyPeerTrust(mark, localFatherHandPublic, remoteFounderPublicKey, requiredScope)

Schema:
- fatherhand.peer-trust/v0

Rules:
- local human root signs the exact remote FounderNode fingerprint;
- no TOFU fallback;
- no hostname-only trust;
- no automatic trust from a valid TLS certificate;
- trust scope webz-peer-auth does not imply artifact admission;
- revocation/replacement is a distinct signed statement.

Commit: feat(fatherhand): explicit peer FounderNode recognition without TOFU

## Task 8 — Executable kernel CLI

Files:
- scripts/fatherhand-kernel.ts
- test/fatherhand-kernel.test.ts
- docs/receipts/WEBZ-005-FATHERHAND-KERNEL.md

CLI uses synthetic temporary key material only:
1. generate FatherHand-0;
2. found Sanctuary FounderNode;
3. create 5 FatherKids / 3 threshold;
4. create descendants A1/A2/A3;
5. prove duplicate A lineage does not increase quorum;
6. recover with A+B+C;
7. verify FatherHand-0 fingerprint;
8. create FatherHand-1;
9. seal/countersign succession;
10. delegate a synthetic webZ transport key from FounderNode;
11. create a FatherHand peer-trust mark for a synthetic Orchard FounderNode;
12. cold verify every public statement from exported public-only JSON;
13. scan outputs for private JWK/share/seed leakage;
14. report exact statement IDs/fingerprints only.

No private data is uploaded as a CI artifact.

Commit: test(fatherhand): execute genesis recovery succession and peer-trust kernel

## Task 9 — CI and regression gate

Files:
- .github/workflows/verify.yml
- package.json
- README.md
- docs/WEBZ-005-FATHERHAND-FOUNDERNODE.md

Verification:
- npm run verify
- direct fatherhand/recovery unit tests
- executable kernel CLI in a temporary directory
- grep/structured scan ensuring logs/artifacts contain no private JWK d or recovery material
- existing WEBZ-003/004 tests unchanged and passing

Evidence must explicitly state:
- network-free specimen;
- no production FatherHand generated;
- JavaScript memory erasure is best-effort;
- no HSM/hardware enclave;
- no direct HTTPS identity completed yet.

Commit: ci(fatherhand): prove network-free root kernel without leaking recovery material

## Review focus before networking

Security reviewer must inspect:
- dependency provenance and pinned package version;
- recovery integrity verification;
- duplicate lineage handling;
- private serialization/logging;
- generation/succession rules;
- domain separation and canonical fingerprinting;
- operational delegation scopes;
- trust-mark exact key binding;
- no TOFU path;
- no runtime access to FatherHand private state.

**WEBZ-005 HTTPS is a later plan.** It starts only after this kernel is green and human-reviewed.
