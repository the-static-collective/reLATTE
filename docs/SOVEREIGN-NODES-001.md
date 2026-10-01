# SOVEREIGN NODES 001

**Status:** bounded executable R4/R5 witness  
**Date:** 2026-10-01

## Thesis

Sovereign Nodes 001 proves that one source crossing can be independently encountered by durable local receivers without a shared mutable database.

```text
NODE A
  signs one crossing
        |
        +------------------+
        |                  |
        v                  v
     NODE B             NODE C
  own key/journal     own key/journal
        |                  |
      ADMIT              REFUSE
        |                  |
 signed response      signed response
        \                  /
         \                /
          +----> NODE A <---+
             verifies both
```

No receiver consults another receiver's state.

The source verifies returned receipts from the signed material itself.

## R4 proof

The first test performs:

1. A creates and signs a crossing.
2. B verifies and RECEIVE-records it.
3. B emits its own signed RECEIVE receipt.
4. B makes an owner-local ADMIT decision.
5. B emits its own signed disposition receipt.
6. B packages both receipts into a Sovereign Response Bundle.
7. A independently verifies the bundle and reads B's local outcome.

```text
SOURCE SIGNATURE != RECEIVER AUTHORITY
RECEIVER RESPONSE != SHARED DATABASE
VERIFICATION != AGREEMENT
```

## R5 proof

The same exact crossing ID is delivered to B and C.

B:

```text
RECEIVED
  -> R3_ADMIT
  -> node-b-local-descendant
```

C:

```text
RECEIVED
  -> R3_REFUSE
  -> semantic_effect = none
```

Both responses verify.

Both remain true after receiver restart.

B and C have:

- different world IDs;
- different receiver particulars;
- different signing keys;
- different journal histories;
- different local state references;
- different response bundle IDs.

No global reconciliation chooses one outcome over the other.

```text
SAME CROSSING != SAME CONSEQUENCE
DIVERGENCE != CONFLICT
LOCAL VALIDITY != GLOBAL CONSENSUS
```

## Sovereign Response Bundle

A response bundle contains:

- crossing ID;
- receiver world;
- receiver particular;
- signed RECEIVE receipt;
- signed disposition receipt;
- non-authority laws.

The bundle itself does not become a third authority layer.

Verification checks:

- both embedded receipts cryptographically verify;
- both receipts name the same crossing;
- both receipts name the declared receiver world and particular;
- RECEIVE really is RECEIVE;
- disposition is an R3 disposition;
- disposition explicitly cites the RECEIVE receipt it follows;
- the bundle's own content address matches its contents.

```text
BUNDLE != RECEIPT
BUNDLE != NEW AUTHORITY
```

## Independent history

The proof uses two separate Local Receiver roots.

Each receiver:

- owns its own persisted P-256 key;
- owns its own hash-chained journal;
- reconstructs independently after restart;
- can return the same response bundle after replay.

The source does not read either journal to verify the response.

This is the important property:

> **Shared crossing identity does not require shared mutable state.**

## Hostile proof

The verifier rejects:

- a bundle relabeled as another world;
- a B RECEIVE receipt cross-wired with a C disposition;
- a disposition mutated after signing;
- a valid response presented as if it belonged to another crossing.

## What this earns

At the current envelope level, this bounded witness earns the stated R4 proof and the decisive R5 divergent-receiver proof:

```text
A signs and sends
B verifies
B decides locally
B signs response
A verifies response

same crossing
  -> B ADMIT
  -> C REFUSE
```

Neither receiver requires shared mutable storage.

## What it does not earn

This specimen does not claim:

- real network transport;
- transport replacement;
- peer discovery;
- authenticated network endpoints;
- R1 payload resolution;
- R1 parent validation;
- production key custody;
- Byzantine consensus;
- R6 completion.

The current test hands the same in-memory signed envelope to independent receivers.

That is sufficient for R4/R5 semantics, not R6 transport.
