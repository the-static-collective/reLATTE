# REPLACEABLE TRANSPORT 001

**Status:** bounded executable R6 witness  
**Date:** 2026-10-01

## Thesis

A reLATTE crossing should survive a change of road.

Replaceable Transport 001 moves one already-signed canonical crossing through two materially different transport mechanisms:

1. filesystem bundle;
2. actual localhost HTTP POST relay.

The road may change.

The traveler must not.

```text
SIGNED CROSSING X
      |
      +--> FILE BUNDLE ------+
      |                      |
      +--> HTTP RELAY -------+
                             v
                       SAME RECEIVER
                             |
                       crossing_id = X
```

## Canonical payload

Every transport frame carries the RFC 8785/JCS canonical JSON string of the complete signed crossing.

The frame records:

- crossing ID;
- SHA-256 of canonical crossing bytes;
- media type;
- canonical body;
- transport kind;
- route note;
- frame timestamp;
- transport laws.

For the same crossing:

```text
file_frame.transport_id != http_frame.transport_id

file_frame.crossing_id == http_frame.crossing_id

file_frame.canonical_body_sha256
  == http_frame.canonical_body_sha256

file_frame.body == http_frame.body
```

Transport metadata changes the transport-frame identity.

It does not mutate crossing identity.

## Transport frame

The transport frame is content-addressed separately from the crossing.

This deliberately creates two identities:

```text
CROSSING ID
  = semantic traveler identity

TRANSPORT FRAME ID
  = one particular road event
```

All declared transport-frame fields are identity-bearing.

Unknown sidecar fields are rejected.

```text
TRANSPORT != CROSSING
ROAD CHANGE != IDENTITY CHANGE
FRAME METADATA != CROSSING METADATA
```

## File road

The file road:

1. verifies the transport frame;
2. verifies the signed crossing inside it;
3. writes the frame to disk;
4. later reads it from disk;
5. re-verifies frame hash, canonical bytes, crossing ID, and crossing signature;
6. returns the original crossing object to the receiver boundary.

This is a real filesystem crossing, not merely a carrier label.

## HTTP road

The HTTP road uses a real Node HTTP server and POST request:

```text
POST /relatte/v0/crossings
Content-Type: application/json
```

The relay:

1. parses the transport frame;
2. requires `transport = http-relay`;
3. verifies transport-frame identity;
4. verifies canonical crossing bytes;
5. verifies the crossing signature;
6. hands the verified crossing to a caller-provided delivery boundary;
7. emits a transport ACK.

The HTTP transport ACK has:

```text
semantic_effect = none
```

and explicitly carries:

```text
ACK != RECEIVE RECEIPT
DELIVERED != ADMITTED
```

The relay cannot make a receiver-local disposition.

## Cross-road idempotence

The decisive integration test uses one durable Local Receiver.

First:

```text
signed crossing X
  -> filesystem bundle
  -> receiver RECEIVE
  -> journal event 1
```

Then the exact same crossing travels through the actual HTTP road:

```text
signed crossing X
  -> HTTP relay
  -> same receiver RECEIVE
  -> original RECEIVE receipt returned
  -> no new journal event
```

So duplicate-delivery idempotence survives transport replacement.

```text
NEW ROAD != NEW CROSSING
DUPLICATE ROAD != NEW HISTORY
```

## Hostile proof

The verifier rejects:

- unknown transport-frame sidecars;
- route metadata changed after frame addressing;
- canonical body changed after hashing;
- transport kind changed after frame addressing;
- canonical body whose crossing signature no longer verifies;
- file helpers given HTTP frames;
- HTTP helpers given file frames.

## What this earns

At the current envelope level, this satisfies the R6 requirement:

> Move the identical canonical crossing using at least two transports. Transport replacement must not change crossing identity.

The executable witness includes:

- actual filesystem I/O;
- actual localhost HTTP socket transport;
- same canonical crossing bytes;
- same crossing ID;
- different transport-frame identities;
- same durable receiver;
- cross-road duplicate idempotence.

## What it does not earn

This is not yet:

- Internet-facing transport;
- remote peer discovery;
- TLS endpoint identity;
- relay federation;
- retry/backoff protocol;
- authenticated transport sessions;
- store-and-forward durability;
- R7 mirroring;
- production HTTP hardening.

Transport remains replaceable.

That is the point.

## Laws

```text
TRANSPORT != CROSSING
DELIVERY != ADMISSION
ACK != RECEIVE RECEIPT
ROAD CHANGE != IDENTITY CHANGE
NEW ROAD != NEW HISTORY
TRANSPORT FAILURE != CROSSING INVALIDITY
```
