# External Checkpoint 001 — R11 Plan

## Goal

Earn R11 by committing a deterministic local receipt-set root to a separate Git repository while preserving full local independence.

## Required proof

- build durable local receiver history;
- collect signed local receipts;
- verify every receipt before root construction;
- require all receipts to belong to the declared local world;
- sort receipt IDs before root construction;
- bind receipt-set root to local history head;
- keep commitment format witness-neutral;
- initialize a separate Git witness repository;
- commit exact canonical commitment object;
- return foreign witness metadata with semantic_effect=none and authority=null;
- independently verify Git commit/path/object hash;
- prove Git witness verification does not validate receipt bodies;
- mutate a receipt copy: local set verification fails while foreign commitment verification remains true;
- delete foreign Git repository;
- reopen local receiver from its own journal;
- verify old commitment locally;
- continue local RECEIVE/ADMIT without foreign service.

## Non-collapses

```text
COMMITMENT != HISTORY
CHECKPOINT != HISTORY VERIFICATION
CHECKPOINT != AUTHORITY
FOREIGN WITNESS != LOCAL LIVENESS
GIT COMMIT != GLOBAL CANON
```

## Stop condition

Do not add blockchain consensus, timestamp-oracle claims, transparency-log inclusion, multi-witness quorum, remote GitHub dependency, or R12 succession semantics.
