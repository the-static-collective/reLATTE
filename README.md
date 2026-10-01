# reLATTE

**A sovereign composition substrate for attributable crossings, local execution, and reconstructible shared history.**

reLATTE is an experimental Static Collective protocol/runtime project.

It asks what survives if the useful parts of blockchain, Ethereum, event sourcing, local-first systems, provenance graphs, cultural inheritance, and executable worlds are separated from global-state sovereignty, token economics, and universal consensus.

The working answer:

> **Many sovereign histories may share verifiable crossings without sharing one global state.**

## COM⁵ — the metabolism

> **The relation is the block. COM⁵ is the metabolism.**

reLATTE is not only a crossing protocol. It is substrate for histories that can remain fertile, form new relations, produce local consequence, cross boundaries, and participate in shared life without requiring one sovereign interior.

```text
COMPOST
   ↓
COMPOSE
   ↓
COMPUTE
   ↓
COMMUTE
   ↓
COMMUNE
   ↓
COMPOST
   ↺
```

These are roles in a derived metabolic projection, not mandatory lifecycle states.

```text
COMPOST != GARBAGE
COMPOSE != MERGER
COMPUTE != SOVEREIGNTY
COMMUTE != SEMANTIC UNIFORMITY
COMMUNE != ABSORPTION
```

A particular may occupy several COM⁵ roles at once.

The narrow commuting law is especially important:

> **The road may commute while the worlds diverge.**

Different carriers may preserve the same signed crossing invariants while sovereign receivers lawfully ADMIT, HOLD, REFUSE, or RETURN differently.

See [COM⁵ — The reLATTE Metabolism](docs/COM5.md) and [Slice 004 — The Road May Commute While the Worlds Diverge](slices/004-the-road-may-commute-while-worlds-diverge.md).

### Web 5.0 — the Five-Door view

**Web 5.0** is a working shorthand for making COM⁵ inspectable as a web surface, not a claim about an industry-standard web version.

The first interface is deliberately small:

> **Every focal particular gets five doors.**

```text
[ COMPOST ] [ COMPOSE ] [ COMPUTE ] [ COMMUTE ] [ COMMUNE ]
```

Each door shows explicit observations about the focal subject. Empty doors preserve fog; references do not silently become relations; opening the room does not mutate the subject.

See [Web 5.0 / COM⁵ — The Five-Door Web](docs/WEB5-COM5.md) and the zero-dependency [Five-Door Room browser demo](demo/com5-room.html).

### Browse the metabolism

The next executable seam opens a room from real reLATTE history rather than hand-entered COM⁵ labels.

A supplied history cut is checked against the existing crossing/receipt signature profile. Receipt-derived COMPUTE and COMMUTE observations are only admitted when the referenced crossing is also present and verified in the same cut.

```text
VERIFIED CROSSING
+
VERIFIED RECEIVER RECEIPT
→ attributable metabolic neighborhood

VALID RECEIPT
+
MISSING VERIFIED CROSSING
→ ORPHAN_RECEIPT
→ no invented road
```

Try the genesis specimen:

```bash
npm run browse:genesis
```

See [Slice 005 — Browse the Metabolism](slices/005-browse-the-metabolism.md).

### Walk the provenance

The next seam makes verified neighborhoods traversable without allowing arbitrary graph jumps.

```text
OPEN A
→ inspect verified one-hop neighbors
→ choose B
→ retain why B was reachable
→ RE-CENTER ON B
```

```text
RE-CENTER != TELEPORT
PATH MEMORY != DESTINATION OWNERSHIP
SPARSE DESTINATION != BROKEN ROAD
```

Try the signed genesis walk:

```bash
npm run walk:genesis
```

There is also a non-authoritative clickable UI specimen at [Walkable Provenance Room](demo/walkable-room.html).

See [Slice 006 — Re-center Without Forgetting the Road](slices/006-recenter-without-forgetting-the-road.md).

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
- [COM⁵ — The reLATTE Metabolism](docs/COM5.md) — derived lifecycle/metabolism projection
- [Web 5.0 / COM⁵ — The Five-Door Web](docs/WEB5-COM5.md) — inspectable five-door surface
- [Slice 004 — The Road May Commute While the Worlds Diverge](slices/004-the-road-may-commute-while-worlds-diverge.md)
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

COM⁵ adds a deliberately non-authoritative observability seam that can group explicitly supplied metabolic observations and render a stable trace without changing crossing or receipt identity.

The Five-Door Room adds a conservative focal-subject projection over those observations. It does not infer relation from mention, note text, or evidence references.

The proof includes fixed signed fixtures, hostile mutation/key/domain tests, and verification in a fresh Node process. It deliberately stops before R3 receiver semantics.

```bash
npm install
npm run verify
```

This executable profile does **not** make a signature truth, human identity, admission, authority, or COM⁵ role into protocol truth.

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
