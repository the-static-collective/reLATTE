# reLATTE Roadmap

The project should earn generality by surviving increasingly hostile crossings.

## R0 — Genesis

Already present:

- Slice 001: relation/crossing as the irreducible shared object.
- Ethereum inversion and organ ownership map.
- A bounded executable identity/signature witness for crossing and receipt particulars.

The executable witness does not yet constitute a receiver runtime or complete R1.

## R1 — Canonical Crossing Envelope

Define a versioned, runtime-neutral envelope.

Required proof:

- canonical byte encoding;
- stable crossing ID;
- source/world/domain binding;
- payload content references;
- parent crossing references;
- declared kind/effect;
- signature field;
- hostile fixtures for mutation and ambiguity.

Current bounded proof:

- explicit `CrossingIdentityBodyV0` construction;
- Project0-conformant RFC 8785/JCS canonical bytes;
- domain-separated SHA-256 crossing IDs;
- source-world/signing-domain/public-key binding;
- fixed signed fixtures and hostile mutation checks.

Still open before R1 is complete:

- full structural JSON Schema conformance in the runtime;
- parent existence/ancestry validation;
- payload-address resolution/verification;
- broader ambiguity fixtures and cross-runtime conformance beyond the current Node witness.

See [Identity + Signature Profile v0](../spec/IDENTITY-SIGNATURE-PROFILE-V0.md).

## R2 — Real Signature + Verification

Use a real cryptographic implementation, initially informed by Formation Trace's ECDSA P-256 specimen.

Required proof:

- same canonical payload verifies across two independent processes;
- one-byte mutation fails;
- wrong key fails;
- wrong world/domain fails;
- signature proves key continuity only.

Current bounded proof:

- ECDSA P-256 + SHA-256 signing via Web Crypto;
- derive-ID-first / sign-ID-plus-body construction with separate signature domains;
- fresh-process verification from serialized public material;
- semantic mutation, wrong-key, wrong-world, and wrong-domain failures;
- fixed crossing and receipt fixtures with no committed private key material.

This proves the cryptographic mechanism only. `SIGNATURE != HUMAN IDENTITY`, `SIGNED != TRUE`, and R3 admission remains local and unimplemented.

## R3 — RECEIVE / HOLD / DISPOSITION

Implement a local receiver with Band-style semantics.

Required dispositions:

```text
HOLD
ADMIT
REFUSE
RETURN
```

Required proof:

- receipt does not imply admission;
- refused payload has no protected semantic effect;
- duplicate delivery is idempotent;
- local state reconstructs after restart.

Current bounded proof:

- [Local Receiver 001](LOCAL-RECEIVER-001.md) verifies a signed crossing before recording it;
- RECEIVE emits a signed receipt with no semantic effect;
- HOLD / ADMIT / REFUSE / RETURN remain distinct local dispositions;
- REFUSE has no protected payload effect;
- duplicate RECEIVE returns the original receipt without appending history;
- repeating the same disposition is idempotent while conflicting redisposition fails;
- local history is an append-only hash-chained journal;
- restart replay reconstructs the same derived state and verifies the journal;
- local signing-key continuity survives restart.

This earns the stated R3 receiver behavior at the current envelope level. It does not close R1 payload-resolution or ancestry-validation gaps and is not yet a production storage/key-custody design.

## R4 — Two Sovereign Nodes

Run two independent nodes with distinct local histories and policies.

Required proof:

- A signs and sends;
- B verifies;
- B may admit or refuse;
- B emits its own signed receipt;
- A can verify B's response;
- neither node needs a shared mutable database.

Current bounded proof:

- [Sovereign Nodes 001](SOVEREIGN-NODES-001.md) has source A create one signed crossing;
- durable node B independently verifies, RECEIVE-records, and ADMITs it;
- B returns a content-addressed response bundle containing its signed RECEIVE and disposition receipts;
- A verifies the returned response from signed material without reading B's journal;
- B's local history and signing continuity survive restart;
- no shared mutable state is required.

This earns the stated R4 semantics at the current envelope level. Network transport and endpoint identity remain open.

## R5 — Divergent Lawful Receivers

Send the same crossing to B and C.

Required proof:

```text
same source crossing
→ B admits
→ C refuses
```

Both outcomes remain valid and attributable.

Current bounded proof:

- [Sovereign Nodes 001](SOVEREIGN-NODES-001.md) sends the exact same signed crossing to durable B and C;
- B ADMITs and C REFUSEs;
- each receiver uses its own world ID, key, journal, history head, and state reference;
- both response bundles independently verify at the source;
- both divergent histories reconstruct after restart;
- no reconciliation step selects one receiver's consequence as globally authoritative.

This earns the stated R5 divergent-receiver semantics at the current envelope level.

This is the first decisive anti-global-state proof.

## R6 — Replaceable Transport

Move the identical canonical crossing using at least two transports, for example:

- direct HTTP/relay;
- file/removable bundle or Git artifact.

Transport replacement must not change crossing identity.

Current bounded proof:

