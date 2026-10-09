# RELATTE-VM-001 — The Machine That Carries Itself

**Status:** Bounded executable experiment. Not a conventional hypervisor or secure arbitrary-code sandbox.

## Hypothesis

A reLATTE composition can carry a complete finite description of the rules needed
to instantiate an equivalent bounded executor, including a reference to that same
description, without inheriting the authority to admit itself elsewhere.

The self-reference is content-addressed, not infinitely nested JSON:

    manifest_id = H(domain || JCS(manifest_body))
    self_ref = manifest_id

Every instance has its own world, particular, runtime ID, step budget, depth,
history and local state. Instances may share an identical governing manifest ID.

## The runnable seam

`src/vm.ts` supplies:

1. `createVmManifest` / `verifyVmManifest` — pinned interpreter identity,
   finite self-reference, immutable bounds and laws.
2. `RelatteVm` — tiny bounded interpreter: INCREMENT and SPAWN_GUEST.
   Guest inherits a **description**, not host keys, access or admission.
3. `verifyVmTrace` — cold deterministic verification of hash-linked actions.
4. `proposeSelf` — reuses existing P-256 signed reLATTE CrossingEnvelope v0
   and content hash of the complete manifest.
5. `verifyVmCandidate` — verifies the crossing, actual manifest content,
   engine identity, exact trace hash, and absence of inherited grants.
6. `verifyVmAdmission` — verifies separate owner RECEIVED and R3_ADMIT
   receipts, the owner/world/contract, same crossing, pinned independent
   owner public key and explicit `relatte-vm-boot` effect.
7. `bootAdmittedVm` — fresh runtime identity; a new zeroed execution journal
   with the predecessor's signed public trace retained as evidence.

### Executable sequence

    VM A (manifest M, runtime A)
       increment
       SPAWN_GUEST
           VM B (manifest M, runtime B, independent identity)
               increment
               increment
               SIGN candidate(M, trace_B, requested_grants=[])
    VM owner C (separate receiver identity + key)
       verify manifest bytes and crossing signature
       RECEIVE          # nothing admitted yet
       owner-local ADMIT # signed, separate consequential act
    VM A and B terminate
    offline verifier replays evidence from archived public artifacts
    VM A' boots (manifest M, fresh runtime identity, state=0)

`M` is exactly the same across A, B, and A'. The runtime identity and
local execution history are not.

## Hostile cases

The test suite requires:

- self-reference mutation denied;
- an actually signed candidate asking for owner-admin grants denied;
- an actually signed claim of inherited authority denied;
- RECEIVE/HOLD without ADMIT cannot boot;
- guest-forged host ADMIT receipt cannot boot (host key is externally pinned);
- wrong receipt/crossing pairs denied;
- wrong receiver world denied;
- manifest substitution denied;
- altered historical trace denied, even if candidate is re-signed;
- replay with old world, particular or runtime denied;
- depth and step budgets enforced;
- dead runtimes cannot execute or propose.

## Ownership boundary

This executable specimen reuses reLATTE's existing signed envelopes, signed
receipts and LocalReceiver. It does not replace the normative R3 receiver.

The `owner.public_key` supplied to verification must come from independent
host trust, **not** from the candidate or a freely chosen receipt. A valid
signature alone is neither truth nor permission.

`RelatteVm` itself has no access to the owner's private key and never performs
its own R3 admission. Any caller holding actual LocalReceiver authority can
make a local disposition, but cannot be compelled by the guest to do so.

## Scope and limitations

- This is a proof of a **bounded interpreter and self-description**, not full
  reLATTE running recursively as a native OS, virtual CPU, WebAssembly VM,
  QEMU guest, or isolated operating-system process.
- The trace is signed as part of the candidate crossing, but it demonstrates
  reproducible *claimed interpreter actions*, not independent measurement of
  arbitrary guest code. A guest holding its own key may sign dishonest claims.
- The hosted successor starts a **fresh runtime**, not an identical continuity
  of private state, identity, resources, capabilities or authorizations.
- This experiment uses the existing LocalReceiver's local R3 semantics. A
  production VM launch must also bind owner policy, approval authority, actual
  artifact custody, process isolation, resource metering, and fresh owner-local
  capability issuance at execution time.
- Prototype histories are held in memory until signed into a crossing and
  archived in the test. This is not a durable execution log until then.
- The reference verifier checks signed admission evidence, but it is not a
  substitute for the receiver's complete persistent journal/replay audit.

## Reproduce

    npm install
    npm run verify

Specifically:

    node --test --experimental-strip-types test/vm.test.ts

## Constitutional invariants

    DESCRIPTION != EXECUTION
    REPRODUCTION != ADMISSION
    CHILD != PARENT AUTHORITY
    SIGNED != TRUE
    HISTORY != CURRENT GRANT
    HOST ADMISSION != GUEST PROPOSAL
    SUCCESSOR != PREDECESSOR
    SELF-REFERENCE != SELF-SOVEREIGNTY

## Next door

RELATTE-VM-002 could bind an independently verified, immutable executable
artifact (for example a WASM module) to this manifest, route its execution
through an out-of-process resource-limited host, and test the same death and
owner-local admission guarantees across two actually separate physical nodes.
R12 Mortality remains the source of the existing full receipt/checkpoint
succession contract. This experiment does not duplicate that protocol.
