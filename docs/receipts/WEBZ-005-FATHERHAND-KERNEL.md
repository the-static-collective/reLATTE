# WEBZ-005 — FatherHand Root-Kernel Execution Evidence

**Status:** executable **synthetic, network-free** cryptographic specimen. **Not merged, not production key material, and not direct HTTPS authority.**  
**Feature PR:** reLATTE #66.  
**Verified functional revision:** `d37e0a3a82fb03f3b47b328ee802bf56c752946a`.  
**Verification run:** GitHub Actions `37584781568` on 2026-10-07 UTC.

## What executed

The kernel created only fresh ephemeral test keys and exercised the entire pre-network trust lineage:

1. generated **FatherHand-0** with P-256 WebCrypto;
2. independently generated a Sanctuary **FounderNode** and signed `fatherhand.founding/v0`;
3. split FatherHand recovery material into **five FatherKids, threshold three**, using exact dependency `shamir-secret-sharing@0.0.4`;
4. cryptographically signed each private recovery-share metadata envelope with FatherHand, including generation, recovery-set ID, unique lineage ID, Shamir coordinate, threshold, total, checksum and RECOVERY_ONLY scope;
5. explicitly retired the original FatherHand private-key handle **before** attempting quorum recovery;
6. proved one/two shares refuse, three distinct signed lineages reconstruct the exact expected FatherHand public fingerprint;
7. made redundant descendants of Kid-A, recovered the original **single A lineage**, and proved duplicate A does not become extra FatherHand quorum authority;
8. recovered FatherHand-0 only inside a bounded recovery capability, freshly generated FatherHand-1, signed succession with 0 and countersigned with 1, then automatically retired the reconstructed old-root capability after that one succession act;
9. independently generated a replaceable operational key and signed a scope/time-bounded FounderNode delegation;
10. generated a separate synthetic Orchard FounderNode and created an exact **FatherHand-1 peer trust mark** for that remote FounderNode, with no TOFU path;
11. cold-verified the founding, recovery integrity, succession, delegation and peer-trust public evidence;
12. retired the synthetic remote FatherHand and FatherHand-1 handles after their bounded acts, so **all root handles were retired before report emission**;
13. emitted a public-only `webz.fatherhand-kernel-witness/v0` report, then CI scanned it for private JWK `d`, private-key fields, share bytes, descendant fragment bytes, seed material and recovery payload fields.

The public report states:

```text
synthetic_only: true
network_used: false
all_root_handles_retired_before_report: true
recovery: 3 of 5
genesis_secret_retired_before_recovery: true
two_share_recovery_refused: true
child_descendants_recovered_one_lineage: true
succession old_and_new_signatures_verified: true
operational delegation verified: true
peer trust verified: true
tofu_used: false
```

## Automated verification

The standard `npm run verify` gate passed:

- TypeScript no-emit check;
- **130 tests passed, 0 failed**;
- production build passed;
- explicit WEBZ-005 synthetic kernel step passed;
- public output leak grep passed.

The tests include:

- ordinary `src/index.ts` exposes **public FatherHand verification** functions but **not** cold-root generation, threshold recovery, ceremony, child-share or trust-mark signing authority;
- FatherHand and FounderNode authority handles bind their hidden private capabilities to immutable identity snapshots, refusing attempts to mutate their public generation/world/fingerprint/key identity before a signing act;
- FatherHand object handles have **no enumerable/private-key property**; private CryptoKey capability is stored outside the serializable handle and can be explicitly retired;
- founding statement mutation fails verification;
- fewer than three FatherKids refuse;
- duplicate recovery lineages refuse;
- same raw Shamir share cannot be relabeled as a new lineage/coordinate: share metadata is FatherHand-signed, share checksum is verified, and the envelope's share coordinate must equal the coordinate encoded in the Shamir share bytes;
- mixed FatherHand, generation and recovery-set shares refuse;
- corrupt share bytes refuse through checksum/signature/final root-fingerprint checks;
- FatherKid descendant reconstruction returns the signed original parent-share identity, preserving **one lineage = one vote**;
- old-root recovery capability cannot sign a second succession after the first completed act;
- altered succession, delegated scope, expiry or peer FounderNode key fails verification;
- operational delegation is accepted only when it chains to the exact FatherHand-signed FounderNode founding statement and that founding statement authorizes the required delegation scope; an under-authorized FounderNode cannot delegate a webZ HTTPS key;
- a different remote FounderNode with the same world-name string does **not** satisfy the FatherHand trust mark;
- public evidence scanner rejects private JWK and recovery-secret-shaped fields.

Existing reLATTE / WEBZ-003 / WEBZ-004 tests and workflows remain active on this branch; the root kernel does not add a network listener or modify the two-host transport protocol.

## Dependency review boundary

The exact runtime dependency is:

```text
shamir-secret-sharing 0.0.4
```

The upstream package describes itself as a zero-dependency TypeScript Shamir Secret Sharing implementation using `Uint8Array`, with independent Cure53 and Zellic audits. Its own security notes explicitly warn that JavaScript cannot provide true constant-time guarantees and that **reconstruction integrity is the caller's responsibility**.

WEBZ-005 addresses that reconstruction-integrity requirement by:

- FatherHand-signing each recovery-share metadata commitment;
- checking private-share SHA-256;
- binding metadata share index to the share's encoded Shamir coordinate;
- refusing duplicate/mixed lineages;
- and, decisively, importing the reconstructed key then recomputing its canonical FatherHand public fingerprint before any recovered-root capability is exposed.

The library is pinned to the exact package version in `package.json`. There is no custom finite-field/Shamir implementation in reLATTE.

## Secret-lifetime boundary

Private FatherHand key material is not returned as a serializable field. Root objects contain public generation/fingerprint/public key only; the private `CryptoKey` is held in an internal `WeakMap`. `retireFatherHand()` removes that capability. Reconstructed PKCS#8 and Shamir working `Uint8Array` buffers are overwritten best-effort after use, and recovered old-root signing authority automatically closes after one successor is created.

**This is not secure erasure in the hardware sense.** JavaScript runtimes are garbage-collected and may copy secret material internally. This implementation makes lifecycle and serialization boundaries explicit, but does not claim HSM/enclave/locked-memory guarantees.

FatherKid and descendant share envelopes themselves are intentionally private backup artifacts. The normal public leak scanner rejects them because they contain recovery material. This PR does **not** save, publish, upload or log any generated FatherKid.

## Authority boundaries

This specimen proves the internal cryptographic shape of:

```text
FatherHand-0
   ├─ signs FounderNode
   └─ 5 recovery lineages / any 3
           ↓
      bounded recovery
           ↓
      FatherHand-1 succession

FounderNode
   └─ scoped operational delegation

FatherHand-1
   └─ exact trust mark for remote FounderNode
```

It does **not** prove:

- a real user's production FatherHand exists;
- real recovery shares are physically separated;
- hardware-backed/private-memory key custody;
- a remote endpoint belongs to a human;
- a TLS session has been authenticated against these statements;
- revocation distribution;
- direct peer HTTPS;
- automatic browsing trust;
- content admission.

The next security gate remains: enroll a remote FounderNode through a deliberate FatherHand ceremony, delegate a transport key, then bind an authenticated network session to **both** the trusted FounderNode and the exact operational delegation. Until that exists:

**TLS VALID != SOVEREIGN PEER TRUST.**

> The seed survived the loss of its original private handle through three independently authenticated kid lineages, then produced a fresh signed successor without turning recovery into daily authority.
