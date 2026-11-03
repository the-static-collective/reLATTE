# LANTERN COMMONS 004 — two save observations into native reLATTE HOLD

**Status:** Experimental bridge. The *save-file scanner and exact Lantern Commons 003 datapack* were built as separate conversation-local artifacts in the kit **Lantern_Commons_004_Witness_Courier.zip**, not automatically published by this branch. This branch DOES contain a reLATTE-native signed crossing / LocalReceiver adapter and adversarial tests. It is not a verified official Minecraft run and cannot establish independent action history.

## Role division

- Source 003 ZIP hash: `0fbce0b83dd510bdba7a8865406270a703fc376e5dc51ef9fb7d5fd31fd780cf`.
- External local-only Python scanner: reads two *closed* Java world saves, `level.dat`, entity and block region Anvil files, locates the anchor marker, compares source-derived touching of 466 block positions, refuses changed blocks and cloned seeds, emits candidate JSON.
- This branch's `scripts/lantern-commons-handoff-004.ts`: only consumes scanner-produced `relatte.skill-cartridge-candidate-004/v0` **as untrusted data**. It checks shape declarations and exact source ID, signs an original native `CrossingEnvelopeV0`, and calls the original reLATTE `LocalReceiver` to RECEIVE, HOLD, verify exact payload custody, and survive a restart.
- A native signature authenticates the local signing key's statement **not** the Minecraft server, its player, the source program execution, or independent human observation.

## Usage after acquiring the scanner's candidate JSON

From the reLATTE repository root:

```bash
npm ci
npm run verify
node --experimental-strip-types scripts/lantern-commons-handoff-004.ts \
  /absolute/path/LOCAL_004_CANDIDATE.json \
  /absolute/path/private-receiver-root \
  /absolute/path/LOCAL_004_SIGNED_HOLD.json
```

Private receiver root contains a signing key; do not commit or publish it. Source file body is capped to 65,536 bytes by R3 custody. Operator must decide what to share; no network calls or auto admission are implemented. Invalid/stale/unsupported candidates fail closed.

## Verify this PR

```bash
npm run verify
node --test --experimental-strip-types test/lantern-commons-handoff-004.test.ts
```

Additional tests: reject false source, same-seed worlds, unsupported skill, fictitious live-witness claim, tampered block checks, auto ADMIT. The positive test creates a true signed native crossing with fresh local keys, verifies R3_HOLD and custody, and reopens the receiver to verify replay.

## Further proof gate

Actual official Mojang 26.1.1 execution in two independent game instances with separate actor/observer clients and captured intent/action/observed state. Original donated Minecraft source traces from draft PRs [#74](https://github.com/the-static-collective/reLATTE/pull/74) / [#101](https://github.com/the-static-collective/reLATTE/pull/101) are donor research, not silently imported into this branch. Then independent receiver acceptance as a *new* separately approved experiment.

**Laws:** `WORLD SAVE != HUMAN WITNESS`; `SIGNED != TRUE`; `RECEIVED != ADMITTED`; `MATCHING BLOCKS != MATCHING ACTIONS`; `CANDIDATE != EXECUTION AUTHORITY`.

Related: #132, #133, #137.
