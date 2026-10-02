# THREE WORLD POST OFFICE 001 — One Letter, Three Covers

**Status:** executable plural-correspondence witness  
**Date:** 2026-10-02  
**Depends on:** MAIL SLOT 001 + STATIC POST 001

## Question

Can one bounded letter body be sent to three sovereign worlds without pretending one encrypted cover can honestly target all three, then return three divergent letters, preserve them separately, and compose a fourth-world descendant without ranking the returns or collapsing them into one shared session?

THREE WORLD POST OFFICE 001 does exactly that.

## One letter body

Carry Card already gives the correct primitive:

~~~text
CarryParcel
~~~

The parcel identity is destination-independent.

Therefore the same source-local release cut can produce one stable:

~~~text
parcel_id
~~~

for all three recipients.

The recipient-specific wrapping remains distinct:

~~~text
same CarryParcel
    ↓
cover for Cedar
cover for River
cover for Ember
~~~

Each cover has its own:

- destination capability;
- destination encryption key;
- signed crossing;
- portable artifact ID;
- return envelope.

~~~text
LETTER BODY != COVER
SAME PARCEL != SAME CIPHERTEXT
~~~

This avoids a false broadcast claim.

A byte-identical encrypted transport artifact cannot honestly bind three different destination worlds, capabilities, and recipient keys at once.

## Dispatch manifest

The source builds:

~~~text
relatte.three-world-dispatch/v0
~~~

The dispatch requires:

- exactly three distinct recipient worlds;
- one shared parcel ID across all covers;
- three distinct crossing IDs;
- three distinct portable IDs;
- one return envelope per cover.

~~~text
SAME QUESTION != SHARED WORLD
RECIPIENT COVER != GLOBAL BROADCAST
PARALLEL DELIVERY != CONSENSUS
~~~

## Three dumb roads

The executable witness deliberately uses three materially boring carriers:

~~~text
CEDAR → .carry file
RIVER → CARRY TEXT
EMBER → JSON copy
~~~

All roads preserve their own cover identity.

The recipient worlds independently verify, RECEIVE, decrypt, and HOLD the common letter.

No world receives another world's cover.

## Three bounded replies

Each destination opens its own one-use return envelope and creates one distinct child reply crossing.

The replies in the witness intentionally diverge:

### Cedar

~~~text
Let repetition become the visible frame rule.
Change content inside the frame, not the frame itself.
~~~

### River

~~~text
Use a restricted palette so movement carries complexity.
Let the limitation be obvious enough to feel intentional.
~~~

### Ember

~~~text
Fix the shot count and mutate density inside each shot.
Preserve one unresolved contradiction instead of smoothing it.
~~~

The source receives all three and independently chooses HOLD for all three.

~~~text
THREE RETURNS != AGREEMENT
RETURN ORDER != RANKING
~~~

## Postbag

The three returned letters enter:

~~~text
relatte.static-postbag/v0
~~~

A postbag is a collection of attributable returns.

It is not a merger.

~~~text
POSTBAG != MERGER
COLLECTION != ADMISSION
DIVERGENCE != FAILURE
~~~

Each return retains:

- origin world;
- portable artifact ID;
- crossing ID;
- parent crossing ID;
- receive receipt;
- local disposition;
- disposition receipt;
- carried return context.

## Human compositor

The postbag may be projected into:

~~~text
relatte.static-post-compositor-draft/v0
~~~

This is an explicit human selection surface.

The compositor sees all returned carriers and chooses:

~~~text
CARRY FORWARD
LEAVE HOME
OPEN TENSIONS
~~~

Selection may only use text that actually arrived in one of the returned letters.

The compositor cannot invent a returned carrier and pretend it came from a recipient.

~~~text
SELECTION != RANKING
OMISSION != NONEXISTENCE
COMPOSITION != CONSENSUS
~~~

Unselected return material remains present in the postbag.

## Fourth-world descendant

The witness selects one carrier from each returned world:

~~~text
Cedar:
  Let repetition become the visible frame rule.

River:
  Use a restricted palette so movement carries complexity.

Ember:
  Preserve one unresolved contradiction instead of smoothing it.
~~~

and preserves two unresolved questions.

That explicit composition becomes a fresh Carry Card.

The descendant crossing names all three returned crossings as parents:

~~~text
reply Cedar ─┐
reply River ─┼──→ fresh descendant crossing
reply Ember ─┘
~~~

The descendant is then sealed under a fresh capability to:

~~~text
WORLD HORIZON
~~~

Horizon RECEIVEs and HOLDs it.

~~~text
DESCENDANT != SUMMARY
ANCESTRY != AUTHORITY
~~~

The fourth world does not inherit the source world's HOLD decisions, the three recipient worlds' authority, or the compositor's authority.

It receives a fresh candidate.

## Postal stamps

The project also defines a bounded projection:

~~~text
relatte.static-post-stamp/v0
~~~

A stamp can display:

- direction;
- world;
- crossing ID;
- parcel ID when known;
- receipt ID when known;
- disposition;
- timestamp.

A stamp is visual ephemera, not protocol authority.

~~~text
STAMP != AUTHORITY
STAMP != RANKING
STAMP != OWNERSHIP
~~~

This supports printable passport-like provenance without turning stamps into identity or title.

## Interaction specimen

Open:

~~~text
demo/three-world-post-office.html
~~~

The specimen shows:

- one common letter body;
- three recipient-specific covers;
- three returned held letters;
- per-return checkboxes at the compositor;
- explicit open tensions;
- a fourth-world descendant.

The browser specimen does not execute the cryptographic protocol.

The Node witness does.

## What this earns

THREE WORLD POST OFFICE 001 proves:

- one exact Carry Parcel identity can be wrapped for three independent sovereign destinations;
- each recipient cover remains capability- and encryption-specific;
- three materially dumb roads can carry those covers;
- every destination can independently RECEIVE and HOLD the same letter body;
- every destination can send one bounded reply through its own return envelope;
- the source can preserve all three returned letters without ranking or merging them;
- a human compositor can make an explicit selection from the returned carriers;
- omitted material remains attributable in the postbag;
- a fresh descendant can name all three reply crossings as parents;
- a fourth sovereign world can receive that descendant without inheriting any prior world's authority.

## What this does not earn

This witness uses synthetic local runtime worlds named Cedar, River, Ember, and Horizon.

It does **not** claim to have contacted ChatGPT, Claude, Grok, or any other external model/provider.

It also does not prove:

- external provider automation;
- semantic equivalence between model families;
- objective consensus;
- quality ranking;
- best-answer selection;
- distributed group identity;
- global post-office state.

Those remain separate doors.

## Laws

~~~text
LETTER BODY != COVER
SAME PARCEL != SAME CIPHERTEXT
SAME QUESTION != SHARED WORLD
RECIPIENT COVER != GLOBAL BROADCAST
PARALLEL DELIVERY != CONSENSUS

POSTBAG != MERGER
THREE RETURNS != AGREEMENT
RETURN ORDER != RANKING
COLLECTION != ADMISSION
DIVERGENCE != FAILURE

COMPOSITION != CONSENSUS
SELECTION != RANKING
OMISSION != NONEXISTENCE
DESCENDANT != SUMMARY

STAMP != AUTHORITY
STAMP != RANKING
STAMP != OWNERSHIP
~~~

> **One letter can cross three borders without becoming one shared room.**

> **Hold all. Rank none. Compose the descendant deliberately.**
