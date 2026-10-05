# Useful Work Kernel 004 — Merkle-Native Result

Kernel 004 closes the identity gap documented in Kernel 003. The canonical
mathematical result now has **one identity**, derived from its Merkle structure:

```text
ordered {index, count} leaves → padded count tree
                                      ↓
                 job hash + dimensions + count-tree root
                                      ↓
                        canonical result root
                                      ↓
                    result_id / artifact address
```

A proof for pixel 1,928 verifies both its committed count and membership in
the named result artifact. There is no separately declared JSON `result_hash`
or unsigned association between two result identities. The count-tree digest
is an internal node; only the top result root is an artifact identity.

The Q24 mathematical contract from [001](../useful-work-001/README.md),
independent Python mathematics from [002](../useful-work-002/README.md), and
fresh signed sampling from [003](../useful-work-003/README.md) remain in use.
The native structure, identity and membership proofs also have a separate
Python implementation. Old wire contracts stay available and fail explicitly
when passed to a verifier for this new contract; they are never relabeled as
Merkle-native evidence.

## Run it

Requires Node 22.18+ and Python 3.10+, with no additional Python packages:

```sh
npm ci
npm run verify
npm run useful-work-004 -- demo examples/useful-work-001/julia-001.json
```

The demo uses separate processes for worker preparation, fresh challenge,
worker response and sampled verification in two worlds. It checks 16 of 3,072
entries by default. `--samples 32` selects another sample count (1–64, bounded
by the population). Output directories must be new; use `--out <new-directory>`
for reruns.

Run the steps on different processes or machines:

```sh
npm run useful-work-004 -- prepare examples/useful-work-001/julia-001.json --out output/native-prepared
npm run useful-work-004 -- challenge output/native-prepared/delivery/work.json --samples 16 --out output/native-challenge
npm run useful-work-004 -- answer output/native-prepared/delivery/work.json output/native-challenge/challenge.json --state output/native-prepared/worker-state --out output/native-answer
npm run useful-work-004 -- verify output/native-prepared/delivery/work.json output/native-challenge/challenge.json output/native-answer/response.json --out output/native-worlds
```

`verify --world python` runs independently of the worker algorithm. Tests remove
all worker/TypeScript mathematical files, poison the full Python render function,
and verify a relocated exchange using only the job and three crossing bundles.
Python also verifies the native proof directly with the TypeScript codec removed.
`compare <receipt-a> <receipt-b> --out <new-directory>` authenticates scoped
receipts and records compatible, contradictory or incomparable observations.
Failed sampled verification emits a signed FAILED receipt and exits 1. Signature
or context authentication failures stop before attesting to an unbound subject.

## Canonical representation and identity — v1 prose contract

A full artifact is JCS UTF-8, without a newline, of exactly:

```json
{
  "schema": "useful-work.merkle-artifact/v1",
  "result": {
    "schema": "useful-work.merkle-result/v1",
    "algorithm": "sha256-jcs-pixel-tree/v1",
    "job_spec_hash": "<canonical job SHA-256 hex>",
    "width": 64,
    "height": 48,
    "counts_root": "<ordered count-tree digest>"
  },
  "escape_counts": ["illustration only: actual entries are integer counts"]
}
```

JCS means canonical JSON; the illustration above is not a valid job artifact.
Counts are integers `0..iterations`, row major, with `index = y*width + x`.
Dimensions match the authenticated job. The job hash binds its seed, version,
bounds, iteration limit and parameters. The existing job limits apply.

Construct the count subtree to the next power-of-two leaf count:

- Real leaf: `SHA256(ASCII("UsefulWork-NativePixel-v1|") || JCS({index,count}))`.
- Padding leaf: `SHA256(ASCII("UsefulWork-NativePadding-v1|") || JCS({index}))`.
- Parent: `SHA256(ASCII("UsefulWork-NativeNode-v1|") || left32 || right32)`;
  `left32` and `right32` are raw digest bytes, in that order.
- Top root: `SHA256(ASCII("UsefulWork-MerkleResult-v1|") || JCS(result))`.
- Sole identity: `result_id = "useful-work-merkle-result-v1:" + top_root_hex`.

All digest text is lowercase 64-character hex. The header schema/algorithm are
fixed. Extra fields, unknown versions and malformed numbers fail explicitly.
Padding leaves cannot be sampled. A proof supplies sibling digests bottom to
top, with orientation derived from index bits and exact depth
`ceil(log2(width*height))`; a one-pixel proof is empty. Verification reconstructs
the count root, then the top node and **the exact expected `result_id`**. Job,
dimensions, index, count, ordering, padding scheme and encoding version are bound
by this structure.

Full artifact inspection validates canonical bytes and rebuilds this same tree
from every ordered count. Its resulting identity must equal the expected ID.
The JSON container is an encoding of the native artifact, not another identity
scheme. Presentation and execution metadata keep their separate byte hashes
as ancillary artifacts; neither determines mathematical result identity.

The [golden vectors](../../fixtures/useful-work-004-golden.json) pin singleton,
non-power-of-two and pixel-1,928 cases. Regenerate them with
`python3 -B examples/useful-work-004/generate_vectors.py`, which uses only the
independent Python world. Tests compare both implementations over 64 jobs,
mutate identity construction, and mutate mathematics in each runtime.

## Crossings, receipts and durable output

The work crossing carries a `useful-work.merkle-manifest/v1` and the canonical
result header in signed donor claims. Its `merkle-result` payload address is
the native `result_id`, understood by this domain adapter. No core reLATTE
addressing, signature, transport or sovereignty rules change. Fresh challenges
use the existing Kernel 003 coordinate derivation over work/challenge crossing
IDs; they carry only this result identity, sample count and fresh random nonce.
The original worker key signs exact-context responses with count proofs and
terminal orbit states. Replaying against another challenge or result fails.

The demo writes `prepared/delivery/work.json` and content-addressed artifact
files, `challenge/challenge.json`, `answer/response.json`, and
`worlds/{typescript,python}/verification-receipt.json`, results and RECEIVE/HOLD
journals. The native artifact filename is the final 64 hex characters of its
ID. The worker key and canonical result used to answer later stay in
`prepared/worker-state/`, separate from portable delivery. Later sampled
verification needs only the three bundles and canonical job bytes at
`artifacts/<job_spec_hash>` beside the work bundle.

Receipts use `extensions.useful_work_native`. Their scope names the exact work,
challenge, response, native artifact ID, result header, indices and coordinates.
Claims distinguish authenticated messages, canonical job/header identity,
response structure, **sampled entries bound to result identity**, and independent
sampled computation. Predictions, terminal states and runtime/source fingerprints
attribute what each world checked. Fingerprints cover both the mathematical
and native-format implementation sources; they do not prove honest execution.

Sampling still can miss errors. `complete_artifact_received`,
`full_artifact_structure_verified` and `full_computation_verified` remain false
in these sampled receipts, even when every pixel happens to be sampled. Proofs
do not attest to full artifact availability, all padding/structure, elapsed work,
ownership, or economic value. An honest fresh challenger supplies unpredictability;
collusion or challenge grinding is not prevented by a consensus mechanism.

The receipt comparator checks signatures and claim/evidence consistency and
selects no winner. Different local mathematical predictions produce scoped
contradictory receipts for the same native identity. RECEIVE/HOLD remains local
and never implies admission or ownership. DOGRAM can visualize this evidence;
distributed workers can index the native leaves/proofs; GHoT can retain the
exchange; repeated audits or an economic/resource layer can consume the scoped
receipts outside reLATTE. Those policies and incentives remain extension seams.
