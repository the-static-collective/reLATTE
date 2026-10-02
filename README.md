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


## DWN Road 001

[DWN Road 001](docs/DWN-ROAD-001.md) plugs a materially foreign Decentralized Web Node into the replaceable-transport seam without promoting DWN storage permission into receiver authority.

```text
SIGNED CROSSING X
   ├─→ filesystem
   ├─→ HTTP
   └─→ DWN RecordsWrite / RecordsRead
                 ↓
          SAME LocalReceiver
```

The bounded witness uses an actual in-process DWN reference implementation and proves that DWN acceptance can still end in owner-local REFUSE.

> **DWN ACCEPTED != RELATTE ADMITTED**


## DID Binding 001

[DID Binding 001](docs/DID-BINDING-001.md) attaches a DID to a reLATTE particular as a dual-attested relation rather than substituting DID identity for particular, key, human, or authority.

```text
PARTICULAR
   |
reLATTE P-256 key
   |
dual-attested binding
   |
DID + verification method
```

The binding is signed independently by both the historical reLATTE key and the DID verification key. Historical verification uses the recorded public material; current DID resolution is a separate corroboration step.

Rotation is append-only:

```text
old key + old DID + B1
          ↓
new key + new DID + B2 --supersedes--> B1
```

> **KEY ROTATION != HISTORY REWRITE**


## DID:DHT Discovery 001

[DID:DHT Discovery 001](docs/DID-DHT-DISCOVERY-001.md) adds a bounded discovery seam for DWN service endpoints advertised by a real locally-created `did:dht` document.

```text
did:dht
  ↓
DID document
  ↓
DecentralizedWebNode service
  ↓
non-executable road candidate
```

Discovery distinguishes **candidate observed**, **no candidate observed**, and **unknown because resolution failed**. A discovered endpoint carries no authorization, delivery, or semantic effect.

```text
DISCOVERED != SELECTED
SELECTED != AUTHORIZED
AUTHORIZED != DELIVERED
DELIVERED != ADMITTED
```

> **A map may reveal a road. It may not move the traveler.**


## Live DHT Gateway 001

[Live DHT Gateway 001](docs/LIVE-DHT-GATEWAY-001.md) crosses the actual HTTP boundary of the open-source DID DHT reference gateway.

```text
local did:dht
    ↓ publish
live gateway
    ↓ fresh resolve
decoded DID document
    ↓
same DID binding + same DWN road candidates
```

The dedicated network witness is separate from the deterministic core suite. It proves gateway acceptance and fresh resolution, not arbitrary Mainline DHT propagation.

```text
GATEWAY ACCEPTED != PUBLIC DHT PROPAGATED
NETWORK WITNESS != CORE TEST SUITE
```

> **The gateway may carry the map. It does not own the territory.**


## Remote DWN Delivery 001

[Remote DWN Delivery 001](docs/REMOTE-DWN-DELIVERY-001.md) closes the first executable **discover → commute → receive** circuit across a real HTTP DWN boundary.

```text
did:dht locator
    ↓ resolve
DWN road candidate
    ↓ explicit select
remote HTTP JSON-RPC
    ↓ RecordsWrite / RecordsRead
same signed crossing
    ↓
LocalReceiver
    ↓
RECEIVE → REFUSE
```

The remote node is multi-tenant, so the locator DID and stored tenant DID remain distinct.

```text
ROAD LOCATOR != DWN TENANT
REMOTE STORED != RELATTE ADMITTED
REMOTE READ != RELATTE RECEIVE
```

> **The road may carry the traveler all the way to the door. The house still decides whether the traveler enters.**


## Mortal Road 001

[Mortal Road 001](docs/MORTAL-ROAD-001.md) proves two-node transport mortality without inventing shared authority.

```text
crossing → DWN A → replicate → DWN B
             X kill A
                        ↓
                 recover from B
                        ↓
                fresh LocalReceiver
                        ↓
                     REFUSE
```

The nodes may carry copies of one attributable crossing without becoming one world or one consensus system.

```text
REPLICATION != CONSENSUS
NODE DEATH != CROSSING DEATH
RECOVERY != ADMISSION
```

