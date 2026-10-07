# TWO-WITNESS-CRUCIBLE-001

> FOUNDATION-OF-TRUST-001 repair: same-key JWK metadata must not produce key
> distinctness. Witness outputs now include E0/E2/E3 evidence levels and explicitly
> leave truth, custody domains, authority and admission UNOBSERVED. Pair assessment
> does not discover unseen equivocation or authorize membership; consequential
> evaluation uses the pinned policy/inventory assessor. See the [claim matrix](FOUNDATION-OF-TRUST-001-CLAIM-MATRIX.md),
> C02, C03, C14, C16, C22, C25 and C32.

## Question

Can one handoff survive hostile disagreement without letting a source claim constitute itself?

The bounded rule under test is:

```text
ONE VALID SOURCE WITNESS
  -> CLAIMED

SOURCE + MATCHING RECEIVER WITNESS
  -> CORROBORATED

DISAGREEMENT / INVALIDITY / ROLE-COLLAPSE
  -> HOLD
```

## Witnesses

Witness 1 is the signed crossing itself.

It binds:

- source particular;
- source world;
- crossing identity;
- payload reference;
- intended receiver world;
- intended receiver particular;
- handoff identity.

Witness 2 is a separately signed receiver receipt.

It must independently bind the same:

- crossing;
- handoff identity;
- source particular;
- receiver world;
- receiver particular;
- thing received.

## Hostile matrix

The executable crucible attacks:

1. source witness only;
2. matching two-key source/receiver pair;
3. one signing key wearing both roles;
4. two distinct keys created under one process;
5. receiver disagreement about target particular;
6. receiver disagreement about the handed thing;
7. replaying a valid receiver witness against a different crossing;
8. refusal substituted for positive reception;
9. post-signature receiver tampering;
10. post-signature source tampering.

## Important ceiling

Two distinct cryptographic keys are **not** proof of two independent custodians.

The current result can establish only:

```text
DISTINCT_SIGNING_KEYS_ONLY
```

It cannot establish from signatures alone:

- distinct humans;
- distinct operators;
- distinct machines;
- distinct administrative domains;
- non-collusion.

Therefore:

```text
DISTINCT KEYS != INDEPENDENT CUSTODY
CORROBORATION != TRUTH
CORROBORATION != ADMISSION
```

A future stronger witness must add an independently evidenced custody or world boundary rather than silently promoting key distinctness into social independence.

## Why this matters for FatherHand

A founding handoff should not become lineage truth merely because the founder says it occurred.

The receiver must independently bind the same edge.

```text
FATHER
   |
   | signed crossing
   v
HANDOFF EDGE
   ^
   | signed receipt
   |
CHILD
```

The evidence belongs to the edge.

Neither endpoint alone gets to constitute the whole relation.
