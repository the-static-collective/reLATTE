# CROSSING PARCEL 001

**Status:** bounded human-facing profile proposal  
**Date:** 2026-10-01  
**Issue:** #34  
**Provenance:** Grok return produced from the Git-visible issue/repository surface. Grok reported that its Git write path was blocked by integration permissions (HTTP 403), so the return crossed back through the human and is committed here by ChatGPT without treating that relay as admission.

## Thesis

A Crossing Parcel is a **human-facing profile / bundle** over existing reLATTE primitives.

It is not a new core protocol primitive.

It lets a human carry a bounded particular between independent AI providers through a neutral, inspectable surface while preserving:

1. the particular being worked on;
2. source / provenance;
3. explicitly admitted context;
4. context intentionally withheld or merely available;
5. the requested transformation;
6. the receiving agent’s proposal;
7. the human’s ACCEPT / HOLD / REJECT / AMEND decision;
8. a reconstructible receipt of what changed.

~~~text
human
  ↓
ChatGPT / reLATTE reading
  ↓
Git-visible parcel
  ↓
Grok
  ↓
Git-visible return
  ↓
ChatGPT
  ↓
human decision
~~~

Git is a replaceable road / witness surface. It is not authority.

## Decision

Crossing Parcel = **profile over existing primitives** + optional transport-bundle composition.

Not a competing base protocol.  
Not a silent expansion of core schema fields.

Preserve non-collapse:

~~~text
TRANSPORT != CROSSING
DELIVERY != ADMISSION
SIGNED != TRUE
RECEIVED != ADMITTED
ADMITTED != SHARED
SHARED != UNIVERSAL
HISTORY != AUTHORITY
CAPABILITY != IDENTITY
~~~

## Field-to-existing-primitive mapping

| Human label | Maps onto |
|-------------|-----------|
| WHO | CrossingEnvelopeV0.source_particular + source_world (+ optional Perspective observer) |
| CARRY | payload_refs (content-addressed) + optional requested_effect |
| HOLD | Local Receiver disposition HOLD / R3_HOLD (semantic_effect = none) |
| ASK | requested_effect or a payload role such as ask / query |
| PROPOSAL | Agent-authored payload or extension; never auto-admitted |
| DECISION | Human-authorized disposition: ACCEPT ≈ ADMIT, HOLD, REJECT ≈ REFUSE, AMEND ≈ new crossing |
| RECEIPT | ReceiptV0 (RECEIVED / HELD / ADMITTED / REFUSED / RETURNED …) |
| NEXT_DOORS | Optional residual / descendant refs or human-readable note in receipt |

Moment / Perspective may be used when plural accounts of the same carrier are useful; they do not overwrite the carrier.

Replaceable Transport (filesystem / HTTP / Git commit) carries the same canonical crossing without changing its identity.

## Concrete two-provider example

### Outbound (human → ChatGPT → Git)

1. Human authorizes a bounded working state.
2. ChatGPT prepares a CrossingEnvelopeV0-compatible crossing whose payload_refs point to content-addressed artifacts containing only the explicitly admitted context + ASK.
3. Where signing is available, the crossing is signed under the existing identity/signature profile. The profile does not assume every conversational surface itself can custody signing keys.
4. The envelope is carried through Git or another replaceable transport. Transport identity may differ; crossing identity does not.
5. No private ChatGPT transcript is required downstream.

### Inbound (Git → Grok)

1. Grok reads only repository-visible artifacts + issue #34.
2. Grok produces a proposal as a new payload or RETURN disposition note.
3. Grok does **not** treat its own proposal as admitted.
4. Grok leaves a human-readable RETURN RECEIPT.

### Return (Grok → human relay → ChatGPT → Git → human)

1. Grok's direct Git write fails with HTTP 403.
2. Grok returns the bounded artifact to the human.
3. The human relays that visible artifact to ChatGPT.
4. ChatGPT reconstructs what was received, interpreted, changed, refused, and left unresolved without access to Grok's private conversation.
5. ChatGPT commits the returned proposal to a review branch and opens a PR.
6. Human records ACCEPT / HOLD / REJECT / AMEND.
7. Only an explicit human/owner decision may become an ADMIT disposition in any local receiver.

This detour does not prove direct provider-to-Git write interoperability. It does test continuity across a provider boundary when transport partially fails and the human remains the continuity witness.

## Hostile / failure cases

