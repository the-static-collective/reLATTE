# PORCH 001 + CREATIVE CUSTOMS 001

**Status:** bounded executable specimen  
**Date:** 2026-10-01

## Thesis

COM⁵ capsules need a way to knock on another world's door without treating delivery as permission.

A **Porch** is a content-addressed public boundary declaration.

**Creative Customs** evaluates an arriving crossing against that declaration and emits a receipt before local admission.

```text
COM⁵ CAPSULE
    ↓
SIGNED CROSSING
    ↓
PORCH
    ↓
CREATIVE CUSTOMS
    ↓
WELCOME / HOLD / REFUSE
    ↓
SIGNED CUSTOMS RECEIPT
    ↓
SEPARATE LOCAL ADMISSION DECISION
```

## Constitutional laws

```text
PORCH != INTERIOR
WELCOME != ADMIT
CUSTOMS != LOCAL CONSEQUENCE
RETURN REQUEST != OBLIGATION
RELEASE SIGNAL != LICENSE
DELIVERY != CONSENT
```

The critical non-collapse is:

> **WELCOME means the knock is welcome. It does not authorize what happens after the door opens.**

## Five porch surfaces

### WELCOME

Names crossing kinds, grammar IDs, and non-authority declarations the ecology is prepared to inspect.

### HOLD

Defines what happens to unmatched arrivals. The specimen chooses to hold unknown grammars rather than silently admitting or deleting them.

### REFUSE

Names crossing kinds or grammars that should not pass customs and may require particular non-authority declarations.

### RETURN

Publishes a return address and the receipts the ecology would find useful if a crossing proceeds.

A request for a return receipt is not an obligation imposed on the sender.

### RELEASE

Names material the porch itself is offering for reuse.

This field is deliberately strict:

> **RELEASE SIGNAL != LICENSE**

If a porch offers rights-bearing material, it must also name at least one explicit license reference. An empty release block is lawful.

## Creative Customs

Customs produces a normal reLATTE receipt draft with:

- the original crossing ID;
- the porch content address as contract reference;
- the capsule address;
- the grammar ID;
- WELCOME / HOLD / REFUSE lane;
- return requests;
- release declaration;
- no semantic effect.

Customs never calls a crossing admitted.

## Specimen proof

The first porch welcomes the Cost-Carrying Return capsule from COM⁵ Capsule 001.

The test then deliberately sends that welcomed crossing to a downstream receiver whose local policy refuses the grammar.

Expected result:

```text
CUSTOMS_WELCOME
      ↓
COM5_REFUSE
```

Both receipts are true.

That is the point.

## What this does not prove

This is not a public licensing standard, legal consent protocol, network discovery service, or generalized policy engine.

It does not prove that an external creative community has actually adopted or consented to reLATTE.

It establishes one executable boundary grammar that can later be pressure-tested against real voluntary participants.
