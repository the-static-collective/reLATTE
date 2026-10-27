# COMMUTER-001 — Automatic Correspondence

**Status: executable library prototype and synthetic pilot specification. Not connected to a farm, GrownBy, an email account, or a live worker.**

## What it solves

A small organization may operate an independent storefront and email/CRM service, but customer activity has to be copied by hand. COMMUTER-001 is a general, replaceable **change → signed crossing → receiver-owned decision → idempotent action** organ built on reLATTE's existing cryptographic and receiver primitives.

A conversation about Cedar Crate Farm motivated the first candidate use case. This document does **not** establish the farm's software permissions, consent, business agreement, email provider, or participation in a pilot.

```text
SOURCE CONNECTOR          reLATTE                   OWNER-LOCAL RECEIVER
GrownBy? / CSV?     ->   signed crossing       ->   RECEIVE receipt
Shopify / Sheet?         (opaque references)        ->   HOLD / REFUSE / ADMIT
                                                        |
                                              ADMIT + fresh policy check
                                                        |
                                                  destination adapter
                                                        |
                                            provider acknowledgement/duplicate
                                                        |
                                              sanitized operator outcome
```

## Implementation

- `src/commuter.ts`: event identity, canonical content hash, signed crossing adapter, owner-local disposition, fail-closed permission boundary, destination idempotency key, and one source poll cycle.
- `test/commuter.test.ts`: independent receiver signed receipts; no-policy HOLD; marketing-without-evidence HOLD; authorized delivery; stable replay after receiver restart; permission recheck; failed sink with no cursor advancement; opaque-subject validation.
- A source connector implements `poll(cursor)` and returns immutable events plus its next cursor. A destination connector implements `apply(change, { crossing_id, idempotency_key })` and **must** deduplicate that key durably. Neither connector's provider is hard-coded.
- A cursor store implements `read()` and `write()`. It must itself be durable for recurring operation; an in-memory store is only a test/demo.
- The caller supplies a persistent P-256 source signing key and a `LocalReceiver` with its own independently governed signing key and journal.

`npm run verify` covers the library and synthetic tests.

## Local decision policy

By default **HOLD**. No effect may be executed unless the receiver owner supplies an `evaluate` callback returning ADMIT, a destination adapter is available, and the callback is still affirmative when dispatch is retried.

The engine also refuses to dispatch marketing when consent is not explicitly `granted` with a content-addressed evidence reference. **An evidence reference is a claim, not proof of valid consent**; the owner callback must independently verify evidence, source signing key binding, recency, unsubscribe state, scopes, and purpose. Operational updates and suppression signals ALSO require owner policy. An ADMIT receipt reports authorization in local receiver history; it does **not** prove the email provider sent anything.

A source event crosses with only an opaque customer reference and a content digest. Actual customer data lives with the source until the admitted destination adapter uses its own authorized access. Never put email addresses or names into opaque IDs, extension metadata, logs, or public crossing receipts.

## Source and destination examples

| Source | Candidate event | Intended destination action | Additional gate |
| --- | --- | --- | --- |
| Storefront | order completed | Sync fulfillment/contact status | Verified business purpose and authorized data access |
| CSA system | membership changed | Update relevant contact segment | Verified current membership |
| Consent manager | unsubscribed | Apply marketing suppression | Validate origin and event |
| Email provider | audience permission changed | Reflect permission with source | Owner-approved bidirectional mapping |

Do **not** automatically email purchasers solely because they placed an order, and do not equate contact sync with marketing consent.

## Illustrative owner-owned policy

```ts
const route = {
  destination: 'farm-email',
  capability_ref: 'owner-issued-capability-reference',
  source_keys: persistentFarmSourceKeys,
  receiver: farmOwnedReceiver,
  received_at: () => new Date().toISOString(),
  evaluate: async (change, crossing) => {
    // Adapter-specific, authoritative verification—not provided by reLATTE.
    if (!(await trustedSourceKey(crossing.signing.public_key))) {
      return { disposition: 'REFUSE', reason: 'unknown source key' };
    }
    if (!(await freshOwnerPermission(change))) {
      return { disposition: 'HOLD', reason: 'needs receiver-owned permission' };
    }
    return { disposition: 'ADMIT', reason: 'authorized for this purpose' };
  },
  apply: destinationAdapter.apply, // MUST use durable idempotency keys
};
await pollCommuterOnce(sourceAdapter, durableCursorStore, route);
```

## Operator view (derived from receipts, not made-up statuses)

- `HELD`: receiver didn't authorize, or destination adapter missing.
- `REFUSED`: receiver refused this crossing.
- `BLOCKED`: crossing was previously admitted but current policy no longer authorizes an action.
- `APPLIED`: adapter claims new remote action. Verify with provider for fulfillment proof.
- `ALREADY_APPLIED`: adapter claims it already processed the stable event key.
- Exceptions: source poll, local signing, or destination action failed; cursor **does not advance**.

## Limits and next gates

1. **Current:** single sequential in-process poll cycle and durable receiver journal. No scheduler, distributed lease, provider connector, durable outgoing receipt log, secret storage, or real-time webhook ingestion. It is not a live sync.
2. **Provider discovery:** determine how the farm actually exports/streams source changes, what email provider it uses, and what data/purposes it wants connected. Document read/write privileges and the concrete owner-issued authorization.
3. **Safe sample connector:** import an owner-provided test CSV snapshot with stable source event IDs and provenance; do not infer marketing consent from rows.
4. **Production runtime:** durable cursor + persistent signer custody, opt-out-first processing, authenticated webhook or polling, replay detection across concurrent workers, retries with backoff, owner-controlled mappings, rate limits, encrypted customer data handling, and audit/telemetry.
5. **Remote outcome evidence:** collect and independently verify provider delivery identifiers and suppression acknowledgments; LocalReceiver's signed admission receipt alone is not a delivery receipt.
6. **HOLD release:** a fresh, independently authorized crossing references a held event; no rewriting an existing receiver disposition.
7. **Consent safety:** honor revocations throughout the pipeline and re-check authoritative permission immediately before any marketing message. Replayed ADMIT never overrides revocation.

## Governing laws

```text
DETECTED != AUTHORIZED
SIGNED != TRUSTED ORIGIN
RECEIVED != ADMITTED
ADMITTED != SENT
PROVIDER ACK != HUMAN RECEIPT
CUSTOMER PURCHASE != MARKETING OPT-IN
TRANSPORT != AUTHORITY
RETRY != NEW CUSTOMER EVENT
```

**Goal:** one farmer can see whether independently owned systems are communicating, what was applied, and what needs a human decision—without reLATTE becoming the farmer's master database.

## Single-host durable cursor

`FileCommuterCursorStore` in `src/commuter-store.ts` persists a poll cursor via same-filesystem atomic rename and rejects malformed state. It is intended for one serial worker on a persistent filesystem. It does not provide distributed locking, fsync durability, or serverless persistence; configure a transactional external store and work lease before scaling out.
