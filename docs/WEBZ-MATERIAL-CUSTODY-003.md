# WEBZ-003 — Receiver-Local Material Custody

**Status:** Proposed owner-level additive R14 extension. **Not merged or globally deployed.**

The reLATTE opaque-organ R14 roundtrip signs an **envelope containing a payload SHA-256 reference**, not evidence that the receiving process read the referenced bytes. The additional custody boundary supplies that missing, independently recorded observation.

## Additive owner primitive

`LocalReceiver.verifyPayloadBytes(crossing_id, bytes, created_at)` requires a previously signed RECEIVE and a separately decided `R3_HOLD` or `R3_REFUSE`. It hashes the **actual supplied byte buffer**, requires that digest to appear in the received **signed crossing**, and emits a reLATTE `relatte.receipt/v0` with kind `PAYLOAD_BYTES_VERIFIED`. The receipt is signed with the **same receiver-local P-256 key** as its RECEIVE and disposition receipts. It includes content SHA-256, byte count, disposition, retention decision and binding to both prior receipt IDs. No authority, admission, or semantic effect is granted.

**HOLD:** Receiver retains the verified bytes in its own `payloads/<crossing_id>.bin` quarantine. An append-only, hash-chained `CUSTODY` event persists the signed receipt. Opening the receiver cold checks the signature, journal chain and actual retained bytes again. A changed/missing file fails replay.

**REFUSE:** The receiver independently hashes and verifies the supplied bytes but **does not retain them**. A signed and durable CUSTODY witness survives cold replay. The existence of a REFUSE record does not mean the refused material entered local world state.

No API accepts `ADMIT` as a custody retention choice. Neither HOLD nor REFUSE changes the world state, and state refs remain backward-compatible with legacy R3 receipts.

## Separate destination execution

`scripts/material-delivery.ts` executes as a standalone Node process. It receives a fixed, bounded JSON request on stdin that names only a **carrier file** and existing receiver root—not the sender's fixture path. The carrier contains a **verified signed crossing envelope plus the actual base64 artifact bytes**. The process independently verifies the signature, byte digest, existing receiver RECEIVE/disposition, receives the bytes into the recipient's own `LocalReceiver`, signs a custody receipt and opens the receiver **cold** to replay its journal and physical payload integrity.

This is a **local file-carrier, separate process proof**. It does not establish different machines, remote network transport, independent administrator OS permissions, legal identity, or fully federated naming authority.

## Negative evidence

- Wrong payload bytes fail against the SHA-256 in the signed crossing.
- Altered crossing contents fail signature verification even if the material is intact.
- Missing signed RECEIVE or receiver-local disposition fails.
- Cannot retain refused material.
- A changed retained file makes cold replay fail.
- A tampered signed custody receipt or event makes cold replay fail.
- Duplicate delivery reuses the same signed custody receipt; no automatic additional admission.
- Payloads greater than 64 KiB, invalid carrier/base64, non-absolute paths and unexpected fields fail.
- Previous reLATTE tests remain unchanged and must still pass.

## Reproduction

```bash
npm install
npm run verify
node --test --experimental-strip-types test/material-custody.test.ts test/material-delivery.test.ts
```

Paired implementation (separate review): `the-static-collective/static-workbench` WEBZ-003 transports its first-party fictional JSON through this owner primitive. There is no rewriting of original R14 crossing, RECEIVE or disposition receipts.
