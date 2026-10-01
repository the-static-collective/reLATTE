# R3 Sovereign Receiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local reLATTE receiver that durably receives and holds verified crossings, applies one owner-local `ADMIT | REFUSE | RETURN` disposition, emits a signed `ReceiptV0`, prevents duplicate semantic consequence, and reconstructs the same local state after restart.

**Architecture:** Add a small append-only local receiver journal and a reconstructible in-memory projection. A valid crossing is durably appended once as `RECEIVED`; an undisposed received crossing projects as `HELD`. Final disposition is appended once as a `DISPOSED` event containing the signed receipt and the resulting protected JSON state. R3 deliberately limits semantic effects to a pure local JSON state transition so the durable journal commit is the authoritative local effect boundary and no external transaction framework is required.

**Tech Stack:** Node.js 22, TypeScript 7.0.2, `node:test`, Web Crypto ECDSA P-256, existing `json-canonicalize` / canonical helpers, local filesystem persistence.

**Spec:** `docs/superpowers/specs/2026-09-29-r3-sovereign-receiver-design.md`

**Issue:** #7 — Implement the R3 sovereign receiver: RECEIVE, HOLD, ADMIT, REFUSE, RETURN

## Global Constraints

- Preserve `VERIFY != ADMIT`, `RECEIVE != ADMIT`, `HOLD != OWN`, `REFUSE != EFFECT`, `RETURN != ADMIT`, `DUPLICATE DELIVERY != DUPLICATE CONSEQUENCE`, and `RESTART != MEMORY LOSS`.
- Use the landed `verifyCrossingEnvelope()`, `sealReceipt()`, and `verifyReceipt()` machinery; do not fork cryptographic identity rules.
- Do not change `schemas/crossing-envelope-v0.schema.json`, `schemas/receipt-v0.schema.json`, or `schemas/organ-contract-v0.schema.json` merely to simplify the receiver.
- Do not add network transport, cloud coordination, group semantics, distributed consensus, a generalized policy engine, or a new capability format.
- Issue #5 / PR #6 group/admin/cloud concepts remain research-only pressure; do not add `membership_cut_ref`, `administration_cut_ref`, or `policy_cut_ref`.
- The receiver journal is local implementation state, not a protocol primitive and not global history.
- R3 semantic effect is limited to one canonicalizable JSON protected state value; no external side effects are introduced.
- CI remains Node 22 and the full gate remains `npm run verify`.

## File Structure

- Create `src/receiver/types.ts` — R3 receiver-local types, journal events, disposition decisions, and runtime records.
- Create `src/receiver/journal.ts` — append-only canonical JSONL persistence with durable append and fail-closed replay.
- Create `src/receiver/state.ts` — journal replay/projection and deterministic local state references.
- Create `src/receiver/runtime.ts` — intake, HOLD, local disposition, receipt sealing, idempotence, and restart opening.
- Modify `src/index.ts` — export the receiver API.
- Create `test/receiver-journal.test.ts` — persistence, replay, corruption, and projection tests.
- Create `test/receiver-runtime.test.ts` — receive/HOLD and disposition tests.
- Create `test/receiver-hostile.test.ts` — Creepy Charlie, duplicate/restart, refusal-integrity, and cloud/group pressure fixtures.
- Create `spec/RECEIVER-RUNTIME-PROFILE-V0.md` — bounded executable R3 profile and explicit non-goals.
- Modify `docs/ROADMAP.md` — record only the R3 proof actually earned.

## Review Focus

1. **Journal truncation/corruption:** any non-empty malformed line must fail reconstruction with `CORRUPT_RECEIVER_JOURNAL`; never skip bad history. Covered in Task 1.
2. **Duplicate final disposition:** a journal containing two final dispositions for one `crossing_id` must fail reconstruction with `CONFLICTING_DISPOSITION`; never last-write-wins. Covered in Task 1.
3. **Equivalent crossing with different valid signature bytes:** because signature bytes are excluded from crossing identity, a legitimately re-signed envelope with the same canonical identity body must deduplicate to the existing receiver record rather than conflict. Covered in Task 2.
4. **Persisted semantic-state tampering:** a JSON-valid journal whose `protected_state_after` no longer matches the signed receipt's `post_state_ref` must fail reopening with `PERSISTED_STATE_REF_MISMATCH`; never trust unsigned local state blindly. Covered in Tasks 1–2.
5. **Restart after final disposition:** delivering the same crossing after reopening the journal must return the established record/receipt and never run the disposition callback or state transition again. Covered in Task 4.

