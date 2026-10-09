# RELATTE-VM-002 — The Executable World

**Status:** bounded executable experiment, stacked on [RELATTE-VM-001](./RELATTE-VM-001.md).  
**Scope:** actual WebAssembly machine-code execution in fresh, separate OS processes on one CI host; not production isolation or independent physical nodes.

## What changes after 001

001 proved self-describing bounded interpreters and a signed reconstruction proposal with fresh admission.

002 binds an independently verifiable **binary WebAssembly artifact** to that description.

    VM-001 manifest (self_ref -> manifest ID)
        |
        v
    signed RELATTE_VM_BOOT_CANDIDATE (history + manifest)
        |
        v
    WASM package (self_ref -> package ID; fixed bytes digest + execution bounds)
        |
        v
    signed RELATTE_WASM_VM_CANDIDATE
        - explicit parent crossing reference
        - exact module content hash
        - exact package content hash
        - same signing key as VM-001 candidate
        - requested_grants = []
        - inherited_authority = false
        |
        v
    foreign LocalReceiver R3 RECEIVE (signed; no execution permission)
        |
        v
    foreign LocalReceiver R3_ADMIT (signed; relatte-wasm-vm-launch)
        |
        v
    host-pinned public-key verification (not from candidate)
        |
        v
    live LocalReceiver.open() journal replay + same R3_ADMIT
        |
        v
    separate Node OS process running WebAssembly no-imports module
        |
        v
    observed { pid, result } returned to parent
        |
        v
    process dies; signed history and bytes remain independently verifiable

## Executable interface

The 002 specimen deliberately uses only one export:

    step(i32 left, i32 right) -> i32

The binary fixture implements `left + right`. A separate hostile fixture implements
an infinite loop, demonstrating host-enforced termination.

This narrow export is intentional. It distinguishes real binary execution from an
unsupported assertion that a complete VM or arbitrary software is safely sandboxed.

## Host controls

- WebAssembly binary size: maximum 4 KiB.
- WebAssembly binary header and section lengths checked.
- Import, table, memory, start, element, data, data-count, and tag sections rejected.
- Runtime WebAssembly module must have **zero imports**.
- Runtime WebAssembly module exports exactly one function called `step`.
- No WASI, filesystem, socket, process, clock or entropy imports.
- Host supplies the complete worker JavaScript; the guest cannot supply JS.
- Child process is launched using the current Node executable in a separate process ID.
- Per-package wall-time deadline: 200–5000 ms, enforced by parent using SIGKILL.
- V8 old-space flag: 32 MiB; **not** a guaranteed whole-process RSS limit.
- Stdout/stderr limits: 4 KiB per stream.
- Inputs and output must satisfy signed 32-bit integer contract.
- Fresh successor runtime identity; explicitly no inherited grants.
- Each launch must reopen a live owner-local receiver journal and find the exact
  signed RECEIVE / R3_ADMIT receipts for the same crossing. An archived receipt
  detached from a dead host cannot launch execution.
- Guest execution outputs are *observations returned by the worker*, not cryptographically
  attested CPU measurements or automatically authorized world state.

These constraints reduce the exposed surface. They do **not** imply a hardened
untrusted-code sandbox, Linux namespace isolation, seccomp/cgroups, virtualization
security, distributed scheduling, or a protected supply chain.

## Cold reconstruction

The test writes the self-reference manifest, signed parent candidate, package,
signed executable candidate, binary bytes and local admission receipts to an
archive file. It then terminates the source VMs and deletes the receiving
host's private root. The archived public evidence remains verifiable but is
**not** sufficient to execute. A newly constructed, independent receiving host
must perform fresh RECEIVE and R3_ADMIT before the identical WASM may execute
in another process under a distinct runtime identity.

The owner public key in the verifier's arguments is an **out-of-band trust anchor**.
If callers let an attacker select it, receipt signature verification no longer
proves *which owner* admitted the execution.

## Hostile cases

- mutation of self-addressed package parameters;
- substitution of executable bytes or manifests;
- signed attempt to claim inherited authority/admin grants;
- guest-forged local receiver ADMIT receipt;
- HOLD without admission;
- mismatch of host trust anchor;
- attempts to boot from valid archived admission receipts after original host root deletion;
- reuse of predecessor world/particular/runtime;
- out-of-range inputs and invalid WASM sections;
- infinite-loop WASM termination without taking down host process;
- healthy execution after hostile guest termination.

## Run

From repository root:

    npm install
    npm run verify

Or for this experiment alone:

    node --test --experimental-strip-types test/wasm-vm.test.ts

The test uses two local receiver identities and distinct child process PIDs.
No separate physical computer, cross-network transport or external VM service is
used by VM-002 itself.

## Boundary laws

    PROGRAM != PERMISSION
    SIGNATURE != AUTHORITY
    DESCRIPTION != EXECUTION
    EXECUTABLE BYTES != EXECUTION AUTHORIZATION
    RECEIVE != ADMIT
    ADMIT != UNIVERSAL CANON
    PROCESS != WORLD IDENTITY
    SURVIVING ARTIFACT != INHERITED PRIVILEGE
    OBSERVED RESULT != CRYPTOGRAPHIC REMOTE ATTESTATION

## Next candidate: 003

- Bind a signed owner-local execution receipt to the admitted executable digest,
  process run, input/output and bounded resource evidence.
- Move from single-host two-process execution to two **independent** machines
  exchanging bytes and crossings over the reLATTE transport.
- Add genuinely OS-enforced memory/process limits (cgroups/seccomp/namespaces
  on Linux or equivalent) and trusted measured execution, where possible.
- Add an owner-local revocation/policy epoch: the current experiment requires
  a live journal with ADMIT, but R3 has no grant-expiration primitive.
- Add a stable, exportable machine representation capable of executing a wider
  reLATTE organ API without granting the guest arbitrary host capabilities.
