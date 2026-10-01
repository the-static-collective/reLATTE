# Slice 009 — The Room May Ask for a Road

**Status:** bounded round-trip navigation seam / non-normative  
**Date:** 2026-10-01  
**Pair:** reLATTE ↔ ROroomOM

> **The Room may request a destination. It may not manufacture the road.**

Slice 008 lets reLATTE hand one enterable particular into ROroomOM.

This slice closes the first navigation loop in the other direction.

A local ROroomOM encounter may ask:

```text
"return me to the navigator
 and try to open B"
```

The request itself proves nothing.

reLATTE must independently reconstruct A's verified neighborhood and prove that B is actually reachable.

---

## 1. The request

ROroomOM may emit:

```text
roroomom.relatte-navigation-request/v0
```

with:

- source subject;
- requested subject;
- source COM⁵ door;
- local encounter id;
- `authority = none`;
- request type `recenter-if-verified-neighbor`;
- explicit anti-collapse boundaries.

The request is an intention carried across a project boundary.

```text
ROOM REQUEST != VERIFIED ROAD
REQUESTED SUBJECT != AUTHORIZED SUBJECT
```

---

## 2. reLATTE re-verifies

reLATTE does not trust the Room's remembered neighbor list.

It runs its own existing traversal proof:

```text
openVerifiedNeighbor(A, B, history cut)
```

Only if that succeeds does reLATTE issue a fresh enterable particular for B.

```text
ROOM asks for B
      ↓
reLATTE re-verifies A → B
      ↓ success
fresh enterable B
```

or:

```text
ROOM asks for X
      ↓
no verified A → X
      ↓
NON_NEIGHBOR_TRAVERSAL
```

---

## 3. The navigator stays sovereign over navigation

ROroomOM owns:

- the local encounter;
- the chosen door;
- local instrument use;
- the desire to continue toward a neighbor.

reLATTE owns:

- verification of the road;
- the re-centering rule;
- the fresh destination projection.

```text
ROOM INTENTION != NAVIGATOR AUTHORITY
LOCAL ENCOUNTER != VERIFIED TOPOLOGY
```

This preserves the two-project composition rather than quietly turning ROroomOM into the protocol runtime.

---

## 4. Round trip

The full first loop is now:

```text
reLATTE A
  ↓ enterable packet
ROroomOM
  ↓ choose door
local encounter
  ↓ request neighbor B
reLATTE
  ↓ reverify A → B
fresh enterable B
  ↓
ROroomOM may enter B
```

The next room is not a continuation because the previous Room said so.

It is a new receiver-local encounter over a fresh reLATTE projection.

---

## 5. Stable compression

```text
REQUEST != ROAD
MEMORY != VERIFICATION
DESIRE TO MOVE != PROOF OF REACHABILITY
ROOM != NAVIGATOR
NAVIGATOR != ROOM
```

> **The Room can ask where to go. The road still has to exist.**
