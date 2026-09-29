# R3 Sovereign Receiver — Design

**Status:** proposed architecture for issue #7  
**Date:** 2026-09-29  
**Target:** Roadmap R3 — RECEIVE / HOLD / DISPOSITION  
**Implementation gate:** no receiver code should be written until this design is reviewed and an implementation plan is approved.

## 1. Purpose

R3 proves the first receiver-side law of reLATTE:

> A crossing may be cryptographically valid and still have no semantic consequence unless the receiving world admits it.

PR #3 landed the bounded R1/R2 identity and signature witness. The next executable boundary is therefore not transport or cloud coordination. It is the local receiver.

The receiver must make these distinctions executable:

```text
VERIFY != ADMIT
RECEIVE != ADMIT
HOLD != OWN
REFUSE != EFFECT
RETURN != ADMIT
DUPLICATE DELIVERY != DUPLICATE CONSEQUENCE
RESTART != MEMORY LOSS
```

## 2. Design constraints

The receiver must preserve existing repository law:

- source identity does not imply action authority;
- signature proves key possession, not truth or human identity;
- semantic admission remains owner-local;
- refusal may produce an attributable receipt but must not mutate protected semantic state;
- transport remains replaceable;
- no global state or global ordering is introduced;
- issue #5 / PR #6 group-admin-cloud work remains non-normative research pressure.

R3 must not require:

- network transport;
- a cloud service;
- a policy engine;
- group membership semantics;
- distributed consensus;
- a new capability format;
- changes to the v0 schemas solely for implementation convenience.

## 3. Architectural approaches considered

### Approach A — in-memory receiver only

Keep all receiver state in memory and prove dispositions with unit tests.

**Advantages**
- smallest code surface;
- easiest to reason about;
- quickest proof of RECEIVE / HOLD / ADMIT / REFUSE / RETURN.

**Failure**
- does not satisfy the roadmap requirement that HOLD and disposition survive restart;
- duplicate prevention disappears on process death;
- cannot prove reconstructibility.

**Decision:** reject as insufficient for R3.

### Approach B — append-only local event journal

Persist receiver events as append-only records and reconstruct receiver state by replay.

Candidate event classes:

```text
RECEIVED
HELD
ADMITTED
REFUSED
RETURNED
RECEIPT_EMITTED
```

**Advantages**
- naturally aligned with reLATTE's receipt/history model;
- restart reconstruction is explicit;
- historical disposition is not overwritten;
- idempotence can be reconstructed from crossing IDs;
- persistence remains local and inspectable.

**Costs**
- slightly more machinery than a snapshot store;
- replay semantics must be carefully bounded;
- protected semantic state must remain distinguishable from receiver bookkeeping.

**Decision:** selected.

### Approach C — mutable receiver snapshot/database

Persist one current receiver record per crossing and current protected state.

**Advantages**
- direct lookup;
- simple duplicate detection;
- less replay code.

**Failure**
- makes historical transition evidence easier to overwrite;
- encourages receiver bookkeeping and semantic state to collapse;
- weaker fit with reconstruction-oriented project law.

**Decision:** not selected for the first proof.

## 4. Selected architecture

R3 uses a **local append-only receiver journal** plus a small reconstructed state projection.

```text
signed CrossingEnvelopeV0
        ↓
verifyCrossingEnvelope()
        ↓
receiver intake
        ↓
append RECEIVED
        ↓
append HELD
        ↓
owner-local disposition adapter
        ↓
┌─────────┬─────────┬─────────┐
│ ADMIT   │ REFUSE  │ RETURN  │
└─────────┴─────────┴─────────┘
        ↓
apply bounded semantic effect only if ADMIT
        ↓
seal ReceiptV0
        ↓
append disposition + receipt reference/data
        ↓
reconstructible receiver state
```

The journal is receiver-local. It is not a global event log.

## 5. Component boundaries

### 5.1 Receiver journal

Responsibility:

- append immutable receiver events;
- load events after restart;
- preserve event order within one receiver journal;
- expose enough data to reconstruct disposition state.

