# LIVE PRIVATE PEER 001 — Find the Door, Seal the Parcel, Close the Door

**Status:** executable live peer-discovery, encrypted-payload, and revocation witness  
**Date:** 2026-10-02  
**Depends on:** CAPABILITY KERNEL 001, TWO WORLDS IN A BOX 001, LIVE DHT GATEWAY 001

## Question

Can one runtime discover another runtime through a freshly resolved DID document, fetch a live peer descriptor over HTTP, encrypt a payload specifically for that destination, cross under a destination-issued capability, and later have that capability revoked without erasing the crossing that already happened?

LIVE PRIVATE PEER 001 composes those seams.

## Live discovery

World B publishes a `did:dht` document containing a service of type:

~~~text
RelatteRuntime
~~~

whose service endpoint points to B's live descriptor:

~~~text
GET /relatte/peer/v0
~~~

World A does not consume B's locally authored DID document directly.

The witness publishes through the live DID-DHT gateway, performs a fresh resolution, then derives a reLATTE peer candidate from the resolved document.

~~~text
DID SERVICE != TRUST
DISCOVERY != AUTHORIZATION
ENDPOINT != WORLD
~~~

A discovered candidate is non-executable until separately selected and used.

## Peer descriptor

The live descriptor exposes only runtime-facing public material:

- world ID;
- crossing HTTP endpoint;
- capability issuer reference;
- capability issuer public key;
- encryption key ID;
- encryption public key.

It does not grant permission.

~~~text
PEER DESCRIPTOR != AUTHORITY
PUBLIC KEY != CAPABILITY
~~~

## Encrypted payload profile

The payload profile is:

~~~text
relatte.ecdh-p256-hkdf-sha256-aes-256-gcm/v0
~~~

It uses:

- ephemeral P-256 ECDH;
- HKDF-SHA256;
- AES-256-GCM;
- random salt;
- random 96-bit IV;
- authenticated context.

The authenticated context binds:

- target world;
- capability ID;
- declared crossing kind;
- media type.

The encrypted envelope itself is content-addressed and referenced by the signed crossing.

This bounded profile intentionally does **not** claim RFC 9180 HPKE compatibility.

~~~text
PROFILE != RFC9180 HPKE
CIPHERTEXT != AUTHORITY
DECRYPTABLE != ADMITTED
ENCRYPTION != IDENTITY
~~~

## First crossing

World B explicitly issues World A's outbound crossing key one capability:

~~~text
action = runtime.receive.crossing
target = WORLD B
kind   = SEALED_MESSAGE
~~~

A encrypts the payload to B's peer-advertised encryption key and signs a crossing containing that exact capability reference.

A then POSTs the crossing to the discovered live peer endpoint:

~~~text
POST /relatte/crossings/v0
~~~

B verifies the capability before durable enqueue.

The live peer server then executes the normal runtime receive path.

HTTP acceptance still earns no semantic admission.

~~~text
HTTP ACCEPTED != ADMITTED
CAPABILITY != ADMISSION
~~~

After the live server stops, B reopens from disk and decrypts the envelope using its persisted destination encryption key.

B then chooses:

~~~text
HOLD
~~~

The successful decryption does not change that decision boundary.

## Revocation

After the first crossing, B signs and appends:

~~~text
relatte.capability-revocation/v0
~~~

The revocation binds:

- capability ID;
- destination issuer;
- destination issuer public key;
- revocation timestamp;
- optional local reason.

The original grant file is not deleted.

The first crossing is not deleted.

The first receiver receipt is not rewritten.

~~~text
REVOCATION != HISTORY ERASURE
REVOKED NOW != NEVER VALID
CAPABILITY STATUS != CROSSING HISTORY
~~~

Historical authorization before the revocation cut remains verifiable.

Fresh use at or after the revocation cut is denied.

## Second crossing

A signs a second fresh crossing using the same formerly valid capability.

B's restarted live peer receives the HTTP request but rejects it before inbox admission:

~~~text
HTTP 403
CAPABILITY_REVOKED
~~~

The second crossing never enters LocalReceiver history.

The first crossing remains held.

## What this earns

LIVE PRIVATE PEER 001 proves:

- a runtime endpoint can be advertised through `did:dht`;
- a fresh DID resolution can recover the same peer candidate identity;
- the discovered endpoint can serve a real HTTP peer descriptor;
- discovery does not itself grant permission;
- destination encryption keys persist across runtime restart;
- payload material can be encrypted to the discovered destination key;
- authenticated encryption binds the destination/capability/kind context;
- a live HTTP crossing can pass the capability gate and enter runtime RECEIVE;
- destination decryption does not create admission;
- a capability can be durably and cryptographically revoked;
- revocation does not rewrite historical grant or crossing history;
- a new crossing using the revoked capability is rejected before receive.

## What this does not earn

This witness does not claim:

- RFC 9180 HPKE conformance;
- anonymous or metadata-private transport;
- TLS certificate policy;
- public Internet reachability;
- automatic trust from DID resolution;
- capability delegation;
- capability suspension and restoration;
- post-quantum confidentiality;
- global revocation consensus;
- automatic admission.

## Laws

~~~text
DISCOVERY != TRUST
DISCOVERED != AUTHORIZED
PEER DESCRIPTOR != AUTHORITY
ENDPOINT != WORLD

CIPHERTEXT != AUTHORITY
DECRYPTABLE != ADMITTED
ENCRYPTION != IDENTITY
PROFILE != RFC9180 HPKE

CAPABILITY != ADMISSION
HTTP ACCEPTED != ADMITTED

REVOCATION != HISTORY ERASURE
REVOKED NOW != NEVER VALID
CAPABILITY STATUS != CROSSING HISTORY
~~~

> **Find the door. Seal the parcel. Cross only with permission. Closing the door later does not erase the crossing that already happened.**
