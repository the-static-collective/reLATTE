# WORLD-FORGE-009 — Owner-signed grant → local reLATTE signed HOLD/REFUSE

**Scope:** experimental DRAFT, stacked on WORLD-FORGE-008 (#149), then #147 → #145 → #144 → #142 → #138. Original reLATTE core code remains unchanged. This is a **receiver-local proposal authorization bridge**, not legal agency, account login, production authorization, or human-identity proof.

## Exactly what is proven in this experiment

1. An owner-controlled **WF008 ECDSA P-256 signed public grant** is supplied to a **local** verifier as an input file. The owner browser's private CryptoKey is *never* exported, transmitted to ChatGPT or placed in the repository. CI uses a fresh **synthetic** signer; the actual user's grant is **never uploaded to GitHub**.
2. `preview` independently verifies the original WF008 cryptographic signature and displays its public-key fingerprint, exact grant digest, time window and scope. **Preview never enrolls**.
3. A deliberate **separate local fingerprint confirmation** is required before `enroll` writes the trust root. A signed grant merely proving possession of a key cannot silently enroll itself. The local trust root pins the original signer public-key fingerprint, exact signed grant digest and audience, **not a private key** or the complete grant.
4. `policy` verifies the original P-256 grant *again*, matches the local fingerprint + original grant digest, examines **locally received owner-signed revocations**, and checks the requested action, time and exact allowlist. Denied actions or expired/revoked grants become `REFUSE`; currently valid allowed project proposals become `HOLD`.
5. `review` creates **a different ephemeral native reLATTE P-256 crossing** for a small sanitized proposal record. The bridge signing key is **not** the user's key and is not a claim of human authorization for every proposal. Native `LocalReceiver` signs `RECEIVED`, `R3_HOLD/R3_REFUSE`, and `PAYLOAD_BYTES_VERIFIED` receipts. **HOLD quarantines a SHA-256-verified proposal record**. **REFUSE discards the record**. Both sides use the existing unmodified native reLATTE core.
6. On restart, native reLATTE independently verifies receipt signatures and replayed journal. Neither local disposition permits `ADMIT`, a merge, deployment, spend, remote execution or other external side effect.
7. `revoke` requires a **real signature under the same enrolled owner key and the exact signed grant digest**. Its cancellation applies only where the revocation has been received. This local file ledger is neither remotely broadcast nor independently tamper-proof against an attacker controlling the entire local filesystem.

## Explicit trust boundary

**No user identity is inferred from a valid signature.** A fingerprint pinned in an experimental receiver is a local recognition decision, not independent person verification. The chat user has provided a signed grant in the conversation; this repository contains **no such user-provided signature, fingerprint, owner file, or private key**.

Project-side scoped assistance is not an automatic API token. This bridge does **not** act on GitHub, execute signed proposals, merge, alter production, admit game cartridges, issue assets, perform legal agency, or grant third-party consent. A separate authenticated human action is still required for consequential changes.

The `at` timestamp is an explicit **simulation/test input**, not a trusted remote timestamp or secure authorization clock. The current prototype is a **review-only** recorder without production action routes. Do not use this clock or mutable local revocation ledger as the security authority for real money, production access, or another person's account. A hardened version would need trusted time, authenticated owner enrollment, freshness/replay protection, protected storage and revocation distribution.

## Run — local, after obtaining a public signed owner grant

The GitHub Actions `.github/workflows/world-forge-009-local-delegation-bridge.yml` builds a single-file **Node 22+ LOCAL CLI** artifact named `WF009-LOCAL-RECEIVER-CLI.mjs` (generated code only; zero actual user grants). It is the easiest way to test without installing a build toolchain. No GitHub or internet access is used by the CLI.

```sh
# 1. Verify ONLY. Does not enroll anything.
node WF009-LOCAL-RECEIVER-CLI.mjs preview WF008-signed-project-delegation.json preview-private.json

# 2. Separately confirm the EXACT displayed fingerprint in your own environment.
#    A matching file is not independent human identity verification.
node WF009-LOCAL-RECEIVER-CLI.mjs enroll WF008-signed-project-delegation.json ./my-local-trust FINGERPRINT_HERE 2026-11-04T12:00:00.000Z

# 3. Bounded project-proposal review. Native reLATTE receipts, never a merge.
node WF009-LOCAL-RECEIVER-CLI.mjs review WF008-signed-project-delegation.json ./my-local-trust PROPOSE_PULL_REQUEST 2026-11-04T12:00:00.000Z proposal-001 receipt-private.json

# 4. Owner-browser-signed revocation must be explicitly supplied and imported:
node WF009-LOCAL-RECEIVER-CLI.mjs revoke WF008-signed-project-delegation.json ./my-local-trust WF008-signed-project-revocation.json revocation-accepted-private.json
```

**Key safety:** Do not upload your local trust directory: it includes a **different local receiver's private signing key** in `native-receiver/receiver-key.json`; it is not your original owner private key. Never push the real grant or revocations to a public Git repository. Use an access-controlled folder and backups appropriate for your environment.

## Test evidence

```sh
npm install
node --experimental-strip-types --test experiments/world-forge-009/tests/bridge.test.mjs
node --experimental-strip-types experiments/world-forge-009/tests/cli-smoke.mjs
```

The tests intentionally generate synthetic local P-256 keys and exercise permitted and forbidden scopes, missing confirmation, signer substitution, changed grant digest, expiry, malicious grant mutation, foreign key revocation, same-key signed revocation, missing/corrupt local ledger, replayed native receipts, quarantined HOLD bytes and nonretained REFUSE bytes. CI also tests the bundled standalone local CLI end to end.

**SIGNED != IDENTIFIED · ENROLLED != UNIVERSALLY TRUSTED · REVIEWED != EXECUTED · HOLD != ADMIT**
