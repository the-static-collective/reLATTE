# CUSTOMS HOUSE 001 — A Context Window Should Have Customs

**Status:** executable human-facing two-cut room  
**Date:** 2026-10-02  
**Depends on:** CARRY CARD HOSTILE 001

## Question

Can the two consent cuts already proven by Carry Card become a human-operable room without turning UI state into authority?

CUSTOMS HOUSE 001 composes:

- one source-local departure desk;
- one safe released preview;
- one sealed road view;
- one destination-local arrival desk;
- one explicit destination disposition;
- receipt references for both cuts.

The room does not create new authority.

~~~text
PROJECTION != AUTHORITY
UI STATE != PROTOCOL STATE
~~~

## The core metaphor

~~~text
DEPARTURES
  what may leave?

        ↓ RELEASE

SEALED ROAD
  what actually travels?

        ↓ RECEIVE

ARRIVALS
  what may enter?
~~~

The sender and destination make different decisions.

~~~text
RELEASE != RECEIVE
RECEIVE != ADMIT
SOURCE RELEASE != DESTINATION DECISION
~~~

## Departure desk

The departure desk projects the source-local Carry Card.

Because it is source-local only, it may display all offered items, including items that will remain home.

Each offered item is rendered as:

~~~text
[✓] carry this
[ ] leave this here
~~~

The projection explicitly declares:

~~~text
locality = source-local-only
transmittable = false
~~~

That matters.

The departure projection itself is not a transport object and must never be serialized onto the road.

~~~text
DEPARTURE VIEW != TRANSPORT BUNDLE
~~~

## Safe release preview

After RELEASE, the room creates a safe preview from the released Carry Parcel.

It contains only:

- human intent;
- carrying list;
- open questions;
- withheld count;
- expiry;
- parcel ID.

It does not contain withheld text.

~~~text
WITHHELD COUNT != WITHHELD CONTENT
PREVIEW != PARCEL
~~~

The preview answers the human question:

> What exactly am I sending?

without reintroducing the material they explicitly chose not to send.

## The road

The static interaction specimen exposes a deliberately reduced wire shape.

It shows that the real transport is structurally:

~~~text
signed crossing
+
recipient-bound encrypted payload
~~~

and that plaintext is not supposed to ride beside the ciphertext.

The browser demo is a projection specimen only.

The executable witness in:

~~~text
scripts/customs-house-001.ts
~~~

uses the real Carry Card, capability kernel, encryption organ, runtime inbox, LocalReceiver, and disposition receipt.

## Arrival desk

Only after RECEIVE and decryption can the destination see the admitted parcel contents.

The arrival projection can display:

- declared human intent;
- carrying list;
- open questions;
- source withheld count;
- RECEIVE receipt reference;
- destination disposition receipt reference.

It cannot display source-withheld text because that text never entered the parcel.

~~~text
source_withheld_text_available = false
~~~

The destination then gets an explicit independent cut:

~~~text
[ ADMIT ] [ HOLD ] [ REFUSE ]
~~~

Decryption does not select one.

~~~text
DECRYPTABLE != ADMITTED
~~~

## Executable hostile witness

The witness plants:

~~~text
CUSTOMS-HOUSE-LOCAL-ONLY-SECRET
~~~

inside the source-local offered context and leaves it unselected.

The source departure view can see it.

The witness then proves all of the following:

~~~text
source departure may display it locally      = true
transport bundle contains it                 = false
safe released preview contains it            = false
arrival projection contains it               = false
~~~

This is the intended boundary.

The same witness then:

1. issues the source crossing key a destination receive capability;
2. RELEASEs the Carry Card;
3. seals the parcel to the destination encryption key;
4. enqueues the crossing through the foreign-runtime capability door;
5. records RECEIVE;
6. decrypts the parcel;
7. renders an UNDECIDED arrival view;
8. proves admission is still false;
9. destination chooses HOLD;
10. renders the final HOLD arrival view;
11. proves LocalReceiver admission remains empty.

## Interaction specimen

Open:

~~~text
demo/customs-house.html
~~~

The specimen lets a user:

- edit the purpose;
- add local context;
- toggle each context item between carry / stay home;
- edit open questions;
- inspect carrying and staying-home counts;
- RELEASE, AMEND, or CANCEL;
- inspect a reduced safe-wire shape;
- move to ARRIVALS;
- choose ADMIT, HOLD, or REFUSE.

CANCEL produces no parcel.

AMEND returns the departure desk to local drafting.

RELEASE creates a source-side cut only.

## What this earns

CUSTOMS HOUSE 001 proves:

- Carry Card has a coherent human-facing interaction model;
- source-local withheld text can remain visible to the source without entering the transmitted representation;
- a safe release preview can answer “what is leaving?” without leaking what stayed home;
- RECEIVE can be rendered separately from destination disposition;
- destination HOLD remains non-admission;
- UI projections can carry receipt references without becoming authority;
- the existing cryptographic/runtime path composes cleanly beneath the human ritual.

## What this does not earn

This does not yet prove:

- production browser/server integration;
- browser-side cryptographic parity with the Node runtime;
- direct provider handoff UI inside ChatGPT, Claude, Meta, Grok, or other assistants;
- legal consent;
- provider-private deletion guarantees;
- anonymous metadata;
- identity of the human pressing RELEASE;
- automatic expiry enforcement.

The HTML demo is an interaction specimen.

The Node witness is the executable protocol proof.

## Laws

~~~text
DEPARTURE VIEW != TRANSPORT BUNDLE
PROJECTION != AUTHORITY
UI STATE != PROTOCOL STATE

AMEND != RELEASE
CANCEL != RELEASE
RELEASE != RECEIVE
RECEIVE != ADMIT

SOURCE RELEASE != DESTINATION DECISION
DECRYPTABLE != ADMITTED

WITHHELD COUNT != WITHHELD CONTENT
WITHHELD CONTEXT != TRANSMITTED CONTEXT
~~~

> **A context window should have customs.**

> **The sender decides what may leave. The destination decides what may enter. What stayed home does not appear at arrivals.**
