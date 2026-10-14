# reLATTE × Mystical Whimsey — SQLite Durable Receiver 001

**Status: experimental branch / review only. Not deployed. Not a booking service, customer database, or live hours publisher.**

This is Option A: adapt reLATTE's **R3 receiver history** to Cloudflare
**SQLite-backed Durable Objects** without using the Node filesystem.
The worker binds one named world, `world:mystical-whimsey-edge-pilot`,
with private SQLite state. It imports **the canonical reLATTE protocol
and canonicalization code** from `../../src` — it does not invent
another crossing ID or receipt signature dialect.

## What's implemented

- A separate Cloudflare Worker ingress with a SQLite-backed DO binding.
- Genuine reLATTE P-256 crossing signature verification, a **pinned source
  public-key fingerprint**, and receiver-generated signed `RECEIVED` and
  `R3_HOLD` receipts.
- Two crash-atomic, hash-linked events per new crossing, in one SQLite
  transaction, plus an indexed receiver view.
- Repeated authenticated delivery returns the **original** receipts
  without a new event. Concurrent arrivals serialize.
- Cold replay re-verifies event hashes, receipt signatures, source
  signatures, allowed source identity, state roots, and indexed journal.
  Corruption refuses startup rather than inventing a new history.
- The only allowed specimen is a signed **public service-hours proposal
  hash**, with strict structure and **no content payload**.
- No external storage, publication, booking, human identity, payments,
  client data, owner admin panel, direct key transfer, or live effect.

## Boundaries and warnings

**HOLD != ADMIT.** A received proposal does not change published hours
on `mysticalwhimsey.org`. Vercel, DNS, and existing production remain
unchanged. The Worker has no route attached to the existing domain.

Private receipt-signing JWK material currently lives in the DO's
private SQLite database. Platform storage provides durability, but this
is **not independent client-held or HSM-backed key custody**. Before real
business records, implement key rotation, independent recovery, audit,
access control, and encryption/retention policy. Do not use for
client-identifying data or sensitive appointment notes.

Only one pinned source key is accepted, and one long randomly generated
operator bearer token gates status and ingress. The source key is an
experimental technical signatory, **not the practitioner's verified
human identity or delegation of business authority**.

All requests are bounded to 16 KiB, with no CORS authorization and
no public content other than `GET /health`. **Do not log request bodies
or private signing keys**. A future authenticated owner role must be
separate from this operator access token.

## Local reproduction (no Cloudflare account needed)

From the root of the `reLATTE` repository:

```bash
npm install --ignore-scripts
node --test --experimental-strip-types experiments/cloudflare-do/test/*.test.mjs
npx wrangler@4.102.0 deploy --dry-run --config experiments/cloudflare-do/wrangler.jsonc
```

The tests use a real in-memory SQLite engine with a Cloudflare-style
`sql.exec`/`transactionSync` adapter, exercise full reLATTE crypto,
duplicate/parallel arrivals, restart replay, key mismatch and corruption.

For an end-to-end **local Worker runtime** smoke test:

1. Generate a disposable signed packet:

   ```bash
   node --experimental-strip-types experiments/cloudflare-do/scripts/lab-packet.mjs /tmp/mw-pilot-crossing.json
   ```

2. Create **untracked** `experiments/cloudflare-do/.dev.vars` with
   `MW_OPERATOR_TOKEN=...` (a generated random long token) and the printed
   `MW_TRUSTED_SOURCE_FINGERPRINT=sha256:...`. Keep `.dev.vars` out of Git.

3. Run:

   ```bash
   npx wrangler@4.102.0 dev --config experiments/cloudflare-do/wrangler.jsonc --local
   ```

4. In another terminal call (substitute your locally generated token):

   ```bash
   curl -i http://localhost:8787/health
   curl -i http://localhost:8787/v0/state -H "Authorization: Bearer <LOCAL_TOKEN>"
   curl -i http://localhost:8787/v0/crossings \
     -H "Authorization: Bearer <LOCAL_TOKEN>" \
     -H "Content-Type: application/json" \
     --data-binary @/tmp/mw-pilot-crossing.json
   ```

   Repeat the POST: `duplicate:true`, identical signed receipt IDs and
   no increase in journal length. Restart Wrangler: `/v0/state`
   must reproduce the same signed history.

Do **not** paste tokens, private keys or `.dev.vars` into chat, GitHub
issues, or repository commits. The demo source key is intentionally
ephemeral and is not a production business signatory.

## Deployment (deliberately manual and not yet authorized)

- Use the practitioner's explicitly approved Cloudflare account/project
  or a delegated operator account; confirm billing and data ownership.
- Configure `MW_OPERATOR_TOKEN` and
  `MW_TRUSTED_SOURCE_FINGERPRINT` as **Worker secrets** using
  `wrangler secret put ... --config ...`; do not use plaintext vars.
- Explicitly review and invoke `wrangler deploy` **only after a separate
  authorization**. Never point the live domain at this experimental Worker.
- Confirm actual Cloudflare runtime ingress, frozen/restarted DO replay,
  rollback/recovery, and cross-provider export in a staging environment.

## Production roadmap

1. Reconcile this SQL adapter against a filesystem R3 receiver under
   identical signed inputs, including receipt/state-ref parity.
2. Add signed trusted-source enrollment and rotation, independent owner
   authentication, least-privilege operator capability and fail-closed
   revocation.
3. Add portable, encrypted backups and tested export/recovery of the
   DO journal and receiver key (without letting operators impersonate
   the practitioner).
4. Add separate real booking provider adapter with provider-authoritative
   availability and idempotent signed webhook receipt **only after owner
   approval**; it must not be mistaken for `R3_HOLD`.
5. After live app tests and owner signoff, decide if Cloudflare should
   host the website too. Hosting is independent of the reLATTE proof.

Relevant code: `src/receiver.ts`, `src/protocol.ts`,
`docs/LOCAL-RECEIVER-001.md`; this work is an independent SQLite
implementation of a deliberately narrow receive/HOLD subset.
