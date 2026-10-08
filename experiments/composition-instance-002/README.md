# COMPOSITION-INSTANCE-002

An admitted bounded composition world generates two new field interfaces, executes separately granted observations, dies, and leaves a candidate and verifiable history. Reconstitution preserves ancestry while creating a fresh incarnation, independently keyed world, offers, admission crossing, authorization epoch and grants.

This is a removable experimental bridge. The normative core and both parent contracts are unchanged. The integration base merges #77 at `f34772194e761585ee6d05a48be33f614f6d4c03` and #78 at `1bdb060130842df2f634831a80f4dc5bb57f630c`; neither was an ancestor of the other. Both share merge base `7af28e974cd82fe6bd1f6cfacf656c8c0d7b1cf1` and normative `src` tree `c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76`. The clean parent merge is `3da2740`. Remove this directory, its evidence fixture and its workflow to leave the two parents independently coherent.

## Run and cold verification

Use Node 24. The bridge specimen itself needs no Minecraft server or external donors.

```sh
npm ci
node --test experiments/composition-instance-002/tests/*.test.mjs
node experiments/composition-instance-002/specimen.mjs
node experiments/composition-instance-002/verify.mjs
node experiments/composition-instance-002/verify.mjs fixtures/composition-instance-002
```

The second command runs **42 bridge tests**: the 25 requested hostile cases, plus 17 death, replay, integrity, bound and cross-instance checks. The cold verifier starts no process and acquires no owner handle. Running it again creates no occurrence and consumes no grant. The tests compare durable evidence before/after and invoke a separate verifier process.

The committed fixture includes `proof.json`, explicit locally selected `roots.json`, signed incarnation journals and content-addressed objects. The proof manifest binds all three instance histories; each journal event is Ed25519 signed and chained. Field publications, grants and operation tickets retain #78's independent owner signatures. Launch/candidate crossings and receiver receipts use #77's unchanged P-256 crossing substrate. Private keys are never persisted. The roots are specimen trust inputs, not a global trust service; a self-declared signing key is not universal trust.

The evidence store hashes the exact serialized JSON bytes. It deliberately preserves the parent's JSON key ordering: #77's spec identity and the inherited planner's constraint enumeration use that ordering. `spec_bytes_base64` and `result_bytes_base64` retain the exact bytes sealed by #77. Semantic digests never replace those byte identities.

To verify the independently coherent parents, provision the pinned donors from #78:

```sh
git clone https://github.com/the-static-collective/tranchNOSE.git ../tranchNOSE
git -C ../tranchNOSE checkout 670ca60012929b51e66b8bac7d0c9b85a4f95d7b
git clone https://github.com/the-static-collective/GHoT.git ../GHoT
git -C ../GHoT checkout e35dd470384d864b7b0b629a68dad570875a7df0
TRANCHNOSE_ROOT=../tranchNOSE GHOT_ROOT=../GHoT node --test test/composition-instance-001.test.ts experiments/dynamic-interface-field-001/tests/*.test.mjs experiments/interface-superspace-001/tests/*.test.mjs
npm run verify
```

That seam suite has **76 tests**: 8 composition, 33 dynamic-field and 35 superspace. The repository verification runs **385 tests**, TypeScript checks/build, trust mutation checks and trust/bootstrap/sovereign replay. The 8 composition tests are included in both totals; these are overlapping suites, not 503 unique tests.

## Walkthrough

1. #77 admits the room spec with `R3_ADMIT`. Its spec-derived `instance_id` is preserved. The bridge creates a separate `incarnation_id`, a fresh independently keyed #78 `world_id`, and an authorization epoch. A subprocess starts with ROOM A → ROOM B, an AGENT in ROOM A and an unopened CHEST. An independently owned source door exists; no chest door exists.
2. The bounded author action moves the agent to ROOM B and opens the chest. The runtime writes its state transition. The bridge verifies that transition, signs its evidence and creates a previously nonexistent eligible interface particular. A field search still returns no chest route.
3. The host explicitly passes the owner publication capability. #78 publishes the contents descriptor with a fresh `offer_id`. The signed bridge journal binds `runtime-event → eligible-interface → explicit-publication → field-event/offer`. The event itself cannot publish.
4. An explicitly anchored observer projects selected histories. The planner discovers a route to the new door. Explicit selection is recorded separately. Owners issue grants for the selected route and subject. The unchanged dynamic executor checks owners at entry and every native boundary, consumes grants and records a fresh occurrence. The runtime observation returns the chest's `stone` and `map fragment` contents as native evidence; the carried request bytes and runtime observations retain separate identities.
5. A second runtime action reveals the map fragment. A fresh eligible interface and offer are published. The child has explicit parent interface/offer lineage and no inherited grants. A separately granted route observes the fragment's ROOM B destination. The first descriptor is unchanged.
6. A fresh read-only observer process reads the persisted runtime state. While both doors exist, the addressable checkpoint preserves instance/incarnation/world identity, governing snapshot, runtime snapshot, events, eligible semantics, descriptors/offers, field history including relations and historical grants, owner frontier, launch/candidate ancestry and observer evidence. Its live authority and restored counter lists are empty. At this pre-candidate checkpoint, candidate ancestry names the launch; the later candidate is bound into the terminal signed evidence bundle.
7. #77 finalizes the observed result as an independently addressed candidate crossing with forced `R3_HOLD`. The candidate's raw content object, result bytes, particular identity, crossing and producer ancestry are preserved independently of the process.
8. The incarnation death fence is fsynced **before** yielding, SIGKILL or withdrawal. The process is killed and its exit is awaited. Its relations and doors retire. A historical route with a still-unused grant fails with `TERMINAL_INSTANCE_DEATH`. Historical successful occurrences remain unchanged. Independent receivers issue local HOLD, REFUSE and ADMIT receipts for the surviving candidate without modifying its producer receipt or journal.
9. A new #77 instance admission uses the checkpoint and the same runtime implementation/spec. The spec-derived instance identity may remain the same, as #77 requires; the incarnation, world key, offers, launch crossing and epoch are fresh. No private key, grant table or counter is restored. Each eligible historical descriptor is explicitly republished with prior offer/world ancestry. Old grants fail. Fresh owner grants execute a new route with counters starting at 1.
10. A separately admitted instance receives selected histories from the dead and reconstituted worlds. Its signed recognition records identify the new world as a descendant, with `same_live_authority: false` and empty authority. This confers no owner handle, grants or publication capability. All disposable instances are then killed.

