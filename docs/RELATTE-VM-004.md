# RELATTE-VM-004 — The Sovereign Handshake

**Status:** Executable **offline file-transport** prototype, stacked on VM-003 / VM-002 / VM-001.  
**Source:** `src/vm-lease.ts`  
**Operator CLI:** `scripts/vm004-peers.mjs`  
**Hostile tests:** `test/vm-lease.test.ts`  
**CI:** `.github/workflows/relatte-vm-004.yml`

## Executable proposition

A source node can send a cryptographically attributable, content-bound request
to run a VM-002 WebAssembly artifact on a separate sovereign host.

The receiving host can independently decide to RECEIVE and R3_ADMIT it, sign a
bounded short-lived **one-use execution grant**, consume that grant in an
owner-local atomic ledger, execute it under the VM-002 subprocess restrictions,
and sign host-reported resource evidence that a cold verifier can validate.

The sender can never substitute its own signature for receiver admission.

```
A: immutable VM-002 candidate
   |
   A signed OFFER -> candidate, exact package digest, nonce,
   |                 B world/key, inputs and bounded expiry
   v
B: independently pinned A key + local B secret
   |
   B signed ACK -> acknowledgement only (no execution)
   |
   B private R3 RECEIVE + R3_ADMIT with local signing key
   |
   B signed GRANT -> B key, admission ID, nonce, inputs,
   |                    not-before/expiry, maximum uses = 1
   |
   B checks current owner journal + local clock
   |
   B atomically consumes nonce on its own filesystem
   |
   B executes WASM in a separate child process
   |
   B's independent witness key signs VM-003 report
   |
   B signs VM-004 USAGE -> grant, witness, input/output digests,
   |                         wall time, resource claim, zero grants
   v
C: offline verify all signatures, hashes and bound parties
```

### Admission is not execution

The ACK and GRANT are standalone signed Receipt v0 artifacts with
`semantic_effect: none`. Neither is the receiver's R3 ADMIT receipt.

Only the receiver itself can create its signed R3 ADMIT via its LocalReceiver
private key. VM-002 requires a currently replayable local journal.

### Expiring single-use authorization

- Offer age: signed start/end, maximum 1 hour.
- Execution grant: signed start/end, maximum 5 minutes, and cannot outlive offer.
- Process launch uses the host's **current local system clock**, rather than
  a timestamp supplied by the guest/caller.
- Grant binds the exact offered candidate, owner ADMIT ID, OFFER ID, ACK ID,
  input digest and nonce.
- `max_uses = 1`.
- Host must atomically create `<receiver-root>/vm004-spent/<nonce-hash>.json`
  using an exclusive-create filesystem operation before starting work.
- Concurrent attempts on the same owner root result in exactly one accepted
  claim. A crash after the claim **burns the grant**; it never silently retries.
- Destroying the original host's LocalReceiver root prevents use of its
  historical grant even if public signed receipts survive.
- The ledger is **local**, not a distributed consensus service. Cloned
  receiver roots or administrators who delete the spent directory can replay
  grants elsewhere. Real deployments need filesystem integrity, safe
  permissions, authenticated persistent host identity, and a nonce-spent
  ledger resistant to rollback.

### Attributed resource reports

VM-003 signs the worker-observed runtime/output using a separate
execution-witness key. VM-004 signs a second B-host **usage receipt** binding:

- the grant receipt ID;
- nonce-claim commitment;
- VM-003 witness receipt ID;
- canonical input and output digests;
- reported elapsed wall time;
- an explicit statement that the report is host-observed, not independent
  hardware metering.

Cold verification checks both signatures, links, and recipient identity.
The output and wall clock are *reported observations*. Two different keys
under one host administration do **not** constitute an independently
trusted physical measurement. It is not yet an energy meter, bill, service
level guarantee, third-party attestation, or payment instruction.

## Actually operating across two computers

Node 24, a checkout of the same experimental branch, and `npm install --ignore-scripts`
are needed on each computer. The CLI uses **files as the transport**; copy
these by USB, scp, removable storage, or another channel. The channel may be
untrusted because payloads are signed and content-addressed; HOWEVER peer
identity fingerprints must be compared using an independent trusted path
before using them for authorization.

Use separate private directories for A and B.

**On A — create the program carrier:**

