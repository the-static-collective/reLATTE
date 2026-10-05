# Useful Work Kernel 002

A second mathematical verifier, written from Kernel 001's prose specification
and golden vectors in **Python 3.10+**, using only the standard library. It has
its own schema checks, seed derivation, integer rounding, sampling loop and
canonical result hashing. It does not import or invoke the worker algorithm.

Use Node 22.18+ or 24 and Python 3.10+:

```sh
npm ci
npm run verify
npm run useful-work-002 -- demo examples/useful-work-001/julia-001.json
npm run useful-work-002:disagreement
```

The first demo creates job → artifact → crossing → RECEIVE/HOLD → two signed
world receipts under `output/useful-work-002/two-worlds/{typescript,python}/`.
Reports contain job/received-result/recomputed-result hashes, first mismatch,
runtime and actual reference-source digest. `comparison.json` retains both signed
receipts. Both commands accept `--out <new-directory>`; output is never overwritten.

The disagreement laboratory edits **isolated source copies** to use an exclusive
escape radius instead of the specified inclusive radius. A one-pixel job exactly
at radius two exposes the error in two experiments:

| World programs | Scoped receipts for the same artifact |
| --- | --- |
| Mutated TypeScript worker + shared TypeScript verifier; original Python | TypeScript signs a match to its own incorrect output; Python signs a mismatch. |
| Original TypeScript worker/verifier; mutated Python | TypeScript signs a match; Python signs a mismatch to its own altered rule. |

Both worlds receive structurally valid, hash-matching bytes. Contradictory
computational claims remain attributable to distinct keys/worlds and exact source
digests. `output/useful-work-002-disagreement/` retains portable deliveries, both
receipts, comparisons, actual mutant source and unchanged receiver HOLD journals.
The laboratory exits zero when the intended disagreements are demonstrated;
individual verification runs exit nonzero. Production source remains unchanged.

Verify a relocated delivery, or compare receipts without rerunning computation:

```sh
npm run useful-work-002 -- verify /path/to/delivery/crossing.json --out later-verification
npm run useful-work-002 -- compare receipt-a.json receipt-b.json --out later-comparison
```

Comparisons verify signatures and require the same crossing, job hash and received
result hash. They reject modified receipts, mixed subjects, one-key impersonation
of multiple worlds, and inconsistent claim profiles. Comparison identity is
independent of receipt order. A comparison is a domain evidence bundle, not a
computational verification or an authority ruling.

`compatible` means signed computations report the same result; `contradictory`
means at least two report different recomputed hashes for the same subject.
`incomparable` covers missing computations, including hash-only checks and
unavailable runtimes. A false computation flag alone is not a refutation:
mismatch requires a completed recomputation digest and sample evidence. No
relationship selects a winner, counts a majority, rewrites receipts, asserts
ownership/value, or changes local HOLD/admission. **RECEIPT ≠ TRUTH** and
**COMPARISON ≠ ARBITRATION**.

## Independence and limits

`independent/julia_q24.py` implements the mathematics with Python integers,
tuple coordinate updates and explicit signed truncation (Python's `//` otherwise
rounds negatives downward). Its canonical encoder covers only this closed,
ASCII-key, safe-integer mathematical schema, not general JCS.

The Node boundary shares envelope/signature authentication, bounded artifact
resolution and structural/hash inspection. It sends exact job/result bytes to
an isolated Python process, then binds returned evidence to those bytes and the
local script digest before signing. Python independently rechecks mathematical
schemas, canonical bytes, job binding and every sample. TypeScript intentionally
retains its shared worker implementation for the common-bug experiment.

Both worlds apply Kernel 001's strict execution-metadata validation in the shared
inspection layer. Even hash-consistent malformed metadata prevents computational
attestation. Valid metadata structure does not attest to worker-reported timings,
runtime or resource use.

This supplies mathematical/runtime diversity, not independent reLATTE
cryptography or transport. Shared boundary defects and common misreadings of
the prose remain possible. Signatures attribute claims to keys; identities and
implementation digests still need your trust policy. Comparisons check signed
claim consistency without demonstrating either world's arithmetic themselves.

## Executable evidence

- Existing golden fixture plus two analytical vectors for radius equality and
  negative truncation, including canonical identities.
- **200** reproducible generated/edge jobs: unequal dimensions, seed/budget
  extremes, signed bounds/constants, row order, every count and result hash.
  Failures print the exact vector.
- Python verification succeeds with the TypeScript algorithm, worker and verifier
  files physically removed.
- **Six actual source mutations**: exclusive radius, seed endianness and negative
  floor division, each applied to both implementations and killed by a vector.
  Shared mutated worker/verifier agreement produces contradictory Python receipts.
- Signature tampering, scope isolation, partial checks, unavailable Python,
  relocation/replay and HOLD persistence during disagreement.

Python can also render alone:

```sh
python3 -I -B independent/julia_q24.py render < jobs.json
# jobs.json: {"jobs": [<job specification>, ...]}
```

Follow-on seams: additional independent implementations, broader property corpora,
externally pinned verifier identities/source versions, and domain-local dispute
policies consuming receipts. These remain outside reLATTE transport and local
sovereignty authority.
