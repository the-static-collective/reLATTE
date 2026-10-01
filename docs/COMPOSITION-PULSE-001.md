# COMPOSITION PULSE 001

**Status:** bounded executable R13 witness  
**Date:** 2026-10-01

## Thesis

R13 is not another primitive.

It asks whether the earned reLATTE organs can compose into one attributable round without hidden authority transfer.

```text
crossing
  ↓
local admission
  ↓
field change
  ↓
fresh local act
  ↓
local act receipt
  ↓
slow developmental witness
  ↓
compositional question
  ↓
owner-local adaptation
  ↓
cultural descendant
  ↓
another sovereign world
  ↓
return crossing
  ↓
origin world receives return
```

The pulse closes without requiring global agreement.

## 1. Origin crossing

The specimen begins with one ordinary signed reLATTE crossing carrying a declared return address.

A durable Local Receiver performs:

```text
RECEIVE
  ↓
R3_ADMIT
```

The admission remains owner-local.

## 2. Field change

The signed ADMIT receipt enters the R9 Field Consequence layer.

The field projection derives local susceptibility from admitted history.

The projection still fixes:

```text
semantic_effect = none
authorization = null
recommended_action = null
```

The pulse therefore cannot claim:

> the field caused the next act.

It can only say:

> the field was part of the attributable context in which a fresh local act occurred.

```text
FIELD != CAUSE
FIELD != AUTHORITY
WEATHER != INSTRUCTION
```

## 3. Fresh local act

An owner-local actor creates and signs a new crossing:

```text
declared_kind = R13_LOCAL_ACT
parents = [origin_crossing_id]
source_history_head = field_history_root
```

The act explicitly records:

```text
field_authorized_action = false
```

The local world then separately RECEIVEs and ADMITs that act.

Thus:

```text
FIELD CONTEXT
    !=
LOCAL ACT
    !=
LOCAL ADMISSION
```

## 4. Slow developmental witness

The pulse then borrows a portable law from **The Daily Slice** donor:

> Record what was visible from here, then; do not retroactively become authority for what was observed.

The R13 slow witness is a separately signed `R13_SLOW_WITNESS` receipt.

It binds:

- origin crossing;
- local act;
- local-act ADMIT receipt;
- field projection;
- historical posture;
- human-readable observation.

It fixes:

```text
semantic_effect = none
visible_from_here_then = true
source_authority = false
canonical_now = false
```

The allowed posture vocabulary follows Daily Slice:

```text
OBSERVATION
QUESTION
SPECULATION
CANDIDATE
TESTED
REFUTED
SUPERSEDED
```

The witness can later be superseded without rewriting the act it observed.

```text
WITNESS != SOURCE
WITNESS != CANON
VISIBLE THEN != CANON NOW
PUBLISHED WITNESS != TRUTH
```

## 5. Compositional question

A content-addressed Compositional Question references the slow-witness receipt.

The question also binds:

- origin crossing ID;
- local-act crossing ID;
- field projection ID;
- explicit constraints.

It always fixes:

```text
semantic_effect = none
authority = null
```

A question can expose a seam.

It cannot authorize the answer.

```text
QUESTION != VERDICT
QUESTION != AUTHORITY
WITNESS != ANSWER
```

## 6. Owner-local adaptation

The R10 Cultural Uptake primitive carries the explicit preserved / varied / introduced / retired mutation grammar.

R13 then adds a separately signed `R13_ADAPTATION` receipt tying that uptake to:

- the slow witness;
- the compositional question;
- the local actor;
- the field context.

The adaptation declares:

```text
authority = fresh-local

inherited_authority = false
field_authorized_action = false
witness_authorized_action = false
question_authorized_action = false
```

The local actor signs the adaptation.

## 7. Descendant

The R10 descendant remains a fresh crossing.

R13 adds pulse linkage to:

- slow-witness receipt ID;
- question ID;
- adaptation receipt ID;
- uptake ID.

