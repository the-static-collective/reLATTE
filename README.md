# reLATTE

**A sovereign composition substrate for attributable crossings, local execution, and reconstructible shared history.**

reLATTE is an experimental Static Collective protocol/runtime project.

[Useful Work Kernel 001](examples/useful-work-001/README.md) demonstrates a
deterministic Julia job → artifact → opaque crossing → sovereign HOLD →
independent recomputation → signed verification receipt. Run
`npm run useful-work -- run examples/useful-work-001/julia-001.json` after `npm ci`.

[Useful Work Kernel 002](examples/useful-work-002/README.md) adds an independent
Python verifier, generated-vector cross-checks, and actual source mutations whose
contradictory receipts remain scoped world claims. Run
`npm run useful-work-002:disagreement` to retain the disagreement experiment.

[Useful Work Kernel 003](examples/useful-work-003/README.md) adds signed fresh
challenges, Merkle proofs and sampled recomputation in independent worlds.
Receipts name exactly the checked entries; full artifact verification remains
unclaimed. Run `npm run useful-work-003 -- demo examples/useful-work-001/julia-001.json`.

[Useful Work Kernel 004](examples/useful-work-004/README.md) makes the Merkle
result root the artifact identity, binding job, dimensions and ordered counts.
Sampled proofs now verify membership in that exact artifact. Run
`npm run useful-work-004 -- demo examples/useful-work-001/julia-001.json`.

[Useful Work Kernel 005](examples/useful-work-005/README.md) accumulates fresh
native audits with authenticated replay/recheck accounting, exact pixel coverage,
overlap, diversity and localized contradictions. Optional sampling probabilities
carry explicit unverified assumptions; repetition selects no truth or consensus.
Run `npm run useful-work-005 -- demo examples/useful-work-001/julia-001.json --with-mutant`.

[Useful Work Kernel 006](examples/useful-work-006/README.md) publishes signed audit
plans, binds deterministic native challenges to attributable source events and
scheduled slots, and retains signed clock inventories with missing/expired slots.
Observed history asserts neither completeness nor computational guilt. Run
`npm run useful-work-006 -- demo examples/useful-work-001/julia-001.json`.

[Useful Work Kernel 007](examples/useful-work-007/README.md) binds native result,
audit/history and attributed resource claims to reproducible local policy valuations.
Signed opinions can disagree or be revised locally; replay verifies the declared
calculation without establishing a universal price, entitlement, payment or ownership.

It asks what survives if the useful parts of blockchain, Ethereum, event sourcing, local-first systems, provenance graphs, cultural inheritance, and executable worlds are separated from global-state sovereignty, token economics, and universal consensus.

The working answer:

> **Many sovereign histories may share verifiable crossings without sharing one global state.**

## Core inversion

Ethereum's durable contribution was not merely cryptocurrency. It provided a general substrate in which independently authored programs could share common addressing, execution, receipts, and composability.

reLATTE explores a different substrate:

```text
Ethereum-like role       reLATTE candidate

account               -> sovereign particular / world
transaction           -> signed consequential crossing
smart contract         -> organ / admission contract
event log              -> attributable receipt
block                  -> local witnessed cut / receipt set
chain id               -> world / domain identity
bridge                  -> explicit typed crossing
wallet                  -> local key + capability custody
state transition       -> owner-local admitted consequence
finality               -> typed local finality
gas                    -> declared local load / resource budget
L2 / app chain         -> sovereign organ/domain
oracle                 -> foreign witness / evidence adapter
checkpoint             -> optional external commitment
consensus              -> question-specific proof, not universal truth
```

There is no required global state and no required global ordering.

## Constitutional laws

```text
SOURCE != PROPOSITION
PROPOSITION != ADMISSION
RENDERING != AUTHORITY

SIGNED != TRUE
RECEIVED != ADMITTED
ADMITTED != SHARED
SHARED != UNIVERSAL

SEED != KEY
HISTORY != AUTHORITY
CAPABILITY != IDENTITY
SIGNATURE != HUMAN IDENTITY

REPLICATION != CONSENSUS
CONSENSUS != TRUTH
FOREIGN CHECKPOINT != GLOBAL CANON
```

## Genesis

The first slice is:

- [Slice 001 — The Relation Is the Block](slices/001-the-relation-is-the-block.md)
- [Identity + Signature Profile v0](spec/IDENTITY-SIGNATURE-PROFILE-V0.md) — bounded executable R1/R2 witness
- [Adoption Roadmap — 87-repo open-world relation map](docs/ADOPTION-ROADMAP.md)
- [Ethereum Inversion](docs/ETHEREUM-INVERSION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Organ Registry](docs/ORGAN-REGISTRY.md)
- [Roadmap](docs/ROADMAP.md)
- [Early Source Packet — authority, replay, witness, sovereign histories](docs/research/EARLY-SOURCE-PACKET.md)

