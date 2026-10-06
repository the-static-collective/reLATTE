# Manga Parcel 001 — LemonPRESS crossing witness

**Status:** bounded executable witness  
**Date:** 2026-10-06

## Question

Can a creative manga incubation parcel cross reLATTE without teaching the substrate what manga is?

The donor is LemonPRESS. The source particular is one exact PNG from the National Treasure graphic-novel incubation field.

LemonPRESS defines the creative meaning:

- one immutable source raster;
- a five-page reversible issue plan;
- unborn print, narration, motion, music, and crawler descendants;
- a user-declared rights basis kept distinct from independent legal verification.

reLATTE receives only an ordinary `relatte.opaque-organ-spec/v0`.

## Crossing

```text
LemonPRESS MangaParcelV0
        ↓
generic opaque-organ adapter
        ↓
signed CrossingEnvelopeV0
        ↓
file transport
        ↓
LocalReceiver
        ↓
RECEIVED
        ↓
HOLD
```

The source-pixel address is:

```text
sha256:7531b551c433fe947658bb9731e9271a8636f1e3a5f57b41827c1925bed295ff
```

The issue-plan address is:

```text
sha256:6f4defc2b216064cd48153cf08c3429679d9a03791b6ca39f97a3129724eb27c
```

The parcel particular is:

```text
manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656
```

## Boundary

No manga-specific branch is added to:

- `src/organ.ts`
- `src/protocol.ts`
- `src/transport.ts`
- `src/receiver.ts`

The donor semantics remain opaque signed data.

The receiver may HOLD the parcel without altering the source, endorsing the rights declaration, or admitting any descendant.

```text
MANGA != SUBSTRATE SEMANTIC
SIGNED RIGHTS CLAIM != LEGAL DETERMINATION
RECEIVED != ADMITTED
HOLD != SOURCE MUTATION
DESCENDANT SLOT != DESCENDANT
```

## What the test proves

`test/manga-parcel.test.ts` proves that the exact source and plan addresses:

1. enter the existing generic opaque-organ adapter;
2. produce a verifiable signed crossing;
3. survive file transport unchanged;
4. reach a durable local receiver;
5. produce a signed RECEIVED receipt;
6. can be placed into HOLD by owner-local law.

This is deliberately a small crossing witness. Rendering pages, narration, motion, music, and publication remain LemonPRESS-side descendant work.
