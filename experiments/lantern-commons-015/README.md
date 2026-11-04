# LANTERN 015 — JAR;VIS CONNECTED CAPABILITY BRIDGE

## Actually live, now

This milestone joins a single-file local-first Solo Desk with a **deployed and independently HTTP-tested public Supabase Edge Function**:

**https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-live-bridge-001**

The Edge Function lives under the existing `pantry-gate` Supabase project and is isolated under a new function slug. It reads no pantry tables, uses no service-role secret, creates no rows, and cannot mutate any repository or call any local JAR;VIS worker.

Source-controlled files:
- `Lantern_015_JARVIS_Connected_Solo_Desk.html` — complete 50 KB standalone browser app, now with explicit connected capability discovery and live evidence actions in Step 03.
- `edge/jarvis-live-bridge-001/index.ts` — the actual complete Deno Edge Function source deployed via Supabase, with fixed GitHub public repo URLs and a two-action allowlist.
- `test_connected.mjs` — offline Node VM tests covering local work, consent-before-fetch, source evidence, CI observations, no transfer of private notes and network failure fallback.
- `.github/workflows/lantern-015-connected-bridge.yml` — GitHub Actions headless deterministic tests plus an independent HTTPS GET of the live Edge Function and both action families.

## What works

Step 03 retains four existing **local, offline** executable actions:
1. Build an editable checklist.
2. Download a structured CSV tracker.
3. Create and download a standalone HTML work card.
4. Perform a local structural audit.

It adds a **CONNECTED, opt-in** panel. Nothing contacts the server at page load. The user explicitly clicks `Discover live capabilities`, sees what the **actual** Edge Function reports as running, selects JAR;VIS / reLATTE / GHoT / planZ, and then may execute one of two remote read-only operations:

- **Inspect actual public source:** Edge Function fetches the *current public* repository `README.md` directly from GitHub, returns the source URL, observation timestamp, byte count, full-document SHA-256, and a short excerpt. Browser renders the evidence literally as text, offers a real downloadable JSON receipt, and can append a provenance summary to the locally editable note **only if explicitly clicked**.
- **Check actual CI:** Edge Function fetches GitHub's public Actions API for that exact allowed repository and returns up to five current workflow run names, statuses, conclusions, links and observation timestamp. Browser displays and can download the actual results; incomplete work is not reclassified as successful.

**Only two string fields ever leave the browser on these calls:** the action identifier and an allowlisted public repository identifier. The full typed work problem, goal, note, shelf, completion status and private evidence **are not submitted**. Requests disable credentials and referrers. There is no token in the browser or public HTTP request. This is an intentionally public endpoint with `verify_jwt=false` because both actions are source-only and have zero writes; output may be rate-limited or unavailable if GitHub is unreachable.

The browser still works as an offline task/action maker when disconnected. It fails visibly rather than inventing connected evidence.

## Strong boundaries

The public Edge bridge **does not**:
- access any private repository, file, photo, email, calendar or network.
- execute JAR;VIS's localhost operator server or any source-owned app/runtime.
- change GitHub issues, branches, workflows, projects or DNS.
- authorize reLATTE ADMIT, sign native receipts, or operate on any person's behalf outside public reading.
- send invitations, recruit helpers, transfer money or send messages.
- turn a green build into a completed real-life task.
- interpret the person's arbitrary natural language task by cloud AI.

There is no account, subscription, Vercel deploy, external git-write token or API key configured for this bridge. The Edge Function is on the existing Supabase project; resource usage counts against that project's allowances. Public endpoints are fixed and read-only, with short request timeouts, size caps, strict action+target allowlists and structured HTTP errors. There is **no durable per-IP quota/rate-limit database** yet; the upstream GitHub API enforces rate limits. Do not expand this anonymous endpoint to write operations without authentication, replay protection, quotas, consent and authorization.

**Privacy caveat:** the Solo Desk stores local working data in browser localStorage. If loaded from a shared third-party raw GitHub host, other pages on that host may share origin-level storage access. Do not type sensitive personal information in a public proxy preview; use the downloaded standalone HTML file, ideally isolated in its own trusted browser profile. The request endpoint itself receives no private task data; normal hosting providers may still receive request metadata.

## Reproduce / verify

- Test local DOM logic: `node --test experiments/lantern-commons-015/test_connected.mjs`.
- Run browser through a local trusted server or open the standalone HTML in a compatible browser.
- Inspect live capabilities: GET `https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-live-bridge-001`.
- Run actual inspect: GET `?action=inspect&target=jarvis`.
- Run actual CI: GET `?action=ci&target=relatte`.
- Confirm refusal of arbitrary access: GET `?action=inspect&target=private` returns 400.

Independent live HTTP reads were successfully observed after deployment, including actual JAR;VIS source digest, current public reLATTE Actions run results, and rejection of an invalid target.

### Next real crossing

To go beyond **read-only** GitHub evidence, JAR;VIS would need an authenticated, operator-approved action boundary that maps specific user-consented tasks onto **small, already-existing, tested source-owned functions**. Never expose repository write tokens or unrestricted command execution in a public anonymous browser. Add a queue/receipt with scoped permission and human review before any externally consequential step.

**The current win is real outside I/O with truthful capability discovery and observable results, not a pretend global autonomous worker.**
