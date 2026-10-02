# MORTAL ROAD 001 — The Road Can Die

**Status:** executable two-node mortality witness  
**Date:** 2026-10-02  
**Depends on:** [REMOTE DWN DELIVERY 001](REMOTE-DWN-DELIVERY-001.md), [LIVE DHT GATEWAY 001](LIVE-DHT-GATEWAY-001.md)

## Question

Can a signed reLATTE crossing survive the death of the remote DWN node that first carried it, without turning replication into consensus or recovery into inherited authority?

MORTAL ROAD 001 answers that with two independently running DWN servers.

```text
locator did:dht
      |
      +----> DWN A
      |
      +----> DWN B

crossing
   |
   v
DWN A
   |
   | verified read + explicit replication
   v
DWN B
   |
   X  kill A
   |
   v
recover crossing from B
   |
   v
fresh LocalReceiver
   |
 RECEIVE
   |
 REFUSE
```

## Why this is bounded replication

The current Web5 agent stack includes a higher-level synchronization engine based on message-event enumeration and `MessagesRead` / remote RPC machinery.

MORTAL ROAD 001 deliberately does not import that entire agent authority and permission layer.

Instead it proves the lower invariant directly:

1. verify a crossing read from node A;
2. write that exact signed crossing as payload to node B;
3. verify it from B;
4. terminate node A;
5. demonstrate A is unavailable;
6. recover the same crossing identity from B.

This is **replication of an attributable traveler**, not a claim that the two DWNs share one state machine.

```text
REPLICATION != CONSENSUS
COPY != AUTHORITY
NODE A != NODE B
```

The DWN record identifiers may differ between A and B.

That is expected.

```text
DWN RECORD != CROSSING
```

The invariant is the signed reLATTE crossing identity.

## Mortality crossing

The executable witness starts:

- one live DID-DHT gateway;
- DWN node A on one HTTP port;
- DWN node B on another HTTP port.

A single `did:dht` document advertises both endpoints.

Both road candidates must be explicitly selected.

The crossing is written to A, recovered from A, and replicated to B.

Then the witness executes an actual process-level death:

```text
docker stop <node A>
```

A subsequent attempt to read the original record from A must fail.

Only after that failure is established may the witness recover from B.

## Fresh receiver authority

Recovery from B is still only transport continuity.

The recovered crossing is handed to a newly created LocalReceiver with a fresh local key, world, journal, and authority.

The successor receiver first records:

```text
RECEIVED
semantic_effect = none
```

and then independently chooses:

```text
REFUSE
```

Therefore:

```text
NODE DEATH != CROSSING DEATH
ROAD DEATH != HISTORY DEATH

RECOVERY != ADMISSION
SUCCESSOR AUTHORITY != TRANSPORT CONTINUITY
```

## What this earns

MORTAL ROAD 001 proves:

- one DID can advertise multiple independent DWN road candidates;
- the same signed reLATTE crossing can be carried by two independent DWN server processes;
- replication preserves crossing identity without requiring equal DWN record identity;
- node A can be terminated after replication;
- node A is actually unavailable after termination;
- node B can still return the exact signed crossing;
- a fresh LocalReceiver can verify recovered history;
- recovery does not create admission;
- the fresh receiver can REFUSE independently.

## What this does not earn

This does not prove:

- automatic background DWN-to-DWN synchronization;
- BFT or quorum consensus;
- total ordering between nodes;
- automatic failover selection;
- public Internet reachability;
- tenant-key recovery after key loss;
- availability if every replica dies;
- shared receiver authority;
- inherited admission.

## Laws

```text
REPLICATION != CONSENSUS
REPLICATION != ADMISSION
COPY != AUTHORITY

NODE A != NODE B
NODE DEATH != CROSSING DEATH
ROAD DEATH != HISTORY DEATH

DWN RECORD != CROSSING
RECOVERY != ADMISSION
SUCCESSOR AUTHORITY != TRANSPORT CONTINUITY
```

> **The road can die. The traveler can still arrive from somewhere else. The next house still owns its door.**
