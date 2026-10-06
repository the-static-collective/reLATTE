# Useful Work Kernel 010 — Offer / Acceptance / Settlement Receipt

010 adds a conditional local offer, a signed presentation of specific evidence,
an offerer-local decision and separately attributed external settlement records.
They have different identities and signing boundaries. None creates an obligation,
executes a transfer, grants ownership or declares universal finality.

```text
OFFER: X + acceptance policy P + condition C + external adapter identity
   ↓
PRESENTATION: exact offer + result/work + complete presented evidence inventory
   ↓
offerer observes presentation and evaluates P locally
   ↓
ACCEPT / HOLD / REJECT                 semantic_effect: none
   ↓ only a specific ACCEPT can be referenced
external payment / ledger / resource adapter observation
   ↓
distinct-key replay receipt → individual external records and terms comparisons
```

```text
VALUATION ≠ OFFER
OFFER ≠ OBLIGATION
ACCEPTANCE ≠ PAYMENT
PAYMENT OBSERVATION ≠ OWNERSHIP
SETTLEMENT RECEIPT ≠ UNIVERSAL FINALITY
```

## Run and retain

Node 22.18+; Python 3.10+ standard library is used only by tests/vector generation.
Portable verification needs Node and the public bundle. No OS collectors, original
artifact path, renderer, private keys, provider connection or ledger are required.

```sh
npm ci
npm run verify
npm run useful-work-010 -- demo
npm run useful-work-010 -- verify output/useful-work-010/settlement.json --out output/settlement-reverified
npm run useful-work-010 -- verify-exchange output/useful-work-010/exchange.json --out output/exchange-reverified
```

Use fresh output directories, with `--out <new-directory>` for reruns. The demo
replays the public 009 resource fixture and issues a new 007 local valuation: 3,072
declared result entries × 1/256 = 12 demo credits. Its acceptance policy admits
one CPU observation from the named collector/replayer and that named valuation.
This is a declared local choice; CPU time is not transformed into value or energy.

After issuing ACCEPT, a **separate example process**, [demo-ledger.ts](demo-ledger.ts),
changes local demonstration balances from 100/0 to 88/12. This process imports no
reLATTE code. The adapter imports that record as `operator-import/v1` and signs
the two balance deltas; another key replays it. There is no financial payment,
resource delivery or enforceable right in this demonstration. Replay, observe,
decide and verify commands never invoke the ledger process or change its state.
The example ledger is a single-process demonstration, not a transactional service.

The demo also saves discretionary HOLD and REJECT decisions about the passing
presentation. These are separate local receipts, not a consensus, irrevocable
decision history or settlement instructions. All new role keys are controlled by
the demo; distinct keys do not prove different people or organizations.

Outputs include `offer-terms.json`, signed `offer.json` and `presentation.json`
file transport bundles, `evidence-input.json`, `evidence.json`, `exchange.json`,
`hold-exchange.json`, `reject-exchange.json`, `external-record.json`, signed
`observation.json`, independent `receipt.json`, `settlement-input.json`, portable
`settlement.json`, readable `summary.json` and `demo-provenance.json`.
`receiver/` demonstrates ordinary opaque RECEIVE/HOLD. `local-state/` contains
restricted private demo keys and the example ledger; neither is part of public replay.

## Offer and condition

`useful-work.offer/v1` is a signed opaque crossing. Its terms contain exactly:

- `description` and `transfer`: offered X. Transfer terms specify adapter kind
  (`payment`, `credit-ledger`, `resource`), `system_ref`, `asset_ref`, `unit`, exact
  positive `amount`, and distinct `from_ref`/`to_ref` labels.
- `policy`: data-only `useful-work.acceptance-policy/v1`, with algorithm
  `typed-evidence-all/v1`, a local name and 1–32 typed AND clauses.
