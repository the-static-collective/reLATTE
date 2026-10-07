# PAPERCHAIN-SEED-VAULT-001 — Executable Seed Capsule + GERMINATION-002 + Fatherhand Gate

**Scope:** experimental donor profile exercising existing reLATTE primitives with a bounded TranchNode/Fatherhand capacity witness. Not a new chain, token, universal registry or release authority. LemonPRESS owns creative donor meaning; TranchNode/Fatherhand evaluates bounded delegated capacity; reLATTE witnesses crossings, local dispositions, lineage and byte custody.

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

## Slice B — Fatherhand capacity witness

Before germination, TranchNode's Fatherhand bridge must evaluate the exact proposed PLANT act.

Its fixed required act is:

```text
capability = paperchain.plant
purpose    = purpose:paperchain:germination
scope      = [seed_id, held_seed_crossing_id]
```

In the TranchNode `experiment/fatherhand-grant-chain-001` branch, prepare a request conforming to:

```text
tranchnode/fatherhand-paperchain-plant-request/v0.1
```

whose `seedId` and `heldCrossingId` exactly match the reLATTE seed witness. Then:

```bash
npm run fatherhand-paperchain-plant -- /absolute/path/request.json \
  > /tmp/fatherhand-paperchain-plant-witness.json
```

The emitted witness is deterministic validation evidence. Current FATHERHAND-001 does **not** yet provide cryptographic grant seals/signature verification. reLATTE therefore binds the exact raw witness bytes by SHA-256 and checks its bounded semantics, but does not claim cryptographic authenticity for the Fatherhand witness.

```text
CAPACITY != CONSENT
VALIDATION != ACTIVATION
FATHERHAND VALIDATION != RELATTE ADMISSION
```

## Slice C — GERMINATION-002

Germination requires **both** the bounded capacity witness and a separate literal operator action:

```bash
node --experimental-strip-types scripts/paperchain-plant.mjs \
  /tmp/paperchain-seed-vault-001 \
  /tmp/paperchain-germination-002 \
  PLANT \
  /tmp/fatherhand-paperchain-plant-witness.json
```

Anything except the exact literal `PLANT` fails before a new garden is created. Missing, invalid, rebound, capability-mismatched, scope-mismatched or purpose-mismatched Fatherhand evidence also fails before the garden exists.

The composition is:

```text
VERIFIED HELD SEED
      |
      +----------------------+
      |                      |
      v                      v
literal PLANT          FATHERHAND WITNESS
local choice           bounded capacity
      |                      |
      +----------+-----------+
                 v
       FRESH PLANTING CROSSING
       parent = held seed crossing
       capability_ref = sha256(exact Fatherhand witness bytes)
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
                 |
                 v
       DETERMINISTIC SVG SEEDLING
                 |
                 v
       FRESH R10 DESCENDANT CROSSING
                 |
                 v
         NURSERY RECEIVE -> HOLD
                 |
                 v
       EXACT CHILD BYTES VERIFIED
                 |
                 v
             COLD REPLAY
```

The generated SVG is intentionally small enough for current exact-byte custody. It is a fresh visual descendant, not a replacement for the manga source pixels.

## Why HOLD does not become ADMIT

The current LocalReceiver records one durable local disposition per crossing. GERMINATION-002 therefore does **not** mutate an earlier HOLD into ADMIT.

Instead:

```text
held source crossing
      !=
fresh planting crossing
```

The PLANT crossing is a new signed consequential act whose parent is the held seed crossing. The garden may admit that fresh act while the seedbank's prior HOLD remains historically true.

## Why Fatherhand does not become reLATTE authority

The crossing records:

- the SHA-256 of the exact Fatherhand witness bytes in `capability_ref`;
- Fatherhand ID;
- terminal grant ID;
- evaluator version;
- exact capability, scope and purpose;
- `inherited_authority = false`.

But receiver-local admission remains a separate reLATTE occurrence.

```text
CAPACITY != CONSENT
CONSENT != CAPACITY
VALIDATION != ACTIVATION
FATHERHAND VALIDATION != RELATTE ADMISSION
```

TranchNode validates the grant chain. reLATTE does not duplicate that evaluator.

## Verification gates

The repository test suite verifies:

- exact literal PLANT is required;
- a Fatherhand witness is required;
- Fatherhand witness must bind the exact seed and held crossing;
- required capability must be exactly `paperchain.plant`;
- required purpose must be exactly `purpose:paperchain:germination`;
- validation must be `valid`, with no failures or unresolved uncertainties;
- validation scope must match the same exact seed and crossing;
- exact Fatherhand witness bytes are hashed and bound into the signed PLANT crossing;
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
- cryptographic authenticity/signature verification for the current Fatherhand witness;
- remote peer-to-peer network delivery;
- human/legal identity from signing keys or Fatherhand IDs;
- publication or canonical status;
- fitness, quality or recommendation of the descendant;
- a webZ browser PLANT control;
- LemonPRESS owner adoption of this experimental donor profile.

Large media should gain a separately reviewed chunked or destination-retrieval custody profile rather than weakening current byte bounds. Fatherhand can later replace raw deterministic witness binding with a signed/canonical grant receipt without changing the core separation of roles.

`SEED != KEY` · `SOURCE IMAGE REF != SOURCE IMAGE CUSTODY` · `HOLD != PLANT` · `CAPACITY != CONSENT` · `CONSENT != CAPACITY` · `ANCESTRY != AUTHORITY` · `DESCENDANT != ANCESTOR`
