# TWO-HOST-WEBZ-004 — First Brokered Crossing Between Independent Runners

**Status:** Experimental implementation on a review branch. The initial execution target is **two different GitHub-hosted CI machines** (separate `sender` and `receiver` jobs), not a privately operated peer-to-peer network.

## Problem and baseline

WEBZ-003 proves exact source bytes were read by a separate local receiver process, then signed by the receiver-local P-256 key. The sender and receiver nevertheless share the same OS machine/filesystem.

WEBZ-004 changes the **machine boundary** without confusing GitHub artifact delivery with an authenticated public endpoint. A sender GitHub Actions job on machine A generates **new signed** `relatte.crossing-envelope/v0` documents for the two existing original Workbench fictional `webz.artifact/v0` specimens, pairing each with **literal payload bytes** in a bounded `webz.material-carrier/v0` JSON carrier. The carriers cross runner boundaries through **GitHub Actions artifacts**, a brokered network handoff controlled by GitHub. Machine B's receiver job downloads the carriers, independently validates envelope signatures, local Orchard policy, actual payload bytes and sha256; **only B** creates the recipient signing key, locally signs RECEIVE → HOLD/REFUSE → PAYLOAD_BYTES_VERIFIED, and produces **public-only** receipt bundles. A separate third job independently verifies the signed source and receiver evidence and ensures A and B were scheduled as distinct jobs/runner instances.

The sender's ephemeral private signing key is never serialized to artifacts. The receiver's `receiver-key.json` and private JWK never leave machine B or get uploaded. The receiver chooses HOLD for the first-party fruit and REFUSE for the fictional spore based on an allowlisted declared artifact kind, **not** based on an instruction carried in the packet.

### Owner and first-party bytes

The physical bytes are the **exact checked-out** `static-workbench/static_workbench/web/webz-fruit.json` and `webz-spore.json` fixtures at immutable Workbench commit `53db559bbc510ad1003a0f8330d1673dcd04d7a0`. This avoids inventing a replacement asset. No user accounts, images, memories, material upload, arbitrary recipient URL or credential are involved. The receiver's policy code validates the first-party fixture declaration and signed source particular, but it **derives the SHA-256 only from bytes obtained from the cross-runner carrier**; the receiver's fixture source file is not needed to deliver material.

### Three separate CI jobs

```text
GitHub runner A            GitHub artifact service         GitHub runner B
sender job                 brokered transport             receiver job
───────────────            ─────────────────             ─────────────
literal fixture bytes → sealed reLATTE crossing + bytes → bounded artifact download
private key stays A         never grants authority          new, B-local receiver key
                                                         independently verifies bytes
                                                         own RECEIVE, HOLD/REFUSE,
                                                         own custody receipt, cold replay
                                               ← public-only receipt bundle upload

GitHub runner C (verifier job):
 download A carrier and B public signed witness → verify signatures, SHA, ID,
 two world decisions and no admission; reject changed/replayed/forged material.
```

**Distinct runners:** each separate `runs-on: ubuntu-latest` job gets its own ephemeral GitHub-hosted environment, reported by GitHub Actions. The source/receiver witness includes separate job identity and host-fingerprint fields for diagnostics. These self-reported fields and fixture P-256 signatures are not hardware attestations or cryptographic evidence of machine tenancy; the GitHub Actions job separation and platform artifact chain establish the limited two-runner setting.

### Explicit protocol boundary

- `SEND != RECEIVE`; the receiver must validate signed crossing before writing any custody record.
- `RECEIVED != ADMITTED`; Orchard locally chooses HOLD/REFUSE, and keeps zero admitted entries.
- `TRANSFER != TRUST`; artifact downloads are scoped to this one Actions run. The receiver-generated public key is authenticated only as part of the run's **platform-controlled artifact provenance**, **not** by an out-of-band sovereign-world key pin.
- `REFUSE != RETAIN`; refused specimen is hashed and receipt-sealed on B but not persisted in receiver quarantine.
- `SIGNATURE != HUMAN IDENTITY`; signatures prove fixture signer continuity. Sender and receiver keys are independently generated and not user identities.
- `BROKERED TWO-HOST != DIRECT HTTPS`; no publicly reachable inbound port, DNS, WebTransport, mTLS or two-person controlled machine deployment is claimed.
- `VISIT != SEND`; Workbench's existing browser controls remain unchanged. This is a manual/CI transport proof, not auto-crossing when browsing pages.
- `PERMISSION != AUTO-MERGE`; branch requires tests/review and explicit human approval before merge.

### Packet contracts and checks

**Sender output (artifact named `webz004-sender-carriers`)** contains only a sealed signed envelope, literal base64 material, and a non-authoritative source-machine witness. Carrier size ≤ 110 KiB. Public metadata is bounded to two fixed first-party payload kinds. No private signing keys in archive.

**Receiver output (artifact named `webz004-orchard-public-receipts`)** contains exactly the two signed RECEIVE, R3_HOLD/R3_REFUSE and PAYLOAD_BYTES_VERIFIED receipts, with crossing/receipt IDs and destination world. No raw source bytes are rebroadcast, no receiver key files, no full journal. Proof includes a snapshot showing no admissions. Signing public keys on all three receipt families match the destination signer.

**Verifier:** revalidates both source envelope signatures, strict carrier hashes/allowlist, all destination receipt signatures and key matching, all id relationships, literal payload digest and byte count, durable signer evidence, specified policy; parses and rejects forged extra fields, mismatched source/target, private key-shaped fields and unexpected artefacts. Verifier must not pretend an unpinned receiver key is a globally trusted identity.

**Failure semantics:** missing carrier, malformed object, altered byte, wrong signer key, extra artifact kind, source/receiver origin collision, wrong or missing receipt, false ADMIT, false retained refusal, non-reproducible journal or missing evidence → FAIL, no success summary.

### Future upgrade

Production two-host **direct authenticated HTTPS** requires: an out-of-band destination signing key or attested authorization trust anchor, distinct machine operators/identities, TLS/mTLS or equivalent protected endpoint, replay-safe challenge/idempotency, bounded invitation and explicit human consent on each end, queue durability, request-authenticated admission policy and reviewed remote key custody. None of these are substituted by GitHub artifacts or CI machine fingerprints.

## Acceptance gates

1. Pure Node tests locally simulate two disjoint roots and an intermediate carrier directory; repeat, bad hash, modified signed envelope, swapped or forged receiver receipt, wrong recipient policy, unknown kind and private-key leak are rejected.
2. CI `sender` job signs two real first-party Workbench fixture bytes; artifacts contain **only** public envelopes and literal bytes.
3. A **separate** CI `receiver` job gets carriers via `actions/download-artifact`, creates its own key and journal, signs HOLD/REFUSE+byte receipts and cold replays; validates no source key material arrived.
4. Third `verify` job downloads both output artifacts, verifies all signatures/ids/decisions, reports a passing two-runner **brokered** witness and records the job names/runner fingerprints and GitHub run scope.
5. All preexisting reLATTE tests still pass; original WEBZ-003 implementation remains unchanged.
