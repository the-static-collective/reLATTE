# reLATTE Architecture

## Thesis

reLATTE is a composition substrate for independently sovereign histories.

Its job is to make crossings addressable, verifiable, replayable, and composable while keeping consequence local.

```text
PARTICULAR
  ↓
SIGNED CROSSING
  ↓
TRANSPORT / MIRROR / RELAY
  ↓
RECEIVER VERIFICATION
  ↓
RECEIVE
  ↓
HOLD
  ↓
LOCAL ADMISSION / REFUSAL
  ↓
LOCAL CONSEQUENCE
  ↓
RECEIPT + RESIDUAL
  ↓
DESCENDANT HISTORY
```

## Layers

### L0 — Canonical identity

Donor: Project0.

Owns canonical serialization/addressing contracts used when reLATTE needs stable shared identity.

### L1 — Artifact substrate

Donor: TranchNode.

Carries immutable addressed bytes and reconstruction-oriented provenance.

### L2 — Signing and source continuity

Donor: Formation Trace initially.

Provides real signing/verification primitives for canonical payloads.

A signing key establishes continuity with that key. It does not establish human identity.

### L3 — Crossing protocol

Owned by reLATTE.

Defines portable envelopes, parent references, signatures, world IDs, payload references, declared requested effects, and return addresses.

### L4 — Transport

Donors: Autodisco federation; historical TranchChain / Sovereign Mesh concepts.

Transport must be replaceable. Hub, peer mesh, file copy, removable media, Git, or other carriers may all transport the same crossing envelope.

```text
TRANSPORT != AUTHORITY
```

### L5 — Admission and local execution

Donor: Band Runtime plus owner-local domain kernels.

```text
RECEIVE != ADMIT
HOLD != OWN
POUR != AUTHORIZE
```

Local owner law determines consequence.

[Local Receiver 001](LOCAL-RECEIVER-001.md) is the first durable bounded witness at this layer. It verifies signed crossings, records RECEIVE separately from disposition, emits signed owner-local receipts, preserves HOLD / ADMIT / REFUSE / RETURN, makes duplicate delivery idempotent, and reconstructs derived state by replaying a hash-chained local journal after restart.

```text
LOCAL JOURNAL != GLOBAL STATE
RESTART != NEW HISTORY
DUPLICATE DELIVERY != NEW EVENT
```

### L6 — Moment / perspective membrane

Donor: Trust.

A shared occurrence may support multiple descendants and accounts without last-write-wins semantic collapse.

```text
MOMENT != CLAIM != MEMORY != EVIDENCE != TRUST ENTRY
```

### L7 — Field and susceptibility

Donors: Band Stigmergic Field, Groove Rooms, Haunted Toaster, Haunted Phonography.

Prior history may change local susceptibility/atmosphere without dictating action.

### L8 — Development and inheritance

Donors: MEMENTO, DerekDerrikDark, BananaSpork, Iron Lung, DEVELOPMENT-EVENT.

Supports witnessed uptake, variation, reproduction, repair, mortality, successor formation, and cultural lineage without inherited sovereignty.

### L9 — Composition and discrimination

Donors: National Treasure, Free Graph/BODY, SEAMforge, Founder Node.

Finds structural overlaps and missing relations without automatically promoting them into shared law.

### L10 — Slow memory

Donor: Daily Slice.

Preserves chronological creature-level becoming without becoming source authority.

### LX — Foreign settlement

Donor concept: THE BELT.

External systems may witness or settle bounded projections without defining the interior.

## Temporal model

reLATTE is a round, not a synchronous chain.

```text
NODE A: receive -> admit -> act -> receipt ----------------
NODE B:       receive -> hold ---------> refuse -----------
NODE C: digest old history -> reproduce -> descendant -----
NODE D:              observe weather -> question ----------
```

No global tick is required.

## State model

There is no single `WorldState`.

Each sovereign domain has its own state/history.

Crossings create typed edges between histories.

```text
H_A0 -> H_A1 -> H_A2
              \
               \ crossing T
                \
                 H_B4 -> H_B5

T is attributable.
B5 is B's consequence.
A does not own B5.
```

## Security model

Minimum intended properties:

- canonical bytes before signing;
- domain separation for signatures/digests;
- anti-replay world/domain binding;
- parent reference validation;
- duplicate delivery idempotence;
- explicit capability scope;
- revocation/expiry representation;
- receiver-local admission;
- signed receiver receipt;
- tamper-evident ancestry;
- restart reconstruction;
- transport independence.

Not yet established:

- network peer PKI;
- human identity binding;
- Byzantine fault tolerance;
- Sybil resistance;
- globally available data;
- globally ordered history.

## Governing rule

> **reLATTE may standardize the crossing. It may not standardize the destination's meaning.**


## Experimental ecology composition

Ecology Machine 001 overlays the existing layers without adding a new sovereign layer.

```text
L9 composition/discrimination
      ↓ candidate grammar

COM⁵ capsule + L3 crossing
      ↓

L4 carrier
      ↓

Porch / Customs boundary
      ↓

L5 local disposition
   ↙      ↓       ↘
 Fog    L7 field   L8 inheritance
 HOLD   weather    tradition
          ↓          ↓
      capacity    release/rest
          \        /
            return
              ↓
        Commuter Line
```

The composition is intentionally cross-layer.

No projection authorizes another layer.

```text
CANDIDATE != CROSSING
CROSSING != DELIVERY
DELIVERY != WELCOME
WELCOME != ADMISSION
ADMISSION != WEATHER
WEATHER != AUTHORITY
ANCESTRY != AUTHORITY
ROUTE != AUTHORITY
```


## Replaceable transport witness

