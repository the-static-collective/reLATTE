# MORTALITY TEST 001

**Status:** bounded executable R12 witness  
**Date:** 2026-10-01

## Thesis

A sovereign reLATTE node may die without either erasing its attributable history or allowing a successor to impersonate it.

R12 therefore tests **succession**, not backup restoration.

```text
PREDECESSOR A
   own key
   own journal
      |
 local history
      |
 checkpoint + mortality seed
      |
 mirrored crossings + peer archives
      |
      X
   KILL A
      |
 surviving mirror + succession capsule
      |
 SUCCESSOR S
   fresh world
   fresh particular
   fresh key
      |
 receives surviving artifacts
      |
 signs fresh succession acceptance
      |
 may make fresh local decisions
```

## Mortality seed

Before death, the predecessor may emit a detached signed `R12_MORTALITY_SEED` receipt.

The seed binds:

- predecessor world;
- predecessor receiver particular;
- predecessor history head;
- predecessor derived state reference;
- recoverable crossing IDs;
- latest local checkpoint commitment ID;
- checkpoint receipt-set root;
- policy `fresh-identity-required`.

The seed has:

```text
semantic_effect = none
```

It is not authority transferred to a successor.

```text
MORTALITY SEED != SUCCESSOR KEY
MORTALITY SEED != SUCCESSOR ADMISSION
```

## Succession capsule

A Succession Capsule is a content-addressed durable handoff artifact containing:

- predecessor mortality seed;
- signed historical receipt bodies;
- the R11 receipt-set commitment covering those historical receipts;
- the exact crossing IDs declared recoverable.

Verification requires:

1. mortality seed signature verifies;
2. R11 commitment shape verifies;
3. historical receipts reconstruct the commitment;
4. all historical receipts name the predecessor world and particular;
5. all predecessor receipts use the same predecessor signing key;
6. checkpoint history head equals the seed's predecessor history head;
7. every recoverable crossing has a real predecessor `RECEIVED` receipt;
8. recoverable IDs exactly match the seed declaration.

The capsule contains only public verification material for the predecessor.

It does not contain the predecessor private key.

## Redundant survival

The executable specimen creates:

- mirror B;
- mirror C;
- peer succession archive B;
- peer succession archive C;
- one foreign Git checkpoint.

Both mirrors retain the same recoverable signed crossings.

Both peer archives retain the same Succession Capsule.

The test then deletes:

```text
predecessor receiver root
predecessor private key
mirror B
peer archive B
foreign Git witness
```

Only mirror C and peer archive C remain.

## Reconstitution

The surviving succession capsule and mirror are sufficient to create a successor receiver.

The successor must use:

- a different world ID;
- a different receiver particular;
- a newly generated local P-256 key.

Attempting to reuse the predecessor world or receiver particular is rejected.

The survivor mirror serves each recoverable crossing under R7 semantics.

The successor then performs ordinary R3 RECEIVE for each crossing.

At this point:

```text
received != admitted
```

The successor has inherited no predecessor disposition.

## Succession acceptance

After receiving at least one recoverable crossing, the successor signs an `R12_SUCCESSOR_ACCEPTANCE` receipt.

It declares:

```text
authority = fresh-local
inherited_private_key = false
inherited_admission = false
```

and references the predecessor mortality seed.

The acceptance receipt's public key must differ from the predecessor seed's public key.

```text
SUCCESSOR != PREDECESSOR
CONTINUITY != IDENTITY
ANCESTRY != AUTHORITY
```

## Fresh authority

Reconstitution alone does not admit historical material.

The decisive test shows:

1. successor receives mirrored crossings;
2. successor snapshot has zero admitted crossings;
3. successor signs its fresh succession acceptance;
4. only then, as a separate local act, successor may ADMIT one crossing;
5. the new ADMIT receipt names the successor world and is signed by the successor key.

Thus:

```text
PREDECESSOR ADMIT != SUCCESSOR ADMIT
RECONSTITUTION != INHERITED CANON
```

## Historical attribution

The predecessor's historical receipts remain cryptographically valid after the predecessor dies.

They continue to name:

```text
world:r12-predecessor
particular:r12-predecessor
```

They are not rewritten to name the successor.

The surviving mirror also preserves each original crossing's own source identity rather than rewriting it to the successor.

```text
DEAD NODE != ERASED NODE
SUCCESSOR != RETCON
```

## Private-key death

The predecessor receiver root contains its private key while alive.

The mortality test deletes that root.

The surviving capsule retains only public JWK material needed to verify predecessor receipts.

No predecessor private-key coordinate is present in the capsule.

The successor cannot sign as the predecessor.

## Hostile proof

The verifier rejects:

- successor reusing predecessor world identity;
- successor reusing predecessor receiver particular;
- edited historical receipts;
- edited uptake of recoverability;
- predecessor receipt key substitution;
- recoverable crossing IDs that lack historical RECEIVE evidence;
- checkpoint/seed history mismatch;
- successor key equal to predecessor key.

## What this earns

At the current envelope level, R12 proves:

- surviving peers retain attributable crossings;
- redundant succession artifacts survive peer loss;
- predecessor private local state may disappear;
- predecessor private key may disappear;
- successor can be reconstituted from surviving attributable material;
- successor has fresh local identity and key;
- successor inherits no admission;
- historical receipts still name and verify as the dead predecessor;
- new successor acts remain attributable to the successor.

## What it does not earn

This does not claim:

- recovery of the dead private journal;
- recovery of the dead private key;
- identity continuity;
- legal succession;
- organizational ownership transfer;
- automatic successor election;
- quorum-based succession;
- remote disaster recovery;
- full R13 composition pulse.

## Laws

```text
SUCCESSOR != PREDECESSOR
RECONSTITUTION != RESURRECTION
CONTINUITY != IDENTITY
ANCESTRY != AUTHORITY
HISTORY != AUTHORITY TRANSFER
HISTORICAL RECEIPT != SUCCESSOR RECEIPT
SURVIVING ARTIFACT != INHERITED AUTHORITY
PREDECESSOR ADMIT != SUCCESSOR ADMIT
DEAD NODE != ERASED NODE
SUCCESSOR != RETCON
```