- **Secret transcript dependency** — handoff fails if either provider requires private conversation memory not present in the visible surface.
- **Silent base-semantic change** — any alteration of core laws or schema without explicit identification collapses the experiment.
- **Git-as-authority** — treating the mere presence of a commit as admission or truth violates HISTORY != AUTHORITY.
- **Agent proposal = human admission** — a Grok or ChatGPT proposal must remain PROPOSAL until a human records DECISION.
- **Inferred human decision** — absence of an explicit ACCEPT / HOLD / REJECT / AMEND leaves the parcel unresolved.
- **Non-reconstructible result** — if a later reader cannot recover the eight preserved elements from durable visible artifacts alone, the continuity claim is unproven.
- **Transport-success inflation** — a human relay after provider write failure must not be redescribed as a successful direct Git write.

## Human-authorized versus agent-proposed

| Layer | Authority |
|-------|-----------|
| Original particular | Human |
| Explicitly admitted context | Human |
| ASK / requested transformation | Human |
| Agent proposal | Agent (Grok / ChatGPT); remains non-admitted |
| DECISION | Human only |
| Local ADMIT | Owner-local receiver under human or owner policy |
| Git commit | Transport / witness only |

## What this experiment proves

- A bounded particular can cross between two independent AI providers through inspectable artifacts without requiring shared private conversation memory.
- The receiving provider can reason from the source provider's durable visible output rather than hidden chain-of-thought or full transcript.
- Existing primitives (CrossingEnvelopeV0, ReceiptV0, Local Receiver dispositions, replaceable transport, Moment/Perspective) already supply the necessary seams for a human-facing profile.
- The human can remain the continuity witness while providers remain replaceable participants.
- A transport failure can remain explicit without destroying reconstructibility.

## What this experiment does **not** prove

- That Git is sovereign storage, identity, or semantic authority.
- That any agent proposal is true, admitted, or authoritative.
- That the profile is complete or production-ready.
- Universal consensus or shared mutable state across providers.
- That private context never leaks; only that the protocol surface does not require it.
- That Grok currently has a functioning Git write path for this repository.
- That a cryptographically signed CrossingEnvelopeV0 was actually emitted during this conversational trial.

## Implementation posture

No new core schema fields are introduced.

No executable code is required for this profile declaration; the existing R1–R8 witnesses cover the underlying mechanics needed by the proposal.

If a later slice needs a thin helper that packs the human-facing labels into an extensions object or a conventional payload role set, that helper remains optional and non-authoritative.

## RETURN RECEIPT

~~~text
RECEIVED:
  Issue #34 body + listed repository artifacts only
  (README.md, schemas/crossing-envelope-v0.schema.json,
   schemas/receipt-v0.schema.json, docs/LOCAL-RECEIVER-001.md,
   docs/REPLACEABLE-TRANSPORT-001.md, docs/MOMENT-PERSPECTIVE-001.md)

INTERPRETED:
  Crossing Parcel as human-facing profile / bundle over existing primitives;
  not a new core protocol; non-collapse preserved.

CHANGED:
  Produced the complete docs/CROSSING-PARCEL-001.md proposal
  Explicit field-to-primitive mapping
  Concrete two-provider example
  Hostile cases + prove / not-prove bounds

REFUSED:
  New core schema fields
  Competing base protocol
  Treating Git as authority
  Auto-admission of any agent proposal
  Manufacturing executable code solely to enlarge the diff
  Any private conversation context not present in the repo or issue

RESIDUAL_FOG:
  Exact conventional payload role names for ASK / PROPOSAL remain open
  Whether a thin optional extensions helper is ever warranted
  How a later human DECISION is recorded as a first-class signed disposition in multi-provider practice
  Grok's direct Git write path was blocked by integration permissions

RETURNED_TO_HUMAN:
  Grok returned the bounded artifact through the visible conversation
  ChatGPT reconstructed it and placed it on a review branch
  Awaiting explicit ACCEPT / HOLD / REJECT / AMEND
~~~

## Laws restated for this profile

~~~text
PROFILE != CORE PRIMITIVE
PROPOSAL != ADMISSION
GIT SURFACE != AUTHORITY
HUMAN DECISION != AGENT INFERENCE
RECONSTRUCTIBLE RECEIPT != PRIVATE MEMORY
TRANSPORT FAILURE != CONTINUITY FAILURE
~~~
