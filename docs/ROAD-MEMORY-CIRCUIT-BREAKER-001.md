# ROAD MEMORY / CIRCUIT BREAKER 001 — Local Memory Is Not Global Reputation

**Status:** executable local transport-memory witness  
**Date:** 2026-10-02  
**Depends on:** [AUTOMATIC FAILOVER 001](AUTOMATIC-FAILOVER-001.md)

## Question

Can one local reLATTE node remember that a discovered road recently failed, stop hammering it during a cooldown, later probe it again, and restore it to service after recovery — without mutating the DID advertisement, inventing global reputation, changing crossing identity, or transferring receiver authority?

ROAD MEMORY / CIRCUIT BREAKER 001 makes that behavior executable.

```text
DWN A fails
   |
   v
local availability observation
   |
   v
OPEN circuit
   |
   +--> future local request: SKIP_OPEN
   |
cooldown expires
   |
   v
HALF_OPEN probe
   |
   +--> success
          |
          v
       CLOSED
```

## Memory is local

The road-memory store is a durable, append-only, hash-chained local journal.

It records only this node's observations.

It does not write back into the DID document and does not claim that another observer should make the same routing decision.

```text
LOCAL ROAD MEMORY != GLOBAL REPUTATION
LOCAL OBSERVATION != NETWORK FACT
CIRCUIT STATE != DID STATE
```

The memory is keyed by the stable reLATTE road candidate identity.

## Circuit states

### CLOSED

The road may be attempted normally.

```text
CLOSED
  ↓
ATTEMPT
```

### OPEN

Enough local availability failures have crossed the configured threshold.

The road remains in history and discovery, but local policy temporarily skips it until the declared cooldown deadline.

```text
OPEN
  ↓
SKIP_OPEN
```

Therefore:

```text
SKIP != ERASURE
OPEN != PERMANENTLY DEAD
```

### HALF_OPEN

Once the cooldown has elapsed, the next local decision becomes an explicit probe.

```text
HALF_OPEN
  ↓
PROBE_HALF_OPEN
```

A successful probe records a success event and returns the local circuit to CLOSED.

```text
PROBE != TRUST
SUCCESSFUL PROBE != GLOBAL HEALTH
```

## Availability memory is not integrity memory

Only explicit availability failure classes are allowed to affect the breaker:

- `TRANSPORT_UNREACHABLE`
- `REMOTE_HTTP_UNAVAILABLE`

Authorization failure, protocol mismatch, malformed data, cryptographic failure, and crossing-identity drift are not allowed to poison the availability circuit.

```text
AVAILABILITY FAILURE != INTEGRITY FAILURE
AUTHORIZATION FAILURE != ROAD DEATH
```

Integrity failure remains a hard stop in Automatic Failover 001.

## Durable replay

The store writes:

```text
road-memory.json
journal.jsonl
```

Each journal event contains:

- sequence number;
- previous event hash;
- candidate identity;
- endpoint;
- observation type;
- availability failure code when applicable;
- explicit observation timestamp;
- event hash.

Reopening the store replays and verifies that chain before rebuilding local circuit state.

```text
PROCESS RESTART != MEMORY RESET
REPLAY != NEW OBSERVATION
```

## The live witness

The executable witness uses:

- one DID-DHT gateway;
- DWN A;
- DWN B;
- one locator DID advertising both roads;
- one signed crossing replicated across A and B;
- one durable local road-memory store.

It performs three cycles.

### Cycle 1 — failure opens A

1. stop DWN A;
2. try A first;
3. observe `TRANSPORT_UNREACHABLE`;
4. record the failure;
5. open A's local circuit;
6. recover the same crossing through B.

### Cycle 2 — cooldown skips A

1. reopen road memory from disk;
2. make another request before A's cooldown expires;
3. observe `SKIP_OPEN`;
4. make no network attempt against A;
5. recover through B.

### Cycle 3 — A returns

1. restart the exact DWN A process with its prior data intact;
2. reopen road memory from disk again;
3. advance the explicit observation clock beyond the cooldown;
4. derive `HALF_OPEN`;
5. probe A;
6. recover the expected signed crossing from A;
7. record success;
8. close A's circuit.

The DID document is never mutated by these local observations.

## Receiver authority remains separate

After the successful half-open probe, the recovered crossing is handed to a fresh LocalReceiver.

It first records RECEIVE with no semantic effect, then independently chooses REFUSE.

```text
ROAD HEALTH != RECEIVER AUTHORITY
HEALED TRANSPORT != ADMISSION
RECOVERY != ADMISSION
```

## What this earns

ROAD MEMORY / CIRCUIT BREAKER 001 proves:

- local road health can persist across process restart;
- repeated local requests can avoid hammering a known-unavailable road;
- the road remains present in discovery history while OPEN;
- cooldown can produce an explicit HALF_OPEN probe;
- a recovered road can locally return to CLOSED;
- a successful probe preserves the original crossing identity;
- local memory does not mutate DID discovery data;
- integrity failures cannot be downgraded into availability memory;
- transport healing does not transfer semantic authority.

## What this does not earn

This does not prove:

- global endpoint reputation;
- shared health scores;
- automatic DID-document mutation;
- latency ranking;
- quorum health;
- fleet-wide breaker state;
- distributed consensus;
- background scheduler semantics;
- automatic admission.

The witness uses explicit timestamps to make breaker timing deterministic.

## Laws

```text
LOCAL ROAD MEMORY != GLOBAL REPUTATION
LOCAL OBSERVATION != NETWORK FACT
CIRCUIT STATE != DID STATE

FAILURE OBSERVED != ROAD ERASED
SKIP != ERASURE
OPEN != PERMANENTLY DEAD
PROBE != TRUST

AVAILABILITY FAILURE != INTEGRITY FAILURE
AUTHORIZATION FAILURE != ROAD DEATH

PROCESS RESTART != MEMORY RESET
ROAD HEALTH != RECEIVER AUTHORITY
ROAD CHANGE != CROSSING CHANGE
RECOVERY != ADMISSION
```

> **Remember the broken road locally. Leave the map alone. Try again when the time is right.**
