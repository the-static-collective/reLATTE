# LOCAL RECEIVER 001

**Status:** bounded durable R3 witness  
**Date:** 2026-10-01

## Thesis

Local Receiver 001 turns reLATTE's synthetic disposition examples into a durable owner-local interior.

It implements:

```text
SIGNED CROSSING
      ↓
VERIFY
      ↓
RECEIVE
      ↓
signed RECEIVE receipt
      ↓
HOLD / ADMIT / REFUSE / RETURN
      ↓
signed disposition receipt
      ↓
append-only local journal
      ↓
restart replay
```

The receiver stores its own local history in an append-only hash-chained JSONL journal.

It does not trust a mutable state snapshot as authority.

State is reconstructed by replay.

## Laws

```text
RECEIVED != ADMITTED
RECEIPT != ADMISSION
HOLD != ADMIT
REFUSE != DELETE
RETURN != TRANSFER OF AUTHORITY
DUPLICATE DELIVERY != NEW EVENT
RESTART != NEW HISTORY
LOCAL JOURNAL != GLOBAL STATE
```

## Durable identity

A receiver owns a local P-256 signing key.

The specimen persists the key locally with restricted file permissions so the same receiver can sign receipts after restart.

The committed repository contains no private receiver key.

```text
KEY CONTINUITY != HUMAN IDENTITY
LOCAL KEY != GLOBAL AUTHORITY
```

## Journal

Each event binds:

- monotonically increasing sequence;
- previous local event hash;
- event type;
- crossing ID;
- original crossing for RECEIVE events;
- signed receiver receipt;
- timestamp.

The event itself receives a domain-separated SHA-256 address.

On restart, replay verifies:

1. event sequence;
2. previous-hash chain;
3. event hash;
4. signed receipt;
5. signed crossing on RECEIVE;
6. RECEIVE precedes disposition;
7. a crossing receives at most one disposition event.

Tampering fails reconstruction.

## RECEIVE

A valid signed crossing may enter local history.

RECEIVE emits:

```text
kind = RECEIVED
semantic_effect = none
```

Receiving a crossing does not admit it.

A duplicate delivery of the same valid crossing ID returns the original RECEIVE receipt and appends no new event.

## Dispositions

### HOLD

```text
kind = R3_HOLD
semantic_effect = none
```

### ADMIT

```text
kind = R3_ADMIT
semantic_effect = receiver-selected effect
```

ADMIT is the only disposition in this specimen that marks protected payload effect as true.

### REFUSE

```text
kind = R3_REFUSE
semantic_effect = none
protected_payload_effect = false
```

The payload remains attributable in history without acquiring admitted semantic effect.

### RETURN

```text
kind = R3_RETURN
semantic_effect = return-created
protected_payload_effect = false
```

Return is an owner-local response, not an authority transfer.

## Idempotence

Duplicate RECEIVE:

- returns the original signed RECEIVE receipt;
- adds no journal event.

Repeating the same disposition:

- returns the original signed disposition receipt;
- adds no journal event.

Attempting a conflicting second disposition fails.

```text
IDEMPOTENCE != REDECISION
```

## Restart proof

The executable test:

1. creates a receiver;
2. receives crossings;
3. admits one and refuses one;
4. records the pre-restart snapshot and history head;
5. destroys the in-memory receiver instance;
6. opens the receiver from disk;
7. replays and verifies the journal;
8. obtains the identical derived state;
9. confirms duplicate delivery remains idempotent after restart;
10. confirms the receiver retains signing-key continuity.

## What this earns

This specimen satisfies the explicit R3 receiver requirements at the current envelope level:

- receipt does not imply admission;
- refused payload has no protected semantic effect;
- duplicate delivery is idempotent;
- local state reconstructs after restart;
- HOLD / ADMIT / REFUSE / RETURN are distinct signed dispositions.

## What it does not earn

Local Receiver 001 does not resolve the still-open R1 questions around payload-address resolution or parent-ancestry validation.

It also does not prove:

- multi-process locking;
- crash-atomic journal writes;
- encrypted key custody;
- network transport;
- capability enforcement;
- production-grade storage;
- R4 two-node operation.

Those remain later pressure.
