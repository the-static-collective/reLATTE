# Useful Work Kernel 003 — Challenge / Response

Kernel 003 adds signed sampling to the integrated 001/002 kernels. A worker
commits its result entries before receiving a fresh challenge. The worker
answers with local orbit evidence and Merkle inclusion proofs. Separate
TypeScript and Python worlds recompute **only the requested coordinates** and
issue signed, explicitly scoped reLATTE receipts. Their disagreements are
attributed observations; reLATTE selects no truth or winner.

Run from a fresh clone with Node 22.18+ and Python 3.10+:

```sh
npm ci
npm run verify
npm run useful-work-003 -- demo examples/useful-work-001/julia-001.json
```

The demo uses a separate process for each step and writes durable output under
`output/useful-work-003/`. The default challenge checks 16 of 3,072 entries.
Use `--samples 32` to change that count (1–64, at most the population).
Output directories must be new; reruns can use `--out <new-directory>`.

The individual commands also work across processes or machines:

```sh
npm run useful-work-003 -- prepare examples/useful-work-001/julia-001.json --out output/prepared
npm run useful-work-003 -- challenge output/prepared/delivery/work.json --samples 16 --out output/challenge
npm run useful-work-003 -- answer output/prepared/delivery/work.json output/challenge/challenge.json --state output/prepared/worker-state --out output/answer
npm run useful-work-003 -- verify output/prepared/delivery/work.json output/challenge/challenge.json output/answer/response.json --out output/worlds
```

`verify --world python` runs only the independent mathematical implementation,
without loading the worker's algorithm. `compare <receipt-a> <receipt-b>`
authenticates and compares signed receipts for exactly the same scope. A
failed local verification gives exit status 1 and a durable FAILED receipt.
Signature or context authentication failures throw before attesting to an
unbound subject. Existing 001/002 crossings without a signed sample commitment
fail explicitly; a commitment cannot be attached without changing the work ID.

## Durable artifacts and transport

The demo leaves:

- `prepared/delivery/work.json`: original signed work crossing, including its
  original four artifact references and an additional signed commitment.
- `prepared/delivery/artifacts/<sha256>`: canonical job/result, PPM and metadata.
- `prepared/worker-state/`: private worker key and committed counts needed to
  answer later. This directory is local state, separate from the delivery.
- `challenge/challenge.json` and `answer/response.json`: signed opaque-organ
  crossings inside the existing file-bundle transport.
- `worlds/{typescript,python}/`: scoped results, signed verification receipts,
  and independent receiver journals with RECEIVE/HOLD receipts.
- `worlds/comparison.json`: compatible, contradictory or incomparable
  observations, with a deterministic comparison ID and `semantic_effect: none`.

Later verification needs only the three crossing bundles and canonical job
bytes at `artifacts/<job_spec_hash>` beside the work bundle. It never requests
the canonical result, image, execution metadata or worker private key. Tests
delete these artifacts and still verify a relocated exchange. The worker
rebuilds its Merkle tree from retained counts; only the selected mathematical
orbits are recomputed during answer and verification.

All transport and possession use existing opaque organs, CrossingEnvelopes,
Receipt signatures, file bundles and LocalReceiver sovereignty rules. The
domain payload is inline in the signed donor claims, with a matching canonical
payload hash reference. No core reLATTE vocabulary or admission law changes.

## Prose wire specification (v1)

The mathematical workload is the unchanged integer-only `julia-q24/v1`
[Kernel 001 contract](../useful-work-001/README.md). Each sample adds the final
integer real/imaginary state as canonical decimal strings, alongside the number
of completed steps. The state is measured after escape or iteration exhaustion;
the initial state is returned when it already lies outside radius two.

The original work crossing signs `donor_claims.sample_commitment`: schema
`useful-work.sample-commitment/v1`, algorithm `sha256-jcs-padded-binary/v1`,
job-spec hash, declared result hash, population and root hash. Counts are row
major; `index = y * width + x`, with row zero at the lower imaginary bound.
Digests are lowercase SHA-256 hex. JCS means UTF-8 canonical JSON with no newline.

Build a complete binary tree padded to the next power of two. A real leaf is
SHA-256 of `UsefulWork-SampleLeaf-v1|` followed by JCS of
`{job_spec_hash,result_hash,index,count}`. A padding leaf uses
`UsefulWork-SamplePadding-v1|` and JCS of `{job_spec_hash,result_hash,index}`.
Each parent hashes `UsefulWork-SampleNode-v1|` followed by the raw 32-byte left
and right child digests. Proof siblings run bottom to top; orientation derives
from successive index bits. Proof depth must be `ceil(log2(population))`, and
padding indices are forbidden. A population of one has an empty proof.