- `present_before`: exact UTC cutoff, exclusive. The offer must be signed before it.
- `eligible_presenter`: pinned world/key or null for any distinct presenter.
- `target`: pinned `result_id`, `work_crossing_id`, `job_spec_hash`, or null for an
  open result target. Every actual presentation still binds all three.
- `settlement_adapter`: a pinned external world/key and explicit allowed record
  origins (`provider-record/v1`, `operator-import/v1`, `simulation/v1`).

The envelope adds `acceptance_policy_id`, fixed condition basis, exact limits and
the five laws. The public key/world must differ from the settlement adapter.
References identify declared systems/accounts/assets; they prove no legal identity,
account ownership, ability to provide X, funded balance or exclusive right.
The offered amount is distinct from any local valuation amount. No conversion,
global exchange rate, automatic pricing or matching market is introduced.

Condition C in this bounded v1 is **the offerer observes this presentation before
the cutoff**, plus any presenter/target restrictions. The presentation timestamp
does not establish delivery. The decision signs `observed_at` under the offerer's
key, with `observation_basis: signed-offerer-local-claim/v1`. This is an attributed
clock claim, not objective time. Observations cannot predate the presentation;
decisions cannot predate their observation. A later decision may accept evidence
observed before the cutoff. Additional condition kinds need a new policy profile.

## Specific evidence and local policy

`useful-work.offer-evidence/v1` carries `result_id`, canonical `job_spec`, authenticated
004 `work`, nullable 005 `audit`, 006 `audit_history`, 008 `service_history`, 009
`resources`, up to 16 complete 007 `valuations`, and a domain-separated `evidence_id`.
Each included object is verified from its underlying signed records, not its saved
summary. Every object binds the same native work crossing/job/result. A separately
provided audit must match the audit reconstructed by a supplied 006 history.
Valuations must match that work and the effective audit/history context.

007 retains its original policy semantics: 009 resource observations are additional
typed evidence in this presentation, not silently added to the older valuation
context, and `proven_cpu_ms` is unchanged. A named 007 valuation remains a local
opinion about the exact context it embeds, with its own self-report and artifact
limitations. Its receipt is never treated as an offer or a promise to pay.

The signed presentation pins the exact offer ID, acceptance policy ID and evidence
ID, plus result/work/job, audit/history/service/resource IDs and ordered valuation
IDs. Changing, deleting or reordering evidence requires a new presentation.
Presentation signing cannot predate the offer or any included signed record.
It explicitly does not verify that the offerer received it. Presenter key/world
must differ from the offerer.

| Policy clause | What the local offerer elects to admit |
| --- | --- |
| `audit` | Minimum unique matching indices reported by listed verifier worlds/keys; optional rejection of any contradictions in the presented audit. Mathematical execution is attributed, not rerun by 010. |
| `audit-history` | Minimum completed observation slots in the verified 006 history, with a pinned observer cut signer. This trusts the observer's inventory and included replayed mathematical receipts, not exclusive work or objective time. |
| `service` | Minimum in-window verified chunk slots in 008, with pinned observer and host. Response timing remains an observer claim; no uptime or physical bandwidth inference. |
| `resource` | Existence of one 009 observation within an exact rational range, from named collector and replay signer, with admitted capture modes and explicit energy reading origins. No sum or job cost. |
| `valuation` | Existence of one local opinion from a named evaluator, with exact policy ID/unit and a minimum amount. No unit conversion or universal value. |

Resource metrics are separately named `cpu_time_observed`,
`energy_watt_hours_observed`, `logical_file_bytes_observed`,
`filesystem_allocated_bytes_observed`, `interface_rx_bytes_observed`, and
`interface_tx_bytes_observed`. Their units/limitations stay inherited from 009.
CPU uses exact milliseconds, energy exact Wh, storage/interface metrics exact bytes.
Thresholds are canonical reduced rational decimal strings. Simulation must be
explicitly admitted in an energy or settlement origin policy.