---

### Task 1: Append-only receiver journal and reconstructible projection

**Files:**
- Create: `src/receiver/types.ts`
- Create: `src/receiver/journal.ts`
- Create: `src/receiver/state.ts`
- Create: `test/receiver-journal.test.ts`

**Interfaces:**
- Produces:
  - `type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }`
  - `type ReceiverDisposition = 'ADMIT' | 'REFUSE' | 'RETURN'`
  - `interface ReceivedEvent { type: 'RECEIVED'; crossing_id: string; crossing: Record<string, unknown>; received_at: string }`
  - `interface DisposedEvent<S extends JsonValue = JsonValue> { type: 'DISPOSED'; crossing_id: string; disposition: ReceiverDisposition; receipt: Record<string, unknown>; protected_state_after: S; disposed_at: string }`
  - `type ReceiverJournalEvent<S extends JsonValue = JsonValue> = ReceivedEvent | DisposedEvent<S>`
  - `interface ReceiverRecord<S extends JsonValue = JsonValue> { crossing: Record<string, unknown>; status: 'HELD' | 'ADMITTED' | 'REFUSED' | 'RETURNED'; receipt: Record<string, unknown> | null; protectedStateAfter: S | null }`
  - `interface ReceiverProjection<S extends JsonValue = JsonValue> { protectedState: S; records: Map<string, ReceiverRecord<S>> }`
  - `class FileReceiverJournal<S extends JsonValue = JsonValue> { constructor(path: string); append(event: ReceiverJournalEvent<S>): Promise<void>; readAll(): Promise<ReceiverJournalEvent<S>[]> }`
  - `function stateRef(value: JsonValue): string`
  - `function reconstructReceiverState<S extends JsonValue>(events: ReceiverJournalEvent<S>[], initialState: S): ReceiverProjection<S>`
- Consumes:
  - `canonicalize()` and `sha256Hex()` from `src/canonical.ts`.

- [ ] **Step 1: Write failing journal persistence and replay tests**

Add tests named:

```ts
test('receiver journal appends canonical JSONL and replays events in order', async () => {
  // append RECEIVED then DISPOSED; reopen and assert deep equality/order
});

test('received without disposition reconstructs as HELD', () => {
  // one RECEIVED event -> record.status === 'HELD'
});

test('admitted disposition reconstructs protected state and receipt', () => {
  // RECEIVED + DISPOSED(ADMIT) -> protected state equals stored protected_state_after
});

test('corrupt non-empty journal line fails closed', async () => {
  // valid line + malformed JSON line -> rejects /CORRUPT_RECEIVER_JOURNAL/
});

test('duplicate final disposition fails reconstruction', () => {
  // one crossing + two DISPOSED events -> throws /CONFLICTING_DISPOSITION/
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --experimental-strip-types test/receiver-journal.test.ts
```

Expected: FAIL because receiver modules/interfaces do not exist.

- [ ] **Step 3: Implement receiver-local types in `src/receiver/types.ts`**

Define the exact interfaces above. Keep journal events closed to `RECEIVED | DISPOSED`; `HELD` is a reconstructed receiver state, not a second persistence event.

- [ ] **Step 4: Implement `FileReceiverJournal` in `src/receiver/journal.ts`**

Requirements:

- serialize each event as `canonicalize(event) + '\n'`;
- append using a file handle opened in append mode;
- call `FileHandle.sync()` before close so a resolved append means the local journal record was durably handed to the filesystem;
- create parent directories when necessary;
- missing journal file reads as an empty event list;
- ignore one final empty line caused by the required trailing newline;
- reject any other empty/malformed non-final line as `CORRUPT_RECEIVER_JOURNAL`;
- validate parsed values are plain canonicalizable objects before casting to receiver events.

- [ ] **Step 5: Implement `stateRef()` and `reconstructReceiverState()` in `src/receiver/state.ts`**

`stateRef(value)` must return:

```text
relatte-local-state-v0:<sha256 hex of UTF-8 canonicalize(value)>
```

Replay rules:

