# LANTERN 015 — Connected Registry 001

## What exists

A second, opt-in single-file interface at `Lantern_015_Connected_Desk.html`, preserving the original offline-only `Lantern_014_The_Solo_Desk.html` exactly. The connected page still has the original four local executors, local shelf, fork, export and evidence-based completion controls.

**Available after explicit discovery:** current public projects from the existing Supabase Edge Function `jarvis-live-bridge-001` (pantry-gate). Two public GET-only operations are implemented today:

| User-facing effect | Wire request | Returned evidence | Does not do |
| --- | --- | --- | --- |
| Read actual public source | `GET .../jarvis-live-bridge-001?action=inspect&target=<allowlisted>` | README excerpt, source URL, SHA-256, byte count, observation time | run project code or change repository |
| Check recent builds | `GET .../jarvis-live-bridge-001?action=ci&target=<allowlisted>` | Latest five public GitHub Actions run states and URLs | trigger a workflow or prove field work |

Allowed targets as currently advertised by deployed backend: `jarvis`, `relatte`, `ghot`, `planz`. The browser also validates this set. Discovery is triggered only by **Find live capabilities**. Each subsequent read requires a separate visible confirmation. The client constructs only `action` and `target` from validated choices. No local note, problem, evidence, or shelf is transmitted. Normal web connection metadata remains visible to the server. No API keys or service role are embedded.

**Human-facing external handoff:** The existing `now-route-live` Waseca-area exchange is linked as a separate, invite-only pilot page. The link carries no query parameters and transfers no typed text. This is a navigation handoff, not an integrated write capability. The pilot currently supports shelf-stable goods only, not fish or other perishables.

## Immediate test preview

A **public GET-only Edge Function** is deployed as `jarvis-connected-registry-001` in the existing pantry-gate Supabase project. The exact URL is:

`https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-connected-registry-001`

Deployment receipt: Supabase function status `ACTIVE`, version 2, `verify_jwt=false`; the served PAGE content was compared byte-for-byte with the GitHub connected HTML when version 1 was deployed, and v2 changed only a path fallback to accept the gateway's normalized root route. Both scripts were syntax-checked. **External browser GET and connected bridge actions still need field verification**; deployment metadata alone is not an independent successful HTTP response. This is a test-only public host and it shares the project's browser storage origin, so use nonsensitive test data only.

## Proof and limitations

- `test_solo_desk.mjs`: the baseline offline behavior remains runnable and tested.
- `test_connected_desk.mjs`: checks zero automatic network calls, exact read-only request boundaries, local keyword suggestions, independent consent, and truthful failure handling.
- GitHub Pages workflow publishes the baseline at the project root and connected interface at `/reLATTE/connected/` **only when GitHub Pages is separately enabled and the guarded deployment succeeds.**
- Backend was inspected in the active pantry-gate Supabase project, but a real public browser transaction was not yet independently verified in this change. Browser CORS, public origin, CI, and deployed link must be field-tested before calling the GitHub Pages UI live.
- GitHub Pages `github.io` project paths share the organization-origin browser storage. Neither this host nor the pantry-gate function origin is appropriate for sensitive notes without a dedicated-origin design.
- Public-source retrieval and CI monitoring are genuine remote reads, but not AI reasoning, volunteer matching, invitation publishing, work execution, or permission to contact another person. Those remain separate gated future crossings.

## Human acceptance test

1. Open the connected desk on a test device. Create a harmless local project, such as `Plan a small community supper`. Confirm all four original local tools work.
2. Before pressing **Find live capabilities**, ensure no request to the bridge occurs.
3. Press **Find live capabilities**. Verify the advertised project targets appear; the suggested target may be changed manually.
4. Inspect a selected public source, explicitly approving the confirmation. Expect a real digest, excerpt, observation time, and source link. Compare public source URL and digest if necessary.
5. Check CI, explicitly approving again. Expect real public run statuses and URLs, or a clear, non-success failure state.
6. Verify no project notes were sent via browser developer-network inspection. Deny a confirmation: no read may occur. Disconnect network: local tools must remain functional.
7. For actual local goods exchange, follow the distinct NOW ROUTE link and use a non-sensitive, invite-authorized test. The Solo Desk content must not be copied automatically.

Next trust boundary: a separate human-authorized write broker for public invitations/requests, with anti-abuse controls, retained consent receipts, safe community moderation, and no private local-note upload by default. This is **not** granted in Registry 001.
