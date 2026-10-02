# CARRY CARD HOSTILE 001 — Two Consent Cuts

**Status:** executable human-facing crossing witness  
**Date:** 2026-10-02  
**Depends on:** CAPABILITY KERNEL 001, LIVE PRIVATE PEER 001 primitives

## Question

Can a human release a bounded parcel toward another assistant without that release becoming destination admission, while guaranteeing that offered-but-withheld context never enters the transmitted object?

CARRY CARD HOSTILE 001 attacks two collapses exposed by the Grok and Meta provider trials:

```text
ACCEPT-TO-SEND != ADMIT-AT-DESTINATION

WITHHELD CONTEXT != CONTEXT SENT WITH A "WITHHELD" LABEL
```

The implementation names the first source-side act **RELEASE** to keep it visibly distinct from destination disposition.

## Human-facing shape

Source side:

```text
I'M CARRYING
  • admitted fact A
  • admitted constraint B
  • open question C

I'M NOT CARRYING
  • everything else

[RELEASE] [AMEND] [CANCEL]
```

Destination side:

```text
parcel arrives
    ↓
RECEIVE
    ↓
decrypt
    ↓
[ADMIT] [HOLD] [REFUSE]
```

The two cuts are separate.

```text
RELEASE != RECEIVE
RECEIVE != ADMIT
DEPARTURE != ENTRY
```

## Local-only card

The source may have a larger local view:

```text
offered_context
admitted_context
open_questions
```

The source-local object is:

```text
relatte.local-carry-card/v0
```

It is not transmitted.

## Released parcel

A human RELEASE produces:

```text
relatte.carry-parcel/v0
```

containing only:

- human intent;
- admitted context;
- open questions;
- count of withheld local items;
- optional expiry;
- creation time;
- non-collapse laws.

It does **not** contain:

- offered context;
- withheld text;
- full chat history;
- model hidden state;
- source-only inference;
- source-local memory.

The withheld count may reveal that additional material existed. It does not reveal that material.

## Sealed transport bundle

The plaintext carry parcel is canonicalized and encrypted specifically to the destination runtime using the existing encrypted-payload profile.

The transmitted bundle contains only:

```text
signed CrossingEnvelopeV0
+
recipient-bound encrypted payload
```

The crossing references the encrypted envelope by content address.

The bundle does not embed plaintext admitted context, much less withheld context.

```text
WITHHELD CONTEXT != TRANSMITTED CONTEXT
PLAINTEXT PARCEL != TRANSPORT BUNDLE
CIPHERTEXT != AUTHORITY
```

## Capability cut

Before a foreign runtime can enqueue the crossing, the destination must have issued the source crossing key a capability scoped to:

```text
action = runtime.receive.crossing
target = destination world
kind   = CARRY_PARCEL
```

That permission reaches only the receive door.

```text
CAPABILITY != ADMISSION
```

## Destination cut

After capability verification, the runtime may RECEIVE the crossing.

At that point:

```text
received = true
admitted = false
held = false
```

The destination can decrypt the parcel and inspect the human-admitted contents.

Decryption still creates no semantic admission.

```text
DECRYPTABLE != ADMITTED
```

The hostile witness then chooses:

```text
HOLD
```

and proves that the parcel remains non-admitted after the destination decision.

A later witness may exercise ADMIT or REFUSE as separate owner-local outcomes.

## Hostile privacy probe

The source-local offered context contains a planted string:

```text
WITHHELD-CONTEXT-MUST-NEVER-CROSS
```

The witness serializes the complete transmitted bundle and fails if any of the following are present:

- the planted withheld string;
- the field name `offered_context`;
- the field name `admitted_context`;
- admitted plaintext itself.

Only ciphertext, content identifiers, policy metadata, and crossing metadata may cross.

This is stronger than sending withheld material with a label that says "do not use."

## What this earns

CARRY CARD HOSTILE 001 proves, at the current bounded adapter level:

- source RELEASE is explicit;
- CANCEL cannot create a released parcel;
- source RELEASE does not imply destination ADMIT;
- offered-but-withheld text does not enter the transport bundle;
- admitted plaintext does not enter the transport bundle;
- the released parcel can be reconstructed after destination decryption;
- capability authorization is still required for foreign enqueue;
- RECEIVE occurs before any destination disposition;
- destination HOLD preserves non-admission;
- the adapter composes existing core primitives without changing the base crossing schema.

## What this does not earn

This witness does not yet prove:

- public Internet provider-to-provider transport;
- direct ChatGPT / Meta / Grok API integration;
- a production UI;
- delegated human identity;
- legal consent;
- automatic expiry enforcement;
- deletion from provider-private logs outside the parcel protocol;
- that transport metadata is anonymous;
- that withheld context never exists in a provider's own preexisting local systems.

It proves only that this protocol surface does not place withheld content into the transmitted Carry Card bundle.

## Laws

```text
RELEASE != ADMISSION
DEPARTURE != ENTRY
RECEIVE != ADMIT

OFFERED CONTEXT != ADMITTED CONTEXT
WITHHELD CONTEXT != TRANSMITTED CONTEXT

PLAINTEXT PARCEL != TRANSPORT BUNDLE
CIPHERTEXT != AUTHORITY
DECRYPTABLE != ADMITTED

CAPABILITY != ADMISSION
TRANSPORT != AUTHORITY
PROPOSAL != HUMAN DECISION
```

> **The sender decides what may leave. The destination decides what may enter. What was withheld never boards the road.**
