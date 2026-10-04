# Useful Work Kernel 001

An executable primitive: a deterministic mathematical job becomes portable result
bytes, an opaque reLATTE crossing, sovereign RECEIVE/HOLD receipts, and a signed
receipt from a separate process that recomputes every sample.

From a fresh clone, use Node 22.18+ (or Node 24) and run:

```sh
npm ci
npm run verify
npm run useful-work -- run examples/useful-work-001/julia-001.json
```

The demo defaults to `output/useful-work-001`. Use `--out <new-directory>` for
another run; existing output directories are deliberately not overwritten.
The command prints the job/result hashes, crossing identity, RECEIVE, HOLD, all
four verification claims, signed receipt path, and verifier key fingerprint.

Durable output:

```text
output/useful-work-001/
  worker/job.json                 canonical job specification
  worker/result.json              canonical mathematical artifact
  worker/render.ppm               visual artifact (portable pixmap)
  worker/execution.json           worker-reported execution metadata
  worker/manifest.json            four SHA-256 content hashes
  delivery/crossing.json          existing file-bundle transport frame
  delivery/artifacts/<sha256>     four exact referenced byte strings
  receiver/                      existing receiver identity and durable journal
  roundtrip.json                 crossing, RECEIVE, HOLD, receiver snapshot
  verification/verifier-result.json
  verification/verification-receipt.json
  verification/verifier-public-key.json
```

Copy **only `delivery/`** to another machine/process with this repository installed:

```sh
npm run useful-work -- verify /path/to/delivery/crossing.json --out later-verification
```

Verification needs neither worker state nor the original receiver's journal or
private key. `--artifacts <directory>` overrides the sibling content store.
`--hash-only` emits a receipt whose computation claim remains **false**, even for
a correct result. Failed verification exits nonzero and writes a signed `FAILED`
receipt with demonstrated partial claims and explicit errors. An invalid transport
frame or crossing exits nonzero before any domain receipt: there is no authenticated
crossing identity to attest against.

## Deterministic model

`julia-q24/v1` is a Julia escape-time sampler using signed Q24 integers
(`q = 2^24`) and exact BigInt intermediates. The seed is an unsigned 32-bit
integer. SHA-256 of UTF-8 `UsefulWork-JuliaSeed-v1|<decimal seed>` yields two
big-endian 32-bit words; each supplies an offset `word % 524289 - 262144` to
the specified real/imaginary constant. No floating point enters the orbit.

Pixels sample the center of each cell, with row zero at the lower imaginary bound.
For x, the initial real coordinate is `min + trunc((2*x+1)*(max-min)/(2*width))`;
y follows the same rule. Starting from that pixel coordinate, while
`zr*zr + zi*zi <= 4*q*q` and the iteration budget remains, evaluate simultaneously:
`zr' = trunc((zr*zr-zi*zi)/q) + cr` and
`zi' = trunc(2*zr*zi/q) + ci`. Division truncates toward zero.
Counts are completed steps, capped at the budget, in row-major order. A capped
count does not establish mathematical membership in the Julia set.

The exact-key job schema rejects unsupported algorithms/parameters, fractional
dimensions, invalid bounds and unsafe integers. Dimensions are 1–512, iterations
1–4096, bounds within ±4q, constants within ±2q, and total worst-case steps are
limited to 5,000,000. Each delivered artifact is limited to 16 MiB.

The existing JCS canonicalizer encodes job and result JSON as UTF-8 without a
trailing newline. Hashes are SHA-256 of those **exact bytes**. The result embeds
the job-spec hash, dimensions and integer escape counts. The golden fixture
`fixtures/useful-work-001-golden.json` fixes job/result bytes and identities.
Presentation uses P6 RGB pixmap bytes with a separate hash. Runtime, clock times,
elapsed milliseconds and execution metadata hashes may differ across workers;
job and mathematical-result hashes do not. Crossing/receipt identities also bind
keys and times, so they are not deterministic work identities.

## Claims and trust boundaries

| Receipt claim | What the verifier demonstrates |
| --- | --- |
| `artifact_received` | All four signed content references resolved to bounded bytes. Receiving an envelope alone is insufficient. |
| `artifact_structurally_valid` | Canonical JSON; supported job; result dimensions/count ranges; metadata schema; PPM header and byte length. |
| `artifact_hash_matches` | Every observed byte hash matches the signed manifest and payload references. This can be true for a false calculation. |
| `computation_independently_verified` | Full local recomputation matches every escape count, with valid structure, hashes and result-to-job binding. |

The worker's manifest is signed donor data, transported through the existing
`OpaqueOrganSpec` → `CrossingEnvelope` → file-bundle → `LocalReceiver` path.
Artifact bytes travel alongside the frame in a content-addressed directory;
the existing transport carries references, not embedded payloads. No substrate
code gains knowledge of Julia mathematics or work value. RECEIVE and HOLD remain
receiver-local actions with `semantic_effect: none`, even when computational
verification later fails. HOLD neither admits the artifact nor asserts ownership.

The verifier signs an ordinary `relatte.receipt/v0` using the existing P-256
profile. Its `extensions.useful_work` contains the exact report. Always inspect
these claims and mode; generic `kind: VERIFIED` alone does not mean computation
was checked. Verify receipt integrity with the existing `verifyReceipt` API:

```sh
node --input-type=module - <<'JS'
import { readFileSync } from 'node:fs';
import { verifyReceipt } from './src/protocol.ts';
const receipt = JSON.parse(readFileSync('output/useful-work-001/verification/verification-receipt.json', 'utf8'));
if (!await verifyReceipt(receipt)) throw new Error('INVALID_RECEIPT');
console.log(receipt.extensions.useful_work);
JS
```

Demo verifier keys are fresh per invocation; only their public half is retained.
A valid signature establishes integrity and attribution to that key, not a trusted
real-world identity or honesty. Compare expected keys and job hashes through your
own trust policy. Independent recomputation shares the versioned reference
algorithm with the worker, so common implementation defects remain possible;
an independently implemented verifier is a concrete next seam. Metadata timing,
hardware, energy use and PPM color correspondence are not computationally attested.

The authority boundaries remain:

- POSSESSION ≠ OWNERSHIP
- RECEIPT ≠ TRUTH
- STRUCTURAL VERIFICATION ≠ COMPUTATIONAL VERIFICATION
- COMPUTATIONAL VERIFICATION ≠ ECONOMIC VALUE

This demonstrates reproducible bounded sampling, byte integrity, transport,
local custody and scoped computational attestation. It does not demonstrate
cryptocurrency, consensus, staking, wallets, markets, incentives, ownership,
universal truth, or a price/resource valuation system.

## Follow-on seams

- **DOGRAM:** consume the versioned job/result/receipt through another donor
  adapter without changing substrate admission rules.
- **Distributed workers:** dispatch canonical jobs by hash, resolve signed content
  references through other existing roads, and compare result hashes.
- **GHoT:** attach receipts and result identities as attributable evidence in a
  provenance graph; retain verification scope and disagreements.
- **Economic/resource layer:** consume these scoped receipts under its own policy;
  independently measure resource claims and assign value outside reLATTE.
- **New workloads/verifiers:** add explicit algorithm versions, golden vectors,
  independently written reference checkers, or proof mechanisms with distinct
  receipt claims. Never relabel hash checks as recomputation.
