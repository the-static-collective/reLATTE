# MAIL SLOT 001 + CARRY TEXT 001 + STATIC POST 001

**Status:** executable portable-correspondence witness  
**Date:** 2026-10-02  
**Depends on:** CUSTOMS HOUSE 001, CARRY CARD HOSTILE 001

## Question

Can a released Carry Card survive ordinary dumb transport — files, clipboard text, email-like copy/paste, removable media — without changing crossing identity, leaking source-withheld context, or requiring either provider to understand reLATTE?

MAIL SLOT 001 answers yes.

The key inversion is:

~~~text
ROAD MAY BE STUPID
PARCEL STAYS SMART
~~~

The road does not need to understand identity, capability, consent, decryption, admission, or history.

It only needs to move bytes.

## Portable .carry artifact

A released transport bundle can be wrapped as:

~~~text
relatte.portable-carry/v0
~~~

with media type:

~~~text
application/vnd.relatte.portable-carry+json
~~~

and conventionally stored as:

~~~text
something.carry
~~~

The artifact contains:

- the existing signed Carry Card crossing;
- the existing recipient-bound encrypted payload;
- an optional return envelope;
- a deterministic portable artifact identity.

It does not replace the crossing identity.

~~~text
PORTABLE ID != CROSSING ID
FILE != AUTHORITY
COPY != NEW CROSSING
~~~

The same portable object may be copied across any number of transport systems without creating a new crossing.

## CARRY TEXT 001

For roads that accept text but not files, the same exact portable artifact can be armored as:

~~~text
-----BEGIN RELATTE CARRY-----
Version: 0
Portable-ID: relatte-portable-carry-v0:...

<base64url of canonical .carry bytes>
-----END RELATTE CARRY-----
~~~

Armor is reversible.

~~~text
.carry
  ↓ armor
CARRY TEXT
  ↓ dearmor
same portable_id
same crossing_id
~~~

The armor introduces no new authority or semantics.

~~~text
ARMOR != AUTHORITY
COPY != NEW CROSSING
~~~

## Dumb-road proof

The executable witness sends one source release through:

1. a canonical .carry file;
2. read-back from disk;
3. CARRY TEXT armor;
4. dearmor;
5. destination Customs / runtime receive.

Across both repackaging steps, the witness requires:

~~~text
portable_id unchanged
crossing_id unchanged
~~~

The road is allowed to be completely ignorant of reLATTE semantics.

## Withheld material still stays home

The witness plants:

~~~text
STATIC-POST-SOURCE-LOCAL-SECRET-MUST-NOT-TRAVEL
~~~

in source-local offered context and excludes it from the released card.

It then proves:

~~~text
secret in serialized .carry bytes = false
secret in CARRY TEXT              = false
secret after destination decrypt  = false
~~~

Therefore portability does not widen the source release cut.

## RETURN ENVELOPE 001

A portable outbound parcel may carry a bounded return invitation.

The source world prepares:

- one fresh delegated P-256 reply key;
- one source-issued receive capability bound to that key;
- one reply kind;
- one parent crossing;
- one expiry;
- max replies = 1;
- the source encryption public key.

The private reply key is encrypted to the outbound recipient.

The destination may decrypt that delegated key and use it to sign one reply crossing back to the source.

~~~text
RETURN KEY != DESTINATION IDENTITY
DELEGATED REPLY KEY != HUMAN IDENTITY
ONE REPLY DOOR != SHARED SESSION
~~~

The reply crossing must:

- use the supplied reply capability;
- use the supplied reply kind;
- name the original crossing as a parent;
- arrive before expiry.

## Burning the reply door

The source return adapter verifies the reply against the return envelope, durably enqueues it, and revokes the return capability as part of consuming that reply door.

A second fresh reply attempt under the same delegated key is rejected:

~~~text
CAPABILITY_REVOKED
~~~

The first reply remains in history.

~~~text
CONSUMED RETURN != HISTORY ERASURE
~~~

This is intentionally not a shared chat session.

It is a bounded piece of correspondence.

## STATIC POST 001

Once .carry and CARRY TEXT exist, ordinary transport becomes sufficient.

Examples include:

- email attachments;
- text messages;
- chat messages;
- Discord;
- Signal;
- Dropbox;
- Drive;
- Git;
- removable media;
- QR encodings;
- any future carrier that preserves bytes.

reLATTE does not need those roads to become reLATTE-aware.

~~~text
GMAIL != AUTHORITY
DROPBOX != AUTHORITY
CHAT TRANSPORT != AUTHORITY
USB != AUTHORITY
ROAD != PARCEL
~~~

The transport can change while the parcel and crossing remain attributable.

## Correspondence shape

~~~text
SOURCE WORLD
    |
Customs House
    |
 RELEASE
    |
 .carry
    |
 dumb road
    |
 CARRY TEXT if needed
    |
 dumb road
    |
DESTINATION WORLD
    |
 RECEIVE
    |
 HOLD / ADMIT / REFUSE
    |
 optional one-reply envelope
    |
 RELEASE RESPONSE
    |
 reply .carry
    |
 dumb road
    |
SOURCE WORLD
    |
 RECEIVE
    |
 local decision
~~~

No shared conversation or global session is required.

## Carry utility

The repository includes:

~~~text
npm run carry -- inspect parcel.carry
npm run carry -- armor parcel.carry parcel.txt
npm run carry -- dearmor parcel.txt restored.carry
~~~

### inspect

Displays safe outer metadata only:

- portable ID;
- crossing ID;
- declared kind;
- source world;
- encrypted payload ID;
- whether a return envelope exists;
- bounded return metadata.

It does not decrypt payload plaintext.

~~~text
INSPECTION != DECRYPTION
~~~

### armor / dearmor

These commands must preserve the portable identity.

They do not mint a new crossing.

## What this earns

MAIL SLOT / STATIC POST 001 proves:

- a Carry Card can become one portable canonical artifact;
- the artifact survives ordinary file transport unchanged;
- the artifact survives text armor unchanged;
- file and clipboard roads need no protocol semantics;
- source-withheld text remains absent;
- destination receive and disposition remain local;
- the source can include one encrypted bounded reply door;
- the destination can return one child crossing;
- the source can consume and burn that reply door;
- a second reply attempt is rejected;
- correspondence can occur without a shared session.

## What this does not earn

This does not prove:

- provider integration;
- legal identity;
- human identity of the sender;
- anonymous transport metadata;
- race-free globally distributed single-use enforcement;
- delivery guarantees from email/chat/storage providers;
- universal file associations;
- QR size suitability for arbitrary parcels.

The one-reply adapter is owner-local and bounded. It is not presented as a distributed consensus primitive.

## Laws

~~~text
ROAD != PARCEL
FILE != AUTHORITY
ARMOR != AUTHORITY
COPY != NEW CROSSING
PORTABLE != ADMITTED

INSPECTION != DECRYPTION

RETURN INVITATION != ADMISSION
RETURN KEY != DESTINATION IDENTITY
DELEGATED REPLY KEY != HUMAN IDENTITY
ONE REPLY DOOR != SHARED SESSION
RETURN CAPABILITY != UNIVERSAL PERMISSION
CONSUMED RETURN != HISTORY ERASURE
REPLY RECEIVED != REPLY ADMITTED
~~~

> **The internet already knows how to move files. We only needed to teach the parcel how to remember its boundaries.**

> **Letters, not shared memory.**