```bash
node --experimental-strip-types scripts/vm004-peers.mjs prepare ./candidate.json
```

**On B — enroll this host; keep the private root on B:**

```bash
node --experimental-strip-types scripts/vm004-peers.mjs enroll ./private-b ./recipient-card.json
```

Transfer `recipient-card.json` to A and confirm its
`recipient_public_fingerprint` with B via another channel.

**On A — sign the offer to the enrolled B key:**

```bash
node --experimental-strip-types scripts/vm004-peers.mjs offer ./candidate.json ./recipient-card.json ./private-a ./offer-out
```

Transfer `candidate.json`, `offer-out/offer.json` and
`offer-out/sender-card.json` to B. The sender must independently tell B
its printed `sender_public_fingerprint`, which is **not** authoritative if
merely copied from the same untrusted transfer.

**On B — verify A's pinned signing key; ACK, admit and execute:**

```bash
node --experimental-strip-types scripts/vm004-peers.mjs receive ./candidate.json ./offer.json ./sender-card.json ./private-b "sha256:EXPECTED_SENDER_FINGERPRINT" ./public-run
```

B produces `public-run/public-run.json`, containing only public signed
receipt evidence. The receiver's peer private key and LocalReceiver keys
remain under `private-b`.

**On A or an independent verifier — cold-verify using BOTH separately pinned
peer fingerprints:**

```bash
node --experimental-strip-types scripts/vm004-peers.mjs verify ./candidate.json ./offer.json ./sender-card.json ./recipient-card.json ./public-run.json "sha256:EXPECTED_SENDER_FINGERPRINT" "sha256:EXPECTED_RECIPIENT_FINGERPRINT"
```

The offline verification does not require the dead source or receiver process,
private key, or the original local journal. It verifies *evidence* but does not
authorize another execution.

## GitHub CI coverage

`RELATTE-VM-004 file-transport handshake` exercises the same CLI end to
end in one hosted runner with separately stored local private roots. Only
selected public artifact files are uploaded, and the private roots are
created under `RUNNER_TEMP`. VM-003 retains its earlier multi-runner
signed execution demonstration.

**Important difference:** VM-004 CI is a *one-runner emulator of the
two-machine file handoff*. It is not a live socket/TLS exchange or a proof
that two physically distinct Static Computers exchanged messages.
The manual operator procedure can be carried out on two actual computers,
but that deployment has not been performed or verified by this repository.

## Hostile proofs

- sender or receiver key mismatch;
- validly signed escalation of `max_uses` or inherited grants;
- cross-wired ACK, offer and admission;
- forged recipient grant with attacker key;
- forged or modified signed resource reports;
- early and expired execution despite valid signatures;
- one-success/one-denial under a racing two-caller replay;
- fresh cold historical verification after owner root removal;
- execution denial after owner root removal;
- identical program bytes with independent owner-local decisions.

## Current unearned claims

- secure peer discovery or publicly certified organizational identities;
- encrypted live network transport, NAT traversal, automatic enrollment or TLS;
- trusted wall clock resistant to rollback;
- rollback-proof/distributed spent-grant database;
- hardened OS isolation against a hostile VM;
- verifiable electricity, carbon, bandwidth, RSS or CPU-time measurements;
- remote hardware attestation, actual independent resource observer or
  distributed settlement;
- specific time-of-use limits enforced after child spawn (VM-002 has an
  independent subprocess timeout but grant expiry is checked **before** run);
- general-purpose remote code hosting.

These are deliberate future requirements, not inferred successes.

## Laws

```
OFFER != ADMISSION
ACK != APPROVAL
ADMISSION != UNLIMITED GRANT
GRANT != FOREVER
EXPIRY != TRUSTED TIME SOURCE
SPENT ON ONE HOST != SPENT EVERYWHERE
WITNESS KEY != HARDWARE ATTESTATION
RESOURCE REPORT != PAYMENT
OFFLINE VERIFICATION != LIVE PERMISSION
```

## VM-005 frontier

Introduce an authenticated network transport between nodes with long-lived
peer enrollment, fresh mutual possession proofs, monotonic clock/replay
windows, rollback-resistant nonce accounting, OS-level process isolation
and resource meters. Preserve VM-004's discrete lawful authority edges;
never silently promote network reachability into executable permission.