- first `RECEIVED` for a crossing creates `HELD`;
- repeated `RECEIVED` may be tolerated only when `canonicalize(constructCrossingIdentityBody(crossing))` matches the already-recorded identity body; signature-byte differences alone are not a conflict;
- repeated `RECEIVED` with a different canonical identity body for the same ID throws `CROSSING_ID_CONFLICT`;
- `DISPOSED` without prior `RECEIVED` throws `ORPHAN_DISPOSITION`;
- second `DISPOSED` for the same crossing throws `CONFLICTING_DISPOSITION`;
- map `ADMIT → ADMITTED`, `REFUSE → REFUSED`, `RETURN → RETURNED` and reject mismatched persisted receipt kind/effect;
- require `receipt.crossing_id === event.crossing_id`;
- require `receipt.pre_state_ref === stateRef(currentProtectedState)` and `receipt.post_state_ref === stateRef(event.protected_state_after)`; otherwise throw `PERSISTED_STATE_REF_MISMATCH`;
- require REFUSE and RETURN `protected_state_after` to be canonically equal to the prior protected state;
- require ADMIT to produce a different state reference from the prior protected state;
- update projected protected state only from the single validated final `DISPOSED.protected_state_after`.

- [ ] **Step 6: Run focused journal tests and verify GREEN**

Run:

```bash
node --test --experimental-strip-types test/receiver-journal.test.ts
```

Expected: all tests in `receiver-journal.test.ts` PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/receiver/types.ts src/receiver/journal.ts src/receiver/state.ts test/receiver-journal.test.ts
git commit -m "feat: add reconstructible receiver journal"
```

---

### Task 2: Verified intake, durable RECEIVE, and idempotent HOLD

**Files:**
- Create: `src/receiver/runtime.ts`
- Modify: `src/index.ts`
- Create: `test/receiver-runtime.test.ts`

**Interfaces:**
- Consumes:
  - `verifyCrossingEnvelope(envelope: unknown): Promise<boolean>`
  - `FileReceiverJournal<S>`
  - `reconstructReceiverState(events, initialState)`
- Produces:
  - `interface ReceiverIdentity { worldId: string; receiverParticular: string; contractRef: string | null }`
  - `interface ReceiverOptions<S extends JsonValue> { journalPath: string; identity: ReceiverIdentity; keys: P256KeyMaterial; initialState: S; now?: () => string }`
  - `class ReceiverRuntime<S extends JsonValue> { static open<S extends JsonValue>(options: ReceiverOptions<S>): Promise<ReceiverRuntime<S>>; receive(envelope: unknown): Promise<ReceiverRecord<S>>; get(crossingId: string): ReceiverRecord<S> | undefined; getProtectedState(): S }`

- [ ] **Step 1: Write failing receive/HOLD tests**

Add:

```ts
test('valid signed crossing becomes durably HELD without semantic effect', async () => {
  // receive valid crossing
  // assert status === 'HELD'
  // assert protected state unchanged
  // reopen runtime and assert same HELD record exists
});

test('invalid signed crossing never enters receiver journal', async () => {
  // mutate signed crossing
  // receive rejects /INVALID_CROSSING/
  // reopen -> no record
});

test('duplicate delivery while HELD is idempotent', async () => {
  // receive same crossing twice
  // journal has one RECEIVED event
  // returned records are equivalent
});

test('equivalent re-signed crossing identity deduplicates despite signature-byte differences', async () => {
  // seal the same draft twice with the same key and timestamp
  // assert crossing_id matches
  // receive both and assert one RECEIVED event / one HELD record
});

