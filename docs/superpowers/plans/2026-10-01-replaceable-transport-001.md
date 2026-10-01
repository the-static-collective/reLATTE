# Replaceable Transport 001 — R6 Plan

## Goal

Earn R6 with two materially different roads carrying one identical signed crossing.

## Required proof

- create one signed crossing;
- serialize it to canonical JCS bytes;
- create a file-bundle transport frame;
- write/read that frame through actual filesystem I/O;
- create an HTTP-relay transport frame;
- POST it over an actual localhost HTTP socket;
- prove both frames carry identical canonical crossing bytes;
- prove both frames carry the same crossing ID;
- prove transport-frame IDs differ;
- deliver both roads to the same durable receiver;
- prove second-road delivery is idempotent and creates no new local history;
- keep HTTP transport ACK distinct from RECEIVE receipt;
- reject transport-frame tampering and unsigned sidecars.

## Non-collapses

```text
TRANSPORT != CROSSING
FRAME != RECEIPT
ACK != RECEIVE RECEIPT
DELIVERED != ADMITTED
ROAD CHANGE != IDENTITY CHANGE
DUPLICATE ROAD != NEW HISTORY
```

## Stop condition

Do not add peer discovery, TLS identity, Internet deployment, retry policy, relay federation, store-and-forward semantics, or R7 mirror claims.
