# BLACK FLAG 001 — A Release Must Return From Sea

**Status:** executable process-mortality witness  
**Date:** 2026-10-02  
**Depends on:** [RUNTIME BOOT 001](RUNTIME-BOOT-001.md)

## The cursed seam

BLACK FLAG kills the runtime at the most dangerous ordinary queue seam:

```text
WORK_CLAIMED
      ↓
LocalReceiver RECEIVE is durable
      ↓
signed receipt is published
      ↓
        X PROCESS KILLED HERE
      ↓
queue item has NOT moved to processed
```

After the kill, disk therefore contains an apparent contradiction:

- receiver history says the crossing was received;
- inbox still says the work is pending.

The runtime must reconstruct this without producing a duplicate receiver consequence.

## Voyage

The witness:

1. creates a world manifest and runtime root;
2. enqueues one signed crossing;
3. records an OPEN local road-memory observation;
4. launches the long-running runtime as a separate OS process;
5. waits until LocalReceiver RECEIVE is durable;
6. sends SIGKILL before queue commit;
7. reopens the runtime from disk;
8. proves the queue item is still pending;
9. proves the receiver already contains the crossing exactly once;
10. proves road-memory state survived;
11. pulses the orphaned queue item again;
12. receives the same signed receipt idempotently;
13. suppresses duplicate receipt publication;
14. commits the queue item processed;
15. lets the LocalReceiver independently REFUSE.

## Exactly-once consequence from at-least-once work

The queue is allowed to claim the same work twice across process death.

The receiver consequence is not.

Expected shape:

```text
WORK_CLAIMED × 2

RECEIVED receipt × 1

RECEIPT_REF_PUBLISHED × 1

WORK_COMMITTED × 1
```

Therefore:

```text
REPLAY != DUPLICATE CONSEQUENCE
QUEUE CLAIM != SEMANTIC EFFECT
```

## Mortality

The witness uses a real child process and SIGKILL.

No graceful shutdown hook repairs the queue before death.

```text
PROCESS DEATH != WORLD DEATH
RESTART != NEW HISTORY
PROCESS RESTART != MEMORY RESET
```

## Authority

Runtime reconstruction does not inherit admission.

After restart and queue completion:

```text
received = [crossing]
admitted = []
```

The receiver then independently chooses REFUSE.

```text
RUNTIME CONTINUITY != ADMISSION
```

## Release law

BLACK FLAG establishes the first runtime release gate:

```text
HAPPY PATH != RELEASE

A RELEASE MUST RETURN FROM SEA
WITH ITS RECEIPTS.
```

> **Kill the process. Keep the history. Finish the work. Do not invent authority.**
