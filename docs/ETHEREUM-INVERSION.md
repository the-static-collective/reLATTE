# Ethereum Inversion

**Status:** architectural candidate  
**Date:** 2026-09-29

reLATTE gives the current ecosystem the “full Ethereum treatment” by asking which Ethereum/blockchain functions are genuinely useful after token economics, one-chain ontology, and universal consensus are removed.

## 1. What is retained

Useful functions:

- stable addressing;
- signed intent;
- deterministic validation;
- append-oriented receipts;
- replayable state transition;
- independent verification;
- explicit execution boundary;
- contract composition;
- event/log surfaces;
- forkable history;
- bridge/cross-domain semantics;
- external checkpointing;
- participant-held keys;
- replaceable relays;
- reconstruction after node loss.

## 2. What is rejected as universal law

reLATTE does not require:

- one total transaction order;
- one globally authoritative state root;
- one economic token;
- proof-of-work or proof-of-stake;
- one universal gas market;
- one canonical VM;
- global semantic consensus;
- a chain deciding human truth;
- signatures proving human identity;
- possession of a capability proving moral/legal legitimacy.

## 3. Candidate primitive mapping

### Sovereign Particular

Analogous pressure: account.

A particular may be a person-controlled node, organ, world, artifact lineage, or other locally governed participant.

A particular has stable addressing and may hold keys/capabilities, but:

```text
PARTICULAR != KEY
PARTICULAR != WALLET
PARTICULAR != CURRENT PROCESS
```

### Crossing Envelope

Analogous pressure: transaction.

A crossing carries attributable material from one local history toward another.

Candidate fields:

```text
crossing_id
protocol_version
source_particular
source_world
source_history_head?
parents[]
payload_refs[]
declared_kind
requested_effect?
capability_ref?
privacy_policy?
audience_policy?
created_at
source_public_key
source_signature
```

The envelope is information until a receiver admits consequence.

### Admission Contract

Analogous pressure: smart contract.

An admission contract is owner-local executable law that answers questions such as:

- may this crossing be received?
- must it HOLD?
- may it create a descendant?
- does this capability permit this requested action?
- what receipt must be emitted?

Admission contracts do not gain authority merely by being portable.

### Receipt

Analogous pressure: event log + transaction receipt.

Receipts preserve observed consequences and non-consequences.

Candidate families:

```text
RECEIVED
VERIFIED
HELD
ADMITTED
REFUSED
RETURNED
EXECUTED
FAILED
RECONSTITUTED
REPAIRED
TRANSMITTED
REPRODUCED
CHECKPOINTED
```

A refusal receipt may exist while protected state remains unchanged.

### Local State Transition

Analogous pressure: VM state transition.

```text
local_state_n
+ verified crossing
+ local admission contract
+ local authority/capability state
--------------------------------
local_state_n+1
+ receipts
+ residual
```

There is no rule requiring a different world to derive the same local state.

### World / Domain ID

Analogous pressure: chain ID.

The identifier prevents replay/confusion across domains and tells a receiver which local constitution governs admission.

### Capability

Analogous pressure: wallet authority / authorization.

A capability grants narrowly scoped permission.

```text
CAPABILITY
├── issuer
├── subject / bearer rule
├── scope
├── target world
├── expiry / revocation condition
└── signature / receipt
```

A seed carries reconstructive information. A capability carries permission. They remain orthogonal.

### Crossing Adapter

Analogous pressure: bridge.

Adapters translate between two explicit constitutions without pretending either side owns the other.

```text
WORLD A
  ↓ export
typed crossing
  ↓ adapter
foreign representation
  ↓ receive
WORLD B
  ↓ local admission
fresh local consequence
```

### Foreign Witness

Analogous pressure: oracle / external settlement / checkpoint chain.

Git, transparency logs, banks, courts, public blockchains, or other external systems may witness a bounded fact.

They do not define interior truth.

### Local Cut

Analogous pressure: block.

A local cut may group receipts for efficient checkpoint/replay, but the cut does not become a universal clock.

Two nodes may legitimately have different local cuts.

## 4. No universal consensus algorithm

Question-specific proof replaces universal consensus.

```text
exact bytes?
  hash

authored by this key?
  signature

received here?
  receiver receipt

admitted here?
  local admission receipt

same historical source?
  lineage proof

same experience?
  impossible to assume; retain accounts

reproduced cultural practice?
  transmission + uptake witnesses

external settlement?
  foreign-system receipt
```

> **There is no universal consensus algorithm because there is no universal question.**

## 5. Composability without sovereignty

The target is Ethereum-like composability with stronger ownership boundaries:

```text
ORGAN A contract
       │
       │ crossing
       ▼
reLATTE composition surface
       │
       ▼
ORGAN B local admission

A remains authoritative for A.
B remains authoritative for B.
reLATTE owns neither.
```

The substrate may validate shared syntax, signatures, identities, ancestry, and declared interfaces.

It must not infer local semantic admission.

## 6. Foreign-chain use

If Ethereum or another public chain is ever used:

```text
local receipt DAG
      ↓
checkpoint commitment
      ↓
public chain
```

The externally settled fact should be intentionally narrow:

> a holder of key K committed to digest D no later than checkpoint C.

It does not establish the truth, interpretation, authority, or legal status of the underlying events.