Each clause reports PASS, FAIL or MISSING, concrete observations and source IDs.
Missing evidence is not a zero or a failed computation. Any FAIL makes the policy
FAIL; otherwise any MISSING makes it MISSING; all PASS makes it PASS. Every included
signature is authenticated before deduplication. Duplicate observations cannot
inflate thresholds, and separate or overlapping resource measurements are never
added, averaged, maximized into job cost or treated as exclusive work.

## Offerer decision

The offerer alone signs an ordinary `ACCEPT`, `HOLD` or `REJECT` receipt about the
presentation, under `contract:useful-work/offer-settlement-v1`. All have
`semantic_effect: none`, null state references and no descendants/residual effects.
The extension `useful_work_offer_decision` binds the complete evidence reference,
policy ID, offerer/presenter, local observation, conditions, rebuilt clause results,
choice, reason and explicit limits.

ACCEPT requires policy PASS and all local conditions true. HOLD/REJECT remain
discretionary even on PASS. No protocol decision is auto-issued on missing evidence,
and malformed/invalid evidence emits validation errors rather than an accusation.
Verification recomputes the complete receipt identity. A valid signature cannot
upgrade ACCEPT to payment, change a report or create admission/ownership effects.

010 has no unique acceptance register, revocation order, exclusive allocation,
offer capacity, arbitration or legal enforceability model. Multiple decisions
can exist; a settlement observation pins one specific ACCEPT receipt. Choosing
which local decision governs an external action remains outside this kernel.

## Three external observation adapters

An external adapter can **attest a record after an external action**, using
`observeSettlement(exchange, input, keys, world, at)`. This function receives
records; it never connects to a payment provider, modifies a ledger or moves a
resource. Each adapter has its own signed family and source literal:

| Kind | Source | Retained source evidence |
| --- | --- | --- |
| `payment` | `external/payment-record/v1` | `transaction_ref`, literal status `posted`, observed transfer terms. Pending records cannot become a payment-observed receipt. |
| `credit-ledger` | `external/credit-ledger-record/v1` | `entry_ref`, source debit and destination credit account refs and exact before/after balances. Both deltas must equal the observed amount. |
| `resource` | `external/resource-transfer-record/v1` | `transfer_ref`, literal `reported-delivered` status and observed transfer quantity/unit. Physical delivery remains unverified. |

Input includes `transfer`, `record_ref`, `observed_at`, adapter-specific `evidence`,
and provenance `{record_origin, provider_ref, adapter_version, record_sha256}`.
The digest is SHA256(JCS({transfer,record_ref,evidence})); it binds the imported
record, not independent provider authorship or truth. V1 attests the adapter's
claim; it does not implement provider signature formats, banking APIs, chain
confirmations, hardware delivery attestation or legal ownership verification.
Those need explicit additional adapters rather than stronger v1 flags.

The signed observation binds offer, presentation, ACCEPT decision, evidence, result
and work IDs. It must use the adapter key/world pinned by the offer and an admitted
record origin. Adapter key/world must differ from the presenter as well as offerer.
Its observation cannot predate the chosen ACCEPT; signing cannot predate observation.
These are consistency checks on attributed clock claims.

A distinct key/world, also distinct from offerer/presenter, replays the source
signature, exact acceptance binding, provenance structure and ledger arithmetic.
It signs `SETTLEMENT_OBSERVED` with `semantic_effect: none` and extension
`useful_work_settlement`. It separately reports `payment_observed`,
`credit_ledger_changed`, or `resource_transferred`, each scoped to the signed
adapter's claim. Those flags are not verification of the underlying physical act.

The receipt compares observed and offered transfer terms. `terms_match` requires
the same kind/system/asset/unit/party refs **and** exact amount. `amount_relation`
is `less`, `equal`, `greater` or `incomparable`. Partial, excess, different-unit
or different-system records can be retained without asserting offer fulfillment.
No partial-payment aggregation or currency conversion occurs.

