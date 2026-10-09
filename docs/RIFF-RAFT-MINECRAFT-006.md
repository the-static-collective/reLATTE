# RIFF-RAFT-MINECRAFT-006 — THE BLACK STAR MAILBOX

**Status:** GitHub Actions archival and separate cold reopen completed successfully on a draft experiment branch. No merge or physical machine operation.

## Problem solved

RIFF-RAFT-005 generated an independently verified signed game evidence bundle: two different Mojang 26.1.1 Minecraft experiments, whose causal histories were derived from signed 004 observations and separately verified by GHoT. The 005 source was previously only in a seven-day CI artifact. RIFF-RAFT-006 seals the **byte-exact original signed bundle and its complete original 004 signed ancestor** into a Git-tracked fixture, not a fabricated replacement.

Source: reLATTE official green run 37994927245; original 005 artifact ID 11646368461; original workflow head c0d47a96245ec9adcff7f2b5247845c9addfd252; artifact expiry October 16, 2026.

Git branch: experiment/riff-raft-minecraft-006-black-star-mailbox.

Persistent paths: fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json (all actual signed native result bytes); fixtures/riff-raft-minecraft-006/custody-index.json (identity and complete byte hashes).

### Fixed evidence identities

- Archived entire bundle SHA-256: da6c556051f197e1d07578b5e435ae3b7132538c7c098a4add9e4acfd4572d42
- Return signed crossing: relatte-crossing-v0:bceaf6c25b074b0e1eed56c157368dae7aa97c99d33c382d5d00c96ddb91dda1
- Return signed receipt: relatte-receipt-v0:c4c8dd65fb645fded4ef8175d734d94fb1145be1cbf9b2f4fab7acf89cd856c3
- Return packet SHA-256: 1d9deb55ccda77a98d2c4c8c062fa965830077c26798b74a9344534d8657936e
- Prior independently verified 004 packet SHA-256: 9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17
- Source-observed causal results: World A 3/9 → 5/9 powered lamps; World B 6/9 → 2/9. Both 005 results are held.

## Two custody boundaries

**Seal job.** Reads the original signed 005 GitHub Actions artifact only if no Git fixture exists; checks it using GHoT’s *independent* P-256 verifier at fixed commit c8b15d43b334b6091f4920578557616b56ce72a6; demands local HOLD; copies the original bytes unmodified; generates a deterministic index and commits only the two evidence files on the experiment branch. Existing divergent files are refused, not overwritten.

**Cold reopen job.** Starts a *separate runner* with read-only Git permissions, checks out the archived source from Git rather than downloading the prior Actions artifact, recalculates its exact index, independently verifies all old and new signatures via the pinned GHoT implementation, and exercises hostile byte tamper, source removal, archive index forgery and fake ADMIT tests. It returns HOLD.

## Commands

From a local checkout of the experiment branch, use:

    python3 experiments/riff-raft-minecraft-006/seal-capsule.py reopen fixtures/riff-raft-minecraft-006
    python3 experiments/riff-raft-minecraft-006/custody-hostility.py fixtures/riff-raft-minecraft-006

An independent checkout of GHoT at the pinned verifier SHA may also run:

    python3 ghot/riff_raft_counterfactual_return.py /path/to/reLATTE/fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json

## Evidence and limits

Git custody survives **the original artifact’s expiry only while this branch or its objects remain accessible**. No independently controlled second mirror, organizational trust root, immutable third-party archival commitment, or land ownership is established. The cold runner re-verifies *saved* game observations and signatures; it does not run the Minecraft experiment again. No physical land, water, heat, power, seed, hydroponics, robotics or radio infrastructure is operated.

AUTHENTICATED SIGNATURE != SOVEREIGN AUTHORITY. GIT COPY != NEW EXPERIMENT. ONE REPOSITORY != PLURAL CUSTODY. ARCHIVAL HOLD != ADMISSION.

**Next aperture:** two separately administered Git evidence custodians independently reopen identical source bytes and produce explicitly local, non-authoritative custody receipts, without smuggling social independence claims from the number of signatures.
