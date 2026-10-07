# PAPERCHAIN-SEED-VAULT-001 — Executable Seed Capsule

**Scope:** experimental donor profile exercising unmodified reLATTE WEBZ-003 owner primitives. Not a new chain, token, universal registry or release authority. The donor meaning belongs to LemonPRESS; reLATTE carries an opaque artifact and signs the crossing and recipient receipts.

## First-person reproduction with the actual Seed Vault source

After checking out this branch and `npm install`, place the original generated manga PNG and the manuscript text anywhere locally, then:

```bash
node --experimental-strip-types scripts/paperchain-seed-vault.mjs \
  /absolute/path/the_seed_vault_music_takes_root.png \
  "/absolute/path/The Autodiscography - The Seed.txt" \
  /tmp/paperchain-seed-vault-001
```

The output directory **must not already exist**. This is a deliberately first-run-only witness so an operator cannot silently overwrite local custody history. Inspect `witness.json`, `seed-manifest.json`, `seed.carrier.json`, `first-panel-candidate.json`, and the `receiver/` journal and held bytes. Preserve receiver private keys locally; do not commit generated `receiver-key.json` or originals.

```text
SOURCE PNG + MANUSCRIPT (read & SHA-256 at source)
        |
        +-- original raw bytes REMAIN source-local
        v
LEMONPRESS SEED MANIFEST (<64 KiB)
  |         |                         |
  |         +-- source image digest   +-- source manuscript digest
  v
reLATTE SIGNED CROSSING (P-256)
  |
Local Receiver -> RECEIVE -> HOLD
  |
WEBZ-003 separate-process delivery of EXACT MANIFEST BYTES
  |
PAYLOAD_BYTES_VERIFIED (same receiver key)
  |
Cold replay, retained manifest rehashed
  |
PANEL CANDIDATE -- still requires creative production and local admission
```

## Why a manifest, not a manga PNG?

The example generated manga page is approximately 3.4 MB. Current `receiveMaterialDelivery` and LocalReceiver byte custody are bounded to **64 KiB of material bytes**. Claiming the entire PNG crossed would therefore be false.

This slice creates a compact, content-addressed seed manifest referencing the original image and manuscript hashes. It does **not** transfer, retain, or independently verify the original image at the destination. Actual PNG ownership, decoding, licensing and receipt of complete page bytes remain separate obligations. The script checks the PNG signature and IHDR dimensions but is not a full image decoder.

The seed itself has a stable content-derived identity from the two source digests. A fresh cryptographically signed crossing carries its own independent identity; those should not be conflated.

## Gates

- Signed crossing is verified against the reLATTE canonical profile.
- RECEIVED and R3_HOLD are separate signed receiver events.
- A distinct local Node process reads the actual seed carrier bytes, hashes them against the signed crossing, signs a `PAYLOAD_BYTES_VERIFIED` receipt, and cold-replays the held payload.
- The output is **HELD**, not **ADMITTED**. A first-panel candidate is only a proposal, with ancestry and an image region; **no new PNG, world, published manga or descendant crossing is generated**.
- Original file bytes are not copied to GitHub or public output.
- Both artifacts are referenced as hashes. A digest alone is not image byte custody.
- One local filesystem is used; the two processes are not two remote peers, identities or administrators.

## Next earned slice: GERMINATION-002

In LemonPRESS, produce a real derivative page/scene from the admitted input, with deterministic or attributable variation and source-region witness. Explicitly record author/receiver selection, then create a **fresh** reLATTE signed crossing naming the parent seed and the new descendant's actual byte digest. Workbench/webZ can expose `INSPECT → HOLD → PLANT` while preventing `PLANT` before local authority and material availability. Add a large-byte custody capability through bounded chunk commitments or verified destination-local retrieval rather than weakening WEBZ-003 limits or treating an unverified hash as delivered bytes.

**Acceptance test for this next slice:** from a fresh receiver, verify the actual original/derived PNG bytes; force a HOLD/REFUSE decision; require an explicit separate planting action; show fresh child identity and exact parent reference; close/reopen and reconstruct the same chain; reject corrupted media, altered ancestry and silent auto-admission.

`SEED != KEY` · `SOURCE IMAGE REF != SOURCE IMAGE CUSTODY` · `HOLD != PLANT` · `ANCESTRY != AUTHORITY`