The executable verifier requires the descendant crossing and the adaptation receipt to use the same local actor public key.

This establishes local key continuity for the adaptation → descendant seam without turning that key into global identity.

```text
ADAPTATION != ANCESTOR
ANCESTRY != AUTHORITY
DESCENDANT != ADMISSION
```

## 8. Another sovereign world

Destination B receives the descendant.

It produces only:

```text
RECEIVED
semantic_effect = none
```

No inherited ADMIT crosses with the descendant.

A separate test sends the same descendant to destination C, which lawfully REFUSEs it.

The B pulse still returns successfully.

Therefore:

```text
GLOBAL AGREEMENT != PULSE SUCCESS
DIVERGENT RECEIVER != BROKEN CONTINUITY
```

## 9. Return crossing

Destination B signs a new `R13_RETURN` crossing.

The return crossing:

- names the descendant as its sole parent;
- records the original crossing's declared return address;
- declares receiver-local authority for any future consequence;
- carries no inherited admission.

```text
RETURN ADDRESS != RETURN AUTHORITY
RETURN != ADMISSION
DESCENDANT ADMIT != ORIGIN ADMIT
```

The origin world RECEIVEs the return crossing.

It does not automatically ADMIT it.

This closes the round while preserving the next decision.

## 10. Composition trace

When every seam verifies, reLATTE emits a content-addressed Composition Pulse Trace binding the IDs of:

- origin crossing;
- origin ADMIT;
- field projection;
- local act;
- local-act ADMIT;
- slow witness;
- compositional question;
- cultural uptake;
- adaptation;
- descendant;
- descendant RECEIVE;
- return crossing;
- return RECEIVE.

The trace is a map of the round.

It is not a new authority layer.

Tampering with any bound ID changes or invalidates the trace identity.

```text
TRACE != AUTHORITY
PULSE != CONSENSUS
```

## Executable round

The integration test executes:

```text
signed origin X
      ↓
world A RECEIVE
      ↓
world A ADMIT
      ↓
R9 field F
      ↓
local maker signs act A1
      ↓
world A RECEIVE + ADMIT A1
      ↓
Daily-Slice-shaped slow witness W
      ↓
question Q
      ↓
R10 uptake U
      ↓
signed owner-local adaptation A2
      ↓
signed cultural descendant D
      ↓
world B RECEIVE D
      ↓
world B signs RETURN R
      ↓
world A RECEIVE R
```

Meanwhile:

```text
world C RECEIVE D
      ↓
world C REFUSE D
```

The pulse still verifies.

## What this earns

At the current envelope level, R13 proves that the roadmap's full compositional round can execute with attributable continuity and without hidden authority transfer.

Specifically:

- admission remains local;
- field remains non-authoritative;
- the fresh act is independently signed;
- the act receives its own local disposition;
- developmental witness remains historical witness rather than canon;
- question remains non-authoritative;
- adaptation is a fresh owner-local signed act;
- descendant preserves ancestry without admission inheritance;
- another world may receive or refuse independently;
- return is a fresh crossing rather than inherited consequence;
- origin receives the return as a fresh candidate.

## What this does not earn

R13 does not claim:

- global consensus;
- automatic action selection;
- automatic adaptation;
- truth adjudication;
- human identity;
- recommendation authority;
- legal authority;
- every donor organ is production-ready;
- the release rule is automatically satisfied;
- reLATTE is now a universal substrate.

The release rule still stands independently:

> Do not call reLATTE a general substrate until two materially different organ families can cross it without reLATTE-specific semantic hacks.

## Laws

```text
FIELD != AUTHORITY
ACT != PROJECTION
WITNESS != CANON
QUESTION != AUTHORITY
ADAPTATION = FRESH LOCAL ACT
ANCESTRY != AUTHORITY
DESCENDANT != ADMISSION
RETURN != ADMISSION
GLOBAL AGREEMENT != PULSE SUCCESS
TRACE != AUTHORITY
PULSE != CONSENSUS
```
