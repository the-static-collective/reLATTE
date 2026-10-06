# Useful Work Field Test 001 — Two Worlds Trade

This is a composition experiment across all ten useful-work kernels. It runs
separate actor processes with separate local key stores, exchanges public files,
serves native chunks over HTTP, changes a separate local ledger, retains a signed
mathematical contradiction and an expired service challenge, and compares two
different local valuations without choosing a winner.

```text
WORLD A                           WORLD B
creates artifact                  publishes conditional OFFER: 12 local credits
        computation / audit / service / resources
                   ──────────────► local ACCEPT
                                         │ explicit operator-directed action
                                         ▼
                              SEPARATE PYTHON LEDGER
                              B:100 → 88     A:0 → 12
                                         │ imported signed adapter observation
                                         ▼
WORLD D                           WORLD C
same context, local value 5        observes/replays settlement
        │                                │
        └──────────── public archive ──────┘
                   A / B / C / D each HOLD
                     no winner or global verdict
```

The live test succeeds with **B's value 12, D's value 5, one signed count
contradiction, two completed audit slots, one timely serving slot and one expired
issued serving slot**. B's tolerance is predeclared in its signed offer policy.
The disagreement and missed service are retained inside the exact presentation
that B accepts. They are also preserved in the final public archive.

```text
COOPERATION ≠ SHARED TRUTH
LOCAL ACCEPTANCE ≠ GLOBAL AUTHORITY
DIFFERENT VALUE ≠ INVALID EVIDENCE
SHARED EVIDENCE ≠ SHARED STATE
PRESERVATION ≠ ADJUDICATION
```

## Run it

Live execution requires Linux, `getconf`, Node 22.18+ and Python 3.10+ standard
library. Public archive verification requires only Node and the public delivery.
No financial payment or enforceable ownership transfer occurs: these are local
demonstration credits in a separate example ledger.

```sh
npm ci
npm run verify
npm run useful-work-field-001 -- run examples/useful-work-001/julia-001.json
npm run useful-work-field-001 -- verify output/useful-work-field-001/public-delivery/field.json --out output/field-reverified
```

Use `--out <new-directory>` for reruns. Runtime depends on host load; the run
waits for real scheduled windows rather than backdating the deliberate expiry.
The bounded profile uses two six-sample audit slots and two six-chunk service
slots, so the input job must contain at least six entries. The normal Julia job
has 3,072 entries. Declared issuance windows are 12 seconds; the process will fail
explicitly if local scheduling cannot keep the demonstration inside its windows.

The compiled CLI also works after `npm run build`:

```sh
node .build/src/useful_work/cli_field_001.js run examples/useful-work-001/julia-001.json --out output/field-built
node .build/src/useful_work/cli_field_001.js verify output/field-built/public-delivery/field.json --out output/field-built-reverified
```

## Actor and state boundaries

[run.ts](run.ts) is a controller: it starts processes and routes public JSON files.
It never generates, reads or passes a world private key. Each invocation of
[actor.ts](actor.ts) opens only its own role's local key store. A long-lived A
process performs the actual render, and another A process serves the artifact.
The other actions use fresh processes that reconstruct context from public files.
Before final HOLD, each A/B/C/D process independently verifies the complete archive
and C's signed reference, then retains its own full public copy in its local store.
The controller verifies B's specific ACCEPT before explicitly invoking the external
ledger command. No offer/decision/observation library function invokes a transfer.

| Actor | Own actions and keys |
| --- | --- |
| A | Creates legacy and native artifacts; signs challenges' answers, service commitment/responses, resource observations and the exact presentation. |
| B | Owns the offer and local valuation/decision; separate planner, challenger, observer and mathematical verifier keys provide scoped audit/service evidence. |
| C | Owns independent Python mathematical verification, source randomness, resource replay, settlement replay and archive preservation keys/roles. |
| D | Owns its local valuation key and a separate diagnostic key for the deliberately faulty mathematical checker. |
| External adapter | Owns a separate key for importing the external ledger record; cannot act as A/B/C/D. |
| External ledger | Owns only its balance/entry file. The Python program has no reLATTE imports, world keys, valuation policy, receiver or consensus machinery. |

