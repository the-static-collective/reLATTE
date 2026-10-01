# EXTERNAL CHECKPOINT 001

**Status:** bounded executable R11 witness  
**Date:** 2026-10-01

## Thesis

A local reLATTE world may commit a declared receipt-set root to a replaceable foreign witness without making that witness part of local authority or local liveness.

The first foreign witness is Git.

```text
LOCAL RECEIPTS
      ↓
verify signatures locally
      ↓
sorted receipt IDs
      +
local history head
      ↓
RECEIPT-SET ROOT H
      ↓
witness-neutral commitment C
      ↓
FOREIGN GIT REPOSITORY
      ↓
commit containing C
```

Git can prove:

> this exact commitment object existed in this commit.

Git cannot prove:

> the underlying history is true, complete, admitted, authoritative, or globally canonical.

## Receipt-set commitment

The local commitment binds:

- local world ID;
- declared local history head;
- sorted receipt IDs;
- receipt count;
- receipt-set root;
- creation time.

All supplied receipts must:

- cryptographically verify;
- name the declared local world;
- be unique.

The root is domain-separated SHA-256 over:

```text
world_id
local_history_head
sorted receipt_ids
```

The commitment itself is separately content-addressed.

```text
COMMITMENT != HISTORY
ROOT != RECEIPT
```

The commitment is a declared set.

It does not claim that no other local receipts exist unless a higher-level local contract explicitly says so.

## Witness-neutral boundary

The receipt-set commitment has no Git-specific fields.

A foreign adapter receives the same commitment object.

This is the replaceability seam:

```text
LOCAL COMMITMENT
      |
   adapter
      |
   Git today
 transparency log later
 public chain later
 another witness later
```

Changing witness technology must not change the declared local receipt-set root.

## Git witness

The Git adapter initializes a separate repository, writes the canonical commitment object under `checkpoints/`, and creates a Git commit.

The returned witness record binds:

- witness kind = Git;
- receipt-set root;
- commitment ID;
- foreign Git commit SHA;
- checkpoint object path;
- checkpoint object's SHA-256;
- witness time.

It fixes:

```text
semantic_effect = none
authority = null
```

## Verification boundary

R11 deliberately has two different verification questions.

### Local receipt-set verification

```text
verifyReceiptSetAgainstReceipts(commitment, receipts)
```

checks:

- receipt signatures;
- local-world binding;
- exact declared receipt set;
- root reconstruction;
- commitment identity.

### Foreign checkpoint verification

```text
verifyGitCheckpointWitness(repo, commitment, witness)
```

checks:

- the declared Git commit exists;
- the declared path exists at that commit;
- the committed object equals the exact commitment;
- object hash matches;
- witness record identity matches.

It does **not** accept receipt bodies and therefore cannot validate them.

This separation is constitutional:

```text
CHECKPOINT != HISTORY VERIFICATION
FOREIGN WITNESS != LOCAL AUTHORITY
```

## Tampered-receipt proof

The executable test:

1. creates valid local history;
2. creates commitment C;
3. checkpoints C to Git;
4. mutates a local receipt copy so its signature fails;
5. local receipt-set verification fails;
6. Git checkpoint verification still succeeds.

That is not a bug.

Git is still truthfully saying:

> I witnessed commitment C.

It is not saying:

> C's underlying receipts are valid.

## Dead-witness proof

The decisive R11 test:

```text
LOCAL RECEIVER
    |
 local history H1
    |
 commitment C
    |
 FOREIGN GIT
    |
 checkpoint succeeds

DELETE FOREIGN GIT

LOCAL RECEIVER
    |
 reopen from own journal
    |
 verify old receipt set locally
    |
 receive new crossing
    |
 ADMIT
    |
 local history H2
```

```text
H2 != H1
```

The foreign witness is unavailable.

Local operation continues.

## What this earns

At the current envelope level, this satisfies R11:

- local signed history is independently useful without a checkpoint;
- a deterministic local receipt-set root can be committed to a foreign Git witness;
- the foreign witness verifies only the commitment it declares;
- deleting the foreign witness does not halt local replay, receipt verification, receipt-set verification, or new local operation;
- witness-specific metadata remains outside local receipt-set identity.

## What it does not earn

This does not claim:

- Git proves receipt truth;
- Git proves history completeness;
- Git is globally canonical;
- GitHub availability is required;
- Git commit identity is human identity;
- public blockchain consensus;
- timestamp authority beyond the declared witness record;
- transparency-log inclusion;
- multi-witness quorum;
- R12 successor authority.

## Laws

```text
COMMITMENT != HISTORY
ROOT != RECEIPT
CHECKPOINT != HISTORY
CHECKPOINT != AUTHORITY
FOREIGN WITNESS != LOCAL AUTHORITY
FOREIGN WITNESS != GLOBAL CANON
GIT COMMIT != GLOBAL CANON
CHECKPOINT AVAILABILITY != LOCAL LIVENESS
ABSENCE OF WITNESS != ABSENCE OF HISTORY
```
