# Useful Work Kernel 007 — Valuation Without Authority

Kernel 007 lets a world sign **“I value this identified evidence at X under policy
P.”** Another process can authenticate the entire evidence inventory and replay
P's arithmetic. That establishes the evaluator's declared calculation, not an
appropriate price, true computation, universal value or entitlement.

```text
Kernel 004 result_id + pinned work/job
       + optional Kernel 005 audit / Kernel 006 observed history
       + attributed resource claims + optional canonical artifact
                              ↓
                    identified evidence context
                              + local policy/version
                              ↓
               exact calculation + scoped signed VALUED receipt
                              ↓
              opaque crossing → sovereign RECEIVE / HOLD
                              ↓
               independent signature/binding/formula replay
```

```text
VALUE ≠ TRUTH
PRICE ≠ AUTHORITY
PAYMENT ≠ OWNERSHIP
WORK CLAIM ≠ RESOURCE PROOF
AUDIT SUCCESS ≠ ECONOMIC ENTITLEMENT
ONE MARKET ≠ UNIVERSAL VALUE
```

## Run and retain it

Node 22.18+; demos/tests additionally require Python 3.10+, standard library only.

```sh
npm ci
npm run verify
npm run useful-work-007 -- demo examples/useful-work-001/julia-001.json --with-mutant
```

The demo runs the actual 004–006 path with four scheduled slots: two complete
sample observations, one expired issuance and one unknown slot. `--with-mutant`
executes a separately modified Python reference that disagrees about terminal
orbit state. Its scoped negative receipt is retained in a newly signed observer
inventory. Two contradictory signed resource claims remain visible. Coverage,
discovery and revised coverage policies then interpret the **same** context;
coverage v1/v2 use the same evaluator key. All three opinions coexist.

Fresh output directories are required; use `--out <new-directory>` for reruns.
Default `output/useful-work-007/` contains:

- `audit-history/`: complete 006 demonstration, role keys, worker data, prior cuts.
- `observed-history.json`: later cut including the optional contradictory receipt.
- `artifact.json`, `resources/claim-*.json`, `context.json`, `valuation-input.json`:
  canonical native artifact, signed claims, self-contained snapshot and file manifest.
- `coverage-v1/`, `discovery-v1/`, `coverage-v2/`: `valuation.json` (portable bundle),
  signed `valuation-receipt.json`, readable report, transport `crossing.json`,
  sovereign receiver/HOLD journals and private local evaluator state.
- `comparison.json`: scoped amounts, policies, evaluator keys/worlds and a relation;
  no ranking, conversion, averaging, winner or global replacement.

Later verification uses only Node and saved public evidence; worker keys, Python,
render algorithms and evaluator private keys are unnecessary:

```sh
npm run useful-work-007 -- verify output/useful-work-007/coverage-v1/valuation.json --crossing output/useful-work-007/coverage-v1/crossing.json --out output/valuation-reverified
npm run useful-work-007 -- context output/useful-work-007/valuation-input.json --out output/valuation-collected
npm run useful-work-007 -- evaluate output/valuation-collected/context.json examples/useful-work-007/coverage-v2.json --out output/my-local-opinion
npm run useful-work-007 -- compare output/useful-work-007/coverage-v1/valuation.json output/useful-work-007/discovery-v1/valuation.json output/my-local-opinion/valuation.json --out output/my-comparison
```

`evaluate` supports `--key <private-jwk>`, `--world`, `--particular` and `--at`.
Without a key it generates a local signing key, stored with restricted permissions.
`claim <claim-spec.json>` signs a self-reported resource claim using the same key
options. These are local actor keys, not wallets. No private keys are committed.

The context manifest uses relative file paths for `work` (transport bundle),
`audit`/`history` (objects or null), `resource_claims` (transport bundles) and
`canonical_artifact` (canonical JSON or null), plus inline `job_spec` and `result_id`.
Contexts and valuation bundles embed evidence so later verification is portable.

## Reproducible local formula

A policy pins its schema, `rational-linear-discount/v1` algorithm, name/version,
local unit label, unique metric terms, caps, missing-value behavior and uncertainty
rules. Its content hash is bound by the signed valuation crossing and receipt.
Policy documents are input data; no arbitrary policy code executes.

For metric values `v`, weights `w`, optional caps `c`, uncertainty fractions `u`
and declared discount rates `r`:

```text
contribution = w × min(v, c)           # uncapped when c is null
subtotal = sum(contributions)
amount = max(0, subtotal) × product(1 − r × u)
```

Fractions use reduced decimal integer numerator/positive denominator strings,
BigInt arithmetic and an explicit 256-digit limit. There is no floating-point
rounding or implied exchange rate. Negative weights can penalize evidence; the
zero floor creates no debt. Reports trace every observed/effective value, cap,
weight, contribution, missing rule and discount factor.

