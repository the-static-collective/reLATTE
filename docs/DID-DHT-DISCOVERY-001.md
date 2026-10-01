# DID:DHT DISCOVERY 001 — A Map Is Not the Road

**Status:** bounded executable discovery witness  
**Date:** 2026-10-01  
**Depends on:** [DID Binding 001](DID-BINDING-001.md), [DWN Road 001](DWN-ROAD-001.md)

## Question

Can a `did:dht` document advertise where a DWN may be reached without turning discovery into authorization, trust, delivery, or admission?

DID:DHT DISCOVERY 001 makes that boundary executable.

```text
PARTICULAR
   |
DID BINDING
   |
did:dht
   |
DID document
   |
DecentralizedWebNode service
   |
candidate endpoint
```

The endpoint is a discovered possibility.

It is not an instruction.

## Actual foreign DID document

The witness uses the Web5-descended `DidDht` implementation to create a real `did:dht:...` document with publication disabled for deterministic CI:

```text
DidDht.create({
  publish: false,
  services: [{
    id: 'dwn',
    type: 'DecentralizedWebNode',
    serviceEndpoint: [...]
  }]
})
```

The resulting DID document expands the service identifier to:

```text
did:dht:...#dwn
```

and preserves the advertised DWN endpoints.

Publication is intentionally not required for this bounded witness.

## Candidate, not command

Each valid HTTP(S) endpoint becomes:

```text
relatte.dwn-road-candidate/v0
```

with its own deterministic candidate ID.

The candidate explicitly carries:

```text
executable = false
semantic_effect = none
```

Therefore:

```text
SERVICE ADVERTISEMENT != TRUST
DISCOVERED != SELECTED
SELECTED != AUTHORIZED
AUTHORIZED != DELIVERED
DELIVERED != ADMITTED
ENDPOINT != AUTHORITY
```

## Three discovery outcomes

Discovery must not collapse missing observations into negative facts.

### 1. Candidate observed

```text
DID resolves
  ↓
DWN service observed
  ↓
one or more valid endpoint candidates
```

### 2. No candidate observed

```text
DID resolves
  ↓
no usable DWN endpoint observed
```

This does **not** prove that no road exists elsewhere.

### 3. Unknown

```text
DID resolution unavailable
  ↓
UNKNOWN
```

An unavailable gateway, resolver failure, or missing document is not evidence of road absence.

```text
RESOLUTION FAILURE != ROAD ABSENCE
UNKNOWN != NONE
NO CANDIDATE OBSERVED != NO ROAD EXISTS
```

## Hostile endpoint handling

Discovery accepts only string HTTP(S) endpoints as road candidates.

The witness records and refuses to execute malformed observations including:

- unsupported URI schemes;
- embedded URL credentials;
- object-shaped service endpoints;
- invalid service identifiers.

Ignored observations remain visible as residual discovery evidence rather than silently disappearing.

## Explicit selection

A caller may explicitly select one known candidate.

Selection produces a separate:

```text
relatte.dwn-road-selection/v0
```

but even that artifact says:

```text
authorized = false
delivered = false
semantic_effect = none
```

Selection is attention, not permission.

## Composition with DID Binding 001

The same actual `did:dht` identity can now participate in both seams:

```text
                    ┌─ DID verification key
                    |
reLATTE particular ─┼─ DID Binding 001
                    |
                    └─ did:dht document
                           |
                      DWN service
                           |
                    candidate road(s)
```

The DID binding proves an attributed cryptographic relation.

The service entry advertises location.

Neither substitutes for the other.

```text
IDENTITY RELATION != LOCATION
LOCATION != AUTHORITY
```

## What this earns

This bounded witness proves:

- a real locally-created `did:dht` document can advertise DWN endpoints;
- those endpoints can be projected into stable reLATTE road candidates;
- discovery performs no delivery;
- candidates have no semantic effect;
- selection remains distinct from authorization;
- malformed foreign endpoint observations do not become executable roads;
- DID resolver failure remains UNKNOWN rather than becoming a false negative;
- DID Binding 001 and DWN endpoint discovery compose around the same DID without collapsing identity into location.

## What this does not earn

It does not yet prove:

- publication to the public Mainline DHT;
- resolution through a live DID DHT gateway;
- live endpoint reachability;
- remote DWN JSON-RPC delivery;
- endpoint authenticity beyond the DID document's own verification model;
- endpoint health;
- failover policy;
- TLS certificate policy;
- local authorization to contact a discovered endpoint;
- receiver admission.

Those belong to later crossings.

## Laws

```text
DISCOVERY != AUTHORIZATION
DISCOVERED != SELECTED
SELECTED != AUTHORIZED
AUTHORIZED != DELIVERED
DELIVERED != ADMITTED

SERVICE ADVERTISEMENT != TRUST
ENDPOINT != AUTHORITY
IDENTITY RELATION != LOCATION

RESOLUTION FAILURE != ROAD ABSENCE
UNKNOWN != NONE
NO CANDIDATE OBSERVED != NO ROAD EXISTS
```

> **A map may reveal a road. It may not move the traveler.**
