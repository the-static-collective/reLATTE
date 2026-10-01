# Slice 008 — The Block Opens Into a Room

**Status:** cross-project projection seam / non-normative  
**Date:** 2026-10-01  
**Donor/receiver:** reLATTE → ROroomOM

> **The navigator finds the particular. The door chooses the projection. The Room composes the encounter.**

The walkable provenance browser has so far behaved like a block explorer with stronger local semantics.

This slice adds the missing transition from **inspectable** to **inhabitable**.

A verified reLATTE particular may be exported as a bounded, non-authoritative **enterable particular** projection.

That packet can be handed to a renderer such as ROroomOM.

The source remains reLATTE's.

The encounter becomes ROroomOM's.

---

## 1. Three layers

```text
reLATTE
= what particular / crossing am I at?

COM⁵
= through what metabolic door am I encountering it?

ROroomOM
= how does this encounter become an inhabitable local room?
```

These layers compose without collapsing.

```text
NAVIGATION != PROJECTION
PROJECTION != RENDERING
RENDERING != AUTHORITY
```

---

## 2. One particular, five doors

An enterable packet exposes exactly five ordered doors:

```text
COMPOST
COMPOSE
COMPUTE
COMMUTE
COMMUNE
```

Each door carries:

- verified direct COM⁵ observations already established by reLATTE;
- local renderer instrument proposals;
- no source mutation authority.

The subject identifier is the same through every door.

```text
FIVE DOORS != FIVE SUBJECTS
DOOR CHOICE != IDENTITY CHANGE
```

---

## 3. Door instruments

The first projection grammar proposes one structural instrument per door:

```text
COMPOST → residual shelf
COMPOSE → relation board
COMPUTE → receipt console
COMMUTE → road map
COMMUNE → participation room
```

These are renderer hints.

They are not protocol objects.

```text
INSTRUMENT PROPOSAL != REQUIRED UI
INSTRUMENT PROPOSAL != CAPABILITY
```

---

## 4. Media becomes Magic Lego

A verified crossing may already declare addressed payload refs with media types.

For the COMPOSE door, the first adapter maps those refs into renderer candidates:

```text
audio/*         → audio player
video/*         → video player
image/*         → image viewer
text/*          → text sheet
application/pdf → document viewer
other           → source inspector
```

This is enough for the room to assemble combinations such as:

```text
song
+
lyric sheet
+
video
+
cover art
+
relation board
```

without importing the media bytes into the packet.

```text
MEDIA REF != MEDIA CONTENT
MEDIA TYPE != SEMANTIC MEANING
PLAYER != OWNERSHIP
```

A `text/plain` payload may become a text-sheet instrument.

That does not prove the text is lyrics unless the source declared an appropriate role.

---

## 5. The same media can participate differently later

This first slice only attaches media instruments directly to COMPOSE.

That is intentionally conservative.

Future ROroomOM composition may lawfully reuse the same addressed media under another door when a separate adapter explains why.

Examples:

- an audio file as composition material;
- the same audio file as a COMMUTE carrier specimen;
- a video as COMMUNE performance evidence;
- a lyric sheet as COMPOST source residue.

But the renderer must not infer those roles merely from MIME type.

```text
MEDIA FORMAT != METABOLIC ROLE
```

---

## 6. Re-entry comes through the door

An enterable packet may optionally include the current verified encounter context from the walk.

Thus:

```text
A
→ B
→ A
→ enter COMPOSE
```

can hand ROroomOM:

```text
same subject A
same door COMPOSE
re-entry occurrence #2
return road already witnessed
```

ROroomOM may use that context to compose a different local encounter.

It may not claim A changed.

```text
PATH-AWARE ROOM != SOURCE-ALTERING ROOM
```

---

## 7. Portable boundary

The packet declares:

```text
projection_status = derived-non-authoritative
authority = none
```

and carries explicit boundaries:

```text
PROJECTION != AUTHORITY
DOOR != CROSSING
MEDIA REF != MEDIA CONTENT
ROOM RENDERING != SOURCE MUTATION
RECEIVER ENCOUNTER != SOURCE IDENTITY
```

A receiving project must validate the packet structure and create its own local encounter identity.

It must not treat the packet as a project-native grant.

---

## 8. Workstation shape

```text
                reLATTE NAVIGATOR
                        │
                     OPEN
                        ↓
                  PARTICULAR
                        │
      ┌─────────┬───────┼───────┬─────────┐
      ↓         ↓       ↓       ↓         ↓
   COMPOST   COMPOSE  COMPUTE COMMUTE   COMMUNE
      │         │       │       │         │
      └─────────┴───────┼───────┴─────────┘
                        ↓
                     ROroomOM
                   MAGIC LEGO
                    WORKSTATION
                        ↓
             local instrument deck
                        ↓
                   ENCOUNTER
                        ↓
                 local receipt
                        ↓
                   RETURN ROAD
```

> **Particulars are navigable. Doors are projective. Rooms are inhabitable.**