The challenger generates 32 fresh cryptographic random bytes **after** the
signed work commitment exists. Its signed challenge carries a 64-hex nonce,
work ID, job hash, declared result hash, root, population and sample count.
The existing signed challenge crossing ID is the challenge identity; it binds
the nonce, signer, timestamp and complete context without a signature cycle.

Derive a uniform sample without replacement from work ID + challenge ID:

1. Initialize remaining population `n = N`, counter `t = 0`, and an implicit
   array `A = [0, ..., N-1]` (the implementation uses a sparse swap map).
2. Read `u` as the first four SHA-256 bytes, unsigned big endian, of ASCII
   `UsefulWork-SampleCoordinates-v1|<work_id>|<challenge_id>|<t>`; increment `t`.
3. Reject `u >= floor(2^32/n)*n` and draw again, preventing modulo bias.
4. Choose `A[u % n]`, replace that slot with `A[n-1]`, decrement `n`.
5. Repeat until `k` entries are chosen; sort indices ascending. Abort after
   100,000 draws rather than silently changing the rule.

The original worker key signs a response naming the exact work/challenge/job/
declared-result/root context. Each requested index supplies `x`, `y`,
`committed_count`, `count`, `final_real_q`, `final_imag_q` and `proof`. Require
exactly the derived sorted sample set: extra/missing/duplicate entries fail.
Verify membership of `committed_count`, then independently recompute count
and terminal state from the canonical job. All three counts (committed, worker,
verifier) and both terminal states must agree. Cross-context replay and a
different response signer fail authentication. Rechecking the same immutable
exchange is valid evidence, not a new challenge or evidence of continued service.

The [golden fixture](../../fixtures/useful-work-003-golden.json) contains
coordinate vectors including one-entry, non-power-of-two, full-sample and
maximum-population cases; a padded root and proofs; and terminal orbit states.
Coordinates/tree vectors were calculated by a standalone Python list/hashlib
implementation of these prose rules. The TypeScript adapter/proof checking is
shared between worlds; Python independently implements the sampled mathematics
and never imports or calls the worker algorithm. Shared authentication code
and independent mathematics remain separate trust boundaries.

## Exactly what the receipt says

`extensions.useful_work_challenge` records the work, challenge and response IDs,
job hash, **declared** result hash, root, population, exact indices/coordinates,
checked count, each world's predictions, and its runtime/source digest. Claims
distinguish authenticated messages, canonical job hash match, response structure,
commitment membership and sampled recomputation. Source fingerprints attribute
a program; they do not prove honest execution or trusted world identity.

`artifact_hash_verified` and `full_computation_verified` are always **false**.
A Merkle proof demonstrates an entry in a signed committed tree. It does not
demonstrate that the tree represents the JSON artifact named by its declared
SHA-256 hash: the two are a signed association, not a verified byte relationship.
Even sampling every leaf does not establish that association. Kernel 001/002
full byte inspection and recomputation remain available when that claim is needed.

Sampling can miss errors. Given a fixed commitment with `b` incorrect entries,
an honest fresh challenge of `k` entries out of `N` misses them with probability
`C(N-b,k) / C(N,k)` under the SHA-256 pseudorandom model. This is a conditional
statistical observation, not an unconditional truth guarantee. A dishonest
challenger can grind challenges or collude; freshness is locally generated,
not a globally verifiable randomness beacon. The tests demonstrate both a
missed corrupted entry and detection when that entry is sampled.

Receipts authenticate attributed claims, not ownership, elapsed work, resource
usage, possession of every artifact byte, or economic value. The same worker
may precompute data; this is no proof of sequential work or continued service.
The comparison checks signatures and evidence consistency, selects no winner,
and never changes RECEIVE/HOLD into ADMIT.

## Follow-on seams

DOGRAM can render the challenged coordinates and world observations. Distributed
workers can route these opaque crossings and persist commitments/proof indexes.
GHoT can retain the scoped challenge/response/receipt history. A future audited
artifact encoding could bind the canonical result identity directly to the tree.
Challenge expiry, scheduling, repeated audits and external randomness can be
separate local policies. An economic/resource layer can consume these scoped
attestations and decide value outside reLATTE. This slice adds none of those
policies, incentives, consensus, markets, wallets or cryptocurrency.
