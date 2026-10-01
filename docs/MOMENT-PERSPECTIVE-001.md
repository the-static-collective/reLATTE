# MOMENT / PERSPECTIVE 001

**Status:** bounded executable R8 witness  
**Date:** 2026-10-01

## Thesis

One stable event may support multiple signed observer accounts without any account rewriting the event or overwriting another account.

```text
SIGNED CROSSING X
      ↓
   MOMENT M
   /      \
  /        \
A account  B account
  \        /
   \      /
   set union
      ↓
both survive replay
```

## Moment

A Moment is a content-addressed anchor over the exact canonical signed crossing.

It binds:

- crossing ID;
- canonical-body SHA-256;
- exact canonical crossing body;
- source world;
- source particular;
- source timestamp.

It does not contain interpretations.

```text
MOMENT != PERSPECTIVE
CARRIER != ACCOUNT
```

## Perspective

A Perspective is an independently signed `R8_PERSPECTIVE` receipt.

It binds:

- Moment ID;
- source crossing ID;
- canonical-body SHA-256;
- observer world;
- observer particular;
- observer account;
- observer signature.

The account may contain assertions and uncertainties.

```text
SIGNED ACCOUNT != OBJECTIVE TRUTH
OBSERVATION != AUTHORITY
```

A Perspective has:

```text
semantic_effect = none
pre_state_ref = moment_id
post_state_ref = moment_id
```

Attaching an account does not mutate the Moment.

## Divergence

The executable specimen uses two accounts:

```text
A: "The return felt like closure."
B: "The return felt like a reopening."
```

Both are signed.

Both name the same Moment.

Neither is promoted to the authoritative reading.

## Synchronization

Each Perspective Replica stores the immutable Moment plus a set of signed Perspective receipts.

Synchronization is set-union:

```text
A has {PA}
B has {PB}

sync

A has {PA, PB}
B has {PA, PB}
```

No field named current, winner, truth, or canonical perspective exists.

Duplicate synchronization is idempotent.

```text
SYNC != OVERWRITE
PERSPECTIVE SET != CONSENSUS
REPLAY != LAST WRITE WINS
```

## Replay

A replica restart:

1. verifies its Moment;
2. verifies every stored Perspective signature;
3. verifies every account still points to the same Moment and carrier hash;
4. reconstructs the complete immutable perspective set.

Divergent accounts survive restart.

## Carrier protection

A Perspective cannot rewrite:

- crossing ID;
- source world;
- source particular;
- canonical carrier body;
- canonical-body hash;
- Moment ID.

Mutating the signed account fails Perspective verification.

Mutating the Moment carrier fails Moment verification.

A Perspective from Moment A cannot be replayed onto Moment B.

```text
PERSPECTIVE != CARRIER MUTATION
ACCOUNT != RETCON
```

## What this earns

At the current envelope level, this satisfies the R8 proof:

- two observers attach divergent accounts;
- sync preserves both;
- replay preserves both;
- there is no last-write-wins semantic collapse;
- neither account mutates source carrier identity.

## What it does not earn

This does not claim:

- objective truth adjudication;
- consensus;
- identity verification beyond signing-key continuity;
- moderation policy;
- causal ordering between perspectives;
- private/encrypted perspectives;
- social reputation;
- R9 field semantics.

## Laws

```text
MOMENT != PERSPECTIVE
PERSPECTIVE != TRUTH
SIGNED != TRUE
DIVERGENCE != OVERWRITE
SYNC != CONSENSUS
REPLAY != LAST WRITE WINS
PERSPECTIVE != CARRIER MUTATION
ACCOUNT != RETCON
```