It proposes that the stable nonfungible object is not a coin or token but a **particular consequential relation/crossing**.

## Current executable edge

The first bounded runtime seam now covers canonical identity and cryptographic verification for `CrossingEnvelopeV0` and `ReceiptV0`:

```text
explicit identity body
→ Project0-conformant RFC 8785/JCS bytes
→ domain-separated SHA-256 ID
→ ECDSA P-256 signature
→ independent verification
```

The proof includes fixed signed fixtures, hostile mutation/key/domain tests, and verification in a fresh Node process. It deliberately stops before R3 receiver semantics.

```bash
npm install
npm run verify
```

This executable profile does **not** make a signature truth, human identity, admission, or authority.

## What reLATTE may absorb

reLATTE is intended to compose reusable contracts already developed elsewhere in the Static Collective while leaving ownership with the source project.

Current donor families include:

- Project0 — canonical semantic addressing
- TranchNode — addressed immutable artifacts and provenance residue
- Formation Trace — signed formation history
- Band Runtime — RECEIVE / HOLD / POUR and refusal semantics
- Trust — Moment / non-destructive multi-perspective memory
- Autodisco — federation, relay, witness ledger, successor history
- Groove Rooms — field weather and local atmosphere
- Daily Slice — developmental memory, THE BELT, sung-round causality
- MEMENTO — uptake, reproduction, tradition, cultural lineage
- National Treasure — discrimination and composition
- Free Graph / BODY — local charts and missing-tissue projection
- SEAMforge — seam, failure, and primitive-evolution analysis
- Iron Lung / reCURV — repair and scar-preserving continuation
- BananaSpork / reconstitution stack — mortality and successors
- Circle / BananaGram lineage — participation becoming capacity

See [Organ Registry](docs/ORGAN-REGISTRY.md).

## Non-goal

reLATTE is **not** a master application and should not become one.

It should provide a common composition surface while preserving:

- local authority;
- source-project ownership;
- divergent interpretation;
- replaceable transport;
- replaceable storage;
- replaceable foreign witnesses;
- mortal nodes;
- reconstructible ancestry.

> **The substrate may compose the organs. It may not become their sovereign.**


## COM⁵ cultural crossing specimen

[COM⁵ Capsule 001](docs/COM5-CAPSULE-001.md) is a bounded executable experiment for carrying an attributed creative grammar through:

```text
COMPOST → COMPOSE → COMPUTE → COMMUTE → COMMUNE
```

It tests one content-addressed grammar crossing against divergent sovereign receiver policies while preserving the core refusal:

> **A PERSON MAY REVEAL A GRAMMAR. THEY MUST NOT BECOME THE GRAMMAR.**

The specimen does not complete R3–R5; it pressure-tests the desired receiver semantics without claiming persistence or generality.


## Porch 001 + Creative Customs

[Porch 001 + Creative Customs 001](docs/PORCH-CUSTOMS-001.md) adds a public boundary declaration for COM⁵ crossings.

A porch can declare:

```text
WELCOME
HOLD
REFUSE
RETURN
RELEASE
```

Creative Customs evaluates an arriving capsule against that declaration and emits a signed receipt with no local semantic effect.

> **WELCOME != ADMIT**

A world may welcome a knock at its porch and still refuse the proposed grammar under separate interior law.


## Ecology Machine 001

[Ecology Machine 001](docs/ECOLOGY-MACHINE-001.md) composes the current cultural-crossing organs into one bounded executable round:

```text
GRAMMAR CANDIDATE
  → COM⁵ CAPSULE
  → SIGNED CROSSING
  → POSTAL CARRIER
  → PORCH / CUSTOMS
  → FRONT DOOR
  → LOCAL DISPOSITION
  → FOG or CONSEQUENCE
  → WEATHER / TRADITION / CAPACITY
  → REST / RELEASE / MORTALITY
  → COMMUTER LINE / RETURN
```

It proves seams between organs without claiming completion of the corresponding roadmap milestones.

> **The machine composes the organs. It does not become their sovereign.**


## Local Receiver 001

[Local Receiver 001](docs/LOCAL-RECEIVER-001.md) gives reLATTE its first durable owner-local interior witness:

```text
VERIFY
  → RECEIVE
  → signed receipt
  → HOLD / ADMIT / REFUSE / RETURN
  → signed disposition
  → append-only journal
  → restart replay
```

Duplicate delivery is idempotent, refused payloads gain no protected semantic effect, and derived local state reconstructs from the verified journal rather than a mutable global state file.

> **RESTART != NEW HISTORY**


## Sovereign Nodes 001

