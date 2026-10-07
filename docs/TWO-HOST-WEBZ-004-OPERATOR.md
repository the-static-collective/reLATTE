# TWO-HOST-WEBZ-004 — Operator-Directed File Crossing

This first brokered two-host specimen can also be rehearsed between **two computers** using an explicit, operator-chosen file transfer (e.g., a trusted removable drive, SCP or a protected shared folder). **No inbound web server, credential provider, DNS endpoint or automatic file transport is installed.**

**Requirements:** Node.js 24 or a compatible Node runtime supporting `--experimental-strip-types`; a checkout of this reLATTE branch with `npm install --ignore-scripts` on **each** computer. The two fictional first-party source fixtures come from immutable Workbench commit `53db559bbc510ad1003a0f8330d1673dcd04d7a0` at `static_workbench/web/webz-fruit.json` and `webz-spore.json`.

### Machine A — Sanctuary

```bash
# From the reLATTE repository on A:
node --experimental-strip-types scripts/webz-two-host-004.mjs sender \
  /absolute/path/to/static-workbench/static_workbench/web \
  /absolute/path/to/sanctuary-out
```

Inspect the `sanctuary-out/` directory: it should contain exactly `carrier-fruit.json`, `carrier-spore.json`, and `source-manifest.json`. It contains source-signed envelopes plus **literal public fictional payload bytes**, not the source private key. Manually copy these **three files** to Machine B into a separate directory.

### Machine B — Orchard

```bash
# From the reLATTE repository on B:
node --experimental-strip-types scripts/webz-two-host-004.mjs receiver \
  /absolute/path/to/received-sanctuary-files \
  /absolute/path/to/orchard-public \
  /absolute/path/to/orchard-private
```

Machine B independently validates the source envelope signatures and literal bytes. B's new private receiver key and hash-chained journal remain in `orchard-private`; the **ONLY public output** is `orchard-public/orchard-public-receipts.json`. B locally assigns **HOLD** to the fruit and **REFUSE** to the spore, then signs byte-custody receipts.

B must **never** send its `receiver-key.json` or entire `orchard-private/` directory back. Copy **only** `orchard-public-receipts.json` to the verifier.

A clean repeat on the same machine and source input replays the existing custody receipt instead of signing a duplicate. A different machine trying to claim that previous run will be refused; inspecting or repairing a damaged receiver root remains the operator's job.

### Machine A or an independent C — Verify

```bash
node --experimental-strip-types scripts/webz-two-host-004.mjs verify \
  /absolute/path/to/sanctuary-out \
  /absolute/path/to/orchard-public-copy
```

A passing `webz.two-host-verification/v0` report means the source signatures, carried payload hashes, signed Orchard RECEIVE/disposition/custody receipts, recipient key continuity and explicit absence of admission all matched. It does **not** prove the receiver's public key was known beforehand, nor that the file transfer was authenticated as a specific human-run server. For a strong **sovereign peer identity**, first enroll and pin the recipient's public key through an **independently authenticated** channel. The present test pins only the fictional world name and local recipient contract; it does not substitute GitHub job metadata or boot fingerprints for that enrollment.

### Privacy and authorization

- Only these two fixed, fictional public `webz.artifact/v0` JSONs are accepted. The user controls the file handoff, and Workbench's browsing UI does **not** perform it automatically.
- Neither JSON carrier nor proof includes personal memory, images, account information or secret key material.
- Do not expose receiver key files or local state roots through a web server or artifact upload.
- An attacker controlling the receiver or the artifact broker can generate self-consistent receipts with their own fresh P-256 key, because **no out-of-band destination key pin has yet been enrolled**. A valid signature is not an authenticated human or universally trusted world identity.
- Refusal is evidence, **not** deletion of all network copies; intermediary broker copies may remain according to the transport's retention policy.
- This is deliberately not a secure production inter-host RPC service, nor a general-purpose arbitrary file uploader.

### CI execution

[GitHub Actions workflow](../.github/workflows/webz-two-host-004.yml) exercises this same choreography with **three separate hosted runner jobs**. GitHub Actions' artifact broker replaces the human file copy and scopes downloads to a single workflow run; the sender and receiver do not share machine storage. For the observed run and signed result, see [TWO-HOST-WEBZ-004 execution](receipts/TWO-HOST-WEBZ-004-EXECUTION.md).

**Next security gate:** a pre-enrolled receiver key plus authenticated TLS transport and independent human authorization on the destination. Do not call that completed until the additional gate is actually exercised.