The journal does **not** decide admission.

Initial persistence may be newline-delimited canonical JSON or another simple file-backed representation already compatible with the project's TypeScript runtime.

The journal format is implementation-local in R3. It is not a protocol primitive.

### 5.2 Receiver state projection

Reconstructs:

- received crossings by `crossing_id`;
- currently held/pending crossings;
- final local disposition per crossing;
- associated receipt;
- local protected semantic state reference/value required by the bounded specimen.

Projection is derived from the journal and may be regenerated.

```text
JOURNAL = retained evidence
PROJECTION = reconstructible convenience
```

### 5.3 Intake boundary

Consumes a candidate crossing.

Required sequence:

1. structurally accept an object only through existing protocol verification rules;
2. verify identity/signature;
3. detect whether this receiver has already seen the `crossing_id`;
4. if new, append RECEIVED then HELD;
5. expose the held crossing for owner-local disposition.

A failed cryptographic/structural verification does not enter the normal RECEIVE/HOLD history as a valid crossing.

Implementations may log invalid input separately, but such logging is outside the semantic receiver journal.

### 5.4 Owner-local disposition adapter

The first R3 adapter should be deliberately narrow.

It receives:

- the held crossing;
- reconstructed local protected state;
- bounded local authority/context.

It returns one explicit disposition:

```text
ADMIT
REFUSE
RETURN
```

It must not mutate receiver state directly.

This keeps the authority decision visible and testable.

### 5.5 Protected semantic state boundary

Receiver bookkeeping and protected semantic state are different stores/concepts even if the first implementation places them in nearby files.

For REFUSE:

```text
protected_state_after == protected_state_before
semantic_effect == none
```

For RETURN:

- protected semantic state remains unchanged by default;
- a return artifact/descendant may be created only through the explicit bounded return behavior.

For ADMIT:

- exactly one bounded semantic effect may occur for the specimen;
- duplicate delivery must never apply that effect twice.

### 5.6 Receipt emission

After disposition, the receiver emits a `ReceiptV0` signed with the existing P-256 machinery.

The receipt must distinguish at least through existing receipt fields:

- receiver/world identity;
- crossing ID;
- disposition kind;
- semantic effect;
- pre/post state references where relevant;
- descendants/residuals where relevant.

R3 should adapt to the current schema rather than broaden it unless implementation discovers a true contradiction. Any such contradiction requires a separate design decision before schema changes.

## 6. State machine

For one receiver and one crossing:

```text
UNSEEN
  ↓ receive valid crossing
HELD
  ├── ADMIT  → DISPOSED_ADMIT
  ├── REFUSE → DISPOSED_REFUSE
  └── RETURN → DISPOSED_RETURN
```

No disposed state transitions back to HELD in R3.

A repeated delivery of the same `crossing_id` returns/reconstructs the existing local state rather than creating a second consequence.

Invalid crossings do not enter this state machine.

## 7. Idempotence

The idempotence key is initially:

```text
(receiver identity, crossing_id)
```

If that pair has already reached a final disposition:

- no second semantic effect occurs;
- no second independent disposition is computed;
- the established disposition/receipt is returned or referenced.

If the crossing is already HELD:

- duplicate delivery does not append another semantic RECEIVE/HOLD sequence;
- it resolves to the existing pending object.

This is receiver-local idempotence, not global replay prevention.

## 8. Restart reconstruction

On startup:

1. read the local receiver journal;
2. validate journal event structure;
3. replay events into the receiver projection;
4. recover held and disposed crossings;
5. recover the protected state needed by the specimen;
6. reject or surface internally inconsistent journal history rather than guessing a repair.

A restart must never turn HELD into ADMITTED.

```text
PROCESS START != DISPOSITION
```

## 9. Hostile fixtures

### Creepy Charlie

A valid signed crossing from a recognized source is refused under current local authority.

Proves:

```text
KNOWN SOURCE + VALID SIGNATURE != CURRENT AUTHORITY
```

