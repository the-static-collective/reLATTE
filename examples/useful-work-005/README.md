# Useful Work Kernel 005 — Repeated Audit / Evidence Accumulator

Kernel 005 retains multiple [Kernel 004](../useful-work-004/README.md) exchanges
for the **same native `result_id`** in one portable audit object. Every work,
challenge, response and receipt signature is authenticated, including replays.
Scope and Merkle membership are checked against the actual signed exchange.
The accumulator reconstructs its totals from those records whenever loaded;
persisted totals are never trusted, even if their enclosing hash is valid.

It records attributed mathematical observations. It does not recompute the
orbits, decide which world is correct, vote, or confer authority or value.
Kernel 004 verifiers remain responsible for their signed predictions. A
signature and a source fingerprint cannot demonstrate honest execution.

```text
AUDIT COUNT ≠ TRUTH
COVERAGE ≠ AUTHORITY
REPEATED CHALLENGE ≠ INDEPENDENT RANDOMNESS
CONFIDENCE ≠ CONSENSUS
RESPONSE TIME ≠ COMPUTE TIME
```

## Run and retain evidence

Requires Node 22.18+; the demo also needs Python 3.10+ (no Python packages).

```sh
npm ci
npm run verify
npm run useful-work-005 -- demo examples/useful-work-001/julia-001.json --with-mutant
```

Default: three fresh 16-pixel challenges, TypeScript and independent Python
worlds, one exact receipt replay, and a genuine same-key recheck. `--with-mutant`
also executes a modified Python implementation whose terminal-state predictions
conflict at each pixel of the first draw. Its signed FAILED receipt remains in
the audit alongside matching observations. Successful collection exits 0 even
with contradictions: the collection operation has completed, and no verdict
has been selected. Use `--rounds <1..100>`, `--samples <1..64>` (bounded by job
population) and `--out <new-directory>` for other runs.

Durable output under `output/useful-work-005/` includes:

- `prepared/`: canonical job, native artifact, work crossing and local worker state.
- `round-*/`: fresh challenge, signed response, per-world receipts and HOLD journals.
- `snapshots/round-*.json`: accumulating history after each round.
- `audit-input.json`: portable file references for independently collecting that history.
- `audit/audit.json`: canonical self-contained audit with all signed records.
- `audit/summary.json`, `audit/crossing.json`, `audit/receiver/`: readable totals,
  signed opaque-organ transport reference and local RECEIVE/HOLD journal.

Later verification requires only `audit.json`, Node and the accumulator code;
no worker keys, full artifacts, Python, or mathematical implementation files.
An optional crossing checks the signed reference to that exact audit object:

```sh
npm run useful-work-005 -- verify output/useful-work-005/audit/audit.json --crossing output/useful-work-005/audit/crossing.json --out output/audit-reverified
npm run useful-work-005 -- collect output/useful-work-005/audit-input.json --out output/audit-collected
npm run useful-work-005 -- append output/audit-collected/audit.json output/useful-work-005/audit-input.json --out output/audit-appended
```

The last command deliberately resubmits old evidence: replay counts grow,
coverage and unique receipt/challenge counts do not. `append` preserves the
previous audit's probability model. For fresh evidence, supply a new manifest:

```json
{
  "schema": "useful-work.audit-input/v1",
  "job_spec": { "description": "replace with the complete canonical RenderJob" },
  "result_id": "useful-work-merkle-result-v1:<64 hex characters>",
  "submissions": [{
    "work": "prepared/delivery/work.json",
    "challenge": "round-4/challenge/challenge.json",
    "response": "round-4/answer/response.json",
    "receipt": "round-4/worlds/python/verification-receipt.json"
  }]
}
```

This illustrates the shape; the placeholder job is invalid. Paths resolve
relative to the manifest. Crossing files use existing file-bundle transport;
receipts use their original signed JSON. Different workers/work crossings may
contribute when they name the identical native result and canonical job.
Unsupported contracts, invalid signatures, crosswired scopes, false positive
proof claims, altered result identities, and forged totals fail explicitly.

## Exactly what accumulates

`submission_count` counts ingestion records. `unique_receipt_count` counts
signed claim IDs; a second valid ECDSA signature on the same claim is a replay.
New receipt IDs from the same verifier key on an old challenge are recorded as
rechecks, including changed responses. Additional worlds also observe that same
draw. None of these events creates a new random challenge. All originals are
retained; each signature is checked before deduplication.

The summary keeps three exact, sorted unions:

- `requested_indices`: coordinates derived from authenticated challenges.
- `proof_bound_indices`: coordinates whose response proofs the accumulator validates.
- `observed_indices`: coordinates with complete signed mathematical evidence,
  including negative observations, counted once per unique receipt.

