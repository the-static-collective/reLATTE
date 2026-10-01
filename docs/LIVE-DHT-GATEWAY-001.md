# LIVE DHT GATEWAY 001 — The Gateway Carries, It Does Not Crown

**Status:** executable network-boundary witness  
**Date:** 2026-10-01  
**Depends on:** [DID:DHT Discovery 001](DID-DHT-DISCOVERY-001.md), [DID Binding 001](DID-BINDING-001.md)

## Why this witness changed shape

The Web5-descended TypeScript SDK still names `https://diddht.tbddev.org` as its default DID DHT gateway.

That historical hosted endpoint is not treated as constitutional infrastructure here.

LIVE DHT GATEWAY 001 therefore runs the **actual open-source DID DHT reference gateway** as an ephemeral external process and exercises the same Pkarr-compatible HTTP interface used by the SDK.

A separately configured public gateway can run the same witness by setting:

```text
DID_DHT_GATEWAY_URL=https://some-current-gateway.example/
```

No public gateway is hard-coded into reLATTE.

## Crossing

```text
local did:dht document
        |
        | DidDht.publish()
        v
live gateway process
        |
        | HTTP PUT /<z-base-32-id>
        v
gateway cache + storage
        |
        | fresh DidDht.resolve()
        v
HTTP GET /<z-base-32-id>
        |
        v
decoded DID document
        |
        v
DWN road discovery
```

The witness requires the road candidate IDs before and after the gateway round trip to be identical.

## Composition

The DID is also bound to a signed reLATTE crossing through DID Binding 001 before publication.

After fresh gateway resolution, the historical binding must still corroborate against the resolved DID document.

```text
reLATTE crossing
      |
DID Binding 001
      |
local did:dht document
      |
LIVE GATEWAY
      |
fresh resolved document
      |
same binding still corroborates
      |
same road candidates
```

The gateway transports a DID document representation.

It does not become the identity.

## What is actually proved

The live witness proves:

- the reference DID DHT gateway server can run as an external process;
- the pinned Web5-descended client can publish a freshly generated `did:dht` document through its HTTP gateway interface;
- the gateway accepts that signed BEP44 record;
- a fresh resolver can retrieve and decode it through the same gateway;
- DID Binding 001 still corroborates against the freshly resolved document;
- DWN road candidate identities survive the encode → gateway → decode round trip;
- none of those operations produce receiver-local semantic effect.

## What is deliberately not claimed

A successful local gateway round trip does **not** prove that the record propagated to arbitrary Mainline DHT peers.

The reference gateway stores a valid record locally before asynchronously attempting its DHT PUT, so these are distinct observations:

```text
GATEWAY ACCEPTED
!=
PUBLIC DHT PROPAGATED
```

Likewise:

```text
GATEWAY RESOLVED != ENDPOINT REACHABLE
RESOLVED != TRUSTED
DISCOVERED != SELECTED
SELECTED != AUTHORIZED
DELIVERED != ADMITTED
```

A later public-propagation witness would require a second independently operated resolver or DHT observation point.

## CI topology

The dedicated witness workflow:

1. clones a pinned commit of the DIF-hosted `did-dht` reference implementation;
2. builds its gateway Docker image;
3. starts it on localhost;
4. waits for `/health`;
5. runs the reLATTE live witness;
6. stores the JSON witness output as a workflow artifact;
7. always prints gateway logs on failure.

Normal `npm run verify` remains network-independent.

```text
NETWORK WITNESS != CORE TEST SUITE
GATEWAY AVAILABILITY != CORE VALIDITY
```

## Laws

```text
GATEWAY != DID
GATEWAY ACCEPTED != PUBLIC DHT PROPAGATED
GATEWAY RESOLVED != ENDPOINT REACHABLE
RESOLVED != TRUSTED

IDENTITY RELATION != LOCATION
DISCOVERED != SELECTED
SELECTED != AUTHORIZED
DELIVERED != ADMITTED

NETWORK WITNESS != CORE TEST SUITE
GATEWAY AVAILABILITY != CORE VALIDITY
```

> **The gateway may carry the map. It does not own the territory.**