- [Replaceable Transport 001](REPLACEABLE-TRANSPORT-001.md) serializes one signed crossing to RFC 8785/JCS canonical JSON;
- a filesystem bundle writes/reads that crossing through actual disk I/O;
- an HTTP relay POSTs the same canonical crossing through an actual localhost socket;
- both roads preserve the same crossing ID and canonical-body SHA-256;
- the two road events have distinct transport-frame IDs;
- the same durable receiver treats second-road delivery as an idempotent duplicate rather than new history;
- HTTP transport ACK remains non-semantic and distinct from receiver RECEIVE receipt;
- hostile frame/body/route/sidecar mutations fail verification.

This earns the stated R6 replaceable-transport semantics at the current local-process/network boundary. Internet transport, remote peer discovery, TLS identity, retries, and store-and-forward remain open.

## R7 — Mirror / Store / Serve Receipts

Recover the old Proof-of-Sharing insight without token economics.

Define distinct claims:

```text
PUBLISHED
STORED
SERVED
RECEIVED
```

Required proof: a dead source node can be reconstructed from independently retained addressed artifacts and receipts.

Current bounded proof:

- [Mirror / Store / Serve 001](MIRROR-STORE-SERVE-001.md) has the source sign both a crossing and a distinct PUBLISHED claim with the same key;
- two independent mirrors retain the same canonical signed crossing object under separate local STORED receipts;
- both converge on the same object address without shared mutable state;
- the source directory and one mirror are deleted;
- the surviving mirror reopens from disk, verifies retained material, reconstructs the original signed crossing, and signs SERVED;
- a fresh Local Receiver then signs RECEIVED;
- the reconstructed crossing continues to name the dead source rather than the mirror;
- PUBLISHED / STORED / SERVED / RECEIVED remain cryptographically and semantically distinct.

This earns the stated R7 artifact-survival proof at the current envelope level. It does not recover source private keys, source authority, or an entire dead node's private local journal.

## R8 — Moment / Perspective Composition

Bind a crossing to a Trust-style shared Moment.

Required proof:

- two observers attach divergent accounts;
- sync/replay preserves both;
- no last-write-wins semantic collapse;
- neither account mutates source carrier identity.

Current bounded proof:

- [Moment / Perspective 001](MOMENT-PERSPECTIVE-001.md) derives one content-addressed Moment from the exact canonical signed crossing;
- two independent observers sign divergent R8_PERSPECTIVE accounts against the same Moment and carrier hash;
- two replicas begin with different accounts and synchronize by immutable set union;
- both accounts survive synchronization, duplicate sync, and restart replay;
- no winner/current-truth field exists in the replica state;
- mutating a signed account fails Perspective verification;
- mutating the anchored carrier fails Moment verification;
- a Perspective bound to Moment A cannot attach to Moment B.

This earns the stated R8 plural-witness semantics at the current envelope level. It does not adjudicate truth, consensus, reputation, or moderation.

## R9 — Field Consequence

Feed admitted local receipts into a Groove/Band-style field projection.

Required proof:

- history alters weather/susceptibility;
- weather does not rewrite history;
- weather cannot authorize an action.

Current bounded proof:

- [Field Consequence 001](FIELD-CONSEQUENCE-001.md) projects only signed R3 ADMIT receipts from the lens's own world;
- signed R8 Perspectives may contribute only when attached to a crossing already present in admitted local history;
- typed structural features feed an owner-local Field Lens rather than a universal weighting model;
- admitted history changes susceptibility relative to baseline;
- two different lenses over the exact same history retain the same history root while producing different field projections;
- source receipts, Moments, and Perspectives remain unchanged and verifiable after projection;
- input order does not alter projection identity;
- every field projection fixes semantic_effect=none, authorization=null, and recommended_action=null;
- field projections cannot verify as receipts or crossings and cannot be received as if they were actions.

This earns the stated R9 field-consequence semantics at the current envelope level. It does not claim prediction, ranking, governance, or objective social measurement.

## R10 — Cultural Descendant

Pass one admitted local consequence through MEMENTO-style uptake/reproduction.

Required proof:

- descendant preserves ancestry;
- descendant does not inherit source authority;
- variation is explicit;
- another world receives descendant as fresh candidate.

Current bounded proof:

- [Cultural Descendant 001](CULTURAL-DESCENDANT-001.md) starts from a verified ancestor crossing that a durable local receiver has explicitly ADMITted;
- an R9 field projection includes that admission but remains context-only and non-authoritative;
- a content-addressed Cultural Uptake binds the ancestor crossing, ADMIT receipt, field projection, field history root, local world/particular, and explicit preserved / varied / introduced / retired declarations;
- at least one explicit variation is required;
- the descendant is a new signed crossing whose parent is the ancestor crossing and whose source identity is the local maker;
- descendant lineage fixes inherited_authority=false and field_authorized_action=false;
- another durable Local Receiver receives the descendant as RECEIVED with semantic_effect=none and no inherited disposition;
- modifying uptake variation breaks uptake identity;
- modifying descendant ancestry breaks crossing verification.

