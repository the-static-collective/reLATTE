# RELEASE RULE HOSTILE 001 — UNLEASH THE BATS

**Status:** bounded generality-gate witness  
**Date:** 2026-10-01

## Question

The roadmap release rule says:

> **Do not call reLATTE a general substrate until two materially different organ families can cross it without reLATTE-specific semantic hacks.**

This witness attacks that rule directly.

The two donor families are intentionally unlike one another:

1. **The Daily Slice** — append-mostly chronological public witness / document history.
2. **The Haunted Toaster** — deterministic song-to-video execution with explicit KEEP/SCRAPE continuation law and render evidence.

The substrate is not allowed to know either family by name.

## The generic membrane

R13 and the earlier milestones proved many specific compositions.

The release-rule test goes the other direction: make the shared substrate *less semantic*.

The generic adapter accepts an opaque organ specification containing only:

```text
family_ref
donor_contract_ref
artifact_kind
source world / particular / history head
payload refs
opaque donor_claims
requested_effect
return address
timestamp
```

It emits one ordinary signed crossing:

```text
declared_kind = OPAQUE_ORGAN_ARTIFACT
```

The donor metadata lives inside the signed `organ_adapter` extension.

reLATTE signs and transports those bytes.

It does not interpret their domain meaning.

```text
DONOR SEMANTICS != SUBSTRATE SEMANTICS
ADAPTER != DONOR AUTHORITY
CROSSING != DONOR INTERPRETATION
PAYLOAD TYPE != ADMISSION LAW
```

## Bat A — Daily Slice

The Daily Slice fixture carries:

```text
family:
  chronological-public-witness

payload:
  one text/markdown artifact

donor claims:
  posture = OBSERVATION
  visible_from_here_then = true
  source_authority = false
  canonical_now = false

requested effect:
  candidate-public-orientation
```

These claims come from Daily Slice's own witness posture.

The generic adapter does not validate or reinterpret them.

## Bat B — Haunted Toaster

The Haunted Toaster fixture carries:

```text
family:
  deterministic-media-execution

payloads:
  application/json video receipt
  video/mp4 finished render

donor claims:
  continuation_verdict = KEEP
  continuation_scope = exact-creature-only
  resolved_timeline_authority = donor-local
  receipt_is_residual_witness = true

requested effect:
  candidate-render-evidence-ingress
```

These belong to the Toaster's domain.

Again, reLATTE does not interpret them.

## Same tunnel

Both organ crossings execute through the exact same substrate path:

```text
opaque donor spec
      ↓
same generic adapter
      ↓
same crossing envelope
      ↓
same signature implementation
      ↓
same file transport
      ↓
same HTTP transport
      ↓
same durable LocalReceiver
      ↓
RECEIVED
      ↓
owner-local disposition
```

The receiver first gets both through file bundles.

Each is then delivered again through the same HTTP relay.

Both HTTP deliveries are idempotent duplicates.

No new history is created merely because the road changed.

## Local meaning remains local

After identical substrate ingress, the test deliberately makes different local decisions:

```text
Daily Slice crossing   → ADMIT
Haunted Toaster crossing → HOLD
```

The distinction is made by the test's owner-local decision.

It is not encoded as a family branch in RECEIVE, transport, signature, or adapter code.

```text
FAMILY != DISPOSITION
PAYLOAD MEDIA TYPE != DISPOSITION
DONOR CLAIM != LOCAL AUTHORITY
```

## Source-code tripwire

The hostile test reads these substrate source files:

```text
src/organ.ts
src/protocol.ts
src/transport.ts
src/receiver.ts
```

and fails if they contain donor-specific identifiers or semantic vocabulary for either test family.

The forbidden tripwire includes:

```text
daily-slice
haunted-toaster
OBSERVATION
KEEP
SCRAPE
ResolvedTimeline
```

Those terms may exist in fixtures, donor projects, tests, and documentation.

They may not become branches in the shared substrate.

## Unknown-family test

A synthetic third organ family is passed through the same adapter:

```text
organ:future-unknown/sensorial-sculpture
media_type = application/x-future-material
alien_semantics = {...}
```

No new enum or adapter branch is added.

The crossing verifies normally.

This does not make the synthetic family meaningful.

It proves the membrane does not require a closed family registry.

## Tamper proof

Opaque does not mean unsigned.

Changing any donor claim after signing invalidates the crossing.

Changing a payload media type after signing invalidates the crossing.

Adding an unexpected descriptor sidecar invalidates the crossing.

Adding an unexpected family-specific hint to the adapter input is rejected.

Thus:

```text
OPAQUE != UNBOUND
GENERIC != PERMISSIVE SIDECAR
```

## What this earns

If the full repository verifier passes, this witness satisfies the roadmap's stated two-family release rule at the current substrate boundary:

- two materially different real donor families;
- one generic adapter;
- one canonical crossing envelope;
- one signature mechanism;
- the same replaceable transport layer;
- the same durable receiver;
- no donor-family branch in the tested substrate source;
- donor semantics remain signed but opaque;
- local dispositions remain owner-local.

This supports calling reLATTE a **general substrate at this bounded crossing boundary**.

## What it does not earn

This is not a claim that reLATTE is:

- universally applicable to arbitrary systems;
- production-ready infrastructure;
- semantically compatible with every donor contract;
- a legal interoperability standard;
- a universal identity layer;
- a universal storage layer;
- a universal execution runtime;
- free of future adapter work at system edges;
- finished with R1 payload-resolution and ancestry-validation gaps.

Generality here means:

> **the shared crossing substrate did not require semantic exceptions for two materially different organ families.**

It does not mean all higher-level meaning is generic.

## Laws

```text
DONOR SEMANTICS != SUBSTRATE SEMANTICS
FAMILY != DISPOSITION
PAYLOAD TYPE != ADMISSION LAW
OPAQUE != UNBOUND
GENERIC != UNIVERSAL
EDGE ADAPTER != CORE EXCEPTION
```
