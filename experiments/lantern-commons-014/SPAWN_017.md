# SPAWN 017 — one operator, many hats

Source: Lantern_017_SPAWN_One_Operator.html

## Why this exists
The initial constraint is **one real person operating the community organizer, grower, artist and any other roles**, not simulated crowds, invented volunteers, or mandatory recruitment. Give that operator independent capability first. Only later connect to other real operators.

Open the standalone HTML file locally. It runs without a server, AI account, password, network connection, or external library.

## Usable actions
1. **Seed:** Choose **Load my organizer + grower + artist hats** to create three distinct operations owned by one person; add custom ones for any other work. Each has a specific initial backlog.
2. **Operate:** Find **DO NOW**, do one actual task outside the app, write a real observation, and record it as done, blocked, or not yet attempted. These are **self-reports**, not witnessed/verified outcomes. Add custom tasks. Use **Work card** for a standalone printable HTML checklist.
3. **Connect your own hats:** Add a real offer or real need to a particular operation. The local matching algorithm finds same-category offers/needs **across different hats**; it does *not* invent a second person or automatically transfer a resource. **Create verification task** adds an unfinished task to check the fit.
4. **Fork:** Fork an existing operation as a clean, unstarted local copy. Export a reviewed **method cartridge** (JSON) that omits all status, observations, recorded offers/needs, contact information and identity/owner keys. Import one later to start another independent local operation.
5. **Portable work:** Download a full **private backup** JSON, restore it later with a separate confirmation (which replaces the current local workbench), and download a spreadsheet-compatible CSV tracker. The private backup includes your notes and capabilities and must not be shared like a public cartridge. CSV cells that look like spreadsheet formula injections are escaped.
6. **Optional remote Commons:** A separate outbound link opens the already-deployed JAR;VIS Commons Desk. Nothing typed or recorded here is posted or sent to that service. Any public thread or Garden submission requires its own explicit participation decision and follows that service's existing rules.

There is no autopublisher, fake match, blockchain token transfer, real-world handoff, payment, or fake verified human outcome in this version. This client does **not** claim that it integrates or controls all the underlying projects.

## One-person field trial
- Seed three hats. In the **organizer** hat, write or print a usable run-of-show.
- In the **grower** hat, count actual resources, if any. Do **not** infer a food offer from the role template. For food, preserve safe handling and actual availability; the separate NOW ROUTE pilot does not accept perishables.
- In the **artist** hat, rehearse or create a genuine first version, and record what happened.
- Add **food: need** to the gathering and **food: offer** to the grower **only if both are real**. See the internal lead and create a verification task, which remains uncompleted.
- Fork one operation. Confirm the child has no claim of having completed the parent's tasks, no copied observations and no copied resource offers.
- Review and download its method cartridge. Import the cartridge and verify that it creates an unstarted independent operation. Open the HTML work card and CSV tracker in ordinary local tools.

**Success condition for solo playtest:** One person leaves with at least one genuinely used artifact, one recorded observation of an actual action, and a reusable cartridge that another person can open—without recruiting anyone.

**Not yet proven:** Real external-world impact, other-person reproducibility, full two-person federation, inter-service persistence, deployed SPAWN frontend, and safe real-world exchange. No such results are claimed based on a code commit or CI run alone.

## Privacy and persistence
- Runtime has **zero fetch calls** or automatic network activity. The only external navigation is a deliberately clicked outbound link.
- Browser localStorage contains the private working journal on that device/origin, not an encrypted vault. A third-party raw-content proxy is not a private host; prefer opening downloaded HTML offline for private work. Browser eviction or clearing can erase local storage.
- An exported method cartridge contains **user-edited title, goal and task titles**; manually review the complete JSON before sharing. The export deliberately strips progress, observations, recorded capability signals, identities and private bearer keys.
- One operator may run multiple hats. Local category matching is only a suggestion, never a reservation, food-safety claim, inventory adjustment, second person's acceptance, or completed transaction.
- Do not use the separate public Commons for private contact/health/legal details.
- Caps: 24 operations, 30 tasks per operation, 24 capability signals per operation and bounded text fields. Malformed cartridge imports are refused; importing a method makes a new operation and does not replace existing work.

## Verify
Run: node --test experiments/lantern-commons-014/test_spawn_017.mjs (Node 20+), or inspect the lantern-014-solo-desk Actions workflow on the proposed branch/PR. Tests cover offline runtime, three hats from one owner, truthful initial statuses, cross-hat matches, cartridge redaction/validation, CSV/HTML escaping, and a fourth freeform operation.

### Next crossing
If a real solo playtest proves useful, connect the SPAWN cartridge format to the existing connected Commons and invitation/federation services through **explicitly selected, receiver-owned crossings**. Do not treat this offline file as a live Supabase backend.
