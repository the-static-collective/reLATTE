# Slice 006 — Re-center Without Forgetting the Road

**Status:** bounded executable specimen / non-normative  
**Date:** 2026-10-01  
**Depends on:** Slice 005 — Browse the Metabolism

> **A browser may move its attention without rewriting how it got there.**

Slice 005 opens one verified COM⁵ neighborhood.

This slice adds the smallest traversal law:

```text
OPEN A
  ↓
inspect verified one-hop neighbors
  ↓
choose B
  ↓
prove A exposed B through attributable observations
  ↓
RE-CENTER ON B
  ↓
retain the A → B road evidence
```

The destination becomes focal.

The road does not disappear.

---

## 1. Re-center is not teleport

A user or agent may ask to open any identifier.

The walkable provenance browser is stricter.

A traversal step from A to B is accepted only when B appears in A's verified `neighbor_refs` under the same supplied history cut.

```text
KNOWN STRING != NEIGHBOR
MENTION ELSEWHERE != CURRENT ROAD
DESIRED DESTINATION != VERIFIED HOP
```

Attempting to jump to an unrelated subject fails with:

```text
NON_NEIGHBOR_TRAVERSAL
```

This is not an authorization failure.

It means only that the current room does not establish that road.

---

## 2. The road gets a receipt of attention

Each accepted traversal step retains the exact COM⁵ observation(s) whose evidence refs exposed the destination.

Conceptually:

```text
STEP
  from_subject
  to_subject
  road_observations[]
  from_room
  to_room
```

This lets a later reader ask:

> Why was B reachable from A?

without reconstructing the answer from UI state or memory.

```text
PATH MEMORY != DESTINATION OWNERSHIP
ROAD EVIDENCE != AUTHORITY OVER DESTINATION
```

---

## 3. Sparse destinations are lawful

A verified road may point to a subject for which the current history cut has no direct COM⁵ observations.

Example:

```text
crossing T
  ↓ verified receipt names
world:beta
```

The browser may lawfully re-center on `world:beta`.

Its room may be empty.

That does not invalidate the road that got there.

```text
VERIFIED ROAD TO B
+
EMPTY ROOM AT B
!=
CONTRADICTION
```

It means:

```text
A ESTABLISHES A RELATION TO B
BUT
THIS CUT DOES NOT YET ESTABLISH DIRECT B-CENTERED OBSERVATIONS
```

The fog remains visible.

---

## 4. Fixed-cut walking

A multi-hop walk is evaluated against one supplied history cut.

Each hop is independently re-derived.

```text
A → B → C
```

requires:

```text
A exposes B
AND
B exposes C
```

under that same cut.

C cannot retroactively create A → B.

A later traversal system may explicitly move to a newer cut, but that should be represented as a new causal input rather than silently changing old road evidence.

---

## 5. Hostile controls

The first implementation proves:

1. a verified one-hop neighbor can be opened;
2. the road observations are retained;
3. an arbitrary identifier cannot be used as a traversal hop;
4. tampering that invalidates the source crossing removes the road;
5. a sparse destination may still be reached when the source establishes it;
6. an empty path is invalid;
7. path order is explicit.

The governing laws:

```text
RE-CENTER != TELEPORT
NEIGHBOR != AUTHORITY
PATH MEMORY != DESTINATION OWNERSHIP
SPARSE DESTINATION != BROKEN ROAD
LATER NODE != RETROACTIVE EARLIER EDGE
```

---

## 6. Web 5.0 consequence

The Five-Door Room can now become a walkable surface:

```text
OPEN PARTICULAR A
      ↓
[COMPOST][COMPOSE][COMPUTE][COMMUTE][COMMUNE]
      ↓
choose verified neighbor B
      ↓
retain why B was reachable
      ↓
OPEN PARTICULAR B
      ↓
repeat
```

The browser does not need a globally complete graph.

It needs enough verified local road to make the next step honestly.

> **Walk the provenance. Keep the road. Preserve the fog.**
