# reLATTE Roadmap

The project should earn generality by surviving increasingly hostile crossings.

## R0 — Genesis

Already present:

- Slice 001: relation/crossing as the irreducible shared object.
- Ethereum inversion and organ ownership map.

No executable protocol is claimed yet.

## R1 — Canonical Crossing Envelope

Define a versioned, runtime-neutral envelope.

Required proof:

- canonical byte encoding;
- stable crossing ID;
- source/world/domain binding;
- payload content references;
- parent crossing references;
- declared kind/effect;
- signature field;
- hostile fixtures for mutation and ambiguity.

## R2 — Real Signature + Verification

Use a real cryptographic implementation, initially informed by Formation Trace's ECDSA P-256 specimen.

Required proof:

- same canonical payload verifies across two independent processes;
- one-byte mutation fails;
- wrong key fails;
- wrong world/domain fails;
- signature proves key continuity only.

## R3 — RECEIVE / HOLD / DISPOSITION

Implement a local receiver with Band-style semantics.

Required dispositions:

```text
HOLD
ADMIT
REFUSE
RETURN
```

Required proof:

- receipt does not imply admission;
- refused payload has no protected semantic effect;
- duplicate delivery is idempotent;
- local state reconstructs after restart.

## R4 — Two Sovereign Nodes

Run two independent nodes with distinct local histories and policies.

Required proof:

- A signs and sends;
- B verifies;
- B may admit or refuse;
- B emits its own signed receipt;
- A can verify B's response;
- neither node needs a shared mutable database.

## R5 — Divergent Lawful Receivers

Send the same crossing to B and C.

Required proof:

```text
same source crossing
→ B admits
→ C refuses
```

Both outcomes remain valid and attributable.

This is the first decisive anti-global-state proof.

## R6 — Replaceable Transport

Move the identical canonical crossing using at least two transports, for example:

- direct HTTP/relay;
- file/removable bundle or Git artifact.

Transport replacement must not change crossing identity.

## R7 — Mirror / Store / Serve Receipts

Recover the old Proof-of-Sharing insight without token economics.

Define distinct claims:

```text
PUBLISHED
STORED
SERVED
RECEIVED
```

Required proof: a dead source node can be reconstructed from independently retained addressed artifacts and receipts.

## R8 — Moment / Perspective Composition

Bind a crossing to a Trust-style shared Moment.

Required proof:

- two observers attach divergent accounts;
- sync/replay preserves both;
- no last-write-wins semantic collapse;
- neither account mutates source carrier identity.

## R9 — Field Consequence

Feed admitted local receipts into a Groove/Band-style field projection.

Required proof:

- history alters weather/susceptibility;
- weather does not rewrite history;
- weather cannot authorize an action.

## R10 — Cultural Descendant

Pass one admitted local consequence through MEMENTO-style uptake/reproduction.

Required proof:

- descendant preserves ancestry;
- descendant does not inherit source authority;
- variation is explicit;
- another world receives descendant as fresh candidate.

## R11 — External Checkpoint

Commit a local receipt-set root to one replaceable foreign witness.

Possible witnesses include Git, transparency logs, or a public blockchain.

Required proof:

- local history is independently useful without checkpoint;
- checkpoint verifies only its declared commitment;
- absence of foreign service does not halt local operation.

## R12 — Mortality Test

Kill a node.

Required proof:

- surviving peers retain attributable crossings;
- reconstructible artifacts can reconstitute a successor;
- successor has fresh local identity/authority;
- historical receipts still name the dead node where appropriate.

## R13 — Composition Pulse

Only after R1–R12, test the larger round:

```text
crossing
→ local admission
→ field change
→ new act
→ receipt
→ slow developmental witness
→ compositional question
→ owner-local adaptation
→ descendant
→ return crossing
```

Success does not require global agreement.

Success requires attributable continuity without hidden authority transfer.

## Release rule

> **Do not call reLATTE a general substrate until two materially different organ families can cross it without reLATTE-specific semantic hacks.**
