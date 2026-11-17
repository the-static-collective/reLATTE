# HUMKIN-GH-RELATTE-001 — GitHub as carrier, reLATTE as membrane

**Status: experimental cross-repository runnable specimen; no player-facing release or live deployment.**

## Why this seam

HUMKIN owns the catalog and music. GitHub carries exactly the two **public metadata** files. reLATTE verifies a native signed crossing, then its own local receiver independently emits **RECEIVED** and **R3_HOLD**. Workbench/STATIC OS can later *inspect* those receipts, and separately authorize actual work through GHoT. The donor repo is not rewritten and the membrane does not become the owner.

```text
HUMKIN Git SHA + discovery.json + tracks.json
  ↓ GitHub Actions sender (real checked-out source bytes)
source manifest: two SHA-256s, exact Git commit, commit time
  ↓ GitHub artifact transport (not permission)
reLATTE native opaque organ adapter and signed crossing
  ↓ native file transport
reLATTE LocalReceiver RECEIVE → HOLD
  ↓ cold replay of private receiver journal
public signed crossing + public receipts + exact public JSON
  ↓ GitHub artifact transport (never receiver private keys)
separate GitHub Actions verifier: hashes + P-256 signatures
  ↓
verified candidate for explicit later Workbench/Station adoption
```

**Run:** Workflow `HUMKIN-GH-RELATTE-001 public catalog to signed sovereign HOLD` on the experiment branch. The three jobs are `sender`, `receiver`, and `independent-verifier`; the first also runs four mutation/refusal tests. No tokens, production service credentials, audio recordings, or private subscriber data are carried.

**Manual local shape:**

```sh
npm install --ignore-scripts
node --experimental-strip-types --test test/humkin-gh-relatte-001.test.mjs
node --experimental-strip-types scripts/humkin-gh-relatte-001.mjs sender /path/to/HUMKIN /tmp/humkin-carrier
node --experimental-strip-types scripts/humkin-gh-relatte-001.mjs receiver /tmp/humkin-carrier /tmp/humkin-work
node --experimental-strip-types scripts/humkin-gh-relatte-001.mjs verify /tmp/humkin-work/public
```

The receiver's private P-256 material stays under `work/private/`, not `work/public/`. GitHub Actions runners are ephemeral, so their local journal is **not** evidence of a persistent production receiver. A third job can verify the public signatures and bytes, not independently replay the receiver's unuploaded private journal. The checked-out HUMKIN source revision is a GitHub-supplied identity claim; reLATTE does not falsely claim HUMKIN cryptographically signed it.

The source is the current 12-track MUTANT POP public catalog, not the emerging Android/Orchard server or a complete future library. The public metadata can declare rights restrictions, but does **not** authorize streaming, rebroadcast, remixing, or copying audio.

## Next action, only once verified

WorkBench can show this HELD catalog as a **candidate** without implying its admission. A separate authorized control could dispatch one actual, bounded GHoT capability such as verifying that the referenced official public track URL responds correctly, returning an execution receipt without broadcasting or redistributing audio. That should reuse existing Workbench `prepare → execute → inspect → cancel/reconcile` and GHoT `offer → selected assignment → receipt` flows, rather than inventing another universal runtime.

Do not convert a catalog HOLD into a HUMKIN player reward, a live radio playlist, a WebZ publication, or a Jubilee economic exchange automatically.

**Laws:** TRANSPORT != CROSSING · SIGNED != TRUE · RECEIVED != ADMITTED · HOLD != ACT · DISCOVERY != SELECTION · CAPABILITY != AUTHORITY · AUDIO LINK != REBROADCAST LICENSE.
