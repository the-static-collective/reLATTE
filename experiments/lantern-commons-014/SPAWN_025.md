# SPAWN 025 — Solo Commons Executor and Connected-Provider Bridge

## A practical answer: one operator, a real output, one deliberately authorized destination

The user does not need to recruit a second operator before JAR;VIS becomes useful. SPAWN 025 extends the local-first desk in [Lantern_025_Solo_Connector_Workbench.html](Lantern_025_Solo_Connector_Workbench.html) with an **actual digital-artifact constructor**, not just task suggestions.

Pick one actual local operation, one unfinished task, one operator-reported available input, the desired output and a format. The tool constructs the content immediately, hashes the exact UTF-8 bytes with SHA-256, creates a browser Blob for local download, and records only metadata (not raw work content) in the local work journal. Supported outputs: printable HTML runbook, Markdown checklist, CSV tracker, source-owned JSON process cartridge, and a **computed single-operator cross-hat capability circuit**. The circuit checks only user-recorded OFFER/NEED category overlaps between distinct hats, produces explicit questions about suitability/ownership/permission, and asserts **zero completed physical transactions**. It does not invent a second person or verify inventory.

**The constructed digital artifact exists.** The real-world task, actual printing, physical deliveries, and other people's decisions are **not** silently completed by creating it. No external authority is inferred from the digital receipt.

## Can reLATTE let people sign in to Google Drive, GitHub, and other networks?

**Yes, but not by becoming the identity provider for every other service.**

reLATTE can broker the *operator's intent, scope, approved plan, provider receipt and reuse method*. Google and GitHub must each conduct their **own OAuth-based authorization**. No one should type a Google password into JAR;VIS or share their ChatGPT connector OAuth tokens with the browser.

### The first bridge, executable today

In the local SPAWN 025 desk, the operator can generate an explicit CREATE_NEW_ONLY provider intent:

- Contains exact artifact bytes and SHA-256 digest, destination and format.
- Includes an explicit operator review checkbox.
- Declares that no provider authorization is included and no remote save has occurred.
- Enforces a safe Drive filename or an explicit, **non-default GitHub work branch** and repository path. It refuses workflow, secret and unsafe paths.
- Can be copied to a connected ChatGPT session, where the existing Google Drive or GitHub plugin can execute a permitted file operation; this is a **separate user-connected session**. The artifact should be read back and compared before being described as saved.

This is **not** yet automatic JAR;VIS browser sign-in. Google/GitHub connectors available inside ChatGPT do not automatically grant credentials to an unrelated website.

### Source-owned provider adapters (ready for a trusted token supplier)

[provider_adapters_025.mjs](provider_adapters_025.mjs) implements:

- Strict validation of the provider intent and digest before any network call.
- Fresh affirmative `approved === true` for every new write. No silent writes or overwrite support.
- Google Drive: create one plaintext, Markdown, HTML, CSV or JSON file through Drive v3 multipart upload **using a separately supplied, short-lived OAuth access token**. Re-read the created file by exact returned ID and hash the returned bytes; only a matching digest becomes PROVIDER_READBACK_VERIFIED.
- GitHub: write one newly created file with a GitHub App user's narrowly scoped access token on an **explicit existing non-default work branch**, supplying no SHA (the GitHub Contents API refuses overwriting an existing file). Read the same branch/path again and hash the read-back file.
- Scoped file listing: Google Drive only files accessible to the app; GitHub only one explicitly chosen repository. No broad drive crawl, private key inspection, deletion or arbitrary code execution.
- The module accepts an authorized token as an injected argument but does **not** initiate OAuth, persist or log secrets, or expose it to the user's standalone exported world.

The adapters are tested with mock provider HTTP boundaries. A genuine end-to-end provider invocation **inside independent JAR;VIS** requires the next auth infrastructure steps below.

### How to turn this into genuine sign-in from JAR;VIS

1. **Choose and deploy a trusted HTTPS origin** for the application, with a stable OAuth callback URL. Do not host OAuth callbacks on an untrusted raw-file proxy or `file://` origin. A standalone offline cartridge can continue functioning without provider access.
2. **Google**: Register a Google Cloud OAuth client and consent screen; request `https://www.googleapis.com/auth/drive.file` instead of unrestricted Drive scopes. Use Google Picker so a person explicitly chooses which existing file an application may access. For persistence, implement an authorization-code flow with PKCE and provider refresh tokens stored securely on the server, encrypted at rest, revocable by the user. Google's `drive.file` scope generally covers app-created or user-selected individual files, not every file in Drive. Full-drive scopes require a different security/review boundary. See [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
3. **GitHub**: Register a GitHub App rather than a broad OAuth App, request repository **Contents read/write**, allow installation on only the repositories the owner selects, and use short-lived installation or user-to-server tokens. Work on a reviewed non-default branch and verify hashes before opening a PR; never silently change main, workflows, organization settings or secrets. See [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).
4. **Authentication service**: The trusted server performs OAuth start/state/PKCE/callback or GitHub App exchange; enforce redirect allowlists and CSRF protection; keep provider refresh tokens off static pages; implement a revocable connection registry keyed by an authenticated account, not by temporary 023/024 signing keys. Scope each operation to one selected file or repository and require a fresh approval before mutating.
5. **Authorization gate**: No provider API operations based only on a relatte public OFFER signature, unchecked natural-language text, generated recommendation, or an AI response. Authenticated owner session + exact signed approval + selected provider resource + provider access token + repeatable readback are separate controls.
6. **Connectivity**: A user may work offline and queue a prepared intent, but the provider write is not complete until an authenticated server executes it, checks HTTP result and performs a readback. Queue must never silently replay unapproved writes.
7. **Audit and disconnect**: Store operation receipts (provider, action, returned file ID, verified digest, timestamp) without copying secret tokens or private file contents into public commons. Permit explicit disconnect and provider-side authorization revocation.

**Current limitation:** Provider OAuth clients, callback origins and server-side token storage have not been configured or verified for the independent reLATTE web app. We do **not** claim an authorized 'Sign in to Google' or 'Connect GitHub' button works in this standalone HTML yet.

## Real connected Drive proof

Using the **existing Google Drive connection within ChatGPT**, we created, edited, and read back a native Google Doc titled **JAR;VIS — Solo Commons Connector Proof (SPAWN 025)**. This proves one authenticated provider read/write round trip works through the ChatGPT connected account. It does **not** prove the independent app received an OAuth credential. The separate workbench and provider adapters are the portable route to making this same experience first-party in a future authenticated JAR;VIS application.

## Source / test boundaries

- `test_solo_025.mjs`: all inherited test suites plus real local work artifact construction, four formats, digest receipts, no false physical completion, safe JSON provider intents, no accidental writes, and private method export.
- `test_provider_adapters_025.mjs`: mocked but executable provider API requests with exact validation of Google Drive multipart create and readback, GitHub App create-only branch write and same-ref readback, unauthorized writes, token guard, digest mismatch, safe path and per-repository listing.
- Both test suites are wired to the inherited GitHub Actions Solo Desk workflow.
- Reusable method-only cartridges never include raw operator notes, provider tokens, contact lists or automatically published outcomes.
- **Not yet proved:** external production OAuth login in standalone JAR;VIS, Google Picker integration, GitHub App installation, long-term token refresh, or independent real-world fulfillment.

**Change status:** experimental stacked draft PR #174 on SPAWN 024 #173; not merged, no changes to existing production endpoints or private 024 relay.