test('same crossing id with a different identity body fails closed', async () => {
  // construct a hostile persisted fixture rather than relying on a hash collision at runtime
  // assert /CROSSING_ID_CONFLICT/
});
```

- [ ] **Step 2: Run the focused runtime tests and verify RED**

Run:

```bash
node --test --experimental-strip-types test/receiver-runtime.test.ts
```

Expected: FAIL because `ReceiverRuntime` does not exist.

- [ ] **Step 3: Implement `ReceiverRuntime.open()`, `get()`, and `getProtectedState()`**

`open()` must read all journal events, re-verify every persisted `RECEIVED.crossing`, re-verify every persisted `DISPOSED.receipt`, confirm each receipt names `identity.worldId` and `identity.receiverParticular`, and only then reconstruct the projection. Reject failures with `INVALID_PERSISTED_CROSSING`, `INVALID_PERSISTED_RECEIPT`, or `RECEIVER_IDENTITY_MISMATCH` as appropriate.

Projection replay then enforces the signed pre/post state-reference links, so tampered `protected_state_after` fails with `PERSISTED_STATE_REF_MISMATCH`.

`getProtectedState()` returns the current reconstructed protected JSON state without mutation.

- [ ] **Step 4: Implement `receive(envelope)`**

Required order:

1. `await verifyCrossingEnvelope(envelope)`;
2. reject false with `INVALID_CROSSING`;
3. read `crossing_id` from the verified object;
4. if an existing record is present, compare `canonicalize(constructCrossingIdentityBody(envelope))` with the stored crossing identity body:
   - equivalent identity body -> return existing record without append, even when valid signature bytes differ;
   - different identity body -> throw `CROSSING_ID_CONFLICT`;
5. append one `RECEIVED` event using injected `now()` or current UTC timestamp;
6. update/rebuild the local projection;
7. return the resulting `HELD` record.

No disposition callback runs during `receive()`.

- [ ] **Step 5: Export receiver API from `src/index.ts`**

Add exports for the receiver types, journal/state helpers required by tests, and `ReceiverRuntime`.

- [ ] **Step 6: Run runtime tests and existing identity/signing tests**

Run:

```bash
node --test --experimental-strip-types test/receiver-runtime.test.ts
node --test --experimental-strip-types test/identity.test.ts test/signing.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/receiver/runtime.ts src/index.ts test/receiver-runtime.test.ts
git commit -m "feat: add verified receiver intake and hold"
```

---

### Task 3: Owner-local disposition, protected-state boundary, and signed receipts

**Files:**
- Modify: `src/receiver/types.ts`
- Modify: `src/receiver/runtime.ts`
- Modify: `test/receiver-runtime.test.ts`

**Interfaces:**
- Produces:
  - `type DispositionDecision<S extends JsonValue> = { kind: 'ADMIT'; nextState: S; note?: string | null } | { kind: 'REFUSE'; note?: string | null } | { kind: 'RETURN'; descendantRefs: string[]; note?: string | null }`
  - `type DispositionAdapter<S extends JsonValue> = (input: { crossing: Readonly<Record<string, unknown>>; protectedState: Readonly<S> }) => DispositionDecision<S> | Promise<DispositionDecision<S>>`
  - `ReceiverRuntime.dispose(crossingId: string, decide: DispositionAdapter<S>): Promise<ReceiverRecord<S>>`
- Consumes:
  - `sealReceipt(draft, keys)`
  - `stateRef()`

- [ ] **Step 1: Write failing disposition tests**

Add:

```ts
test('ADMIT changes protected state once and emits a verifiable ADMITTED receipt', async () => {
  // receive -> dispose ADMIT
  // assert state changed
  // assert receipt.kind === 'ADMITTED'
  // assert receipt.semantic_effect === 'local-state-change'
  // assert receipt pre/post refs match stateRef()
  // assert verifyReceipt(receipt) === true
});

test('REFUSE emits REFUSED receipt and preserves protected state exactly', async () => {
  // deep snapshot before
  // dispose REFUSE
  // assert deepEqual after
  // semantic_effect === 'none'
});

test('RETURN emits RETURNED receipt and preserves protected state', async () => {
  // return with one descendant ref
  // semantic_effect === 'return-created'
  // protected state unchanged
});

test('disposition callback failure leaves crossing HELD and appends no DISPOSED event', async () => {
  // callback throws
  // assert rejection
  // runtime record remains HELD
  // reopen and assert HELD
});

test('disposing an unknown crossing fails', async () => {
  // assert /UNKNOWN_CROSSING/
});

test('ADMIT requires an actual protected-state change', async () => {
  // ADMIT with canonically identical nextState rejects /ADMIT_REQUIRES_STATE_CHANGE/
  // crossing remains HELD
});

