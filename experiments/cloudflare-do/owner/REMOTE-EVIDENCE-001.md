# R3-CF-002 — Remote Cloudflare Temporary Staging Evidence

**Verified:** October 14, 2026, 19:50:50 UTC.  
**Source:** `e3f00f2ea8c5bfd5ec6f26070043c98d3937c28a` (later changed for documentation).  
**Private GitHub Actions run:** https://github.com/the-static-collective/mystical-whimsey/actions/runs/38626939100  
**Execution:** actual Cloudflare-hosted Workers using a **disposable temporary Cloudflare account**, not the operator's connected permanent account.

## Observed remote endpoints

- Receiver public health: `https://relatte-mw-durable-pilot.viridian-tail.workers.dev/health`
- Source owner public health: `https://relatte-mw-owner-pilot.viridian-tail.workers.dev/health`
- Crossing: `relatte-crossing-v0:1742f91012db87da537e6ddbf161c8bf2004a497657d700a71960952bfb54e34`

These URLs are **ephemeral** until the temporary account is claimed before its expiry. Do not treat them as stable hosting or public business endpoints.

## What the remote execution verified

1. Wrangler created a temporary Cloudflare account and deployed two different Worker services, each declaring a SQLite-backed Durable Object with its own private P-256 key.
2. Each service's authorization-protected identity endpoint returned its own public signer fingerprint, and the two fingerprints differed.
3. The two services pinned each other's public signing fingerprints through the operator-controlled test bootstrap. The receiver's source trust pin was confirmed after redeployment.
4. The source generated and persisted a real reLATTE signed crossing referring only to a SHA-256 of fictional public service hours (Mon–Fri, 09:00–21:00, America/Chicago).
5. Cloudflare Service Binding transported the signed candidate to a distinct receiving Worker. The receiver signed `RECEIVED` and `R3_HOLD` (no admission). Owner independently verified both signed receipts against its pinned destination signer and recorded acknowledgement in its own outbox.
6. Recipient state showed `journal_length: 2`, `held: 1`, `admitted: 0`; owner outbox showed `confirmed: 1`, `pending: 0`.
7. After *remote Worker redeployment*, repeat source proposal returned an identical crossing ID and `duplicate: true`; receiver journal length remained 2.
8. Unauthenticated read of owner outbox returned HTTP 401; no client, payment, appointment, or sensitive payload was sent.
9. The private run concluded `TEMP_STAGING_RESULT=PASS`.

This is **stronger than** the previous local Wrangler proof: the Worker code and Durable Object state ran in real Cloudflare infrastructure and the signer-backed carrier traversed a real Cloudflare inter-service boundary.

## Limits and non-claims

- Both services share the *same temporary Cloudflare account*; this is not two independent accounts/operators or a decentralized network.
- The run verifies persistence across remote **redeployments**; it does not independently induce or attest physical host failure/eviction.
- Operator bearer tokens were randomly generated in CI and set as temporary Worker secrets; they were not published in repo, artifact, or logs. Business-practitioner human authorization is not implemented.
- This test is **not a real service-hours update**. No public website content changed, no booking was made, no money moved, and no Mystical Whimsey customer information was collected.
- The private CI log contains a claim URL which functions as a sensitive, time-limited capability. **Never copy that token to a public repository or public issue.** Claiming requires user sign-in and may create a *separate permanent Cloudflare account*. If unclaimed, the account and its Workers expire after 60 minutes.
- Independent key custody/export, loss recovery, trust rotation, and production security review remain gates before using this for business records.

## Follow-up gate

When moving from disposable staging to practitioner-approved permanent hosting, deploy using an authenticated Cloudflare connection and explicit owner consent. Do **not** attach `mysticalwhimsey.org` or import any private business/client records until that review is complete.