Coverage is the cardinality of each union against `width*height`, with an exact
observed numerator/denominator. Requested samples, valid proofs and mathematical
observations are distinct. Unavailable checkers and malformed responses cannot
inflate observed coverage. Even full observed coverage does not assert full
computation verification or artifact availability.

Overlap is measured across **distinct challenge IDs**, with exact repeated slots,
shared indices and challenge multiplicity histogram. Each pixel records its
distinct challenges, receipt IDs, observation count, committed count and grouped
worker/verifier predictions. Contradictions preserve the exact `index`, `x`, `y`
and receipt IDs: differing verifier counts/states, conflicting worker evidence,
count-versus-commitment mismatch, and worker-versus-verifier mismatch remain
separate. Later matching claims do not erase earlier disagreement. Terminal
states are worker evidence, not part of the count-only native result commitment.

Challenger/worker/verifier world labels and normalized public keys are enumerated.
Implementations group by `(id, source_sha256)` with runtime variants; neither
labels, keys nor fingerprints prove independent execution or entropy. Reused
nonces across distinct challenge IDs are exposed. Signer timestamps are retained
as claims; the accumulator derives neither response duration nor compute time.
Progress follows ingestion order, not a trusted global chronology.

## Optional conditional sampling model

The default model is **off**. Enable it explicitly on `demo` or `collect`:

```sh
npm run useful-work-005 -- demo examples/useful-work-005/julia-audit.json --samples 4 --assume-honest-fresh --bad-entries 1 --out output/audit-modeled
```

Given a fixed population `N`, a fixed bad-entry set of cardinality `b`, and
eligible sample sizes `k_j`, the reported sampling-design probability is:

```text
P(no sampled index hits that fixed set | stated model)
    = product_j [ C(N-b, k_j) / C(N, k_j) ]
```

Within a draw sampling is uniform without replacement; draws are independent.
Three fresh 4-of-12 draws with one fixed bad entry give `(8/12)^3 = 8/27`.
Replays, rechecks and extra verifier worlds contribute no extra factors. All
distinct IDs sharing a nonce are excluded, as are challenges without a complete
mathematical observation. Exact impossibility is separate from numeric underflow;
scientific notation and log probability retain nonzero tiny values.

**These assumptions are stipulated, never verified.** They require fresh honest
independent entropy, no grinding of nonces/keys/timestamps, SHA-256 behaving as
an unbiased pseudorandom sampler, a fixed result/error set, and a complete
unselected challenge history. Eligibility/completion/availability must also be
independent of coordinates and error locations: selectively withholding replies
invalidates the interpretation. Unique IDs and passing receipts do not establish
these conditions. This is an **ex-ante** probability from sample sizes, before
conditioning on the actual coordinates or predictions. It is neither a posterior
correctness probability nor a confidence score, and remains such when conflicts
are already observed. Every modeled audit embeds these assumptions and
`assumptions_verified: false`.

## Identity, transport and extension seams

The canonical audit schema is `useful-work.audit/v1`, containing `result_id`,
the canonical job, lossless ordered submissions, optional model and derived
summary. Its address is `useful-work-audit-v1:` plus
`SHA256(ASCII("UsefulWork-Audit-v1|") || JCS(object without audit_id))`.
This identifies an evidence/history object; the audited artifact continues to
have exactly Kernel 004's sole `result_id`. Appending history produces a new
audit address. One-pass and incremental construction of the same ordered input
produce the same object. Different ingestion orders retain different histories.

The signed opaque-organ crossing uses `organ:useful-work/kernel-005` and
`contract:useful-work/audit-accumulator-v1`, referencing the audit address and
target result. Verification reconstructs the audit before accepting that
reference. Local RECEIVE/HOLD conveys possession, with no ownership, admission,
consensus, or economic verdict. No reLATTE core authority rules change.

This small format has explicit limits: 1,024 submissions, 1 MB per submission
and 64 MiB per audit. It revalidates retained evidence on append/load, rather than
relying on a collector's cached counts. It does not prove history completeness,
challenger independence, availability or elapsed effort.

The [signed golden fixture](../../fixtures/useful-work-005-golden.json) retains
three 4-of-12 draws, replay/recheck and a real mutant. Its exact expected counters
and `8/27` rational vector are derived separately in Python by
[`freeze_golden.py`](freeze_golden.py), without the accumulator. Fixture tests
authenticate all saved evidence. Freezing a new demo preserves its signatures
and nonces; a new signed history intentionally has a different audit ID.

Concrete follow-on seams: DOGRAM can show coverage/progress and pixel conflicts;
GHoT can retain successive audit addresses; distributed collectors can exchange
signed submissions; local policies can schedule challenges and track availability.
Any resource valuation, admission policy or economic layer consumes this scoped
evidence outside reLATTE's transport authority. Those policies remain unimplemented.
