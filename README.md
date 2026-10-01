# reLATTE

**A sovereign composition substrate for attributable crossings, local execution, and reconstructible shared history.**

reLATTE is an experimental Static Collective protocol/runtime project.

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
