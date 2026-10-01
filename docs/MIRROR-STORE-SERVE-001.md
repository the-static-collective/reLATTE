# MIRROR / STORE / SERVE 001

**Status:** bounded executable R7 witness  
**Date:** 2026-10-01

## Thesis

A crossing can outlive its source without a mirror becoming the source.

R7 separates four claims that are often collapsed:

```text
PUBLISHED
STORED
SERVED
RECEIVED
```

Each claim has a different actor and different evidentiary meaning.

```text
PUBLISHED != STORED
STORED    != SERVED
SERVED    != RECEIVED
MIRROR    != SOURCE
```

## Claim grammar

### PUBLISHED

The source signs a `R7_PUBLISHED` receipt for its already-signed crossing.

The publication claim:

- names the source world and particular from the crossing;
- has `semantic_effect = none`;
- must be signed by the same key that signed the crossing.

It proves a source-key publication declaration.

It does not prove independent retention, serving, or receipt.

### STORED

A mirror independently retains the canonical signed crossing and the source's publication receipt.

The mirror signs a `R7_STORED` receipt naming:

- crossing ID;
- mirror world and particular;
- content-addressed mirror object;
- canonical-body SHA-256;
- source PUBLISHED receipt ID.

The stored object is canonical JCS JSON of the complete signed crossing.

```text
STORED != OWNED
STORED != PUBLISHED
MIRROR COPY != SOURCE MUTATION
```

### SERVED

A mirror can later reconstruct its retained object, verify the crossing, publication receipt, and storage receipt, then emit a fresh `R7_SERVED` receipt.

The serve receipt points back to the exact stored receipt and object.

Serving does not alter the crossing's source fields.

```text
SERVE != PUBLISH
SERVE != RECEIVE
SERVE != ADMIT
```

### RECEIVED

A Local Receiver may then receive the served crossing.

That existing signed receipt remains:

```text
kind = RECEIVED
semantic_effect = none
```

The mirror never manufactures a RECEIVE receipt on behalf of a destination.

## Independent mirrors

The executable witness creates two separate mirrors, B and C.

Both retain the same canonical crossing object.

Therefore:

```text
B.object_id == C.object_id
B.crossing_id == C.crossing_id
```

But:

```text
B.STORED receipt != C.STORED receipt
B.signing key     != C.signing key
B.local world     != C.local world
```

Shared object identity does not collapse independent retention claims.

## Dead-source proof

The decisive test performs:

```text
SOURCE A
  signs crossing X
  signs PUBLISHED(X)
      |
      +-------> MIRROR B stores X
      |
      +-------> MIRROR C stores X

DELETE SOURCE A
DELETE MIRROR B

MIRROR C survives
      |
      v
reopen C from disk
verify retained object
verify source PUBLISHED receipt
verify C STORED receipt
reconstruct original signed X
      |
      v
C signs SERVED(X)
      |
      v
fresh receiver D
      |
      v
D signs RECEIVED(X)
```

The reconstructed crossing still says:

```text
source_world = world:r7-source
source_particular = particular:r7-source
```

The surviving mirror's SERVED receipt says:

```text
world_id = world:r7-mirror-c
receiver_particular = particular:r7-mirror-c
```

The road survives the source.

The mirror does not inherit the source's crown.

## Durable mirror shape

Each mirror owns:

```text
mirror.json
mirror-key.json
records/
serve-claims.jsonl
```

A retained record contains:

- content-addressed canonical crossing object;
- source PUBLISHED receipt;
- mirror STORED receipt.

On reopen, the mirror verifies every retained record before becoming usable.

Mirror STORED receipts must verify under the mirror's persisted local key.

## Mirror object identity

The object address is derived only from the canonical signed crossing body:

```text
relatte-mirror-object-v0:
  SHA256(JCS(signed_crossing))
```

Two honest mirrors retaining the same crossing therefore converge on the same object address without sharing mutable state.

Their claims about that object remain distinct.

## Hostile proof

The test suite rejects or detects:

- source PUBLISHED claim signed by a different key;
- canonical retained body modified after storage;
- retained body hash mismatch;
- invalid source publication receipt;
- invalid mirror storage receipt;
- mirror storage receipt not linked to the retained object;
- mirror storage receipt not linked to the source publication receipt;
- STORED and SERVED claims signed by different mirror keys;
- serve bundle whose object linkage no longer closes.

## What this earns

At the current envelope level, this earns the stated R7 proof:

> A dead source node can be reconstructed from independently retained addressed artifacts and receipts.

More precisely, the source's signed crossing can be reconstructed and verified after the source disappears.

A surviving mirror can prove:

```text
source said PUBLISHED
mirror independently STORED
mirror later SERVED
receiver later RECEIVED
```

without collapsing those claims into one another.

## What it does not earn

This does not yet prove:

- reconstruction of an entire dead source node's private local journal;
- recovery of lost source private keys;
- source authority continuation;
- distributed erasure coding;
- quorum durability;
- remote mirror discovery;
- Internet-scale serving;
- legal archival rights;
- R12 successor authority.

R7 preserves attributable artifacts and claims.

It does not resurrect source sovereignty.

## Laws

```text
PUBLISHED != STORED
STORED != SERVED
SERVED != RECEIVED
MIRROR != SOURCE
COPY != AUTHORITY
RETENTION != OWNERSHIP
RECONSTRUCTION != SUCCESSION
SOURCE DEATH != ARTIFACT DEATH
```
