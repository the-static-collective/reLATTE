# Slice 005 — Browse the Metabolism

**Status:** bounded executable specimen / non-normative  
**Date:** 2026-10-01  
**Depends on:** COM⁵ + Five-Door Room

> **Do not draw the road when you can verify the crossing and the receipt.**

The Five-Door Room begins as a projection over explicit COM⁵ observations.

This slice earns the next step: derive a one-hop room from actual reLATTE crossing and receipt records.

The goal is not a universal crawler.

The goal is a trustworthy neighborhood.

---

## 1. Input

A bounded history cut may contain:

- signed `CrossingEnvelopeV0` records;
- signed `ReceiptV0` records;
- malformed or unknown material.

The browser verifies each recognized record using the existing reLATTE identity/signature profile.

A receipt does not create a road by itself.

For receipt-derived COMPUTE or COMMUTE observations, the referenced crossing must also be present and verified in the supplied cut.

```text
VERIFIED RECEIPT
+
MISSING VERIFIED CROSSING
=
ORPHAN RECEIPT
```

The orphan remains reportable as rejected input.

It does not become a metabolic edge.

---

## 2. Derived doors

A verified crossing can establish COMPOSE observations.

A verified receiver receipt, paired with its verified crossing, can establish:

- COMPUTE — an attributable receiver disposition/effect record;
- COMMUTE — an attributable road from the crossing to a receiver-side signed receipt;
- COMPOSE — declared descendants, if present;
- COMPOST — declared residuals, if present.

Nothing in the current protocol records independently earns COMMUNE.

Therefore the door remains empty unless later attributable evidence supports it.

```text
EMPTY COMMUNE DOOR
!=
NO COMMUNION EXISTS

EMPTY COMMUNE DOOR
=
THIS HISTORY CUT DOES NOT ESTABLISH IT
```

---

## 3. One hop only

The first neighborhood builder does not recursively crawl every reference.

It returns direct evidence references attached to observations about the focal subject.

```text
FOCAL PARTICULAR
      ↓
VERIFIED DIRECT OBSERVATIONS
      ↓
ONE-HOP NEIGHBOR REFS
```

This keeps the first browser bounded and inspectable.

A future traversal may choose to open a neighbor as a new focal room.

That is a new crossing of attention, not hidden recursion.

---

## 4. Hostile controls

The implementation must preserve:

```text
TAMPERED CROSSING
→ REJECT

VALID RECEIPT + ABSENT CROSSING
→ ORPHAN
→ NO COMMUTE EDGE

REFERENCE IN EVIDENCE
!=
AUTOMATIC RELATION INFERENCE

NO VERIFIED OBSERVATION
!=
NEGATION
```

The current genesis fixture supplies a useful specimen:

```text
particular:genesis-a
  ↓ signed crossing
crossing:d12...
  ↓ verified receiver receipt
world:beta / particular:genesis-b
```

The browser can now open the crossing and show COMPOSE, COMPUTE, and COMMUTE from verified records while leaving COMPOST and COMMUNE visibly empty.

---

## 5. Stable compression

> **Browse the metabolism. Verify the road. Preserve the fog.**

And:

```text
GRAPH SHAPE != VERIFIED ROAD
SIGNED RECEIPT != PRESENT CROSSING
ORPHAN RECEIPT != COMMUTATION
EMPTY DOOR != NEGATION
```