[Sovereign Nodes 001](docs/SOVEREIGN-NODES-001.md) gives the durable receiver a real multi-world crossing proof:

```text
A signs one crossing
   ├─→ B → ADMIT → signed response
   └─→ C → REFUSE → signed response

A verifies both.
```

B and C keep separate keys, journals, histories, and state references. Both survive restart. The source never needs access to either receiver's mutable interior.

> **SHARED CROSSING IDENTITY != SHARED MUTABLE STATE**


## Replaceable Transport 001

[Replaceable Transport 001](docs/REPLACEABLE-TRANSPORT-001.md) proves that one signed crossing survives two materially different roads:

```text
SIGNED CROSSING X
   ├─→ filesystem bundle ─┐
   └─→ HTTP POST relay ───┤
                          ↓
                    SAME RECEIVER
```

Both roads carry the same JCS-canonical crossing body and crossing ID while producing distinct transport-frame IDs.

> **ROAD CHANGE != IDENTITY CHANGE**

The HTTP ACK is transport-only and has no semantic effect. Receiver admission remains local.


## Mirror / Store / Serve 001

[Mirror / Store / Serve 001](docs/MIRROR-STORE-SERVE-001.md) gives reLATTE its first dead-source artifact-survival proof:

```text
SOURCE
  ├─ signs crossing X
  └─ signs PUBLISHED(X)
         |
      mirrors B + C
         |
       STORED
         |
   source disappears
   mirror B disappears
         |
      mirror C
         |
       SERVED
         |
    fresh receiver
         |
      RECEIVED
```

The surviving crossing still names the original source. The mirror never inherits source authority.

> **SOURCE DEATH != ARTIFACT DEATH**


## Moment / Perspective 001

[Moment / Perspective 001](docs/MOMENT-PERSPECTIVE-001.md) gives one stable crossing multiple independently signed accounts without collaborative overwrite:

```text
Moment M
 ├─ Perspective A
 └─ Perspective B

sync = set union
replay = preserve both
```

Neither perspective can mutate the carrier it witnesses.

> **DIVERGENCE != OVERWRITE**


## Field Consequence 001

[Field Consequence 001](docs/FIELD-CONSEQUENCE-001.md) turns admitted local history and plural witness into owner-local susceptibility without making weather sovereign:

```text
admitted receipts
      +
R8 perspectives
      ↓
typed features
      ↓
local Field Lens
      ↓
weather / susceptibility
```

Two worlds may interpret the same history through different lenses while retaining the same history root.

> **WEATHER MAY DIFFER WHILE HISTORY REMAINS THE SAME.**


## Cultural Descendant 001

[Cultural Descendant 001](docs/CULTURAL-DESCENDANT-001.md) turns admitted local consequence into explicit, attributable heredity:

```text
ancestor
  → local ADMIT
  → field context
  → owner-local uptake
  → explicit variation
  → fresh signed descendant
  → another world
  → RECEIVED as fresh candidate
```

The descendant preserves ancestry without inheriting the ancestor's authority or the producing world's admission.

> **ANCESTRY != AUTHORITY**


## External Checkpoint 001

[External Checkpoint 001](docs/EXTERNAL-CHECKPOINT-001.md) commits a deterministic local receipt-set root to a separate Git witness without making Git part of local authority or liveness:

```text
local signed receipts
      ↓
receipt-set root H
      ↓
witness-neutral commitment
      ↓
foreign Git commit

delete Git
      ↓
local receiver keeps operating
```

> **CHECKPOINT AVAILABILITY != LOCAL LIVENESS**


## Mortality Test 001

[Mortality Test 001](docs/MORTALITY-TEST-001.md) kills a durable sovereign node and reconstitutes a fresh successor from surviving mirrors and peer archives:

```text
PREDECESSOR
   ↓ history + checkpoint + seed
mirrors + peer archives
   ↓
KILL predecessor + key + one peer + Git
   ↓
surviving mirror + capsule
   ↓
SUCCESSOR
fresh world / particular / key
```

Historical receipts still name the dead predecessor. New acts name the successor.

> **RECONSTITUTION != RESURRECTION**


## Composition Pulse 001

[Composition Pulse 001](docs/COMPOSITION-PULSE-001.md) executes the first complete roadmap round:

```text
crossing
→ local ADMIT
→ field
→ fresh local act
→ local act receipt
→ slow witness
→ compositional question
→ owner-local adaptation
→ descendant
→ another sovereign world
→ return crossing
→ origin RECEIVE
```

A second world may refuse the same descendant while the pulse still closes.

> **GLOBAL AGREEMENT != PULSE SUCCESS**


## Release Rule Hostile 001

[Release Rule Hostile 001](docs/RELEASE-RULE-HOSTILE-001.md) attacks the independent generality gate with two materially different donor families:

