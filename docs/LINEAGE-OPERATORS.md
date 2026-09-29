# Candidate Lineage Operators

**Status:** CANDIDATE / NON-NORMATIVE / NOT PROMOTED  
**Date:** 2026-09-29  
**Pressure source:** Slice 002 — National Coffee Day coffee-lineage specimen

reLATTE v0 already carries parent references, descendants, residuals, and local receipts.

The coffee-lineage pressure test suggests that future versions may benefit from naming the **structural operator** that relates inputs to outputs.

This note proposes vocabulary only.

It does not change the schemas.

---

## 1. Why operators

A generic crossing can tell us that something touched something.

It may not tell us enough about the shape of the lineage.

Compare:

```text
A → B
```

with:

```text
A ──SPLIT────→ B + C
A + B ─MERGE→ C
A ─TRANSFORM→ B
A ─EXTRACT──→ B + residual C
```

These relations should not be silently treated as equivalent.

---

## 2. Candidate vocabulary

### TRANSFER

The relevant particular remains the same lineage identity while custody, location, possession, or receiving context changes.

```text
A@World1 → A@World2
```

Possible law:

```text
TRANSFER != TRANSFORMATION
```

### SPLIT

One parent yields two or more separately addressable descendants.

```text
A → B + C + ...
```

The parent may remain as a historical source even if it is no longer an active material unit.

Possible law:

```text
DESCENDANTS SHARE ANCESTRY
!=
DESCENDANTS SHARE IDENTITY
```

### MERGE

Two or more parents contribute to one descendant.

```text
A + B + ... → C
```

Possible law:

```text
PLURAL ANCESTRY
!=
SOURCE COLLAPSE
```

### TRANSFORM

One or more inputs produce a descendant whose present identity should not be treated as identical to any one input.

```text
A → B
```

The important distinction from TRANSFER is semantic identity, not visual graph shape.

Possible law:

```text
ANCESTRY SURVIVES
WITHOUT REQUIRING IDENTITY TO SURVIVE
```

### EXTRACT

An input is acted upon to produce a primary descendant plus one or more residuals.

```text
A + context → B + residual C
```

Possible law:

```text
PRIMARY OUTPUT != WHOLE CONSEQUENCE
```

### CONSUME

A local domain records that a particular ceased to remain available for the declared local use.

```text
A → locally exhausted
```

This is not metaphysical annihilation.

Possible law:

```text
LOCALLY CONSUMED
!=
ERASED FROM HISTORY
```

### RESIDUAL

A residual is not necessarily an operator; it is a first-class result role.

It names something left by a relation that is not the primary desired output.

Possible law:

```text
RESIDUAL != FAILURE
```

---

## 3. Quantities are domain law

reLATTE should not assume universal conservation semantics.

Some domains may meaningfully declare:

- mass;
- count;
- duration;
- money;
- bytes;
- energy;
- probability;
- rights/capabilities;
- no conserved quantity at all.

Therefore:

```text
RELATION SHAPE
!=
CONSERVATION CLAIM
```

A future operator declaration may optionally reference a domain-owned quantity schema.

It should not invent one.

---

## 4. Unknowns remain explicit

A merge may have unknown proportions.

A split may have missing descendants.

A transform may include unmeasured loss.

An extraction may have residuals that were not captured.

A lawful lineage surface should be able to say:

```text
known
estimated
private
unmeasured
missing
unknown
```

without converting those states into zero.

Candidate law:

```text
UNKNOWN != NONE
```

---

## 5. Candidate future shape

Not a schema proposal; only an illustrative shape:

```json
{
  "operator": "MERGE",
  "inputs": ["sha256:lot-a", "sha256:lot-b"],
  "outputs": ["sha256:blend-c"],
  "residuals": [],
  "quantity_model_ref": null,
  "claims": {
    "proportions": "unknown"
  }
}
```

A later protocol version would still need to decide whether this belongs:

- in the crossing envelope;
- in an Organ Contract;
- in a descendant relation object;
- in a separate lineage receipt;
- nowhere in the shared substrate.

That decision is deliberately unresolved.

---

## 6. Promotion test

Do not add lineage operators to the shared schemas merely because coffee makes them intuitive.

Promotion should require at least:

1. two or more independent donor domains needing the same distinction;
2. an example where leaving the operator implicit causes real ambiguity;
3. replay/reconstruction benefit;
4. no theft of domain-local semantics;
5. hostile cases for split, merge, missing outputs, and false conservation;
6. a migration path that does not rewrite v0 receipts.

Until then:

> **Useful vocabulary is not yet protocol law.**
