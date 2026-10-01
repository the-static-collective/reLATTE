# Local Receiver 001 — R3 Durability Plan

## Goal

Earn the explicit R3 proof with a bounded durable local receiver.

## Required behavior

- verify signed crossing before local history;
- RECEIVE with semantic_effect=none;
- HOLD / ADMIT / REFUSE / RETURN as distinct dispositions;
- signed receiver receipts;
- refused payload has no protected semantic effect;
- duplicate RECEIVE is idempotent;
- duplicate same disposition is idempotent;
- conflicting second disposition fails;
- local state reconstructs by replay after restart;
- receiver signing identity persists across restart;
- journal tampering fails replay.

## Storage shape

```text
receiver.json
receiver-key.json
journal.jsonl
```

The journal is append-only and hash-chained.

Derived state is not an authority file.

## Stop condition

Do not implement R4 networking, generalized capability enforcement, payload resolution, or production key custody here.
