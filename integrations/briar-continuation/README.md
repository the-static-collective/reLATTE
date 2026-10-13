# BRiAR CONTINUATION 002 — source-preserving bootstrap

**Status: scripts and provenance checks implemented; external source checkout / APK build not executed here.**

This is a stepping stone for a **separate, attributed derivative** of Briar's Android source code. It is not Briar upstream, not a GitHub-hosted fork, and not another reLATTE runtime module. reLATTE owns portable crossings; Briar owns its own identity, cryptography and sync.

## Upstream facts, independently inspectable

- Official source: https://code.briarproject.org/briar/briar
- Stable baseline selected: `release-1.5.21`; GitLab tag listing showed revision `aea0e4a6` as of 2026-10-13.
- Official source-building instructions: https://briarproject.org/building/
- Official reproducibility tool: https://code.briarproject.org/briar/briar-reproducer
- Upstream maintenance statement: https://briarproject.org/news/2026-maintenance-mode/
- Upstream GPL-3.0-or-later `LICENSE.txt` must stay intact. Submodule licensing must be audited separately. Desktop and Mailbox have separately licensed components.

## Safe source bootstrap

On an internet-connected development machine:

```sh
bash integrations/briar-continuation/bootstrap-briar.sh ./briar-static-source
bash integrations/briar-continuation/verify-briar-source.sh ./briar-static-source
```

The script clones the **original Git history**, pins the selected release tag against the upstream's published short revision, initializes its submodules, checks the original GPL license, creates a local `static/continuation-001` branch, and commits a provenance manifest. It never publishes code and never asks for a GitHub token.

For an Android debug compilation smoke test (needs working JDK + Android SDK):

```sh
bash integrations/briar-continuation/verify-briar-source.sh ./briar-static-source --build-debug
```

This is a *source compilation*, **not** independent reproducibility of a released binary. To reproduce the **official** APK, use the upstream briar-reproducer under its documented Docker/disorderfs prerequisites, compare against that exact release, and preserve hashes and the environment record. For a modified derivative, establish and test a separate deterministic build process. A successful smoke build alone never proves APK equivalence or safety.

## Publishing to a separate Collective repository

The current connected GitHub actions cannot create/fork a repository. Once a repository such as `the-static-collective/briar-static` exists and its scope is verified, review the local clone and push the derivative branch using ordinary Git. Do **not** replace `upstream`, rewrite original commit authors, relicense third-party code, or silently push release tags. Make the fork identity distinguishable from official Briar builds; distribute the required corresponding sources and notices with any binaries.

## Proposed source modifications, in priority order

1. Human-readable contact invitations and connection health UX (local-only status, no contact enumeration to third parties).
2. Background battery/reliability diagnostics without forwarding connection events externally.
3. Offline Mailbox continuity tests on real Android devices and explicit storage safety boundaries.
4. Optional signed reLATTE invitation exchange *only with human consent*; no auto-sharing keys, contact lists or private chat history.
5. Separately audited desktop/Android ergonomics; preserve upstream security fixes.

## Refusals

```
UPSTREAM != DOWNSTREAM
SOURCE CHECKOUT != REPRODUCIBLE APK
TEST PASS != SECURITY AUDIT
PREVIEW != AUTHORIZATION
LOCAL REST TOKEN != WEB SESSION TOKEN
NETWORK CONNECTIVITY != IDENTITY
```

The existing ROADWORKS 001 and BRIAR CONTINUATION 001 draft PRs remain independently reviewable. This branch advances the fork bootstrap only; no official Briar code is copied into reLATTE.