[Replaceable Transport 001](REPLACEABLE-TRANSPORT-001.md) gives L4 a bounded executable proof over two real roads: filesystem I/O and localhost HTTP.

```text
canonical signed crossing
      |
   +--+--+
   |     |
 file   HTTP
   |     |
   +--+--+
      |
 same crossing identity
```

Transport frames are separately addressed road events. They may vary without mutating the crossing carried inside them.

```text
TRANSPORT FRAME != CROSSING
ACK != RECEIVE RECEIPT
DELIVERY != ADMISSION
ROAD CHANGE != IDENTITY CHANGE
```


## Mirror / Store / Serve witness

[Mirror / Store / Serve 001](MIRROR-STORE-SERVE-001.md) extends the transport/storage boundary with independently signed retention claims.

```text
source crossing
    |
 PUBLISHED
    |
 +--+--+
 |     |
 B     C
STORED STORED
       |
     source dies
       |
     C SERVES
       |
   D RECEIVES
```

The artifact address is derived from the canonical signed crossing, so independent mirrors converge on object identity without converging on local history or authority.

```text
OBJECT IDENTITY != CLAIM IDENTITY
MIRROR != SOURCE
RETENTION != OWNERSHIP
RECONSTRUCTION != SUCCESSION
```


## Moment / Perspective witness

[Moment / Perspective 001](MOMENT-PERSPECTIVE-001.md) adds a bounded plural-witness composition above stable crossing identity.

```text
signed crossing
      ↓
stable Moment
   ↙       ↘
Perspective A
Perspective B
   ↘       ↙
 immutable set union
```

The Moment anchors the carrier. Perspectives remain separately signed observer accounts.

```text
MOMENT != PERSPECTIVE
SYNC != OVERWRITE
PERSPECTIVE SET != CONSENSUS
ACCOUNT != CARRIER MUTATION
```


## Field consequence witness

[Field Consequence 001](FIELD-CONSEQUENCE-001.md) gives L7 a bounded executable projection over admitted L5 history plus R8 plural witness.

```text
admitted receipts
    +
perspectives
    ↓
typed features
    ↓
owner-local lens
    ↓
susceptibility
```

The field keeps a deterministic history root independent of the lens, so differing local interpretations do not rewrite shared evidence.

```text
HISTORY != WEATHER
LENS != HISTORY
WEATHER != AUTHORITY
SUSCEPTIBILITY != INSTRUCTION
```


## Cultural descendant witness

[Cultural Descendant 001](CULTURAL-DESCENDANT-001.md) gives L8 a bounded executable heredity path downstream of admitted L5 history and non-authoritative L7 field context.

```text
ancestor crossing
      ↓
local ADMIT
      ↓
field projection
      ↓
owner-local uptake
      ↓
explicit variation
      ↓
fresh descendant crossing
      ↓
next sovereign receiver
```

The descendant uses the ancestor as a parent reference but owns fresh source identity and arrives elsewhere without inherited admission.

```text
ANCESTRY != AUTHORITY
FIELD != AUTHORITY
VARIATION != RETCON
REPRODUCTION != ADMISSION
```


## External checkpoint witness

[External Checkpoint 001](EXTERNAL-CHECKPOINT-001.md) gives LX a bounded Git witness over a deterministic local receipt-set commitment.

```text
local history
    ↓
receipt-set commitment
    ↓
replaceable witness adapter
    ↓
Git commit
```

The local commitment remains useful without Git. Git proves only that the exact commitment object existed in the declared foreign commit.

```text
CHECKPOINT != HISTORY
FOREIGN WITNESS != LOCAL AUTHORITY
GIT COMMIT != GLOBAL CANON
CHECKPOINT AVAILABILITY != LOCAL LIVENESS
```


## Mortality / succession witness

[Mortality Test 001](MORTALITY-TEST-001.md) composes R3 durability, R7 mirrors, and R11 checkpointing into an explicit node-death boundary.

```text
predecessor local history
       ↓
checkpoint + mortality seed
       ↓
mirrors + succession archives
       ↓
predecessor death
       ↓
fresh successor
```

The successor re-receives surviving artifacts under a new local identity and key. Historical predecessor receipts remain immutable attribution records.

```text
SUCCESSOR != PREDECESSOR
CONTINUITY != IDENTITY
ANCESTRY != AUTHORITY
PREDECESSOR ADMIT != SUCCESSOR ADMIT
```


## Composition pulse witness

[Composition Pulse 001](COMPOSITION-PULSE-001.md) composes the earned admission, field, developmental-witness, heredity, and return boundaries into one executable round.

```text
crossing
  ↓
local admission
  ↓
field projection
  ↓
fresh local act + receipt
  ↓
slow witness
  ↓
question
  ↓
owner-local adaptation
  ↓
descendant
  ↓
sovereign receive
  ↓
return crossing
  ↓
origin receive
```

The pulse trace records continuity across these seams without becoming another authority layer.

```text
FIELD != AUTHORITY
WITNESS != CANON
QUESTION != AUTHORITY
DESCENDANT != ADMISSION
RETURN != ADMISSION
PULSE != CONSENSUS
```


## Generality gate witness

[Release Rule Hostile 001](RELEASE-RULE-HOSTILE-001.md) tests the shared crossing substrate against two materially different donor families without promoting donor semantics into core.

```text
donor-owned semantics
       ↓
opaque signed adapter descriptor
       ↓
canonical crossing
       ↓
replaceable transport
       ↓
durable receiver
       ↓
owner-local disposition
```

The substrate may bind donor claims without interpreting them.

```text
DONOR SEMANTICS != SUBSTRATE SEMANTICS
FAMILY != DISPOSITION
OPAQUE != UNBOUND
EDGE ADAPTER != CORE EXCEPTION
```
