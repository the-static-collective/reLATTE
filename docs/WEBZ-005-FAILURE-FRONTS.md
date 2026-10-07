# WEBZ-005 — Ruthless Failure-Front Review

**Status:** active pre-merge red-team record for PR #66.  
**Purpose:** attack the FatherHand / FounderNode root kernel from failure, confusion, replay, compromise, supply-chain, recovery, and operational fronts before any direct networking is permitted.

This document distinguishes **mitigated in executable code** from **still structurally unresolved**. A green test is evidence for the tested claim only.

## Laws added by the red-team pass

```text
VALID SIGNATURE != UNIQUE SUCCESSOR
QUORUM RECOVERY != GLOBAL UNIQUENESS
FORK DETECTION != FORK PREVENTION

LOCKFILE != SUPPLY-CHAIN ELIMINATION
CI GREEN != HARDWARE TRUST
SYSTEM CLOCK != TRUSTED TIME

PRIVATE FIELD HIDDEN != SECURE ERASURE
THREE SHARES != THREE INDEPENDENT CUSTODIANS
BACKUP EXISTS != BACKUP IS AVAILABLE

HTTPS URL != AUTHENTICATED WORLD
TRUSTED FOUNDER != TRUSTED PAYLOAD
TRUST MARK != ADMISSION
```

## Failure matrix

