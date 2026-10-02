# REMOTE DWN DELIVERY 001 — Discover, Commute, Receive

**Status:** executable remote-transport witness  
**Date:** 2026-10-01  
**Depends on:** [LIVE DHT GATEWAY 001](LIVE-DHT-GATEWAY-001.md), [DID:DHT Discovery 001](DID-DHT-DISCOVERY-001.md), [DWN ROAD 001](DWN-ROAD-001.md)

## Question

Can a road discovered from a DID document actually carry one signed reLATTE crossing over HTTP through a remote DWN and into a sovereign LocalReceiver without allowing discovery, selection, storage, or delivery to become admission?

REMOTE DWN DELIVERY 001 closes that circuit.

```text
reLATTE crossing
      |
      | bound to
      v
locator did:dht
      |
      | publish + resolve
      v
DWN service endpoint
      |
      | explicit candidate selection
      v
remote HTTP JSON-RPC
      |
      | RecordsWrite
      v
remote DWN storage
      |
      | RecordsRead
      v
same signed crossing
      |
      v
LocalReceiver
      |
   RECEIVE
      |
   REFUSE
```

## Multi-tenant distinction

A DWN service endpoint advertised by one DID is a road location.

The DWN itself is multi-tenant.

Therefore the identity that advertises the road does not need to collapse into the identity whose records are stored there.

The witness intentionally uses:

- a `did:dht` as the **road locator**;
- a separate `did:key` as the **DWN tenant**.

```text
ROAD LOCATOR != DWN TENANT
NODE LOCATION != TENANT IDENTITY
```

This also keeps remote DWN authorization verifiable without depending on the historical default public DID-DHT gateway.

## Actual HTTP transport

The adapter uses the reference server's real JSON-RPC surface:

```text
POST /
dwn-request: {
  jsonrpc: "2.0",
  method: "dwn.processMessage",
  params: {
    target: <tenant DID>,
    message: <RecordsWrite | RecordsRead>
  }
}
```

For `RecordsWrite`, the canonical reLATTE crossing bytes are streamed in the HTTP request body.

For `RecordsRead`, the server returns:

- the JSON-RPC reply in the `dwn-response` header;
- the record data in the binary response body.

The recovered body must still be JCS-canonical and must independently pass reLATTE crossing verification.

## The whole executable path

```text
1. create locator did:dht
2. attach DWN service endpoint
3. bind signed reLATTE crossing to locator DID
4. publish locator DID to live gateway
5. freshly resolve locator DID
6. discover DWN road candidate
7. explicitly select candidate
8. create separate did:key DWN tenant
9. HTTP RecordsWrite signed crossing
10. HTTP RecordsRead same record
11. verify exact crossing identity
12. LocalReceiver RECEIVE
13. assert no admission
14. LocalReceiver REFUSE
```

Step 12 still has no semantic effect.

Step 14 is the first owner-local semantic disposition in the circuit, and REFUSE deliberately has no protected payload effect.

## What this earns

This witness proves:

- DID-based road discovery can feed a real remote HTTP transport;
- the selected endpoint can be used for actual DWN JSON-RPC;
- a signed crossing survives remote `RecordsWrite → RecordsRead`;
- remote storage acceptance does not create local admission;
- a remote read does not itself create a LocalReceiver event;
- the LocalReceiver independently verifies and records RECEIVE;
- the receiver can REFUSE the remotely delivered crossing;
- the remote node does not gain authority over the receiver's decision;
- road-locator identity and DWN-tenant identity remain distinct.

## What this does not earn

This does not yet prove:

- Internet-routable DWN hosting;
- TLS trust policy;
- endpoint reputation;
- DID-DHT propagation across independent public gateways;
- DWN replication between two remote nodes;
- tenant migration;
- capability delegation between locator and tenant identities;
- automatic road selection;
- automatic admission.

## Laws

```text
ROAD LOCATOR != DWN TENANT
NODE LOCATION != TENANT IDENTITY

DISCOVERED != SELECTED
SELECTED != AUTHORIZED
ENDPOINT != AUTHORITY

REMOTE STORED != RELATTE ADMITTED
REMOTE READ != RELATTE RECEIVE
RECEIVED != ADMITTED
DELIVERED != ADMITTED

DWN RECORD != CROSSING
TRANSPORT != CROSSING
```

> **The road may carry the traveler all the way to the door. The house still decides whether the traveler enters.**