The cold verifier reconstructs all historical views and proposals, validates signatures/hash chains and literal crossing bytes, checks runtime transitions and causal publications, verifies owner ticket frontiers and sequential consumption, distinguishes execution from proposals, confirms candidate bytes/dispositions, and proves fresh world/offer/epoch identities and ancestry. Its reported specimen totals are **3 successful routes, 2 stale/historical denials, 2 runtime transitions, 4 explicit publications, 1 surviving candidate and 7 signed owner tickets**. Replay restores **0 live grants** and executes **0 side effects**.

## Terminal fencing and scope

The bridge gives the executor a `FencedOwner`; the raw #78 owner stays private. Runtime IPC carries only bounded action/observation requests. Field views carry descriptors and signed evidence, never owner-control objects. Every bridge gate checks the durable incarnation fence and the pinned admitted spec. Known journal frontiers reject rollback/equivocation; torn journals fail closed. Unexpected subprocess exit also triggers fencing and retirement.

Ordinary #78 withdrawal can be followed by a new offer. Terminal bridge death cannot. If cleanup is interrupted, raw historical #78 publication events may still project as discoverable in a selected historical view. They are historical claims: the bridge reports no live doors and every owner entry denies execution. Cold recovery produces a read-only, non-executing history object, even from an unfenced historical prefix. It never recreates the old owner or its keys. A signed fence survives interrupted cleanup; delayed publication, queued native execution, fresh grants and unused stale grants all fail. Legitimately completed occurrences are never erased.

The native implementation uses the parents' existing file-byte surface and observe relation contract with an explicitly installed specimen binding. It invokes the unchanged `observeFilesystem` primitive, writes and reads a real temporary file object, preserves carried bytes, adds actual runtime observation evidence, and runs the existing executor cleanup. The interface descriptor's participant reference retains the spec-derived instance identity; the field offer's independently keyed world identity determines its current incarnation. The runtime state machine and its ontology live only here. It is deterministic in state, not in cryptographic identities or occurrence IDs. V8 memory, two state transitions, eight observations and five-second calls are bounded; this is a trusted local specimen, not an OS sandbox for adversarial executable code. It does not extend #77's official Mojang runtime or claim a new Minecraft run. Both parents' current-head official-server CI proofs remain their own evidence.

This earns no global registry/identity/discovery, automatic trust, distributed consensus/atomicity, durable restoration of a live owner, arbitrary recursive execution, remote physical truth, permanent world or general autonomous agency. Durable storage and explicit selected trust roots remain local assumptions. Host-process crash recovery is deliberately non-executing: resume means fresh admission and reconstitution, never restoring old authority. Runtime ontology does not enter reLATTE's normative core.

## Laws

```text
INSTANCE != RUNTIME       INSTANCE != WORLD       WORLD != DOOR
DOOR != OFFER             OFFER != PARTICULAR
EVENT != PUBLICATION      PUBLICATION != DISCOVERY
DISCOVERY != SELECTION    SELECTION != AUTHORIZATION
AUTHORIZATION != EXECUTION
INSTANCE DEATH != HISTORY DEATH
INSTANCE DEATH != CANDIDATE DEATH
DOOR RETIREMENT != HISTORY ERASURE
SNAPSHOT != FREEZE        SNAPSHOT != AUTHORITY     HISTORY != AUTHORITY
RECONSTITUTION != RESURRECTION
SAME SNAPSHOT != SAME LIVE WORLD
SAME DESCRIPTOR != SAME INCARNATION
LINEAGE != AUTHORITY      PARENTAGE != PERMISSION   OBSERVATION != OWNERSHIP
COMPOSITION != SELF-ADMISSION
WORLD PARTICIPATION != GLOBAL REGISTRY
```