```text
Daily Slice       Haunted Toaster
    \                 /
     \               /
      opaque organ adapter
              ↓
       signed crossing
              ↓
     file / HTTP transport
              ↓
       LocalReceiver
```

The shared substrate is forbidden from learning either donor family's semantics.

> **EDGE ADAPTER != CORE EXCEPTION**

## Useful Work Kernel 008 — Proof of Availability / Serving

[Kernel 008](examples/useful-work-008/README.md) adds host-signed service commitments,
scheduled native chunk challenges, real HTTP serving and scoped observer receipts.
Signed inventories retain every planned slot, late responses and earlier cuts.

```text
result_id + Merkle root + host + endpoint + service window
  → signed commitment → fresh scheduled challenge
  → native bytes + inclusion proofs → observer receipt → service history
```

Chunk proofs and decoded byte counts are replayable. Response observation and timing
are attributed to the observer. Continuous storage, physical bandwidth, network path
and host uptime remain explicitly unverified.

```sh
npm run useful-work-008 -- demo examples/useful-work-001/julia-001.json
```

## Useful Work Kernel 009 — Measured Resource Adapters

[Kernel 009](examples/useful-work-009/README.md) adds separate signed CPU, energy-meter,
storage and network-interface observations with source provenance and independent
arithmetic replay. Real Linux collectors read process ticks, file metadata/native
bytes and interface counters; the external meter adapter ingests signed readings.
The demo's energy readings are explicitly simulated.

Each observation preserves its own limits: process time is not exclusive work,
meter deltas establish no job causation, file snapshots prove no continuous storage,
and interface bytes are not physical bandwidth or serving bytes. No generic resource
proof or economic value is inferred.

```sh
npm run useful-work-009 -- demo examples/useful-work-001/julia-001.json
```

## Useful Work Kernel 010 — Offer / Acceptance / Settlement Receipt

[Kernel 010](examples/useful-work-010/README.md) adds signed conditional offers,
specific evidence presentations and offerer-local ACCEPT/HOLD/REJECT receipts.
Typed policies admit named audit, service, resource or valuation sources under
an offerer-observed deadline. Separate external payment, credit-ledger and resource
adapters attest individual records; another key replays their scope and arithmetic.

Acceptance performs no transfer. Observed records can match, partially match or
differ from offered terms without creating obligation, ownership, universal value
or finality. The demo changes a local demonstration ledger in a separate process;
ordinary observation and verification never execute a transfer.

```sh
npm run useful-work-010 -- demo
```

## Useful Work Field Test 001 — Two Worlds Trade

[Field Test 001](examples/useful-work-field-001/README.md) composes all ten kernels
through separate actor processes and local key stores. A creates artifacts; B
offers and locally accepts 12 credits for named audit, serving, resource and
valuation evidence; a separate Python ledger changes balances; C replays settlement;
D values the same context at 5. One signed mathematical disagreement and one
expired serving challenge remain inside the accepted and preserved evidence.

A/B/C/D each verify, copy and HOLD the public archive. No winner, shared truth, universal price,
global authority or common world state is selected. The live test runs on one Linux
host with local demonstration credits; portable verification needs only public
records and Node.

```sh
npm run useful-work-field-001 -- run examples/useful-work-001/julia-001.json
```

### Useful Work Field Test 002 — Crossing the Wire

The ten-kernel trade can now run through autonomous world services with durable
signed inbox/outbox histories. Actual HTTP faults exercise delay, disconnect,
duplicate and out-of-order delivery, retry, a temporary partition, late evidence
and an unavailable/restarted world. Each world replays its own observations;
no merged history or trade controller is required.

The [field guide](examples/useful-work-field-002/README.md) includes independent
host commands, an isolated-container driver and a five-runner cross-machine workflow.

```sh
npm run useful-work-field-002 -- local examples/useful-work-001/julia-001.json output/field-002-local
npm run useful-work-field-002 -- verify output/field-002-local/C/public-local-view.json
```

[Field Test 003 — The Door Market](examples/useful-work-field-003/README.md)
adds independently published credit, storage, and compute offers, plus a world
with an empty local listing. A's discovery view replays attributed evidence under
each policy without ranking, selecting, or sending a presentation. Separate
`choose` and `cross` commands bind an explicit sovereign choice before the chosen
B door uses the wire trade and external demonstration ledger. Signed local views
retain incomplete discovery, missing energy evidence, and dissenting value.

```sh
npm run useful-work-field-003 -- run examples/useful-work-001/julia-001.json output/field-003
# Follow the field guide's explicit choose and cross commands in another terminal.
npm run useful-work-field-003 -- verify output/field-003/trade/A/market/public-local-view.json
```
