# reLATTE Execution Model

**Status:** candidate v0  
**Date:** 2026-09-29

reLATTE needs an Ethereum-like common execution surface without requiring every domain to run one universal VM.

The reusable unit is therefore an **Organ Contract**: a declared interface between a portable crossing and owner-local admission/execution law.

## 1. Execution boundary

```text
canonical CrossingEnvelope
        ↓
structural validation
        ↓
source signature verification
        ↓
anti-replay / world checks
        ↓
RECEIVE
        ↓
HOLD
        ↓
owner-local Organ Contract
        ↓
┌─────────┬─────────┬─────────┐
│ ADMIT   │ REFUSE  │ RETURN  │
└─────────┴─────────┴─────────┘
        ↓
local consequence, if any
        ↓
signed Receipt
```

The common substrate owns the envelope/receipt contract.

The destination owns semantic admission.

## 2. Ethereum analogy

Ethereum composes applications because callers can rely on common rules for:

- addressing;
- transaction shape;
- execution invocation;
- logs/receipts;
- contract interfaces.

reLATTE should provide the same *kind* of composability while refusing one universal state machine.

Its equivalent of an ABI is the **Organ Contract Manifest**.

The manifest declares:

- contract identity/version;
- owner project;
- accepted crossing kinds;
- input schema references;
- allowed dispositions;
- effect classes it may emit;
- receipt classes;
- dependencies;
- explicit non-authorities.

It does not make a project subordinate to reLATTE.

## 3. Candidate deterministic shell

A compliant host should be able to expose behavior equivalent to:

```text
parse(canonical_bytes)
→ CrossingEnvelope

verify_identity(envelope)
→ crossing_id

verify_signature(envelope)
→ valid | invalid

receive(envelope, local_context)
→ RECEIVE receipt or structural refusal

hold(envelope)
→ stable pending object

execute(contract, envelope, local_state, local_authority)
→ {
     disposition,
     new_local_state?,
     receipts[],
     descendants[],
     residual[]
   }
```

Only the structural shell needs cross-runtime determinism.

Domain meaning remains local.

## 4. Consequence classes

A contract should declare one or more bounded consequence classes.

Initial vocabulary:

```text
none
local-state-change
artifact-created
descendant-created
capability-issued
capability-revoked
return-created
projection-updated
field-pressure-updated
unknown
```

These are accounting classes, not semantic verdicts.

## 5. Refusal law

If a contract refuses a crossing:

```text
protected_state_after == protected_state_before
semantic_effect == none
```

The system may still append an attributable refusal receipt.

## 6. Replay

A receipt-producing transition is replayable only when all causal inputs required by the declared contract are recorded or content-addressed.

Ambient dependencies that can change the result must be declared or excluded.

```text
same recorded causal inputs
+ same contract version
+ same local pre-state
→ same deterministic structural result
```

Human decisions do not need to be deterministic.

They need to be attributable.

A later replay may verify that a human disposition occurred without pretending a machine could derive the same choice.

## 7. Local state roots

A world may optionally expose content-addressed state roots/cuts.

They are local:

```text
state_root@WorldA != global state root
```

A receipt may bind:

- pre-state root;
- post-state root;
- exact contract version;
- crossing ID;
- emitted descendants.

This supports reconstruction without imposing one total order across worlds.

## 8. Calls between organs

Cross-organ composition is itself a crossing.

An Organ Contract must not invoke another organ through hidden in-process authority and later describe the result as an external crossing.

Instead:

```text
ORGAN A
  ↓ emits crossing T1
reLATTE surface
  ↓
ORGAN B receives T1
  ↓ emits receipt R1 / descendant T2
reLATTE surface
  ↓
ORGAN A may receive T2
```

This keeps the doorway attributable.

## 9. Contract upgrades

A new contract version is a descendant, not a rewrite.

Receipts preserve the exact version that handled the occurrence.

```text
Contract v1
   ↓ descendant relation
Contract v2

old receipt -> v1 forever
new receipt -> whichever version actually handled it
```

## 10. Minimal shared API

The candidate v0 shared artifact set is:

- `CrossingEnvelopeV0`
- `ReceiptV0`
- `OrganContractV0`

Schemas live in `schemas/`.

> **Portable syntax may cross. Local authority does not.**
