# RELATIONAL FISSION 001 — Split the pair, keep the witness

**Status:** bounded executable experiment on a branch  
**Donors:** reLATTE Slice 001; Moment/Perspective R8; Cultural Descendant R10; FreeGraph / UNDERSTORY  
**Promotion:** none. No change to the v0 crossing or receipt schemas.

## The particular

A relationship is not merely an edge flag attached to two objects. It may be
an independently addressed historical occurrence, with distinct participants,
claims, events, and later descendants.

```text
A ───── RELATION R0 ───── B
              │
       independently signed
       endpoint attestations
              │
   endpoint A releases R0
              │
      R0 remains addressable
      A remains A; B remains B
              │
       a later new act
              ▼
A ───── RELATION R1 ───── B
        parent = R0
    new signature + attestations
```

Both endpoints remain independent particulars. The relation is a third
particular: a signed formation crossing, with separately signed event receipts.
The relation cannot sign, decide, consent, or exercise authority on behalf
of either endpoint.

## The laws

```text
SEPARATION != ERASURE
RELEASE != VACANCY
REUNION != REVERSAL
FISSION != EXTINCTION

PRESENCE != HISTORY
FREEDOM != ABANDONMENT
CONTINUITY != REPETITION

RELATION != ENDPOINT
FORMATION != MUTUAL ATTESTATION
SIGNED ATTESTATION != HUMAN CONSENT
RELEASE RECORD != EXTERNAL STATE CHANGE
ANCESTRY != AUTHORITY
REUNION != REACTIVATION
PROJECTION != AUTHORITY
```

## Portable events

1. **FORMATION:** A signs an ordinary `CrossingEnvelopeV0` of kind
   `RELATION_FORMATION`. Its `extensions.relation` names exactly two
   distinct public-key-bearing endpoints, purpose and optional parent. The
   formation's first endpoint must be the crossing signer. It carries no
   requested semantic effect, capability, or admission.
2. **ATTEST:** Each endpoint separately signs a `ReceiptV0` of kind
   `RELATION_ATTEST` binding the formation crossing ID and its own index.
   One signed account is **not** promoted into a mutual relation.
3. **RELEASE:** Either endpoint independently signs `RELATION_RELEASE`.
   This requires no counter-signature and does not erase attestation history.
   It changes this read-only projection to `released`, **not** the other
   endpoint's world, rights, obligations, or local interpretation.
4. **REUNION:** A new signed `RELATION_FORMATION` names the original
   crossing as parent. Both endpoints must newly attest. The original ID
   remains released; the descendant has a distinct ID.

A relation's status is derived from a set of verified receipts:
`proposed` / `dual-attested` / `released`. Events are idempotent by
receipt ID; the projection is order-independent and grants no authority.
`released` means at least one cryptographically attributable release exists,
**not** proof that a prior mutual relation ever existed. The projection also
reports exactly which endpoints attested, allowing clients to retain that
distinction.

A `verifyFreshReunion` witness accepts only an old relation with two
attestations and a release, and a newly dual-attested relation with an explicit
parent reference. This first specimen requires the same ordered endpoint keys:
key rotation and independent identity migrations are deliberately out of scope.

## FreeGraph / UNDERSTORY consumer boundary

A graph consumer can render:

- a historical R0 edge (even after split) and its release receipt;
- an independent new A→X or B→Y proposal **only after** fresh local actions;
- a new R1 edge with a visible provenance path back to R0;
- different local interpretations, without a global active/inactive decree.

**Do not automatically connect nearby nodes.** Mycelial proximity, graph
centrality, recommendations, or remembered co-presence may be proposal
surfaces, not authorizations. A signed release cannot create a new partner,
advertise availability, oblige reunion, transfer ownership, or rewrite a
private record.

## Hostile controls

The tests cover a single-sided attestation not counting as mutual, duplicates,
unilateral release, original identity surviving release, fresh formation and
both new attestations, wrong signing keys, tampering, cross-relation event
replay, a false ancestry claim, and release before mutual formation.

Run (from the reLATTE root):

```bash
npm run verify
```

## Nonclaims and next door

This is an **opt-in proof surface**, not a default behavior for social
relationships, user accounts, interpersonal consent, or resource ownership.
A P-256 signature establishes control of a signing key only. It does not
prove a person's identity, consent in a legal or interpersonal sense, or
power over someone else's data. Private relationship history may require
encryption, access controls, retention/deletion policies, and consent beyond
this experiment. No peer storage, local receiver admission, key succession,
real-time synchronization, or FreeGraph UI wiring is supplied here.

**Next proof:** place two independently governed graph replicas beside this
portable relation witness, show a release received on only one side, and
verify that the other side neither silently obeys it nor erases it.
