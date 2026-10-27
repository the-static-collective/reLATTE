# EVIDENCE-TRANSIT-001 — Reusable Evidence Crossing

**Status:** executable reLATTE library specimen, backed by P-256 signed `CrossingEnvelopeV0`, receiver-local signed R2/R3 receipts and test coverage. Not a deployed universal bus.

## Why

A Night Shift receipt may link to a GitHub PR; a Garden delivery may eventually produce a human-confirmed handoff; a deployment may generate an independently fetched machine observation. These are *different evidence sources*, but they should not need different laws for provenance and authority.

```
source adapter (GitHub / Vercel / Garden / newspaper / external)
  -> immutable, sanitized EvidenceObservationV0
  -> source-owned payload digest + signing key
  -> signed reLATTE CrossingEnvelopeV0
  -> recipient LocalReceiver: verify signature, RECEIVE receipt
  -> recipient owner-policy evaluation
       HOLD   -> signed HOLD receipt; no storage/admission
       REFUSE -> signed REFUSE receipt; no storage
       ADMIT  -> signed ADMIT receipt; at most "store observation"
  -> authorized idempotent destination sink: local observation record
  -> human reviewer decides whether evidence helps a task
```

This module is **not** a Commuter marketing or contact-sync transport. Those contracts remain independent. It composes the same reLATTE envelope/receipt primitives without importing a foreign system's authority.

## Delivered code

- `src/evidence-transit.ts` — provider-neutral event identity, payload address, sealed crossing, receiver-local policy and disposition, sink deduplication, serial source polling with commit-after-success cursor.
- `test/evidence-transit.test.ts` — stable identity, signature and tamper rejection, signed HOLD, ADMIT and replay, refusal, permission revocation, invalid data, failed sink/cursor recovery.
- `npm run verify` — complete repository type check/tests/build.
- Source and destination adapters are injected, not hard-coded.

### Semantics

- `evidence_level = claim` means a subject claims a fact; `source_observed` means an adapter saw a source response; `bytes_verified` is valid *only if the adapter actually verified payload bytes*. None means external truth, action completion, or human identity.
- `payload_ref` is a `sha256:<64 hex>` digest. It is not a URL or permission grant. Source evidence must be fetched out-of-band by a receiver-approved adapter.
- The public crossing does not copy private source payloads.
- `source_keys` are persistent source-owned P-256 keys, separate from the receiver key; keys and source-to-key authorization must be managed by the operating deployment. A valid signature alone does not establish who the operator was.
- When `evaluate` or `store` is missing: **HOLD**, no destination mutation.
- The receiver writes a signed RECEIVE receipt, then a signed disposition receipt. `ADMIT` means permission to store an observation, not permission to publish it or act on it.
- Idempotency key = deterministic `evidenceEventId`; the destination owns durable deduplication. The synthetic test sink uses a Set; deployers must supply atomic dedupe.
- LocalReceiver dispositions are immutable. An already-held crossing cannot later become admitted by policy edit alone: create a *new* source observation/crossing with fresh attributable ancestry.
- An existing ADMIT never overrides a later negative local policy check. A retry with revoked permission returns `BLOCKED` without another store.
- Poller advances source cursor only after the entire batch finishes; no distributed lease or scheduler is included.

## First concrete source: Night Shift 005

Night Shift currently stores source-observed GitHub PR state in `night_external_observations` and links it to private work submissions by a separate `night_external_evidence_links`. Its initial specimen is public `the-static-collective/reLATTE#121`, which GitHub reported merged on 2026-10-27.

An adapter may translate that row into `EvidenceObservationV0` with:

```ts
{
  schema: 'relatte.evidence-observation/v0',
  source_system: 'github',
  source_world: 'world:github-public',
  source_particular: 'source:github-pr',
  source_event_id: 'the-static-collective/reLATTE#121:MERGED:270169ebcc54...',
  subject_ref: 'repo:the-static-collective/reLATTE',
  assertion_kind: 'github.pull_request.state',
  payload_ref: 'sha256:<digest of canonical source observation>',
  evidence_level: 'source_observed',
  occurred_at: '2026-10-27T07:49:35.000Z',
  observed_at: '2026-10-27T08:45:32.000Z'
}
```

Those values are **illustrative**; the payload digest must be computed from a verified source-specific canonical byte representation, not copied from a dummy hash. Night Shift's existing database fingerprint is not automatically a reLATTE signature.

A live sender must explicitly sign, and a live receiving world must independently verify and admit. Never relabel an unsigned database receipt as reLATTE-signed.

## Boundaries and next test

No current proof of permanent hosted key custody, background delivery, multi-operator admission, live browser-to-worker crossing, or other external provider integration is implied by this library change. Proposed production adapters: first Night Shift, then independently permissioned Vercel deployments, publications, Garden field notes, and Penny settlement observations. Do not pretend a grocery delivery is verified merely because a contributor said it was.

**Law: source observed ≠ receiver admitted ≠ independently reviewed ≠ field proved.**


## NIGHT-SHIFT-WORKER-001 — real one-shot road

`npm run evidence:night` polls the **current live, public Night Shift source feed**, maps public GitHub PR observations through `NightShiftPublicEvidenceSource`, signs each reLATTE crossing with a persistent local P-256 source key, and hands it to a distinct durable `LocalReceiver`. No background job or cloud timer is claimed.

First use: `npm install && npm run evidence:night`.

The default receiver **HOLDs** all observations and writes independently signed `RECEIVED` and `R3_HOLD` receipts into a local append-only journal. It does *not* change Night Shift tasks.

Explicit operator choice: `npm run evidence:night -- --admit-observations` uses a **separate receiver world** and only admits the narrow `night-shift:github-rest` public source-observation kind to a durable, local, idempotent record store. This says **stored observation**, not merged-author identity or task completion. A GitHub PR is not proof of who performed a community service.

Keys and receipts reside under `~/.relatte/night-shift-evidence`, or in the private directory selected by `RELATTE_NIGHT_EVIDENCE_HOME`. The source signing key is created once (mode 0600 on Unix), and each receiver manages its own independent key. Back up these files carefully; losing them loses continuity. Do not copy keys into a repository, a public URL, or a screenshot.

**Operational limitations:** no 24/7 process, no scheduling, no global receiver lease, no multi-operator coordination. The current public API returns at most five latest merged PR observations; if a persisted cursor is not in a full five-row window, polling fails instead of silently skipping events. This is a bounded pilot aperture, not a lossless production event bus. Production use requires a paginated outbox and stronger identity/key custody.

The adapter converts Supabase PostgREST microsecond UTC timestamps to strict millisecond-Z values before canonical reLATTE signing. Observation payload digests are domain-separated, while the actual public source bytes are not included in the envelope.