Unknown metrics remain `null`. Each term explicitly chooses `zero` or `reject`;
uncertainty rules choose `max-discount`, `no-discount` or `reject`. Rejecting a
valuation says the policy cannot evaluate these inputs. It emits no fraudulent
work allegation or failed-computation receipt. Uncertainty fractions range from
zero to one. No conditional miss probability is treated as correctness or value.

`fixtures/useful-work-007-golden.json` freezes public signed evidence and three
opinions with exact amounts **9, 48 and 21/2 local points**. Fresh challenges can
produce different coverage and amounts. Tests authenticate the fixture and compare
its metrics against a Python implementation derived from raw inventories, without
reading accumulator summaries. A separate `fractions.Fraction` implementation
cross-checks 96 generated formula vectors, including caps, negatives and missing
uncertainty. The Python oracle does not authenticate signatures; the Node verifier
does that before replaying the policy.

## Evidence and trust boundaries

The result identity remains Kernel 004's single Merkle-native identity. Context and
policy IDs address the input snapshot and interpretation, not alternate artifacts.
Every underlying crossing, receipt, history cut, reference and summary is verified
through 004–006 before projection. Supplying both audit and history requires the
exact history-derived audit ID. Signatures authenticate claims and attribution;
valuation replay does not re-execute their mathematical verifiers.

Metrics expose their basis and source IDs:

| Basis | Available interpretation | Limit |
| --- | --- | --- |
| Canonical job | result entries; declared iteration budget | declared upper bound, not executed work or physical cost |
| Attributed sampled receipts | observed union, matching indices, distinct challenge IDs, key/source-fingerprint diversity | repetition, labels and key diversity do not prove independent execution or randomness |
| Localized disagreements | contradictory indices; contradictory fraction within the observed union | disagreement is not fraud; proof-only disagreements outside that union remain in the raw count |
| Declared schedule | issued/completed observation slots; incomplete fraction over **all** planned slots | future and missing slots remain in the denominator; completion includes negative mathematical claims |
| Signed clock observer | in-window response observations over all closed slots | observed timestamps, not objective time, computation duration or complete history |
| Included canonical artifact | present-at-evaluation and byte count after native structure/root verification | not full computation, future availability or persistent storage |
| Signed self-reports | maximum claimed CPU ms, energy millijoules, stored/served/mirrored bytes | attributed declarations, never resource proof |

Resource claim format is `useful-work.resource-claim/v1`: `result_id`, optional
`audit_id`/`history_id`, `basis: "self-reported/v1"`, `claimed_at`, `note` and
`amounts` with all five fields (`cpu_ms`, `energy_millijoules`, `stored_bytes`,
`served_bytes`, `mirrored_bytes`); each amount is null or a bounded nonnegative
integer and at least one must be present. Non-null references must match this
context exactly. Measured/proven bases are unsupported.

Claims are authenticated before replay deduplication. All unique claim IDs and
conflicting values remain recorded. V1 takes the **maximum per field**, never a
sum across resubmissions or identities. Rewarding any such metric requires explicit
`allow_self_reported_resources: true` and a cap. This bounds the policy contribution;
it does not provide Sybil resistance or establish the claimant's honesty.

`full_computation_verified_result` and `proven_cpu_ms` stay unknown: there are no
full-computation or measured-resource proof adapters in this contract. Even observing
every index does not silently promote attributed receipts into a new execution proof.
Missing artifacts mean unavailable evidence, not proved unavailability. Timing is
judged at the history's signed observer cut, not the evaluator's timestamp.

The valuation crossing carries `organ:useful-work/valuation-v1` under
`contract:useful-work/local-valuation-v1`; signed receipts are `VALUED` with
`semantic_effect: none`. Verification rejects validly signed wrong arithmetic,
changed origins/scope and stronger authority/ownership/resource/truth assertions.
Receiver admission remains receiver-local. Holding a valuation transfers no ownership,
makes no payment and grants no economic entitlement. reLATTE core remains unchanged.

A world may select a later policy interpretation locally. Earlier receipts remain
historical opinions, and no receipt erases another world's valuation. Comparisons
retain different contexts and different unit labels explicitly. Even identical
amounts do not establish consensus or correctness.

## Deliberate limits and extension seams

This kernel implements signed interpretation, not currency, consensus, staking,
markets, wallets, settlement or economic incentives. The demo controls every role
key on one machine; source fingerprints and clock observations remain attributed
claims, not evidence of physical independence or an objective clock.

Future adapters can introduce separately scoped resource measurements or availability/
serving observations, with explicit verification rules and new policy versions.
Dogram/distributed workers can supply inventories without changing valuation authority;
GHoT worlds can retain and replace their own interpretations. An external economic
or resource layer can consume these opinions under its own settlement/ownership
rules. It must not turn transport, repeated audits or a local policy into a universal
price or payment obligation.