All 12 registered keys are distinct. Stores are scoped to each role with directory
mode 0700 and private key mode 0600. Each world also has its own durable receiver
directories, with normal RECEIVED/R3_HOLD receipts and no admission effects.
Some earlier kernel helpers retain their existing planner/challenger world labels;
the registered signing keys identify their owner-local B roles without modifying
those kernel contracts.

This is **process and key-store separation on one host**, under one controller
and OS user. It is not a container/UID/network/administrative trust boundary.
The controller could access files under that OS identity, and the demonstration
operator controls all roles. PIDs, timestamps, source fingerprints, live resource
capture modes and provider labels are attributed provenance, not hardware or
organizational attestation. No external randomness beacon or power meter is claimed.

## Ten kernels, one interaction

| Kernel | Field-test use |
| --- | --- |
| 001 | A actually computes the deterministic Julia artifact and signs the original byte-addressed work. |
| 002 | B recomputes the full artifact using TypeScript; C does so with the independent Python implementation in another process. Their scoped receipts coexist. |
| 003 | B issues a fresh legacy sample challenge, A returns its committed entries/proofs, and B/C independently recompute the requested orbits. |
| 004 | A also creates the Merkle-native artifact. Signed challenges, proofs and sampled receipts bind the native result identity. |
| 005 | The accumulator retains every mathematical receipt, including D's diagnostic FAILED receipt and its localized count disagreement. |
| 006 | B predeclares two scheduled audit slots; C emits fresh signed randomness after their starts. Both slots accumulate complete attributed observations and a signed observer cut. |
| 007 | B locally values the complete valuation context at 12; D separately values the same context and unit at 5. The comparison reports different local amounts with no winner. |
| 008 | A commits a real HTTP endpoint and native chunk root. B observes a proof-bearing response for slot 0; slot 1 is issued but deliberately left unanswered until its deadline expires. |
| 009 | Live A process CPU, native file metadata/bytes and loopback interface counters are signed separately and independently replayed by C. Energy evidence is absent, not zero. |
| 010 | B's offer admits specified evidence/signers, A signs an exact presentation, B signs local ACCEPT, the separate ledger moves 12 credits, a separate adapter imports the record, and C signs the settlement replay receipt. |

001/003 and 004 have different artifact/commitment identities. The archive verifies
their same canonical job and escape-count contents while preserving both original
identity schemes. It does not rewrite legacy receipts into native receipts or
treat a legacy full-artifact opinion as a global proof of native computation.

007's context remains its existing native work, audit/history and artifact content
profile. Both B and D receive the same public evidence and construct that exact
same context. Service and measured-resource records are separate typed inputs to
010's acceptance policy; they are not silently added to the older valuation
contract or converted into proven CPU cost, energy, price or exclusive work.

## Deliberate trouble and B's local choice

[fault-checker.ts](fault-checker.ts) executes the reference sample checker and
changes one count prediction under a clearly named diagnostic implementation ID.
It changes neither the worker's artifact nor its Merkle proof. D's separate fault
key signs the resulting mathematically negative receipt. B/C signed matching
receipts remain alongside it. The audit records one contradictory index and
the native comparison reports `contradictory`; nothing votes that receipt away.
This is controlled fault injection, not an accusation about a real party.

Separately, the controller issues the second service challenge and intentionally
does not request its answer. It waits past the signed response deadline before B
cuts the service history. That slot remains `EXPIRED`. This demonstrates a known
missing observation, not proven host unavailability, computation failure or guilt.
The first challenge uses a real HTTP request and native chunk inclusion proofs.

B publishes the offer **before these fresh challenges and observations**. Its
data-only AND policy requires:

- At least six unique matching entries attributed to the named B/C mathematical
  verifier keys, with `reject_contradictions: false` explicitly stated.
- Two completed scheduled audit observation slots under B's named observer.
- At least one in-window verified serving slot under the named B observer/A host.
- One admitted live CPU, storage and receive-interface observation apiece, replayed
  by C. CPU/interface zero deltas are permitted at counter resolution; storage must
  contain native bytes. No resource quantities are summed or priced.
- B's own specified local valuation policy, unit and amount of at least 12.

B observes A's presentation before its exclusive offer deadline and locally
ACCEPTS. The policy evaluation reports the retained contradiction and serving
accounting rather than substituting a clean evidence bundle. Its ACCEPT receipt
has `semantic_effect: none`: it creates no protocol obligation or ownership and
performs no transfer. A world with a stricter policy could decline this evidence.
This experiment does not attempt to adjudicate which policy is correct.