| Front | Attack | Current result | Status |
|---|---|---|---|
| Root serialization | Accidentally JSON-serialize FatherHand private key | FatherHand handle contains public identity only; private CryptoKey stays outside serializable object | **MITIGATED** |
| Root mutation | Change generation/fingerprint/public key after creation, then sign | hidden capability snapshot detects mismatch and refuses | **MITIGATED** |
| Recovery-set multiplication | Accidentally issue two independent recovery sets from one live FatherHand | second issue refuses; successor gets its own fresh set after succession | **MITIGATED locally** |
| Root extraction after backup | Continue carrying an extractable root key after shares exist | after first recovery set is signed, root signer is re-imported as non-extractable | **MITIGATED in WebCrypto process** |
| Below-threshold recovery | 1 or 2 FatherKids recover root | refused | **MITIGATED** |
| Lineage inflation | copy Kid-A and rename it Kid-F | FatherHand signature binds lineage metadata; relabel fails | **MITIGATED** |
| Coordinate confusion | alter share index independent of actual Shamir x-coordinate | envelope index must equal final encoded Shamir coordinate; signed metadata also binds it | **MITIGATED** |
| Mixed recovery set | combine valid shares from different sets | refused | **MITIGATED** |
| Mixed generation/root | combine shares from different FatherHands or generations | refused | **MITIGATED** |
| Corrupt share | modify share bytes and recompute superficial metadata | checksum/signature and final recovered public fingerprint refuse | **MITIGATED** |
| Recovery input DoS | huge candidate array / oversized base64 share | bounded before interpolation/decode work | **MITIGATED** |
| Kid descendants | A1+A2 presented as two independent FatherHand votes | descendants reconstruct signed Kid-A; A still counts once | **MITIGATED** |
| Old-root reuse | use one recovered root repeatedly inside one ceremony | first succession auto-closes recovered capability | **MITIGATED per ceremony** |
| Cross-process old-share replay | use the same 3 old FatherKids in two independent recovery ceremonies | both successors can be cryptographically valid; public succession-set verifier detects the fork when both are observed | **RESIDUAL — detectable, not preventable offline** |
| Successor continuity | recovery creates successor with no recovery path | executable kernel now issues a fresh 3-of-5 recovery set for FatherHand-1 before retiring it | **MITIGATED in specimen** |
| Succession mutation | alter generation/key/founder retention after signatures | old signature + new countersignature fail | **MITIGATED** |
| Succession replay DoS | feed hundreds/thousands of repeated succession statements | verification capped before expensive signature replay | **MITIGATED** |
| World-name confusion | Unicode confusable, controls, percent/path/query/fragment tricks | world IDs restricted to canonical lower-case ASCII webZ form | **MITIGATED** |
| Scope typo / invented authority | mint arbitrary founder or peer scope | closed allowlists; every FounderNode must include world-identity authority | **MITIGATED** |
| Delegation confused deputy | FounderNode delegates scope FatherHand never granted | operational delegation must chain to exact signed founding statement and authorized scope | **MITIGATED** |
| HTTP downgrade | operational transport constraint uses http:// | rejected for webZ HTTPS scope | **MITIGATED** |
| URL credential confusion | https://user:pass@host | rejected | **MITIGATED** |
| URL fragment/query/path confusion | hidden routing/identity text in endpoint constraint | transport constraint is exact canonical HTTPS origin | **MITIGATED** |
| Clock rollback | validate delegation/trust before signed creation time | verifier refuses dates before creation | **MITIGATED assuming caller time is trustworthy** |
| Born-expired trust/delegation | create authority already expired | creation refuses | **MITIGATED** |
| Peer-world replay | use Orchard trust mark while claiming another world string | peer verifier requires exact expected remote world | **MITIGATED** |
| Peer-key substitution | same world string, different FounderNode key | exact remote FounderNode fingerprint must match | **MITIGATED** |
| TOFU fallback | accept first network key | no TOFU path in root kernel | **MITIGATED by absence** |
| Operational private-key serialization | serialize online key object | operational handle now contains public identity only; private CryptoKey held separately and explicitly retired in synthetic run | **MITIGATED in kernel** |
| Public evidence leak | log JWK d / share bytes / seed material | recursive leak scanner + CI grep; scanner itself is cycle/depth bounded | **MITIGATED for tested outputs** |
| npm package substitution | package version changes under CI | committed lockfile includes registry integrity; CI uses npm ci --ignore-scripts | **MITIGATED, registry/CA still trusted** |
| GitHub Action tag retarget | actions/* v4 mutable tag moves | checkout/setup/upload/download are pinned to immutable commit SHAs | **MITIGATED for these workflows** |
| CI token persistence | test process reads persisted checkout credential | checkout uses persist-credentials:false; workflow permissions are contents:read | **MITIGATED** |
| CI runaway | malicious/hung test consumes runner indefinitely | explicit job timeout | **MITIGATED** |
| Existing WEBZ regression | root hardening breaks WEBZ-004 crossing | existing sender → receiver → verifier jobs remain required | **GATED BY CI** |

## Residual blockers before direct authenticated WEBZ networking

### 1. Offline recovery fork cannot be prevented by signatures alone

Three legitimate old FatherKids can reconstruct FatherHand-0 more than once on disconnected machines. Each reconstruction can produce a different, correctly old-signed and new-countersigned FatherHand-1.

The kernel now names the consumed recovery-set ID and detects conflicting successors when evidence is co-observed. It **cannot** make disconnected threshold recovery globally single-use without another coordination/witness primitive.

Before production peer networking, choose and implement a conflict policy such as:

- durable external succession checkpoints witnessed by multiple independently controlled locations;
- a human-mediated fork-resolution rule with signed supersession;
- or a threshold co-signing protocol that never reconstructs one reusable root at all.

Do not describe the current scheme as globally fork-proof.

### 2. Revocation distribution is not implemented

The architecture describes FounderNode and operational-key revocation, but the current root kernel does not yet provide a complete, distributed revocation feed or prove that a remote peer has seen the newest revocation state.

**Block direct peer acceptance until this exists.**

### 3. Trusted time is not solved

Delegation and trust windows are checked rigorously against the caller-supplied clock. A compromised or badly rolled-back system clock can still alter temporal decisions.

Before long-lived network authority depends on time, define the time-trust model.

### 4. FatherKid storage is not production-hardened

FatherKid envelopes are deliberately private and contain real recovery share material. This specimen does not encrypt them at rest, place them in hardware, distribute them to independent custodians, or prove geographic/administrative separation.

Three stolen shares still recover the root because that is the threshold contract.

### 5. JavaScript is not secure memory

Uint8Array working buffers are overwritten best-effort and private CryptoKey handles are retired, but the runtime is garbage-collected and may copy data. Base64 recovery-share strings are immutable until garbage collected.

No secure-erasure, HSM, TPM, enclave, or locked-memory claim is made.

### 6. Remote FounderNode enrollment ceremony is not implemented

The kernel can sign and verify a peer trust mark, but it does not yet prove **how the human obtained and compared the intended remote FounderNode fingerprint** through an independent authenticated channel.

That ceremony is the next trust-bootstrap gate.

### 7. TLS/session binding is not implemented

No direct network listener exists yet. Therefore we have not proved:

- TLS certificate/public-key binding to a FounderNode delegation;
- mutual challenge freshness;
- replay-safe session setup;
- request body binding;
- endpoint rotation;
- revocation during an active session;
- connection downgrade/reflection resistance;
- network DoS/rate limiting.

### 8. CI is evidence, not a root of sovereignty

GitHub-hosted runners, npm registry delivery, operating-system images, and repository hosting remain external supply-chain dependencies for this **synthetic test**. They are not appropriate custody for a real FatherHand.

## Merge posture

The root kernel may be reviewed as a bounded cryptographic specimen only after the full regression suite is green. Its merge must **not** be interpreted as approval to:

- create the user's production FatherHand;
- generate real custodial FatherKids;
- expose a server;
- auto-enroll a peer;
- claim fork-proof recovery;
- or claim hardware-backed key custody.

The direct-network phase remains separately gated.
