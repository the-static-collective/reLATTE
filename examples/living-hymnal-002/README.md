# Living Hymnal 002 — The Song Crosses, the Church Decides

**Status:** bounded experimental interoperability witness. No church account, Suno session, Tithely API, real contributor material, or deployable service is involved.

**Source:** Static Live draft [Living Hymnal 001](https://github.com/the-static-collective/static-live/pull/38), `toRelatteExportBundle(song)`.

## What is proved

This demonstration accepts a public **text-only** Living Hymnal bundle containing:

- `payload_text`: the exact UTF-8 JSON bytes of a published song projection with *only* `id`, `title`, `lyrics`, `scriptureRef`, `bpm`, and `meter`;
- `spec`: Static Live's `relatte.opaque-organ-spec/v0`, matching its `sha256:` content reference, scoped release assertions, and an explicitly null cryptographic source history head;
- `schema`: `living-hymnal.relatte-export/v0.1`.

The edge adapter checks the exact payload digest, rejects additional private fields, and requires explicit **interchurch lyric-sharing** claims. It then uses **unchanged reLATTE core** functions to produce a genuinely signed crossing.

A test sends that crossing through real reLATTE file transport and independent local receivers:

```text
Static Live published song + opt-in share clearance
                │
       public lyric payload bytes
                │
       exact sha256 payload reference
                │
    reLATTE opaque organ SEAL (signed)
                │
        file transport / verification
                │
       ┌────────┴─────────┐
  Church B             Church C
  receives             receives
  independently ADMIT  independently REFUSE
       │                    │
    local receipt        local receipt
       └────────┬───────────┘
             restart/replay
```

**Neither church inherits the source church's admission.** A signed assertion is not an identity credential or evidence of copyright ownership, pastoral authorization or verified contributor permission.

## Verification

```sh
npm ci
npm run verify
node --test --experimental-strip-types test/living-hymnal-002.test.ts
```

The proof exercises signature verification, frame verification and file-bundle readback, idempotent receipt, independent local decisions, restart replay, payload tamper rejection, unexpected private field rejection, unlicensed-claim refusal and signed-claim tamper rejection.

## Important boundaries

- **The receiving application must verify the payload digest and local release policy before an import or reuse decision.** The general reLATTE receiver verifies the crossing signature, not application-specific license validity.
- The source's `source_history_head` remains **null**: Living Hymnal has a local append-only journal, not a reLATTE-verifiable historical chain. Inventing a signed history root would be misleading.
- reLATTE only carries the **text projection**. It does not carry personal seed submissions, consent-document references, stems, mixes, MIDI, click tracks, images, or rights to a recording.
- The authored `donor_claims` indicate that a reviewer recorded permissions, but they are **claims**, not objective proof. For real use, enforce church-held contributor licenses and record downstream restrictions.
- Example generated keys are ephemeral. Production key custody, church identity trust anchors, payload storage, delivery and local identity/permission verification are not implemented.
- Incoming ADMIT is a **synthetic test decision**, not a pastor's approval or permission to sing at a real church.
- The generic substrate in `src/` contains no references to hymns, worship, churches or Tithely. This edge contract lives strictly under `examples/`.

## Next

In a controlled approved field trial, export the bundle JSON from a real *licensed* Living Hymnal test account and verify the same song in two independent receivers. Then add source key custody, scoped distribution licenses and specific recipient church policy checks. Never treat an outside church's signed crossing as authorized local publication.

**PORTABILITY != AUTHORITY TRANSFER.** **LICENSE CLAIM != PROVEN LICENSE.**
