# Slice 007 — The Return Is a New Encounter

**Status:** bounded executable specimen / non-normative  
**Date:** 2026-10-01  
**Depends on:** Slice 006 — Re-center Without Forgetting the Road

> **SAME PLACE != SAME ARRIVAL**

A walkable provenance browser eventually encounters a simple but important case:

```text
A → B → A
```

The final `A` may resolve to the same underlying particular as the first `A`.

But the browser is no longer in the same traversal position.

It has a road behind it.

This slice records that difference without mutating A.

---

## 1. Re-entry belongs to the walk

A re-entry witness is derived from ordered traversal history.

It is not written into the focal subject.

```text
SUBJECT A
!=
ENCOUNTER WITH A

SAME SUBJECT
+
DIFFERENT PATH POSITION
=
NEW ENCOUNTER
```

The first executable form records:

- subject;
- encounter index;
- occurrence number;
- first encounter index;
- whether this encounter is a re-entry;
- the verified step used to arrive;
- the subjects encountered between first entry and return.

---

## 2. No automatic changed-world claim

The browser may truthfully say:

```text
I RETURNED TO A
BY
B → A
```

It may not automatically say:

```text
A CHANGED
```

or:

```text
THE WORLD CHANGED
```

when both encounters were reconstructed from the same fixed history cut.

The changed thing that is definitely established is the **encounter context**.

```text
RETURN != MUTATION
RE-ENTRY != NEW SUBJECT
NEW ENCOUNTER != NEW WORLD STATE
```

A future newer history cut may establish changes in A itself.

That would be additional evidence, not a consequence of navigation.

---

## 3. The road comes back with you

When A is revisited, the re-entry witness keeps the verified return step.

```text
FIRST A
  ↓
B
  ↓ verified road
RETURN A
```

A later reader can ask:

- Was this actually a return?
- Which occurrence of A is this?
- What lay between the encounters?
- What verified road justified the final hop?
- Did the underlying history cut change?

The first implementation answers the first four and explicitly leaves the fifth unchanged.

---

## 4. Re-entry is deterministic

For one fixed ordered path:

```text
A → B → A → B → A
```

the A encounters are:

```text
A #1  initial
A #2  re-entry
A #3  re-entry
```

Occurrence number is a property of this walk.

It is not a universal identity field for A.

```text
ENCOUNTER NUMBER != SUBJECT IDENTITY
WALK HISTORY != GLOBAL HISTORY
```

---

## 5. Why this matters for COM⁵

Re-entry reveals that a room can remain structurally identical while its meaning to the traversal changes because the road now exists in memory.

This is not semantic authority.

It is path-aware presentation.

```text
OPEN A
→ COM⁵ room
→ walk
→ RETURN A
→ same COM⁵ room data
  +
  re-entry witness
  +
  remembered road
```

The browser gains context without rewriting source evidence.

---

## 6. Hostile controls

The implementation must preserve:

1. A → B → A produces one re-entry witness for A;
2. A → B produces none;
3. repeated returns increment occurrence count deterministically;
4. the final A remains the same subject identifier;
5. re-entry does not claim the subject mutated;
6. the return road remains attributable;
7. the walk is evaluated against the same supplied history cut.

The governing laws:

```text
SAME PLACE != SAME ARRIVAL
RETURN != MUTATION
RE-ENTRY != NEW SUBJECT
ENCOUNTER NUMBER != SUBJECT IDENTITY
PATH-AWARE != SOURCE-ALTERING
```

> **The crossing becomes a place. The return becomes an encounter.**
