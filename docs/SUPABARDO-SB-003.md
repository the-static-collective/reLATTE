# SUPABARDO SB-003 — The Ark That Outlived Its World

**Date:** 2026-10-07  
**Status:** executable mortality specimen  
**Branch:** `experiment/supabardo-sb003-ark-outlived-world-001`

## Why 003

SB-002 already exists as the Haunted Toaster creative-proposal crossing whose destination chooses `HOLD` without KEEP, REFUSE, or render authority.

SB-003 therefore tests a different pressure:

> Can a crossing survive the death of its predecessor world, permit a fresh successor to reconstruct useful capability, and still refuse to call the successor the predecessor?

## Law

```text
SUCCESSOR != PREDECESSOR
RECONSTITUTION != RESURRECTION
ANCESTRY != AUTHORITY
ARK != INHERITED ADMISSION
DESCENDANT != RESURRECTED ORIGINAL
```

## Ceremony

```text
foreign capability
      ↓
WORLD A locally ADMITs it
      ↓
A creates checkpoint + mortality seed
      ↓
A creates succession capsule
      ↓
A wraps exact capsule bytes as signed Ark crossing
      ↓
A RELEASES Ark
      ↓
SUPABARDO OPEN
      ↓
WORLD A dies
(receiver root + persisted private key deleted)
      ↓
Ark + mirror survive
      ↓
WORLD B is created with fresh identity
      ↓
B reconstitutes from Ark/capsule + surviving mirror
      ↓
R12_SUCCESSOR_ACCEPTANCE
semantic_effect = none
authority = fresh-local
inherited_private_key = false
inherited_admission = false
      ↓
B independently ADMITs recovered capability
      ↓
new descendant:
capability:sb003-successor-descendant
      ↓
SUPABARDO EXIT
semantic_effect = none
      ↓
Bardo dies
      ↓
B reopens and history still verifies
```

## What dies

The test literally deletes:

- World A's LocalReceiver root;
- World A's persisted private-key file with that root;
- the temporary SB-003 Bardo runtime.

After those deletions, the test reopens World B from its own local journal and verifies the surviving successor admission and Bardo EXIT receipts.

Claim limit: this proves filesystem-level death of the predecessor runtime and its persisted key material in the specimen. It does not prove RAM zeroization, hardware destruction, HSM guarantees, or impossibility of an independently copied key.

## What survives

- exact Ark bytes;
- signed Ark crossing;
- source RELEASE;
- unresolved Bardo receipt;
- succession capsule;
- surviving mirror of the recoverable crossing;
- fresh successor acceptance;
- B-local ADMIT;
- Bardo EXIT;
- B's local journal.

## The authority split

The successor acceptance is deliberately non-semantic:

```text
R12_SUCCESSOR_ACCEPTANCE
semantic_effect = none
```

It establishes that B has accepted an attributable continuity reference under a new local identity.

It does **not** import A's prior admission.

Only the later B-local `R3_ADMIT` creates B's consequence.

## Hostile cases

SB-003 currently attacks:

1. **identity resurrection** — attempting reconstitution with A's old world identity must fail with `SUCCESSOR_IDENTITY_MUST_BE_FRESH`;
2. **Ark substitution** — different Ark bytes do not match the signed Ark payload address;
3. **authority inheritance** — successor acceptance explicitly records no inherited private key and no inherited admission;
4. **Bardo meaning theft** — EXIT has `semantic_effect = none` and merely references B's independently signed local consequence.

## Result criterion

SB-003 passes only if, after A and the Bardo are both gone:

```text
A existed
A held local authority
A emitted an attributable Ark
A died

B != A
B used surviving evidence
B received recoverable material
B inherited no admission
B created a fresh local admission
B created a new descendant

the Bardo died
the history remained reconstructible
```

The intended result is:

> **Continuity can survive death without identity surviving by fiat.**