test('RETURN requires at least one explicit descendant ref', async () => {
  // RETURN with [] rejects /RETURN_REQUIRES_DESCENDANT/
  // crossing remains HELD
});
```

- [ ] **Step 2: Run disposition tests and verify RED**

Run:

```bash
node --test --experimental-strip-types test/receiver-runtime.test.ts
```

Expected: new disposition tests FAIL.

- [ ] **Step 3: Add `DispositionDecision` and `DispositionAdapter` to `src/receiver/types.ts`**

Keep the adapter deliberately bounded:

- `ADMIT` must provide the complete next protected JSON state;
- `REFUSE` cannot provide a next state;
- `RETURN` cannot provide a next state and must provide a non-empty explicit `descendantRefs` array;
- `ADMIT` must change the canonical protected-state reference or reject with `ADMIT_REQUIRES_STATE_CHANGE`;
- callers do not choose `ReceiptV0.semantic_effect`; runtime derives it from disposition.

- [ ] **Step 4: Implement `ReceiverRuntime.dispose()`**

Required behavior:

1. locate existing record or throw `UNKNOWN_CROSSING`;
2. if already final, return the established record without calling `decide`;
3. capture current protected state and pre-state ref;
4. invoke `decide` with read-only crossing/state values;
5. validate the decision and derive:
   - `ADMIT → kind: 'ADMITTED', semantic_effect: 'local-state-change', protected_state_after = nextState`; require a changed state ref;
   - `REFUSE → kind: 'REFUSED', semantic_effect: 'none', protected_state_after = prior state`;
   - `RETURN → kind: 'RETURNED', semantic_effect: 'return-created', protected_state_after = prior state`; require at least one descendant ref;
6. compute post-state ref from `protected_state_after`;
7. build a `ReceiptV0` draft with:
   - `crossing_id`;
   - `world_id = identity.worldId`;
   - `receiver_particular = identity.receiverParticular`;
   - derived `kind` and `semantic_effect`;
   - `contract_ref = identity.contractRef`;
   - pre/post state refs;
   - `descendant_refs = decision.descendantRefs ?? []`;
   - `residual_refs = []`;
   - note or null;
   - injected/current timestamp;
   - empty extensions;
8. `await sealReceipt(draft, keys)`;
9. append exactly one `DISPOSED` event containing the signed receipt and `protected_state_after`;
10. only after durable append succeeds, update/rebuild in-memory projection and return final record.

This ordering makes the local journal commit the R3 semantic effect boundary. There is no external side effect to become orphaned.

- [ ] **Step 5: Run disposition tests and verify GREEN**

Run:

```bash
node --test --experimental-strip-types test/receiver-runtime.test.ts
```

Expected: all receiver runtime tests PASS.

- [ ] **Step 6: Run the protocol regression tests**

Run:

```bash
node --test --experimental-strip-types test/identity.test.ts test/signing.test.ts
```

Expected: all existing R1/R2 tests PASS unchanged.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/receiver/types.ts src/receiver/runtime.ts test/receiver-runtime.test.ts
git commit -m "feat: add local receiver dispositions"
```

---

### Task 4: Hostile restart, replay, and authority fixtures

**Files:**
- Create: `test/receiver-hostile.test.ts`

**Interfaces:**
- Consumes:
  - public receiver API from Tasks 1–3.
- Produces:
  - executable hostile proof for issue #7 acceptance criteria.

- [ ] **Step 1: Write the Creepy Charlie authority test**

```ts
test('Creepy Charlie: known valid signer can still be refused by current local law', async () => {
  // seal a valid crossing from a known source
  // receive successfully
  // local decide function returns REFUSE because current authority is absent
  // assert REFUSED + semantic_effect none + protected state unchanged
});
```

- [ ] **Step 2: Write restart/idempotence tests**

Add:

```ts
test('HELD survives restart without implicit admission', async () => {
  // receive only, reopen same journal, status remains HELD
});

test('ADMITTED survives restart and duplicate delivery does not rerun disposition', async () => {
  // admit, reopen, receive same crossing, call dispose with callback that would throw if invoked
  // established ADMITTED record/receipt returns unchanged
});

test('reopen rejects JSON-valid tampering of protected_state_after', async () => {
  // alter stored protected_state_after while leaving signed receipt unchanged
  // open rejects /PERSISTED_STATE_REF_MISMATCH/
});

test('duplicate delivery before and after restart produces one protected-state transition', async () => {
  // counter-like JSON state from 0 -> 1
  // duplicates never reach 2
});
```

- [ ] **Step 3: Write refusal and Gardeners/cloud pressure tests**

Add:

```ts
test('refusal journal bookkeeping does not alter protected semantic state', async () => {
  // canonicalized protected state before === after refusal
});

test('recognized external administrator does not bypass owner-local disposition', async () => {
  // crossing metadata may claim/mention an administrator in extensions
  // receiver still invokes local decision and may REFUSE
});

test('receiver reconstructs locally with no cloud coordinator present', async () => {
  // all state/receipt recovery comes only from local journal path
});
```

