# TWO-HOST-WEBZ-004 — Actual Brokered Crossing Evidence

**Status:** first machine-separated **brokered** experimental crossing verified. **Not merged, installed, or a direct sovereign HTTPS endpoint.**  
**Feature PR:** [reLATTE #64](https://github.com/the-static-collective/reLATTE/pull/64).  
**Verified functional source revision:** `28c920235abb7f76ed2e8062c0d58fa4ec1572ce` (later documentation changes only).  
**Run:** [GitHub Actions 37578744438](https://github.com/the-static-collective/reLATTE/actions/runs/37578744438), 2026-10-07 UTC.

## What actually happened

Three distinct GitHub Actions jobs ran on independently provisioned `ubuntu-latest` hosted runner environments with **artifacts transferred through GitHub's service**, not through shared local filesystem paths:

1. **A — Sanctuary sender:** Checked out the actual original Workbench `webz-fruit.json` and `webz-spore.json` bytes at immutable Static Workbench commit `53db559bbc510ad1003a0f8330d1673dcd04d7a0`. Independently P-256 signed reLATTE `relatte.crossing-envelope/v0` crossing envelopes with first-party Sanctuary source addresses and exact payload SHA-256. Uploaded `webz004-sender-carriers`: two strict, bounded JSON `webz.material-carrier/v0` envelopes with actual base64 bytes plus a non-authoritative source-run manifest. Neither source key nor a receiver private key was placed in the artifact.
2. **B — Orchard receiver, new runner:** Downloaded the exact named sender artifact through `actions/download-artifact@v4`. Independently verified source signatures, actual carried bytes, SHA-256, fixed original fixture provenance and the Orchard's own decision rule. Generated **its own new recipient P-256 signer and append-only LocalReceiver journal on B alone**. Signed RECEIVE → independent HOLD for the fruit / REFUSE for the fictional spore → additional `PAYLOAD_BYTES_VERIFIED` receipt, and reopened receiver state cold. Held fruit bytes stayed in **B-local quarantine**; refused spore bytes were **not retained**. Uploaded only one JSON public evidence file as `webz004-orchard-public-receipts`. Its private key file stayed in B's `$RUNNER_TEMP` and was not uploaded.
3. **C — independent verifier, new runner:** Downloaded both previous artifacts and cryptographically checked the original signed source envelopes, literal carried bytes, destination signer signatures for all RECEIVE/R3/custody receipts, signer continuity, digest and byte count, exact crossings and parent receipt links, opposed Orchard HOLD/REFUSE policy and an empty admission snapshot. Verified that the source/receiver diagnostic machine fingerprints differ and belong to a single Actions run. Uploaded public `webz004-third-party-verified-witness`.

The C job emitted the following **`webz.two-host-verification/v0`** success:

```text
verified: true
run_id: 37578491187
fruit: R3_HOLD, exact signed sha256 material reference, receiver-key signed custody
spore: R3_REFUSE, exact signed sha256 material reference, receiver-key signed custody
scope: GitHub-artifact-relayed distinct jobs;not-authenticated-direct-network-peer
```

The exact source and receipt IDs remain visible in the verifier job log and downloadable evidence artifact.

### CI checks

- Original full reLATTE `npm run verify` job: **119 passing tests, 0 failed**, including the retained WEBZ-003 contracts and TypeScript build.
- Additional `node --test test/webz-two-host-004.test.mjs`: **9 passing, 0 failed**, covering independently signer-backed two-parcel transfers, independent byte verification, corrupted carrier bytes/signature denial, missing known schema fields, forged signed custody receipt, same-machine/run collision and key-root publication refusal, plus cold retry of a previously verified handoff returning the **identical signed receipts and unchanged receiver journal**; a foreign runner cannot claim the earlier retry.
- Sender job **success** → receiver job **success** → verifier job **success**, all for the same exact source revision. An additional independent push run `37578748067` also passed end-to-end.

### Bounded authority and non-claims

This **did cross GitHub-hosted runner VM boundaries**: B did not read A's source fixture path or share A's local file system; the actual encoded material moved through **GitHub-hosted artifact transport** and B independently processed it. GitHub's run/job association is the **transport provenance boundary**; self-reported machine fingerprints alone are not hardware attestations.

This does **not** prove a direct authenticated HTTPS connection, peer discovery, two independently controlled accounts, pre-pinned receiving-world public identity, global WEBZ name resolution, a public webZ protocol handler, production key management, automatic browser transfer or local admission. The receiver public key is freshly generated on B and verified as signed-key continuity in artifacts; an **out-of-band trust anchor is still required** before treating any unknown remote receiver as a sovereign trusted peer.

The sender and receiver were automated **fictional first-party** CI test fixtures. No real user material, photo, personal memory or credentials were transferred. The human was not impersonated as the signatory. GitHub job separation shows independently scheduled runners, **not a hardware attestation proving physical tenancy**. HOLD is quarantine; REFUSE retains no bytes; neither is ADMIT.

> The parcel left one machine, arrived through a broker at another, and the receiving world signed what it actually observed. Direct authenticated peer transport remains the next separate security gate.