This earns the stated R10 cultural-descendant semantics at the current envelope level. It does not claim automatic reproduction, fitness, ranking, licensing inheritance, truth preservation, or downstream admission.

## R11 — External Checkpoint

Commit a local receipt-set root to one replaceable foreign witness.

Possible witnesses include Git, transparency logs, or a public blockchain.

Required proof:

- local history is independently useful without checkpoint;
- checkpoint verifies only its declared commitment;
- absence of foreign service does not halt local operation.

Current bounded proof:

- [External Checkpoint 001](EXTERNAL-CHECKPOINT-001.md) verifies a declared set of signed local receipts and derives a deterministic receipt-set root bound to the local history head;
- the commitment format contains no Git-specific fields, preserving a replaceable witness boundary;
- a separate Git repository stores the exact canonical commitment in a real Git commit;
- Git witness verification checks only the declared commit/path/object/commitment linkage and does not accept receipt bodies;
- mutating a local receipt copy makes local receipt-set verification fail while the Git witness still truthfully verifies that it witnessed the original commitment;
- deleting the foreign Git repository does not affect local journal replay, local receipt verification, local receipt-set verification, or subsequent RECEIVE/ADMIT operation.

This earns the stated R11 checkpoint semantics at the current local Git witness boundary. It does not claim history completeness, Git authority, timestamp-oracle authority, multi-witness consensus, or R12 succession.

## R12 — Mortality Test

Kill a node.

Required proof:

- surviving peers retain attributable crossings;
- reconstructible artifacts can reconstitute a successor;
- successor has fresh local identity/authority;
- historical receipts still name the dead node where appropriate.

Current bounded proof:

- [Mortality Test 001](MORTALITY-TEST-001.md) builds durable predecessor history, covers it with an R11 receipt-set commitment, and emits a signed mortality seed;
- two R7 mirrors retain every declared recoverable crossing and two peer archives retain the same content-addressed succession capsule;
- the predecessor receiver root/private key, one mirror, one peer archive, and the foreign Git witness are then deleted;
- the surviving mirror plus surviving succession capsule are sufficient to create a successor with a different world ID, receiver particular, and fresh local key;
- the successor re-receives surviving crossings with no inherited admission;
- successor acceptance explicitly declares fresh-local authority, no inherited private key, and no inherited admission;
- predecessor historical receipts remain valid and continue to name the dead predecessor;
- a later successor ADMIT is a separate fresh local act signed under the successor key;
- reusing the predecessor world or receiver identity is rejected by the reconstitution helper.

This earns the stated R12 mortality/succession semantics at the current local durability boundary. It does not recover the dead private journal/key, elect successors, or establish legal/organizational succession.

## R13 — Composition Pulse

Only after R1–R12, test the larger round:

```text
crossing
→ local admission
→ field change
→ new act
→ receipt
→ slow developmental witness
→ compositional question
→ owner-local adaptation
→ descendant
→ return crossing
```

Success does not require global agreement.

Success requires attributable continuity without hidden authority transfer.

Current bounded proof:

- [Composition Pulse 001](COMPOSITION-PULSE-001.md) executes one complete round from signed origin crossing through local RECEIVE/ADMIT, R9 field projection, fresh signed local act, a second local RECEIVE/ADMIT, Daily-Slice-shaped slow developmental witness, content-addressed compositional question, R10 Cultural Uptake, signed owner-local adaptation, fresh signed cultural descendant, another sovereign world's RECEIVE, signed return crossing, and origin-world RECEIVE of the return;
- field, witness, and question all remain explicitly non-authoritative;
- the descendant must share the adaptation actor's local signing key while still remaining a fresh crossing with no inherited admission;
- a third sovereign world may REFUSE the same descendant while the main pulse still closes, proving global agreement is unnecessary;
- the returned crossing arrives back at the origin world as RECEIVED with no automatic disposition;
- a final content-addressed pulse trace binds every stage ID and rejects tampering or unsigned sidecars.

This earns the stated R13 composition-pulse semantics at the current envelope level. The independent release rule still stands and is not automatically satisfied by R13 completion.

## Release rule

> **Do not call reLATTE a general substrate until two materially different organ families can cross it without reLATTE-specific semantic hacks.**


## Composite witness lane

The roadmap remains milestone-gated, but later ideas may be assembled early as bounded synthetic witnesses when doing so exposes useful seams.

Current composite witness:

- [Ecology Machine 001](ECOLOGY-MACHINE-001.md)

It composes candidate grammar discovery, COM⁵ capsules, transport-shaped carriers, Porch/Customs, local divergent disposition, Fog HOLD, Cultural Weather, Tradition, capacity proposals, release/rest declarations, and Commuter Line routing.

This composite does **not** advance R3–R13 to complete status.

```text
COMPOSITE WITNESS != MILESTONE COMPLETION
SYNTHETIC SEAM != PRODUCTION RECEIVER
PRESSURE TEST != GENERALITY
```
