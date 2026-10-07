# PAPERCHAIN-SEED-VAULT-001 — Executable Seed Capsule + GERMINATION-002

**Scope:** experimental donor profile exercising existing reLATTE primitives. Not a new chain, token, universal registry or release authority. LemonPRESS owns the creative donor meaning; reLATTE witnesses opaque crossings, local dispositions, lineage and byte custody.

## Slice A — held seed capsule

Run with the actual source PNG and manuscript:

```bash
node --experimental-strip-types scripts/paperchain-seed-vault.mjs \
  /absolute/path/the_seed_vault_music_takes_root.png \
  "/absolute/path/The Autodiscography - The Seed.txt" \
  /tmp/paperchain-seed-vault-001
```

The output root must not already exist.

```text
SOURCE PNG + MANUSCRIPT
        |
        +-- raw source bytes remain source-local
        v
CONTENT-ADDRESSED SEED MANIFEST (<64 KiB)
        |
        v
P-256 SIGNED reLATTE CROSSING
        |
        v
RECEIVE -> HOLD
        |
        v
SEPARATE DESTINATION PROCESS
verifies exact manifest bytes
        |
        v
PAYLOAD_BYTES_VERIFIED
        |
        v
COLD REPLAY
```

The source PNG itself is not claimed as destination-custodied material. Current WEBZ-003 custody is bounded to 64 KiB; the generated manga page is materially larger. The manifest therefore names the source image and manuscript digests without pretending their full bytes crossed.

## Slice B — GERMINATION-002

Germination requires a separate literal operator action:

```bash
node --experimental-strip-types scripts/paperchain-plant.mjs \
  /tmp/paperchain-seed-vault-001 \
  /tmp/paperchain-germination-002 \
  PLANT
```

Anything except the exact literal `PLANT` fails before a new garden is created.

The flow is:

```text
VERIFIED HELD SEED
      |
      | explicit PLANT
      v
FRESH PLANTING CROSSING
parents = [held seed crossing]
      |
      v
GARDEN RECEIVE
      |
      v
LOCAL ADMIT
      |
      v
FIELD PROJECTION
context only; no authority
      |
      v
OWNER-LOCAL CULTURAL UPTAKE
explicit preserved / varied / introduced / retired
      |
      v
DETERMINISTIC SVG SEEDLING BYTES
      |
      v
FRESH R10 CULTURAL DESCENDANT CROSSING
      |
      v
NURSERY RECEIVE -> HOLD
      |
      v
EXACT CHILD BYTES VERIFIED + RETAINED
      |
      v
COLD REPLAY
```

The generated SVG is intentionally small enough for current exact-byte custody. It is a fresh visual descendant, not a replacement for the manga source pixels. Its lineage names the admitted planting crossing and preserves the held seed ancestry.

## Why HOLD does not become ADMIT

The current LocalReceiver records one durable local disposition per crossing. GERMINATION-002 therefore does **not** mutate an earlier HOLD into ADMIT.

Instead:

```text
held source crossing
      !=
fresh planting crossing
```

The explicit PLANT action creates a new signed consequential crossing. The garden may admit that fresh act while the seedbank's prior HOLD remains historically true.

This keeps the important law executable:

> **HOLD != PLANT**

## Verification gates

The repository test suite verifies:

- exact literal PLANT is required;
- held parent crossing and held manifest custody must verify first;
- changed manifest blocks planting;
- planting crossing has the held seed crossing as parent;
- garden produces a signed R3_ADMIT receipt;
- field projection has no authorization or recommendation power;
- cultural uptake declares its variation explicitly;
- descendant crossing is freshly signed and verifies as R10 lineage;
- descendant payload digest matches the actual generated SVG bytes;
- another world receives the child as a fresh candidate;
- nursery HOLD does not imply ADMIT;
- separate-process WEBZ-003 custody reads, hashes and retains exact child bytes;
- cold replay reconstructs the same nursery custody.

## Still unearned

This work does **not** prove:

- full original PNG byte custody at the receiving seedbank;
- remote peer-to-peer network delivery;
- human/legal identity from signing keys;
- publication or canonical status;
- fitness, quality or recommendation of the descendant;
- a webZ browser PLANT control;
- LemonPRESS owner adoption of this experimental donor profile.

Large media should gain a separately reviewed chunked or destination-retrieval custody profile rather than weakening current byte bounds.

`SEED != KEY` · `SOURCE IMAGE REF != SOURCE IMAGE CUSTODY` · `HOLD != PLANT` · `ANCESTRY != AUTHORITY` · `DESCENDANT != ANCESTOR`
