# JAR;VIS Commons Desk 002 — integrated human-first front door

## Reality of the result

The public test host is the existing Supabase Edge Function **jarvis-connected-registry-001**, version 3 (2026-11-04). This function now serves `Lantern_016_Commons_Dock.html` as the default `text/html` page, while preserving the previous connected registry on `?classic=1`. No Vercel or new paid infrastructure was added.

**Independent public page check:** a separate web fetch retrieved title `JAR;VIS · Make something happen` and the human-facing HTML sections and links (Commons, Garden, Invitation Network, NOW ROUTE, First Table, POKE, Banana Pocket, etc.). This proves HTTP page rendering, **not** successful end-to-end live POST participation.

## Exact crossings to machinery we already deployed

| Human action | Deployed function or site | Real output | Authority / limitation |
| --- | --- | --- | --- |
| Describe one real need | Local JS `routeIntent` | Inline action with direct tool choices, no network request | Not AI; deterministic keyword router |
| Make something now | Local `makeCard` + original `?classic=1` | Downloaded action card; Solo Desk local checklist/tracker/page/audit | No outside-world execution |
| Give or request goods urgently | `/functions/v1/now-route-live` | Existing invite-only Waseca time-sensitive exchange | Requires pilot code, only safe shelf-stable goods |
| Submit a bounded offer, need, question, experiment | POST `/functions/v1/garden-signal` with explicit consent | Real `PENDING` Garden submission + private withdrawal receipt | Held for human review, not auto-published / matched |
| Read approved Garden material | GET `/functions/v1/garden-signal?feed=1` | Reviewed public entries only | A reviewed record is not field proof |
| Publish persistent discussion | POST `/functions/v1/invitation-network-002` action `publish` | Public thread ID and 30-day share link + private owner key | Public by explicit consent; no personally identifying details |
| Find existing threads | POST same function action `discover` | Current public thread candidates | Self-declared, not verified matches |
| Read and reply | POST same function actions `read`, `reply` | Actual public replies and private reply receipt | Each reply individually consented |
| Close your own thread | POST same function action `withdraw` with owner key | Thread hidden from service | Cannot recall copies elsewhere |
| Flag unsafe discussion | POST same function action `report` | Safety-report submission | Not automatic removal |
| Human–AI shared room | `/functions/v1/agent-commons-frontdoor-016` | Reviewed First Table history, seat-controlled HELD submissions | No AI identity proof |
| Two-person acknowledgement | `/functions/v1/poke` | Working content-free signal with distinct private bearer links | Not messaging or verified identity |
| Creative field shell | `/functions/v1/banana-pocket` | Existing BananaGram Pocket local game | Not network exchange |
| Research old machinery | `/functions/v1/jarvis-solo-live-017` | Source-backed public reLATTE, JAR;VIS, GHoT, STATIC OS inspection | Read-only, not running those machines |
| Other public doors | `https://doors.abundent.org/social-porch/` and `https://doors.abundent.org/porch/` | Existing drafts, community materials, public porch | Not live posting / private intake |

**Cross-origin caveat:** this static client is specifically deployed on the active Supabase project origin because the existing Garden and Invitation APIs check browser `Origin`. A new `https://kbhqacsdvjsstzyplqij.supabase.co` entry was added to the existing Invitation Network 002 origin allowlist (v5); all other invitation logic is unchanged. The Commons frontend does **not** work if its HTML is copied directly to GitHub Pages: same-origin endpoints would point at the wrong host. Keep this portal on the function host until a correctly permissioned domain/bridge is explicitly built. GitHub PR #165 keeps the sources under review and does not silently publish the portal on GitHub Pages.

## Secrets and human control

- No network on initial page load except the **explicitly requested** public conversation permalink `?thread=uuid`, which reads that public thread.
- User text only crosses when they explicitly check consent and submit. No automatic transfer from the local intent field to Garden or Invitation Network.
- Public conversation owner and reply keys are shown/copied, never included in shareable thread URL, never stored in localStorage, never sent to other connected tools.
- The review queue response is `PENDING`, and this GUI never implies publication/volunteer commitment.
- The underlying APIs retain existing rate limits, input checks, manual review, public abuse reports and withdrawal controls. These protections are not replaced by client-side checks.
- No remote agent execution, repository writes, mass contact, automatic matching, payment or unrestricted backend access is granted here.

## Test and acceptance

- `test_commons_dock.mjs` covers no automatic fetches, deterministic local intent routing, real API request shapes to Garden and Invitation Network (with mocked HTTP responses), separate review and public consent, receipts, public read discovery, replies, withdrawal and failure.
- Browser-UI smoke test from application source confirmed local router and mocked Garden and thread creation/reply behaviors; the exact server function was verified ACTIVE and HTML was independently fetched at its public URL.
- **Still to verify with human non-sensitive field trials:** a genuine private Garden submission returning its withdrawal key, a genuine public invitation posted/retrieved in two different browsers, actual withdrawal, and NOW ROUTE end-to-end two-person agreement. No such real submissions were created as part of these software checks.
- GitHub Actions still must run the new test suite. The user has not enabled official GitHub Pages on the reLATTE repository.

## Test drill

1. Open the Commons Desk; enter `I have extra shelf-stable groceries today`; select **Find the next real action** and verify it offers the existing invite-only NOW ROUTE, not an empty invitation.
2. Open **Garden · private review**, enter a nonsensitive 12–300 character test idea, explicitly authorize it, submit, and **save its private withdrawal key**. Check status: PENDING, **not public**. Withdraw if appropriate.
3. Open **Invitation Network**, publish a harmless public invitation, save the **private owner key** separately, then copy the **public link** to another browser. The other browser should read/reply without the owner key. The first browser can close the thread with its private key.
4. Check **What has been heard?**—only explicitly reviewed public entries should appear.
5. Try **First Table** and **POKE** from the hub. These remain separate, functional destinations; their capabilities are not silently borrowed.

Final boundary: the hub is not an AI agent with unrestricted action authority; the available actions above are real but bounded.
