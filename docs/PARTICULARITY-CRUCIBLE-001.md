# PARTICULARITY-CRUCIBLE-001

## Purpose

This specimen attacks two opposite identity failures in one bounded executable model:

- **false split** — one particular presents discontinuous states and is incorrectly treated as multiple particulars;
- **false collapse** — multiple particulars share identical inherited content and ancestry and are incorrectly merged.

The specimen borrows the identity problem only. It does **not** model or diagnose human psychology.

## Laws under test

```text
STATE != PARTICULAR
CONTROL != IDENTITY
ACCESS != EXISTENCE
SURFACE DISCONTINUITY != PARTICULAR DISCONTINUITY
PARTICULAR POINTER != CONTINUITY PROOF
NO PARTICULAR CONTINUITY WITHOUT A WITNESSABLE PATH

COPY != PARTICULAR
SHARED CONTENT != SHARED IDENTITY
SHARED ANCESTRY != SHARED STATE

ANCESTRY != AUTHORITY
SURFACE != REFERENT
SAME CARRIER != SAME REFERENT
DIFFERENT CARRIER != DIFFERENT REFERENT

NO CONTINUITY WITHOUT A WITNESSABLE PATH
```

## Crucible A — false split

One constituted particular `P` presents two state surfaces:

```text
PARTICULAR P
   ├─ STATE A
   │    self = A
   │    controller = controller:a
   │    access = event:e
   │
   └─ STATE B
        self = B
        controller = controller:b
        access != event:e
```

A state surface is not allowed to prove continuity merely by carrying the same `particular_id`. A recorded state-transition path must join the surfaces. An impostor surface that names the same anchor but lacks that path is not accepted as continuous.

The test requires all of these to be simultaneously true:

```text
state(A) != state(B)
controller(A) != controller(B)
self(A) != self(B)

particular(A) == particular(B)
witnessable_state_path(A, B) == true

impostor.particular_id == particular(A)
witnessable_state_path(A, impostor) == false

can_access(B, event:e) == false
witnessed(event:e) == true
```

A local access gap therefore cannot erase witnessed existence.

## Crucible B — false collapse

Two independent constitution events receive the same inherited content and lineage root:

```text
                 SAME SEED CONTENT
                      /     \
                     /       \
             CONSTITUTE Q   CONSTITUTE R
                  |              |
                  Q              R
```

The test requires:

```text
content(Q) == content(R)
lineage(Q) == lineage(R)

constitution(Q) != constitution(R)
particular(Q) != particular(R)
```

This makes constitution, rather than byte equality, the boundary that creates a fresh particular.

## Authority trap

Two state surfaces belong to one particular but use different controllers. A capability granted to controller A does not silently follow the particular into controller B.

```text
same particular
     |
  +--+--+
  |     |
 A       B
 |       |
grant    no grant
```

Required result:

```text
authority(A) == true
authority(B) == false
```

This keeps authority explicit and prevents identity continuity from becoming capability inheritance.

## Name-surface mutation

The specimen includes one provisional transformed carrier:

```text
ORIGINAL "ALPHA"
      |
      | PROVISIONAL_NU
      v
SIGN "ΑΛΦΑ"
```

Both surfaces name the same referent, but continuity is accepted only because an explicit transition record joins them.

A third surface with the same referent but no transition is **not** considered witnessably continuous.

Therefore:

```text
SAME REFERENT != PROVEN CONTINUITY

PROVEN CONTINUITY =
  SAME REFERENT
  + EXPLICIT TRAVERSABLE TRANSITION PATH
```

The transition explicitly carries:

```text
authority_transferred = false
```

The provisional `NU` label is deliberately not defined beyond the specimen. The experiment tests the slot before naming the metaphysics.

## Same carrier / different referent

Two distinct particulars may expose an identical carrier string:

```text
P -- "SAME-NAME"
Q -- "SAME-NAME"
```

The carrier equality does not merge their referents or name surfaces.

## Cold replay

The final test destroys all runtime projection state by serializing only the durable records and replaying from parsed data.

The reconstructed answer must be:

```json
{
  "A_and_B_same_particular": true,
  "A_and_B_same_state": false,
  "B_can_access_event": false,
  "event_existed": true,
  "A_has_controller_capability": true,
  "B_has_controller_capability": false,
  "surface_mutated": true,
  "referent_continued": true,
  "authority_transferred_by_name_transition": false
}
```

Tampering with constitution identity material must make replay fail.

## What this specimen does not claim

It does not establish a universal theory of personal identity.

It does not infer human identity from signatures, controllers, memory, names, or state.

It does not define `NU` as a normative protocol primitive.

It does not make reLATTE the authority over local identity.

It establishes only a bounded executable distinction:

> **A particular may survive surface discontinuity, while shared surfaces, bytes, ancestry, or names do not by themselves collapse distinct particulars.**
