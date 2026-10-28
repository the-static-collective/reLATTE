# PLANZ-RETURN-TRANSPORT-001

**2026-10-28 — executable reLATTE adapter and synthetic receiver proof. Not a production global courier.**

A manually prepared, unverified JAR;VIS `planz.return-candidate/v0` becomes a strictly validated `EvidenceObservationV0` with `evidence_level=claim`, an opaque source event ID and a domain-separated SHA-256 payload reference. The actual JSON candidate stays in sender-controlled custody. reLATTE signs its crossing with source-local P-256 key material. A distinct `LocalReceiver` verifies and issues RECEIVE + HOLD/REFUSE/ADMIT signed receipts.

- By default, no receiver policy means HOLD; no sink means HOLD even if requested ADMIT.
- An admitted observation is **only a candidate for owner review**, never a planZ issue update, verified beneficiary outcome, donation, completed task, or Full Measure deed.
- A local idempotent sink may remember the observation. The test uses a Set for deduplication; production requires durable receiver-controlled dedupe, an authenticated source-to-key binding, key custody, transport configuration, and operator permissions.
- The source candidateId uses the existing JAR;VIS SHA-256 JSON basis. The reLATTE payload digest is deliberately a **separate** domain-separated hash and does not authorize retrieval of the packet.
- Replaying the same signed candidate gives stable crossing identity; a receiver may still withdraw its current store policy, yielding BLOCKED without another store.
- Rejected source fields, contact-like text, false verified statuses and changed content ID refuse before signing.
- No local people, case notes, addresses, payment details, partner identity, real public dispatch or cross-border shipments are part of the test.

**Full Measure seam:** only independently approved and authenticated local human activity may count as a Deed or a new Capacity. A transport receipt proves cryptographic transport/disposition, never the associated real-world claim.

`SIGNED != TRUE`; `ADMITTED_OBSERVATION != FIELD_CONFIRMATION`; `REVIEW_CANDIDATE != COMPLETED_ACT`; `WITNESS_OF_BYTES != WITNESS_OF_BENEFIT`.
