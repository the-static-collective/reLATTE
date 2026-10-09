# RELATTE-VM-003 — The Witnessed Machine

**Status:** executable experimental slice, stacked on VM-002 and VM-001.  
**Code:** `src/wasm-witness.ts`; tests: `test/wasm-witness.test.ts`.  
**Distributed CI:** `.github/workflows/relatte-vm-003.yml`.

## New capability

A constrained no-import WebAssembly module is already content-addressed and admitted by a separate reLATTE owner under VM-002.

VM-003 makes an *observed execution* into an independently checkable, attributable signed receipt.

```
signed VM-001 candidate
  -> signed VM-002 module candidate + exact WASM bytes
  -> independent host receiver RECEIVE + R3_ADMIT
  -> reopen and replay LIVE host receiver journal
  -> run WASM in distinct process, with host deadline
  -> collect PID, result, host-observed elapsed time
  -> distinct local execution witness key signs Receipt v0
  -> archive publicly verifiable receipt + immutable evidence
  -> third verifier verifies all links without running guest
```

The receipt kind is `R15_VM_EXECUTION_WITNESS`. This is a specimen designation, **not** a claim that the normative reLATTE protocol has advanced to release R15.

### Required signed bindings

The receipt identity binds the *same* VM-002 signed candidate crossing ID, local owner world and particular, and owner admission receipt. Its `extensions.vm003` binds:

- original self-addressed interpreter manifest ID;
- WASM package ID, WASM SHA-256 digest, parent crossing ID;
- local signed RECEIVE and R3_ADMIT receipt IDs;
- distinct host-chosen execution nonce and runner label;
- fresh successor world, particular and runtime IDs;
- child OS PID;
- input vector and domain-separated canonical input hash;
- host-observed output and separately domain-separated output hash;
- claimed host wall-clock duration;
- VM-002 declared timeout and V8 *old-space flag*, not an RSS bound;
- an empty inherited-grant set and explicit non-admission flag.

The receipt is signed by a **separate execution-witness P-256 key**, not by the guest source key or LocalReceiver's owner key. The caller supplies this host-controlled key for a run. The cold verifier demands an externally **pinned witness public key**, checks the existing owner admission evidence and both guest crossing signatures, checks exact fields, refuses cross-wired receipts, and verifies the witness signature.

Signed does not imply measured truth: a malicious host could sign a fictional PID, duration, or result. The verifier attests that a particular key *reported* these values, **not** that hardware independently measured or executed them.

### No authority laundering

A VM-003 receipt has `semantic_effect: none`, never `R3_ADMIT`. It cannot authorize a new execution. VM-002 still reopens the owner-local receiver history and requires that the candidate be currently admitted. If that host root is deleted, the historical VM-003 receipt remains cryptographically verifiable but no new run can launch from it. A successor host must make fresh RECEIVE and R3_ADMIT decisions under fresh keys.

### Two-runner GitHub Actions witness

Workflow `RELATTE-VM-003 witnessed two-runner execution` uses four jobs:

1. **source** signs and publishes only the candidate, self-description and WASM bytes;
2. **runner-a** admits them under owner A, actually executes WASM in a child process, signs a witness and publishes only public evidence;
3. **runner-b** separately admits the identical bytes under owner B and signs an independent execution witness;
4. **verifier** downloads both public artifacts, verifies all crossing/receipt signatures, candidate bytes, distinct owner and witness keys, source relations and identical input/output commitments. It publishes a third verification artifact.

No private keys are transferred between jobs. Private receiver roots are destroyed after execution.

**Boundary:** jobs are distinct GitHub-hosted runners, *not independently attested physical computers*. GitHub manages runner allocation. A signed public key in a job artifact is not independently certified as belonging to a particular human, organization or physical node. CI artifact provenance is a workflow provenance claim; deployments need an external trust registry and authenticated transport.

### Reproduction

```bash
npm install --ignore-scripts
npm run verify
node --test --experimental-strip-types test/wasm-witness.test.ts
```

Manual exchange across actually separate computers, each running Node 24 with the same checked-out code:

```bash
# Source computer: create only the public carrier
node --experimental-strip-types scripts/wasm-two-runner-003.mjs prepare /tmp/vm003-source

# Transfer /tmp/vm003-source/candidate.json to both host computers.
# Host A (local owner journal, keys and process):
node --experimental-strip-types scripts/wasm-two-runner-003.mjs host candidate.json /tmp/vm003-a runner-a

# Host B, independently (same input carrier, separate local private keys):
node --experimental-strip-types scripts/wasm-two-runner-003.mjs host candidate.json /tmp/vm003-b runner-b

# Independent verifier: receive carrier + only the two public witness.json artifacts:
node --experimental-strip-types scripts/wasm-two-runner-003.mjs verify candidate.json a-witness.json b-witness.json
```

In an actual deployment, separately establish and pin *which* owner and witness keys each host is authorized to use, before interpreting these signed reports as trustworthy evidence. The example CLI relies on runner/artifact provenance; it does not supply an authenticated networking layer.

## Hostile cases

- forged receiver or witness signature;
- mutation of reported result, resources or inherited grants;
- swapped owner/admission receipts;
- wrong or substituted pinned signer;
- mutated WASM binary bytes;
- reuse of a single signed witness as two independent ones;
- attempted execution after owner-local receiver death;
- digest changes and out-of-range inputs;
- VM-002's already proved infinite-loop host deadline.

## Strictly unearned capabilities

This does **not** establish a physical two-machine field deployment, secure isolation of hostile guests, tamper-resistant measured computation, exact energy/cost accounting, cryptographic remote attestation, host identity certification, authenticated cross-network transport, or revocation/expiry of a previously granted R3 ADMIT.

The execution witness is a meaningful provenance step precisely because these unknowns stay explicit.

## Constitutional laws

```
EXECUTION WITNESS != EXECUTION PERMISSION
SIGNED REPORT != HARDWARE ATTESTATION
ONE RUNNER JOB != DISTINCT PHYSICAL MACHINE
RESOURCE REPORT != INDEPENDENT MEASUREMENT
COLD VERIFICATION != LIVE ADMISSION
SUCCESSOR != PREDECESSOR
DUPLICATED RESULT != SHARED SOVEREIGNTY
```

## 004 frontier

An authenticated two-host transport handshake with pinned owner/witness keys,
a signed execution plan, leased single-use run capabilities with explicit expiry,
resource accounting recorded by the host, and separate contradictory observer receipts.
Only then pursue physical Static Computer nodes with durable hardware custody.
