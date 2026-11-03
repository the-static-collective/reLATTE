# WORLD-FORGE-008 — Owner Key, Scoped Project Representation

**Status: experimental draft.** An AI assistant may draft, analyze, propose GitHub changes, calculate, and communicate under the user's expressed project-side direction. It does **not** personally possess a persistent human signing identity, legal power of attorney, access to the user's private key, or unilateral authority to merge, deploy, spend money, issue tokens, execute external equipment, or admit foreign game-world cartridges.

## What this experiment implements

- **Offline single-file owner console** generated at `experiments/world-forge-008/dist/WORLD-FORGE-008-OWNER-CONSOLE.html`. It has no dependency on services, scripts, network, CDN or a hosted login. The generated file is a CI artifact available from the green GitHub Actions run.
- A local browser **ECDSA P-256** key pair is created only after the owner clicks `Create local signer`. Its private key is **nonextractable** through the browser's WebCrypto API, and both keys persist in browser IndexedDB. Browser storage does **not** equal a hardware security module and can disappear when storage is cleared. No backup/recovery mechanism is claimed.
- Another explicit click signs a limited, auditable **project delegation grant**. It is valid for 1, 7, 14 or 30 days, with strict expiry, one unique random 128-bit nonce and a fixed audience. Only these five scopes are allowed:
  `DRAFT_EXPERIMENT`, `PROPOSE_PULL_REQUEST`, `SUMMARIZE_VERIFIED_RESULTS`, `CHECK_MATH`, `COMMUNICATE_PROJECT`.
- The owner can export a **public signed grant JSON**, without exporting the private signing key. Receiving software can independently cryptographically verify it using `src/delegation-core.mjs` and `src/verify-public.mjs`, while still requiring a separate independent trust decision that the displayed public key is actually the owner.
- The owner can explicitly sign and download a **revocation**. This cancels the grant at a receiver **only once the receiver obtains and verifies that revocation**; there is no automatic network broadcast, historical retroactive cancellation, or proof that everyone received notice.
- Fixed safety boundaries: **no permission to merge, admit, spend, sign as owner, issue tokens, control external equipment, deploy production, or act as a legal representative.** All such operations require separate owner action through an authenticated service.

## Important distinction: a true enrolled owner key is not yet here

The user's permission expressed in conversation authorizes **project support** in this chat. The code in this PR creates a way for a person to establish a *new local key* under that person's control. It does **not** imply that the user has already created, signed, or enrolled such a key. A browser key fingerprint is a pseudonymous public-key identifier, **not verified human identity or external institutional trust**. The AI assistant has no private signing key of its own and cannot countersign as the user.

An actual receiving-world enrollment requires receiving the public grant from the user, verifying signature and source, independently establishing and pinning the public key to the intended person through a user-controlled authenticated channel, receiving revocations, and recording each approval separately. Until then the 008 output is a local signed project-delegation artifact, not an admitted agent credential or production identity infrastructure.

## Build and test

```sh
node --test experiments/world-forge-008/tests/delegation.test.mjs
node experiments/world-forge-008/src/build.mjs
# Open experiments/world-forge-008/dist/WORLD-FORGE-008-OWNER-CONSOLE.html in a browser
```

On browsers that do not permit persistent WebCrypto key storage at `file://` origins, host the file **locally only** from a development server on `127.0.0.1`. Do not host a credential ceremony on an untrusted website. A user's local browser data controls the key; clearing its origin data may render grants impossible to revoke using that private key.

CI `.github/workflows/world-forge-008-local-owner-delegation.yml` runs native hostile P-256 tests, generates a single-file console, and runs a real headless Chromium click-through to confirm local key generation, signature/download, IndexedDB reload persistence, cryptographic revocation and zero outbound requests. **CI demonstrates synthetic key holder behavior, not the actual user's signature.**

## Relationship to prior evidence

#147 verifies authentic original PR #101 source signatures from its *separate nine-lamp Minecraft redstone experiment*, with different CI receiver-local policies. The source identity remains **ephemeral CI keys**, not verified humans. #144/#145 implement a *different* bounded material-repair donor chain and native review-only crossing. WORLD-FORGE-008 does **not** conflate those sources or grant authority to act upon either.

**SIGNED != IDENTIFIED · DELEGATED != IMPERSONATED · PROPOSED != MERGED · RECEIVED != ADMITTED**
