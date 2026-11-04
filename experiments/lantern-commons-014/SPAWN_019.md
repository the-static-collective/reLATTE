# SPAWN 019 — MAXIMUM REACH, bounded action search

SPAWN 018 searches down to the smallest missing ingredient. SPAWN 019 searches in the other direction: **what is the highest-consequence action this same person can responsibly attempt or investigate, given a concrete horizon, priority, and a truthful record of available resources?**

This is not a global maximizer, market predictor, all-knowing AI or public network crawler. It is a deterministic, finite library of plausible next operations, tailored to the hats already created. It does not fabricate materials, contacts, venue permission, food safety or actual consequences.

## Try it

Open Lantern_019_Maximum_Reach.html in a recent browser, preferably saved locally for private work. It inherits the original SPAWN 018 offline workbench and its local storage key, so prior 018 answers on the same browser origin may be visible. It does not automatically scan the person's house, photos, calendar or garage.

1. Create or seed the community organizer, grower, artist, or other hats.
2. Under **The gleaning field**, record what you actually have and what is missing.
3. Under **The other direction**, pick **all my hats** or one, and choose **Today / 7 days / 30 days**, plus a definition of "largest": **reach, reuse, or cross-hat leverage**.
4. Optionally type a **private north-star goal** to add a user-defined, testable first-chapter candidate. That text does not establish any of its resources or outcomes.
5. Press **Search the largest responsible move**. Two separate answers appear:
   - **Largest startable proof**: highest-ranking candidate whose required ingredients are all self-reported found and which requires no separate external-authority action. This is only a hypothesis that a controlled local test could start, **not a claim of feasibility or verified impact**.
   - **Highest frontier in the catalogue**: high-scoring proposal whether or not its materials are found. Displays exact unknown, missing, checked, or cross-hat reuse-unverified requirements and a concise reason for its position.
6. **Seek the next constraint** asks one concrete supply or permission-related question, shows where to look and a lower-cost substitute. The answer is recorded in the same private gleaning journal; it can also appear in the gleaning questions even if it was absent from the initial starter kit.
7. **Stage the first actual proof** adds precisely one **TODO** task under a real hat, never marks it done and refuses duplicates. **Download a one-page frontier brief** makes a local, printable HTML document with explicitly labeled self-report status. It does not send an invitation.

The user controls whether to attempt a real action. Crossing into public participation, physical exchange, venue use, a sale, a publication, food handling, or third-party contact requires its own consent and real-world checks.

## What the search knows

- A bounded set of editable, source-owned action archetypes: one-page runbook, real inventory of one item, reusable sorting station, small original performance, tested first prototype, portable method kit, one-person cross-hat proof, a staged community gathering demonstration, and a reproducible Commons launch kit.
- Only hats that **actually exist** can contribute. One person with three hats remains one person. No fictional people, promised attendance, or invented partners.
- Each archetype declares horizon (1/7/30 days), a first testable artifact, an editorial reach/reuse/cross-hat score, a list of required gleaning question IDs and whether outside authority or safety review is needed.
- Reported-found ingredients under the wrong hat are shown as **possibly reusable; check again**, not as permission to double-use. Even within the correct hat, self-reported availability does not establish safety, suitability, capacity, ownership or actual future availability.
- **External-authority-gated** candidates are never automatically classified as ready-to-start, even with every inventory check marked found.
- An authored north-star phrase only produces a bounded *single-user first proof*; it does not hallucinate unknown partners, precise economic value, social reach, genuine impact or feasibility.

## Important limitation: "largest" is not an objective universal maximum

There can be no proof of the mathematically largest action without a known and finite universe of possibilities, comparable outcomes, real constraints, and consistent units of value. The software instead **searches a finite catalogue** for a candidate that ranks highly under an **explicitly selected human priority**. Reach / durability / cross-hat values are editorial scores on a 1–5 scale, **not measured forecasts**. This is only a useful prioritization heuristic; human judgment and field evidence outrank it.

**The dual-loop:**

- DOWN: Mission -> smallest useful slice -> missing ingredient -> look/confirm/substitute.
- UP: Known resources -> largest candidate under current constraints -> one actual proof -> record observation -> recompute frontier.
- ACROSS: possible resources between the person's different hats -> verify compatibility and actual permission -> propose a voluntary crossing only.

## Safety and privacy

- No cloud model, search engine, Supabase write, site deployment, new relationship, budget, payment, blockchain token, external execution, mass message or remote synchronization is invoked.
- Local storage stays under the browser origin and may be cleared. The optional original Commons Desk link has its own different rules; nothing is silently sent.
- Never treat "confirmed" here as independent safety/identity/stock verification. Perishable food, live events, child protection, electrical safety and legal/financial activity require appropriate external confirmation.
- The private backup includes your journal. A shareable method cartridge omits private gleaning answers, recorded offers and work observations; manually inspect its user-edited title, goal, tasks and custom question hints before sharing.
- The external-source horizon-searching / community-opportunity scanning that the user may want is a **separate potential future crossing** requiring explicit scope, source attribution, permission checks and no automatic contacting.

## Tests and status

Run: node --test experiments/lantern-commons-014/test_maximum_019.mjs

CI keeps the previous 017 and 018 suites, with new tests covering finite horizons, ranking, one-person scope, readiness gates, re-use uncertainty, gap seeking, human-written visions, first-TODO creation and local brief output.

Source is on a draft branch and human-review PR, not merged. GitHub Actions success is software-test evidence, **not a field outcome, verified public deployment, or proof of a real max-impact action**.
