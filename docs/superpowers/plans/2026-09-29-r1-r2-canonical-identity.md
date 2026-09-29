# R1/R2 Canonical Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make reLATTE's v0 CrossingEnvelope and Receipt cryptographically reproducible through Project0-conformant canonical bytes, stable SHA-256 IDs, and bounded ECDSA P-256 verification.

**Architecture:** Keep the executable kernel pure and transport-free. Explicit identity constructors normalize optional v0 fields, exclude only self-referential IDs/signatures, and produce RFC 8785/JCS bytes under reLATTE domain separators; signing uses a second domain-separated preimage that includes the already-derived ID. Receiver semantics remain out of scope.

**Tech Stack:** TypeScript, Node.js 22 Web Crypto, node:test, SHA-256, RFC 8785/JCS-compatible canonicalization.

**Spec:** GitHub issue #2 and `spec/EXECUTION-MODEL.md`.

## Global Constraints

- Preserve `IDENTITY != SIGNATURE`, `SIGNATURE != HUMAN IDENTITY`, `SIGNED != TRUE`, and `RECEIVED != ADMITTED`.
- No RECEIVE/HOLD/ADMIT/REFUSE runtime, transport, database, UI, wallet, or global state.
- Conform canonicalization behavior to Project0's current RFC 8785/JCS profile; do not import Formation Trace's local sorted-JSON routine as protocol law.
- Keep Coffee Day lineage operators non-normative and untouched.
- Use explicit hashed/signable-body constructors; never generic root-field deletion.

## Review Focus

- Optional field omission versus explicit null/empty arrays must not fragment identity unexpectedly.
- P-256 coordinate changes must change identity; runtime-only JWK metadata (`ext`, `key_ops`) must not; signature bytes themselves must not.
- Private JWK material must never be accepted into an envelope/receipt signing public key.
- Wrong world/domain/key and semantic mutation must all fail verification.
- Cross-process verification must use serialized public material only, with no hidden local key state.

---

### Task 1: Canonical identity kernel

**Files:**
- Create: `src/canonical.ts`
- Create: `src/protocol.ts`
- Create: `src/index.ts`
- Test: `test/identity.test.ts`

**Interfaces:**
- Consumes: v0 schema field names from `schemas/crossing-envelope-v0.schema.json` and `schemas/receipt-v0.schema.json`.
- Produces: `canonicalizeDomainValue`, `constructCrossingIdentityBody`, `constructReceiptIdentityBody`, `computeCrossingId`, `computeReceiptId`, `crossingSignatureBytes`, `receiptSignatureBytes`.

- [x] **Step 1: Write failing identity tests** for key-order invariance, normalized optional fields, explicit self-reference exclusion, world mutation, receipt identity, hostile canonicalization inputs, and private-JWK rejection.
- [x] **Step 2: Run `node --test --experimental-strip-types test/identity.test.ts` and verify RED** because `src/index.ts` does not exist.
- [x] **Step 3: Implement the minimum canonical/profile code** using Project0-compatible pre-canonicalization validation and RFC 8785/JCS serialization semantics.
- [x] **Step 4: Re-run the identity tests and verify GREEN.**
- [x] **Step 5: Record the task result in the execution ledger.**

### Task 2: Bounded P-256 signing and independent verification

**Files:**
- Modify: `src/protocol.ts`
- Modify: `src/index.ts`
- Test: `test/signing.test.ts`
- Create: `fixtures/genesis-signed-crossing.json`
- Create: `fixtures/genesis-signed-receipt.json`

**Interfaces:**
- Consumes: Task 1 identity/signature preimage functions.
- Produces: `generateP256KeyPair`, `sealCrossingEnvelope`, `sealReceipt`, `verifyCrossingEnvelope`, `verifyReceipt`.

- [x] **Step 1: Write failing signing tests** for seal/verify, semantic mutation, wrong key, wrong world/domain, receipt verification, cross-process verification, and stored signed fixtures.
- [x] **Step 2: Run the signing test and verify RED** because signing exports do not exist.
- [x] **Step 3: Implement minimal ECDSA P-256 Web Crypto helpers** with public JWK only in portable objects and base64url signatures.
- [x] **Step 4: Generate fixed signed fixtures, then verify both fixtures through the production verifier.**
- [x] **Step 5: Run identity + signing tests and verify GREEN.**
- [x] **Step 6: Record the task result in the execution ledger.**

### Task 3: Package gate, CI, and protocol documentation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.github/workflows/verify.yml`
- Create: `spec/IDENTITY-SIGNATURE-PROFILE-V0.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: Tasks 1-2 executable public API.
- Produces: `npm test`, `npm run check`, `npm run build`, `npm run verify`, GitHub Actions gate, exact byte-equation documentation.

- [x] **Step 1: Add package/typecheck/build/CI configuration and exact profile documentation.**
- [x] **Step 2: Run local executable tests with Node's TypeScript stripping.**
- [x] **Step 3: Publish the branch and open a draft PR linked with `Closes #2`.**
- [x] **Step 4: Verify GitHub Actions typecheck/build/tests on the branch.**
- [x] **Step 5: Run an owner-style final review, fix any Critical/Important findings with RED→GREEN tests, and re-run the whole suite.**


## Execution result

Completed on branch `feat/r1-r2-canonical-identity`.

- Identity/signature implementation is bounded to R1/R2 and leaves R3 receiver semantics unimplemented.
- GitHub Actions caught and forced repair of TypeScript/WebCrypto integration and the older canonicalizer package's native-ESM entrypoint.
- Final verification gate: `npm run verify` on Node 22 with dependency installation.
- Final review hardening adds explicit stored-ID tamper checks and verifies the intentional distinction between P-256 coordinate identity and runtime-only JWK metadata.
