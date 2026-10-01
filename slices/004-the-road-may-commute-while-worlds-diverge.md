# Slice 004 — The Road May Commute While the Worlds Diverge

**Status:** executable-boundary pressure test / non-normative  
**Date:** 2026-10-01  
**Companion:** [COM⁵ — The reLATTE Metabolism](../docs/COM5.md)

> **Transport may preserve a crossing without preserving a receiver's consequence.**

This slice pressure-tests the **COMMUTE** role of COM⁵ against reLATTE's existing crossing law.

It does not add transport protocols, consensus, receiver semantics, or a COM⁵ field to any shared schema.

---

## 1. Specimen

Assume one valid signed crossing `T`.

It leaves Source A and reaches two sovereign receivers through materially different carriers.

```text
                    relay C
                  /         \
SOURCE A -- T ---             ---> WORLD B
                  \         /
                    Git M

SOURCE A -- T --- removable media ---> WORLD D
```

The carriers differ.

The crossing identity does not.

Candidate success condition:

```text
bytes(T via relay C)
  identify as
same crossing T

bytes(T via Git M)
  identify as
same crossing T

bytes(T via removable media)
  identify as
same crossing T
```

The transport path is not part of the crossing's semantic authority.

```text
CARRIER != SOURCE
CARRIER != RECEIVER
CARRIER != AUTHORITY
```

---

## 2. What may commute

The narrow commuting surface is structural.

A lawful carrier path should be able to preserve:

- crossing identity;
- source signature validity;
- canonical addressed payload identity;
- declared ancestry;
- declared protocol fields.

If two carrier paths alter those invariants, the diagram did not commute for this purpose.

```text
PATH DIFFERENCE
+
INVARIANT PRESERVATION
=
TRANSPORT COMMUTATION
```

This is not a universal mathematical claim.

It is a bounded reLATTE transport test.

---

## 3. What must not be forced to commute

Now let World B and World D evaluate the same verified crossing.

```text
                 SAME T
                /      \
               /        \
          WORLD B      WORLD D
             ↓            ↓
           ADMIT        REFUSE
             ↓            ↓
       consequence B   receipt D
```

Both histories may be lawful.

The fact that the crossing commuted does not require the worlds to converge.

```text
CROSSING IDENTITY COMMUTES
!=
LOCAL CONSEQUENCE COMMUTES

VERIFIED SAME INPUT
!=
REQUIRED SAME OUTPUT
```

A third receiver may HOLD.

A fourth may RETURN.

The receiving worlds remain sovereign over admission.

---

## 4. Cloud without semantic crown

A cloud relay may make transport easier.

It may cache, mirror, route, retry, checkpoint, or surface health.

It must not derive:

```text
transported successfully
therefore
admitted successfully
```

or:

```text
all receivers obtained the same crossing
therefore
all receivers must reach the same meaning
```

The cloud can help a road commute.

It cannot demand that sovereign destinations collapse.

```text
CLOUD COORDINATION
!=
SEMANTIC CONSENSUS
```

---

## 5. Hostile controls

A future transport implementation should survive cases equivalent to:

1. relay path and file-copy path deliver byte-identical signed crossing material;
2. a carrier mutates one signed field and verification fails;
3. a carrier duplicates delivery and receiver idempotence prevents accidental double consequence;
4. two receivers verify the same crossing and make different dispositions;
5. a receiver lacks required local evidence and HOLDs rather than inventing it;
6. cloud relay disappears while retained crossing bytes remain independently verifiable;
7. a mirror adds local metadata without mutating signed crossing identity;
8. transport order differs without manufacturing a global semantic order.

Success is:

> **The road is verifiable, the destinations remain sovereign, and divergence remains attributable.**

---

## 6. COM⁵ fit

This slice isolates one seam in the larger metabolism.

```text
COMPOSE
  crossing T becomes a declared relation
       ↓
COMPUTE
  sender constructs and signs T
       ↓
COMMUTE
  replaceable carriers preserve T's invariants
       ↓
COMMUNE
  receivers encounter T within shared ecology
       ↓
COMPOST
  receipts, refusals, residuals, failures, and later reinterpretations remain substrate
```

The roles overlap.

No universal clock or stage field is required.

---

## 7. Stable compression

```text
THE ROAD MAY COMMUTE
WHILE THE WORLDS DIVERGE.

TRANSPORT != AUTHORITY
VERIFICATION != ADMISSION
SAME CROSSING != SAME CONSEQUENCE
DIFFERENCE != FAILURE
```
