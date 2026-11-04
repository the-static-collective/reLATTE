# LANTERN 015 — JAR;VIS Connected Front Door (LIVE)

> Status: published as a new isolated public Edge Function on the user's existing Supabase pantry-gate project. It does **not** modify existing function slugs, private tables, or domain DNS. Draft source PR stacked on 014; actual HTTP verification is in the 015 workflow.

## Open the actual public app

https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-solo-live-017/

- [Health](https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-solo-live-017/health)
- [Live source-backed registry](https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/jarvis-solo-live-017/capabilities)

**Not Vercel, not GitHub Pages, and not a third-party raw-content proxy.** Existing free-to-use project infrastructure hosts the app and its bounded API. No new database tables, paid project, third-party model, GitHub credentials or external accounts are needed for the user.

## Real capabilities with truth boundaries

| User control | Actual action | Evidence/output | Cannot claim |
| --- | --- | --- | --- |
| Connect and verify sources | Server fetches *public* GitHub file contents and blob SHAs from an explicit allowlist: JAR;VIS, reLATTE world cartridge registry, GHoT, STATIC OS. | Each source is marked CONNECTED_READ_ONLY only on a successful real GitHub API read. | Connected does not mean all programs are running or can be executed remotely. |
| Inspect a source | Remote Edge reads a current allowlisted file and compiles a real source-backed report of JAR;VIS package scripts, verified world ancestry or source docs. | Browser downloads `JARVIS_Connected_<source>_Source_Report.json` with exact GitHub blob SHA. | No GitHub write, local execution, deployment or ADMIT. |
| Route my short offer | The exact reviewed **JAR;VIS LIVE-OFFER-001 pure router** copied from source repository uses an exact proposal-only JSON cartridge to classify and rank actions. | Actual remote route-execution JSON receipt, intent, IDs, original router blob SHA, and a downloadable plan. | Router **proposals** are NOT actions executed; no recording, scheduling, transport, publication or human consent occurs. |
| Start recording | A deliberate user-click asks the browser for microphone permission and uses `MediaRecorder` to produce local audio Blob. | A real audio file is downloaded to the user's device. | No server upload, transcription, streaming or remote recording. |
| Existing four Solo Desk offers | 014 checklist/CSV/HTML/audit execute locally and still work when Internet is absent. | Real browser artifacts. | Cannot inspect local files or verify any external accomplishment. |

### Source custody and provenance

The public JAR;VIS deterministic router and its reviewed reLATTE live-offer cartridge were copied without change from `the-static-collective/JAR-VIS` at Git blob SHAs:

- `src/live-offer-router.mjs`: `92835c17c2cfba84d1e67acca03338af1d91ff1a`
- `cartridges/live-offer-001.json`: `bf04098596d469f0e8a6bd7fa7fc81205f6ab9c2`

The public endpoint permits only the exact source names `jarvis`, `world`, `ghot`, `static_os`—not caller-supplied GitHub paths, URLs or arbitrary commands. GitHub requests use **public read-only API calls** without a credential. If a source is missing or rate-limited, JAR;VIS reports UNAVAILABLE and refuses to invent results.

The backend is `experiments/lantern-commons-015/server/index.ts`, importing the exact router and cartridge and serving the derived, tested 014 HTML page in `page.ts`. Deployment is a **new isolated Supabase Edge function** `jarvis-solo-live-017` (`verify_jwt=false` because all functions are intentionally anonymous and carefully scoped). No `SUPABASE_SERVICE_ROLE_KEY`, GitHub PAT, or other secret is read or exposed by it.

### Privacy boundary

- Notes, projects, local Work Shelf and saved drafts in the *public* live app are intentionally stored in **volatile in-tab memory**, never `localStorage`. This avoids origin-sharing hazards with unrelated functions on the same `supabase.co` host. Refreshing the tab erases local drafts; **Export shelf** to save.
- Pressing **Connect** or **Inspect** sends no user task text—only the allowlisted source name, and all GitHub reads are for public source.
- The short offer (4–240 chars) is sent to the remote deterministic route only after a separate **unchecked-by-default consent checkbox** and an explicit button press. The backend does not store it. Do not enter secrets in it. We cannot guarantee what a hosting provider may record in infrastructure logs, so keep short offers nonsensitive.
- No private user or partner records, no Supabase DB queries or RLS change, no analytics, no browser token/key storage and no cross-origin POST. Audio Blob never crosses the network.
- This is a deterministic source-owned action router, **not an autonomous AI model**. Source inspection is a real remote operation, while ranked next actions remain proposals unless their separate action buttons actually execute them.
- GitHub public read limits can temporarily make a source unavailable; that is displayed, not masked.

## Reproduction and evidence

```sh
node --test experiments/lantern-commons-015/test-connected.mjs
```

GitHub workflow `.github/workflows/lantern-015-connected-live.yml` runs local source integrity tests and live HTTP tests from a GitHub runner for the exact public GET and POST routes (including negative security tests). It must be GREEN before claiming the full milestone proven.

## Next trust frontier

After actual user testing, implement an **authenticated action dispatch** with explicit OAuth scopes, allowlisted repository write operations, per-action confirmation and source-native HOLD/ADMIT boundaries. Do not place a GitHub token in a public HTML app or give an anonymous Edge function repository write authority just to eliminate clicks.
