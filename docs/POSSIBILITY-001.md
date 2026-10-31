# POSSIBILITY-001 — Open Useful Later crossings

**Status: executable reLATTE adapter, not a deployed exchange or credit service.**

## Origin

GrO's [Useful Later](https://github.com/the-static-collective/GrO/tree/main/apps/field-scout/useful-later) card asks whether a person can put a specific useful capacity on the table and find someone who values it *now*. Its first local pilot uses a small service-for-advance card. The ambition here is wider than money or labor.

The reLATTE primitive is **one attributable, source-owned, consent-sensitive relationship event** — not a currency unit, person, tradable debt balance, or centrally enforced account.

```text
SOURCE WORLD                   reLATTE                RECEIVER WORLD
a need / offer / invitation     hash private source      local owner verifies signer
    |                           record, sign crossing          |
a new claim-level event    ->   immutable reference    -> RECEIVE signed receipt
    |                            no private terms             |
source retains exact text       replaceable carriage          HOLD / REFUSE / ADMIT
                                                             |
                                                ADMIT = REVIEW OBSERVATION ONLY
                                                             |
                                             no dispatch without owner sink
```

## One public grammar, many possible organs

`PossibilitySignal` carries only:

- Source world and particular; opaque source event and relation IDs.
- Source vocabulary `kind` and `action` (e.g., `service.work.reported`, `resource.offered`, `knowledge.invited`).
- A domain-separated SHA-256 reference to an exact source-owned packet.
- An event timestamp; fixed `source_claim` and `review_only` boundaries.

No price, account, legal claim, contact, human name, address, description, phone, private beneficiary, or live action is embedded in a crossing. Arbitrary *namespaced category labels* are possible; arbitrary authority claims are not. `requested_effect` is limited by the existing `EvidenceObservation` adapter to `store-observation`.

The receiver controls its own `EvidenceRoute.evaluate` and `store` callback, key-trust policy, authorization, capacity and acceptance. A new receiver may refuse exactly the same signed claim another receiver holds. Missing evaluation or missing sink always produces an independent signed HOLD.

A `LocalReceiver` ADMIT permits only receiver-owned storage of a **claim-level observation**. It does not prove actual advance, work, consent, fulfillment, identity, payment, lawful ownership, or legal transfer.

### GrO source adapter

`adaptGrOUsefulLater(exportedCard, {world, particular})` checks the exported card's known event vocabulary and impossible state transitions, including maker + holder + incoming-beneficiary consent for a proposed change. It hashes the *entire source packet* and transforms only the **latest local self-reported event** into a signed crossing candidate. It cannot authenticate a typed name or reconstruct private meaning without the original packet.

Export after each event if historical event-by-event crossing is needed; a final exported snapshot does **not** claim every previous event was transmitted separately. Changing any source event changes the digest and crossing identity. Conflicting source histories are not silently merged.

A beneficiary change recorded inside an exported GrO card **is not negotiability, a financial instrument, or transfer of real-world rights**. Real agreement must be established outside the software. The runtime deliberately does not settle claims or collect payments.

## Local reproducible demonstration

```sh
npm run verify
# focused:
node --test --experimental-strip-types test/possibility.test.ts
```

The tests exercise:

- Source-packet reference verification with no leakage of people, amounts or work terms into the signed carrier.
- P-256 crossing signatures and independent receiver signed receipt; missing permission HOLD.
- Non-service source (garden surplus) admitted to **review storage** only by a receiver's explicit policy; deterministic replay after durable journal restart.
- Revocation of receiver store policy blocks later attempts even after an earlier ADMIT.
- Refusal, consent-dependent local transfer-state replay, invalid history, and hostile metadata rejection.

`src/possibility.ts` exports:

- `possibilityContentRef(record)`, `validatePossibilitySignal(signal)`, `possibilitySignalId(signal)`.
- `adaptPossibilityToEvidence(signal)`, `sealPossibilitySignal(signal, destination, keys)`, `transportPossibilitySignal(signal, route)`.
- `matchesPossibilityContent(signal, record)` for payload matching.
- `validateGrOUsefulLater(card)`, `adaptGrOUsefulLater(card, source)`, `matchesGrOUsefulLater(signal, card)`.

## Future integration gates

1. A real GrO browser export or API adapter that passes an exact source packet into `adaptGrOUsefulLater` while keeping private fields at source.
2. Persistent maker signature keys, on-device key custody, and an independently maintained signer-to-human authorization registry (not provided by merely seeing a key).
3. Receiver-owned permissions, participant-specific direct consent, rejection/appeal and restorative/cancellation processes, privacy and safety controls.
4. Replaceable source and sink adapters: Garden Help Slip, reLATTE CommUter, Full Measure world events, community resource lists, and other consented sources.
5. **Separate legal/product analysis before introducing real advances, deposits, work contracting, regulated credit, transfer of financial claims, escrow, securities, payments or fundraising.** A $25 UI limit is not a legal exemption.
6. Live cross-device tests with persistent receiver operators and an independent second person.

Do not treat a source self-report as a signed human act. Do not promote a receiver receipt to market price, debt, universal reputation or field verification.

```text
SIGNATURE != CONSENT
RECEIVE != ADMIT
ADMIT_OBSERVATION != ACCOMPLISHMENT
BENEFICIARY_CHANGE != DEBT_TRANSFER
CONTENT_HASH != RETRIEVAL_RIGHT
ONE LOCAL RELATION != UNIVERSAL MONEY
```
