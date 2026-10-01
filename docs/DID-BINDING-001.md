# DID BINDING 001 — Relation, Not Identity Collapse

**Status:** bounded executable identity-interoperability witness  
**Date:** 2026-10-01  
**Depends on:** [DWN ROAD 001](DWN-ROAD-001.md)

## Question

Can reLATTE use a decentralized identifier without turning the DID into the particular, the signing key, the human, or the authority over historical receipts?

DID BINDING 001 answers with a dual-attested relation.

```text
PARTICULAR P
   |
   | historical crossing signed by
   v
reLATTE P-256 key K
   |
   | dual-attested relation
   v
DID D
   |
   v
verification method V
```

The relation is explicit.

None of the nodes collapse into another.

## Binding artifact

A `relatte.did-binding/v0` identifies:

- the particular;
- one already-signed reLATTE crossing;
- the exact reLATTE P-256 public key used by that crossing;
- a DID URI;
- one DID verification method;
- the DID method's public verification key;
- an optional prior binding that this binding supersedes;
- the binding timestamp;
- non-collapse laws.

The complete identity body receives its own content address:

```text
relatte-did-binding-v0:<sha256>
```

Then the same binding body is signed twice.

```text
binding body
   ├─→ reLATTE P-256 signature
   └─→ DID verification-method signature
```

This means neither side can unilaterally manufacture the association.

## Historical verification does not require a live resolver

The binding carries the exact public material that signed it.

Therefore a historical verifier can check:

1. the original crossing signature;
2. the crossing ID;
3. the particular named by the crossing;
4. the reLATTE key named by the binding;
5. the reLATTE-side binding signature;
6. the DID-side binding signature.

All of that works offline.

A current DID document can then be consulted separately to answer a narrower question:

> Does this DID currently resolve to a document containing the verification method and public key recorded by the historical binding?

That is corroboration of present resolution state.

It is not a prerequisite for historical cryptographic verification.

```text
DID RESOLUTION
!=
HISTORICAL SIGNATURE VALIDITY
```

## Rotation

Rotation is represented append-only.

```text
crossing X -- key K1 -- DID D1 -- binding B1
     |
     | later history
     v
crossing Y -- key K2 -- DID D2 -- binding B2
                               |
                               └─ supersedes B1
```

B2 does not mutate B1.

K2 does not become the historical signer of X.

D2 does not become the historical DID attested by B1.

The old crossing and old binding remain independently verifiable.

```text
KEY ROTATION != HISTORY REWRITE
NEW BINDING != MUTATION OF OLD BINDING
CONTINUITY != IDENTITY COLLAPSE
```

## DWN composition

The specimen then carries the bound crossing through the foreign DWN road proven by DWN ROAD 001.

After `RecordsWrite → RecordsRead`, the recovered crossing keeps the same reLATTE crossing ID and the independent DID binding still verifies against it.

So the first two foreign interoperability seams now compose:

```text
DID relation
     |
signed reLATTE crossing
     |
DWN foreign road
     |
same crossing
     |
same historical DID binding
```

Neither the DID nor the DWN acquires receiver-local authority.

## What this earns

The executable witness proves:

- a DID can be attached as a relation rather than substituted for a reLATTE particular;
- the DID key may be cryptographically different from the reLATTE signing key;
- both keys attest the same binding body;
- current DID-document resolution can corroborate the relation;
- historical binding verification does not require current DID resolution;
- replacing both the reLATTE key and DID creates a fresh binding;
- the prior crossing and binding remain byte-for-byte unchanged and verifiable;
- a DWN round trip does not disturb the binding-to-crossing relation.

## What this does not earn

This does not yet prove:

- long-lived DID-method rotation semantics;
- `did:dht` publication;
- revocation registries;
- human identity;
- legal identity;
- uniqueness of a person behind a DID;
- compromise recovery;
- social recovery;
- capability delegation;
- credential authority;
- automatic trust.

A valid binding proves possession and mutual attestation of keys around a declared relation.

It does not prove who the human is.

## Laws

```text
PARTICULAR != DID
DID != KEY
KEY != HUMAN
SIGNATURE != HUMAN IDENTITY

DID RESOLUTION != HISTORICAL SIGNATURE VALIDITY
KEY ROTATION != HISTORY REWRITE
NEW BINDING != MUTATION OF OLD BINDING
CONTINUITY != IDENTITY COLLAPSE

DWN != WORLD
TRANSPORT != IDENTITY
```

> **A DID may name a door into a relation. It does not become the thing on either side of the door.**