B's and D's valuations use explicit result-entry weights producing 12 and 5 field
credits. They assign zero discount rate to the retained contradictory-observation
fraction. These are local opinions, not a resource-to-value conversion or a universal
price. Different weights or uncertainty policies remain possible under 007.

## External ledger and settlement

[ledger.py](ledger.py) starts a fresh ledger with B=100 and A=0. Only after the
controller has verified B's ACCEPT does it make an **operator-directed** transfer
request with amount 12 and opaque acceptance/evidence correlation IDs. The Python
ledger does not interpret ACCEPT or the offer policy: it executes that explicit
request under its own local rules, preserves an entry, and changes B/A to 88/12.
Repeating the same entry/request returns the existing record without another debit;
reusing its entry reference for a different request fails. This is a bounded
single-process example ledger, not a concurrent payment or transaction service.

The separate adapter process verifies the exchange and the record's correlation
labels, then signs a 010 `credit-ledger` observation as `operator-import/v1`.
C independently replays the signature, exact ACCEPT/evidence binding, before/after
balance arithmetic and match to B's offered terms. Its `SETTLEMENT_OBSERVED`
receipt does not execute anything. The controller checks that observation/replay,
D's dissent and archive preservation leave the ledger file unchanged.

The observed record matches the offered amount/system/asset/unit/account labels.
That does not prove account ownership, external provider authenticity, legal
discharge, irrevocability or universal finality. The prototype's source records
and actual local file change are retained, with their distinct claim boundaries.
The ledger owns its state; worlds keep their own receiver/interpretation state.
reLATTE establishes no shared world state or global credit ledger.

## Retain and replay

The output contains:

- `private-worlds/{A,B,C,D,adapter}/`: separate local key stores, A's local artifact
  and raw measurement data, and each world's durable receiver state. A/B/C/D also
  retain their own `local/public-archive.json` and signed reference after verification.
- `external-ledger/state.json`: the separate program's balances and idempotent entry.
- `public-mailbox/`: public inputs/outputs used at process boundaries, including
  original source records. Private keys never enter the mailbox.
- `process-transcript.json`: incrementally retained steps, actor/command/PID,
  attributed times and input/output hashes, including final archive retention acts.
- `public-delivery/field.json`: standalone public archive, C-signed preservation
  crossing, and four peer RECEIVED/R3_HOLD pairs.
- `public-delivery/summary.json`: rebuilt ten-kernel trace, disagreement, expiry,
  value comparison, local ACCEPT and separate settlement observation.

The archive embeds the legacy/native artifacts, complete evidence bundle, offer,
presentation, decision, both valuation opinions, external ledger request/record and
before/after snapshots, core boundary HOLD receipts, and the transcript through the
trade. Its signed preservation reference binds the exact archive ID, result and
evidence. Later peer retention receipts are in the enclosing delivery; the complete
live process transcript also records those steps. No receipt is deleted to make
the trade look cleaner. Public-mailbox files preserve routing/debug details separately.

```text
field_id = "useful-work-field-test-001-v1:"
         + SHA256("UsefulWork-FieldTest001-v1|" || JCS(archive without field_id))
```

`verifyFieldArchive` reconstructs all signatures, artifact/proof/context bindings,
typed local calculations, field-role assignments and the summary. It replays signed
mathematical predictions as attributed observations; it does not rerun or decide
their mathematics. It also requires the deliberately retained contradiction,
expired slot and distinct 12/5 opinions. A rehashed summary cannot invent a winner,
erase a contradiction or strengthen settlement to finality.

`verifyFieldDelivery` additionally checks C's exact preservation reference and each
world's independent HOLD of it. Receiving the same archive establishes neither
agreement nor consensus. The public artifact needs no actor/ledger programs, private
world directories, original artifact path, live server, OS counters, Python, or
mathematical worker/checker modules for later verification. The standard Node
crypto/canonicalization dependencies remain required.

The live composition and hostile archive tests run under `npm run verify`. They
also check that repeated ledger requests cannot debit twice, settlement replay
cannot change ledger state, role substitutions and signed admission upgrades fail,
and relocated public verification preserves the fault, expiry and dissent after
all execution machinery is removed. This is evidence for bounded cooperation in
this experiment, not proof of trust-free economic cooperation in every deployment.