The Gardeners/cloud fixture must remain narrative pressure only; do not implement group semantics.

- [ ] **Step 4: Run hostile tests and verify RED/GREEN honestly**

Run before any needed implementation fix:

```bash
node --test --experimental-strip-types test/receiver-hostile.test.ts
```

If any test fails, fix the owning runtime/journal behavior minimally and rerun until PASS. Do not weaken hostile assertions to fit implementation.

- [ ] **Step 5: Run all receiver tests**

```bash
node --test --experimental-strip-types test/receiver-*.test.ts
```

Expected: all receiver tests PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add test/receiver-hostile.test.ts src/receiver
git commit -m "test: pressure-test sovereign receiver semantics"
```

Only include `src/receiver` files in this commit if hostile tests required a real behavior fix.

---

### Task 5: Publish the bounded R3 profile and earn roadmap status

**Files:**
- Create: `spec/RECEIVER-RUNTIME-PROFILE-V0.md`
- Modify: `docs/ROADMAP.md`
- Verify only: `schemas/crossing-envelope-v0.schema.json`
- Verify only: `schemas/receipt-v0.schema.json`
- Verify only: `schemas/organ-contract-v0.schema.json`

**Interfaces:**
- Consumes: executable evidence from Tasks 1–4.
- Produces: documentation that states only what those tests prove.

- [ ] **Step 1: Write `spec/RECEIVER-RUNTIME-PROFILE-V0.md`**

Document:

- local append-only journal is implementation-local, not protocol canon;
- `RECEIVED` journal event projects to `HELD` until disposed;
- owner-local `ADMIT | REFUSE | RETURN`;
- exact ReceiptV0 mapping:
  - `ADMIT → ADMITTED / local-state-change`;
  - `REFUSE → REFUSED / none`;
  - `RETURN → RETURNED / return-created`;
- idempotence key `(receiver identity, crossing_id)`;
- restart reconstruction;
- local state-ref construction;
- corruption/fail-closed behavior;
- semantic effect is deliberately bounded to local JSON state in R3;
- explicit non-goals: R4 two-node behavior, transport, cloud, group/admin semantics, generalized policies/capabilities.

- [ ] **Step 2: Update the R3 section of `docs/ROADMAP.md`**

Add a `Current bounded proof` subsection only for facts demonstrated by tests.

Do not claim R4 or general substrate status.

- [ ] **Step 3: Verify schema files are unchanged from the implementation branch base**

Run:

```bash
git diff --exit-code <implementation-base-sha> --   schemas/crossing-envelope-v0.schema.json   schemas/receipt-v0.schema.json   schemas/organ-contract-v0.schema.json
```

Expected: exit 0 and no diff.

Record the actual implementation base SHA in the PR body.

- [ ] **Step 4: Run the complete repository gate**

Run:

```bash
npm run verify
```

Expected:

- `tsc --noEmit` exits 0;
- all `node:test` suites pass with 0 failures;
- `tsc` build exits 0.

- [ ] **Step 5: Review the issue #7 acceptance criteria against executable evidence**

Check each criterion directly against a named test or verification output. If a criterion is not proven, either add the missing proof or leave the roadmap claim unearned.

- [ ] **Step 6: Commit Task 5**

```bash
git add spec/RECEIVER-RUNTIME-PROFILE-V0.md docs/ROADMAP.md
git commit -m "docs: record bounded R3 receiver proof"
```

---

## Whole-branch verification before PR

Run fresh, from the implementation branch head:

```bash
npm run verify
git diff --exit-code <implementation-base-sha> --   schemas/crossing-envelope-v0.schema.json   schemas/receipt-v0.schema.json   schemas/organ-contract-v0.schema.json
git status --short
```

Then inspect the complete diff and confirm:

- receiver code only implements the R3 local seam;
- no hidden group/cloud/policy subsystem entered scope;
- no v0 schema was widened;
- receipt signing still routes through existing protocol code;
- `REFUSE` and `RETURN` preserve protected state;
- duplicate/restart tests prove one semantic consequence at most;
- docs do not claim more than executable tests establish.

## Expected implementation branch

After this plan is approved, create an isolated execution branch/worktree from `spec/r3-sovereign-receiver` so the approved design and plan travel with the implementation:

```text
feat/r3-sovereign-receiver
```

Do not implement directly on `main` or on PR #6.