Always false: provider authenticity, physical delivery, bank finality, ledger
persistence, exclusive record use, legal discharge, ownership, exclusive job
causation, organizational independence, objective time, transfer performed by
reLATTE, transfer guarantee, obligation creation and universal finality. A matching
record is not an automatically discharged obligation or a universal paid status.

## Inventory, portability and commands

`useful-work.offer-exchange/v1` embeds `{offer,evidence,presentation,decision}`.
`useful-work.settlement-bundle/v1` embeds that exchange, ordered
`observations: [{observation,receipt}]`, rebuilt `summary` and domain-separated
`bundle_id`. Every submitted record is authenticated before deduplication.
Unique observation/replay IDs are counted; individual receipts remain retained.
Repeated external record labels and conflicting content digests are surfaced.
No transfer totals or global spend accounting are computed. Record references
are not assumed unique, complete or exclusive across this or other offers.

An empty observation inventory can retain an ACCEPT with no payment evidence,
or a HOLD/REJECT with no settlement claim. It does not imply a zero transfer or
failure. The bundle hash commits the presented inventory; it cannot establish
that no other decision/record exists. Signed presentations, decisions and adapter
observations provide the cryptographic bindings to their respective subjects.

```text
evidence_id = useful-work-offer-evidence-v1:
            + SHA256("UsefulWork-OfferEvidence-v1|" || JCS(evidence without evidence_id))
policy_id   = useful-work-acceptance-policy-v1:
            + SHA256("UsefulWork-AcceptancePolicy-v1|" || JCS(policy))
bundle_id   = useful-work-settlement-bundle-v1:
            + SHA256("UsefulWork-SettlementBundle-v1|" || JCS(bundle without bundle_id))
```

All signing commands take explicit local P-256 private JWKs, `--world`, and
`--out <new-directory>`. Offers/presentations accept raw crossings or file bundles;
other commands consume embedded JSON. `--observed-at` is deliberately required for
decisions, so local observation is distinct from command execution/signing time.

```sh
npm run useful-work-010 -- evidence <evidence-input.json> --out <new-dir>
npm run useful-work-010 -- offer <offer-terms.json> --key <offerer-key> --world <offerer-world> --out <new-dir>
npm run useful-work-010 -- present <offer-bundle> <evidence.json> --key <presenter-key> --world <presenter-world> --out <new-dir>
npm run useful-work-010 -- decide <offer-bundle> <evidence.json> <presentation-bundle> --choice HOLD --observed-at <UTC> --reason <text> --key <offerer-key> --world <offerer-world> --out <new-dir>
npm run useful-work-010 -- observe <exchange.json> <external-record.json> --key <adapter-key> --world <pinned-adapter-world> --out <new-dir>
npm run useful-work-010 -- replay <exchange.json> <observation.json> --key <separate-replayer-key> --world <replayer-world> --out <new-dir>
npm run useful-work-010 -- collect <settlement-input.json> --out <new-dir>
```

Public API: `usefulWork.settlement`, with creation/signing/inspection functions
for evidence, offers, presentations, decisions, observations, receipts and bundles.
Policies are bounded data, never code. Limits: 32 clauses, 32 admitted audit verifier
identities per clause, 16 valuations, 64 settlement submissions, 64 KB policy,
2 MB signed 010 messages/receipts, 1 MB raw external record and 192 MiB portable
evidence/exchange/bundle; nested 004–009 limits still apply.

The [golden bundle](../../fixtures/useful-work-010-golden.json) contains public
records only. [settlement_vectors.py](settlement_vectors.py) independently checks
hashes, typed threshold/window arithmetic and ledger deltas on those vectors;
Node performs signature authentication and underlying evidence reconstruction.
Hostile tests cover scope substitution, signed authority/effect upgrades, cutoff
edges, named provenance, simulation opt-in, partial/mismatched records, replay,
opaque HOLD and relocated verification after deleting collectors/worker code.
