# DWN ROAD 001 — Foreign Road, Same Traveler

**Status:** bounded executable foreign-infrastructure witness  
**Date:** 2026-10-01  
**Base:** `super-relatte-001`

## Question

Can a real Decentralized Web Node carry a signed reLATTE crossing without becoming the authority that decides what the crossing means?

DWN ROAD 001 attacks that boundary directly.

```text
SIGNED CROSSING X
   ├─→ filesystem
   ├─→ HTTP relay
   └─→ DWN RecordsWrite / RecordsRead
                 |
                 v
           LocalReceiver
                 |
         RECEIVE != ADMIT
```

The DWN is a foreign storage/message substrate. reLATTE keeps traveler identity, verification, receiver history, and semantic consequence local.

## Foreign implementation

The witness uses the published reference implementation:

```text
@tbd54566975/dwn-sdk-js 0.5.2
```

The package name retains TBD's historical namespace, while the source repository now lives under the Decentralized Identity Foundation.

The test creates an actual in-process `Dwn` with LevelDB-backed message, data, event, and resumable-task stores. It then creates a signed DWN `RecordsWrite`, processes it through the node, reads the record back through `RecordsRead`, and re-verifies the recovered reLATTE crossing.

This is not a mock transport.

## Adapter boundary

`src/dwn-road.ts` owns the foreign dependency.

Input:

```text
Dwn
tenant DID
DWN signer
signed CrossingEnvelopeV0
```

Write path:

```text
verify reLATTE crossing
  ↓
JCS canonical crossing bytes
  ↓
DWN RecordsWrite
  ↓
Dwn.processMessage(...)
  ↓
202 Accepted
```

Read path:

```text
DWN RecordsRead
  ↓
recover exact bytes
  ↓
require canonical JCS body
  ↓
verify reLATTE signature + crossing ID
  ↓
ordinary reLATTE crossing
```

The DWN record ID is retained as road identity. It does not replace the crossing ID.

```text
DWN RECORD ID != CROSSING ID
```

## Three-road invariant

The integration test sends one signed crossing through:

1. filesystem bundle;
2. localhost HTTP relay;
3. actual in-process DWN RecordsWrite / RecordsRead.

All three roads deliver the same crossing to one durable `LocalReceiver`.

The first delivery appends one RECEIVE event.

The HTTP and DWN deliveries are duplicates and append no new history.

```text
FILE ROAD
   |
HTTP ROAD ----> SAME CROSSING ----> ONE RECEIVE RECEIPT
   |
DWN ROAD
```

Therefore:

```text
ROAD CHANGE != IDENTITY CHANGE
DUPLICATE ROAD != NEW HISTORY
```

## Authority attack

The decisive test is intentionally asymmetric:

```text
DWN RecordsWrite
      ↓
202 Accepted
      ↓
reLATTE receiver
      ↓
REFUSE
```

A successful DWN write creates no reLATTE admission.

The receiver remains free to HOLD, ADMIT, REFUSE, or RETURN under its own law.

```text
DWN ACCEPTED != RELATTE ADMITTED
STORAGE PERMISSION != SEMANTIC AUTHORITY
DELIVERY != ADMISSION
```

## What this earns

At this bounded seam, reLATTE has now accepted a materially foreign infrastructure implementation of a deliberately replaceable lower layer.

The witness proves:

- an actual DWN can store the canonical signed crossing;
- an actual DWN can return the same crossing bytes;
- reLATTE verification survives the round trip;
- DWN record identity remains distinct from reLATTE crossing identity;
- file, HTTP, and DWN roads converge without creating duplicate receiver history;
- DWN acceptance creates no receiver-local semantic effect;
- a receiver can REFUSE a crossing that the DWN successfully stored.

## What this does not earn

DWN ROAD 001 does not yet prove:

- remote Internet DWN interoperability;
- DID service-endpoint discovery;
- `did:dht` publication or rotation;
- DWN Protocol installation;
- cross-node DWN replication;
- encrypted record transport;
- capability delegation;
- production persistence or concurrency;
- a stable DWN standard version;
- Web5 compatibility as a whole.

The current DWN specification and implementation remain foreign dependencies with their own versioning and maturity.

That is acceptable because the road is replaceable.

## Laws

```text
DWN != WORLD
DWN RECORD != CROSSING
DWN ACCEPTED != RELATTE ADMITTED
STORAGE PERMISSION != SEMANTIC AUTHORITY
TRANSPORT != CROSSING
ROAD CHANGE != IDENTITY CHANGE
DUPLICATE ROAD != NEW HISTORY
```

> **The node may store the crossing. It may not decide what the crossing does.**
