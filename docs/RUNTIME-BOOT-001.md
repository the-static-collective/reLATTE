# RUNTIME BOOT 001 — A World That Can Wake Up

**Status:** executable local runtime shell  
**Date:** 2026-10-02

## Purpose

RUNTIME BOOT 001 composes previously proven reLATTE organs into one restartable local node.

A runtime root contains:

```text
world.rel.json
receiver/
road-memory/
runtime-receipt-bus.jsonl
inbox/
  pending/
  processed/
outbox/
  pending/
```

The runtime does not become the sovereign.

```text
RUNTIME != RECEIVER AUTHORITY
MANIFEST != WORLD
QUEUE != AUTHORITY
OBSERVABILITY != COMMAND
```

## World manifest

`world.rel.json` declares enough structure to reconstruct the runtime:

- world ID;
- receiver particular;
- receiver contract;
- enabled core organs;
- road-memory policy;
- pulse interval.

It deliberately forbids automatic semantic disposition:

```text
automatic_disposition = null
```

The runtime may verify and RECEIVE work.

It may not silently ADMIT it.

## Inbox

A valid signed crossing may be written into the durable inbox as:

```text
relatte.inbox-item/v0
```

The item has its own deterministic queue identity.

```text
ENQUEUED != RECEIVED
ENQUEUED != ADMITTED
```

## Runtime receipt bus

Runtime observations form an append-only hash chain.

The bus records:

- BOOT;
- INBOX_ENQUEUED;
- WORK_CLAIMED;
- RECEIPT_REF_PUBLISHED;
- WORK_COMMITTED.

The `RECEIPT_REF_PUBLISHED` event references the independently signed LocalReceiver receipt.

The bus does not replace it.

```text
RUNTIME EVENT != RECEIVER RECEIPT
RECEIPT BUS != AUTHORITY
```

## Pulse

One local pulse:

```text
pending inbox item
      ↓
WORK_CLAIMED
      ↓
LocalReceiver.receive()
      ↓
signed RECEIVED receipt
      ↓
publish receipt reference
      ↓
move pending → processed
      ↓
WORK_COMMITTED
```

No global clock or shared world state is introduced.

```text
PULSE != GLOBAL TICK
QUEUE COMPLETION != SEMANTIC CONSEQUENCE
```

## Long-running shell

`scripts/runtime-node-001.ts` boots an existing runtime and continuously pulses its inbox.

SIGTERM or SIGINT stops future pulses.

A killed process may leave pending work.

That is intentional: restart recovery is proved by BLACK FLAG 001.

> **A runtime may wake the organs. It may not become the sovereign.**
