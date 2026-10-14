# MW × reLATTE R3-CF-002 — two durable worlds, one private crossing

**Experimental stacked branch on R3-CF-001. No public Cloudflare deployment, business website migration, customer information, or real service-hours publishing.**

## What R3-CF-002 adds

Two independently persisted SQLite Durable Object instances inside two **separate Cloudflare Worker services**:

1. **Owner (Source) DO** (`relatte-mw-owner-pilot`): holds a fresh P-256 source key in **its own private SQLite state**, signs a reLATTE crossing naming the SHA-256 of narrowly validated public business hours, and stores the crossing in an idempotent owner-local outbox.
2. **Receiver DO** (`relatte-mw-durable-pilot`, from CF-001): receives an envelope only from a **previously pinned source signer**, validates real reLATTE signatures, signs a `RECEIVED` and independent `R3_HOLD`, and writes a transactionally paired journal to its **different SQLite database**.
3. **Owner confirmation:** The owner Worker talks to the receiver **through a Cloudflare Service Binding**, not a public webhook. It independently verifies both recipient signatures, binding to crossing ID, a pinned receiver public-key fingerprint, HOLD disposition, and absence of a business effect **before** marking its outbound entry confirmed.

```text
          SOURCE WORKER                 RECEIVER WORKER
        owner SQLite DO                receiver SQLite DO
       private P-256 key                private P-256 key
              │                              ▲
     reLATTE signed crossing                 │
              └── Service Binding ───────────┤
              ◄─ RECEIVED / R3_HOLD receipts ┘
              │
     VERIFY pinned receiver fingerprint
              │
     owner-local acknowledgement
```

The transfer is **one signed candidate and two signed receipts**; it is not a calendar update. Both worlds are configured in one Cloudflare account for this specimen, so organizational independence and independent platform administration are **not** established by service separation.

## Properties exercised in CI

- Both source and destination keys persist across process death.
- Both local databases survive separate Wrangler-process restarts.
- Source signature can be pinned out of band at the receiver, and destination signature pinned at the source.
- Transport failure leaves the source outbox **pending**, allowing the original signed crossing to be retried.
- Repeating a confirmed request returns the original crossing ID without another receiver event.
- Unknown cross-source signatures, falsely signed ADMIT claims, altered receipts, invalid service-hours fields, and missing operator bearer credentials are refused.
- The receiver does not publish website changes and does not create bookings.

**Recorded source history is not equivalent to a server-side booking or owner approval.** This program currently proves receipt handling for public schedule proposals only.

## Local test

From the reLATTE repo root:

```bash
npm install --ignore-scripts
npm install --no-save --ignore-scripts wrangler@4.151.0
node --test --experimental-strip-types experiments/cloudflare-do/test/*.test.mjs
node --experimental-strip-types experiments/cloudflare-do/test/worker-runtime.mjs
node --experimental-strip-types experiments/cloudflare-do/test/two-worker-runtime.mjs
```

The new integration test launches two locally hosted Wrangler Workers with independent persistent directories, creates their signer identities, explicitly pins each public fingerprint via local isolated `.dev.vars`, transfers one sample proposal across a Worker **Service Binding**, then kills and restarts both Workers and verifies the previous signed history and deduplication.

The `.dev.vars` test credentials are disposable and not copied into a repository; tests abort rather than clobber pre-existing developer secrets. There are no real customer names, phone numbers, locations, health details, payments, or appointment messages.

## Next boundaries

- The initial source operator token is held by the **technical operator**, not a real authenticated practitioner user. There is no owner app/SSO or authority delegation.
- Both Workers and their private keys are still administered under one Cloudflare account. We must not claim this is an independent peer network or a full distributed multi-custodian installation.
- SQLite persistence is durable on the host, not a proof of portable ownership. Build encrypted export and independently tested restoration under practitioner-controlled credentials.
- Owner and receiver identity bootstrap is performed by a privileged local operator through the two authorized `/v0/identity` routes; there is no automatically authenticated independent identity registry.
- There is no source journal hash chain (only a durable idempotent outbox), no outbound signed delivery receipt, and no multi-business tenancy.
- Event ordering, deduplication and provider-confirmed appointment availability need separate business-specific organs.
- The sensitive business and customer-data model is deliberately not implemented here; privacy retention, consent, key rotation/revocation, incident response and security review are required before public writes.
- Existing production `mysticalwhimsey.org`, Vercel and DNS remain unchanged. Do not attach its live domain or enable scheduling on this branch.

Parent: [R3-CF-001](../README.md), [reLATTE Local Receiver 001](../../../docs/LOCAL-RECEIVER-001.md).