> **The road can die. The traveler can still arrive from somewhere else. The next house still owns its door.**


## Automatic Failover 001

[Automatic Failover 001](docs/AUTOMATIC-FAILOVER-001.md) turns two-road mortality into explicit local recovery policy.

```text
try A → failure observation
           ↓
        try B
           ↓
     same crossing
           ↓
     LocalReceiver
```

Availability failure may change the road. Integrity failure stops the policy.

```text
FAILURE OBSERVED != ROAD ERASED
ROAD CHANGE != CROSSING CHANGE
AVAILABILITY FAILURE != INTEGRITY FAILURE
FAILOVER != AUTHORITY TRANSFER
```

> **When a road closes, choose another road. Do not rename the traveler. Do not move the door.**


## Road Memory / Circuit Breaker 001

[Road Memory / Circuit Breaker 001](docs/ROAD-MEMORY-CIRCUIT-BREAKER-001.md) gives automatic failover durable owner-local transport memory.

```text
A fails → OPEN
          ↓
      SKIP_OPEN
          ↓
     cooldown
          ↓
    HALF_OPEN probe
          ↓
       success
          ↓
       CLOSED
```

Road health is a local observation, not a mutation of the DID document or a global reputation claim.

```text
LOCAL ROAD MEMORY != GLOBAL REPUTATION
CIRCUIT STATE != DID STATE
SKIP != ERASURE
AVAILABILITY FAILURE != INTEGRITY FAILURE
ROAD HEALTH != RECEIVER AUTHORITY
```

> **Remember the broken road locally. Leave the map alone. Try again when the time is right.**


## Runtime Boot 001 + Black Flag 001

[Runtime Boot 001](docs/RUNTIME-BOOT-001.md) composes the local receiver, durable road memory, inbox/outbox queues, a world manifest, and a receipt-reference bus into one restartable node shell.

[Black Flag 001](docs/BLACK-FLAG-001.md) kills that runtime after RECEIVE is durable but before queue commit, then proves restart completes the orphaned work without duplicating the receiver consequence.

```text
world.rel.json
      ↓
runtime boot
      ↓
durable inbox
      ↓
LocalReceiver RECEIVE
      ↓
      X SIGKILL
      ↓
runtime replay
      ↓
same receipt
      ↓
queue commit
      ↓
fresh local REFUSE
```

```text
MANIFEST != WORLD
RUNTIME != RECEIVER AUTHORITY
REPLAY != DUPLICATE CONSEQUENCE
PROCESS DEATH != WORLD DEATH
RESTART != NEW HISTORY
HAPPY PATH != RELEASE
```

> **A release must return from sea with its receipts.**


## Capability Kernel 001 + Two Worlds in a Box 001

[Capability Kernel 001](docs/CAPABILITY-KERNEL-001.md) makes destination-issued receive permission executable without collapsing permission into admission.

[Two Worlds in a Box 001](docs/TWO-WORLDS-IN-A-BOX-001.md) boots two complete sovereign runtimes, gives each world an independent capability issuer, crosses A → B, Black-Flag kills B after RECEIVE but before queue commit, reboots B, lets B REFUSE, then returns a signed sovereign response B → A under a separately issued reverse capability. A independently HOLDs that response.

```text
WORLD A                     WORLD B
   |                           |
   |---- capability-gated ---->|
   |       proposal            |
   |                           X SIGKILL
   |                           |
   |                         REBOOT
   |                           |
   |                         REFUSE
   |                           |
   |<--- separately gated -----|
   |   sovereign response      |
   |
  HOLD
```

```text
IDENTITY != CAPABILITY
CAPABILITY != ADMISSION
CAPABILITY A→B != CAPABILITY B→A
PROCESS DEATH != WORLD DEATH
RESPONSE != AGREEMENT
SHARED CROSSING != SHARED WORLD STATE
```

> **Two worlds may share a traveler without sharing a throne.**


## Live Private Peer 001

[Live Private Peer 001](docs/LIVE-PRIVATE-PEER-001.md) composes fresh DID-based peer discovery, a live runtime HTTP endpoint, recipient-bound encrypted payloads, and durable capability revocation.