### Duplicate crossing

Deliver an admitted crossing twice.

Proves exactly one semantic consequence.

### Refusal integrity

Snapshot/hash the protected state before refusal and compare afterward.

Proves refusal bookkeeping does not mutate protected semantic state.

### Held restart

Persist HELD, terminate receiver instance, reconstruct a new instance, verify it remains pending.

### Disposed restart

Admit/refuse/return, restart, deliver the same crossing again, verify no duplicate consequence.

### RETURN specimen

Produce one bounded return object/descendant or explicit return receipt while protected semantic state remains unchanged.

### Gardeners pressure

Use group/admin/cloud research only as a test narrative:

- recognized external administration cannot bypass local disposition;
- unavailable current authority evidence must not default to admission;
- cloud absence does not erase local receiver state.

No group implementation belongs in R3.

## 10. Error handling

Errors fall into three classes.

### Invalid candidate

Examples:

- bad signature;
- malformed canonical object;
- wrong signing domain.

Result: reject before valid RECEIVE/HOLD state.

### Receiver persistence failure

Examples:

- cannot append journal;
- cannot fsync/write required local record;
- corrupted journal on restart.

Result: fail closed. Do not apply protected semantic effect unless the required receiver history can be durably recorded according to the selected operation order.

### Local disposition/application failure

If local law fails before effect:

- preserve HELD if safe and attributable;
- do not fabricate REFUSE or ADMIT.

If effect application can fail partially, the implementation must avoid claiming atomicity it cannot prove. The first specimen should therefore choose an effect small enough to make ordering and recovery explicit.

## 11. Ordering rule for ADMIT

The first implementation should make the write/effect sequence explicit enough that a crash cannot silently produce:

```text
effect happened
but receiver reconstructs as never admitted
```

Preferred design pressure:

1. durable intent/disposition record sufficient to identify the transition;
2. apply bounded idempotent semantic effect;
3. seal/store final receipt;
4. reconstruct incomplete transitions deterministically or fail closed.

The exact event names are implementation detail, but crash consistency is part of R3's restart proof.

If this makes the first semantic effect too complex, choose a simpler idempotent specimen rather than inventing a transaction framework.

## 12. Testing strategy

Tests should operate against temporary local directories so each receiver has isolated persistence.

Required groups:

- existing R1/R2 protocol tests unchanged;
- receiver state-machine tests;
- journal reconstruction tests;
- duplicate/idempotence tests;
- hostile Charlie tests;
- refusal state-integrity tests;
- restart tests for HELD and final dispositions;
- signed receipt verification tests;
- corruption/fail-closed tests for journal input.

The full repository gate remains:

```bash
npm run verify
```

CI must run the same gate.

## 13. Documentation changes after implementation

Only after executable proof exists:

- update `docs/ROADMAP.md` R3 status;
- add a bounded receiver profile/doc describing local journal semantics;
- document what is still unproven:
  - R4 two sovereign nodes;
  - transport;
  - cloud coordination;
  - group/admin semantics;
  - generalized capability/policy evaluation.

## 14. Compatibility

R3 consumes the landed v0 protocol objects.

Default rule:

> Do not change the v0 schemas to fit the receiver.

If the implementation reveals a genuine contradiction between the existing schemas and the R3 proof obligation, stop and isolate that contradiction as a separate protocol decision.

## 15. Success criterion

R3 is earned when one local receiver can demonstrate:

```text
valid crossing
→ durable HOLD
→ owner-local disposition
→ one bounded consequence or none
→ signed receipt
→ restart
→ same attributable history
```

while hostile tests prove:

```text
VALID != AUTHORIZED
RECEIVED != ADMITTED
REFUSED != EFFECTED
DUPLICATE != REPEATED CONSEQUENCE
RESTART != REINTERPRETATION
```

## 16. Explicit boundary

This design does not build the cloud.

It builds the reason the cloud can eventually remain uncrowned.

> **The doorway may be reachable from anywhere. The destination still decides what enters.**