```text
publish B peer DID
      ↓
fresh resolve
      ↓
discover live descriptor
      ↓
B-issued capability
      ↓
encrypt payload to B
      ↓
HTTP crossing
      ↓
B RECEIVE → decrypt → HOLD
      ↓
B revokes capability
      ↓
second HTTP crossing
      X
CAPABILITY_REVOKED
```

```text
DISCOVERY != TRUST
CIPHERTEXT != AUTHORITY
DECRYPTABLE != ADMITTED
REVOCATION != HISTORY ERASURE
REVOKED NOW != NEVER VALID
```

> **Find the door. Seal the parcel. Cross only with permission.**


## Customs House 001

[Customs House 001](docs/CUSTOMS-HOUSE-001.md) turns Carry Card's two consent cuts into a human-facing departures / arrivals room.

```text
DEPARTURES
  choose what may leave
      ↓
   RELEASE
      ↓
sealed road
      ↓
   RECEIVE
      ↓
ARRIVALS
  ADMIT / HOLD / REFUSE
```

The source-local departure view may display withheld material because it is explicitly non-transmittable. The released preview, road, and arrival view may expose only the carrying set plus a withheld count.

```text
DEPARTURE VIEW != TRANSPORT BUNDLE
RELEASE != RECEIVE
RECEIVE != ADMIT
SOURCE RELEASE != DESTINATION DECISION
WITHHELD COUNT != WITHHELD CONTENT
PROJECTION != AUTHORITY
```

There is an interactive specimen at [demo/customs-house.html](demo/customs-house.html).

> **A context window should have customs.**


## Mail Slot 001 + Static Post 001

[Mail Slot 001 + Carry Text 001 + Static Post 001](docs/MAIL-SLOT-STATIC-POST-001.md) makes released Carry Cards portable through ordinary dumb transport.

```text
Customs House
    ↓ RELEASE
portable .carry
    ↓
file / email / chat / USB / whatever
    ↓
CARRY TEXT when only text fits
    ↓
same portable ID
same crossing ID
    ↓
Customs House
```

An optional Return Envelope carries one encrypted delegated reply key and one source-issued receive capability. The destination may use that door for one child reply; the source burns the capability after accepting it.

```text
ROAD != PARCEL
FILE != AUTHORITY
ARMOR != AUTHORITY
COPY != NEW CROSSING
ONE REPLY DOOR != SHARED SESSION
RETURN INVITATION != ADMISSION
```

Portable parcel utility:

```bash
npm run carry -- inspect parcel.carry
npm run carry -- armor parcel.carry parcel.txt
npm run carry -- dearmor parcel.txt restored.carry
```

> **The internet already knows how to move files. We only needed to teach the parcel how to remember its boundaries.**

> **Letters, not shared memory.**


## Three World Post Office 001

[Three World Post Office 001](docs/THREE-WORLD-POST-OFFICE-001.md) sends one stable Carry Parcel body under three recipient-specific covers, collects three bounded return letters without ranking them, and composes a fresh three-parent descendant for a fourth sovereign world.

```text
                 ONE PARCEL
                     |
       +-------------+-------------+
       |             |             |
    CEDAR          RIVER         EMBER
    .carry       CARRY TEXT     dumb copy
       |             |             |
      HOLD          HOLD          HOLD
       |             |             |
    reply A        reply B       reply C
       +-------------+-------------+
                     |
                  POSTBAG
                     |
              human compositor
                     |
           fresh 3-parent descendant
                     |
                  HORIZON
                     |
                    HOLD
```

```text
LETTER BODY != COVER
SAME PARCEL != SAME CIPHERTEXT
POSTBAG != MERGER
THREE RETURNS != AGREEMENT
SELECTION != RANKING
DESCENDANT != SUMMARY
STAMP != AUTHORITY
```

Interactive specimen:

```text
demo/three-world-post-office.html
```

> **One letter can cross three borders without becoming one shared room.**

> **Hold all. Rank none. Compose the descendant deliberately.**
