# SPAWN 022 — The Evolutionary World Engine

## What this version makes executable

A world cartridge is no longer merely a description or a promise. It is an offline, **interactive HTML file** with a source-owned deterministic transition engine, an editable starting-resource state, real clickable simulation controls, a report generator and reset. It can be handed to another person to inspect, run, challenge, and fork independently.

SPAWN 017–021 already supply one real human across several independent operations; material gleaning; bounded maximum-action discovery; combinatorial imagination; and trial-linked learning. The **SPAWN 022** World Engine makes four competing, independent hypothetical *versions of a cooperative arrangement*, runs them under the **same inputs**, and produces a reviewable first test.

The primary source is [Lantern_022_Evolutionary_Worlds.html](Lantern_022_Evolutionary_Worlds.html). This is a single-file offline application, not a production web deployment.

### Four world laws, one operator

| Fork | Preferred moves | Hypothesis (not proven) |
| --- | --- | --- |
| Generosity | Try conceptual handoffs and additional work samples | Making spare outputs visible might increase opportunities to reuse them. |
| Efficiency | Document procedures early and avoid repeating first steps | A useful process card might reduce repeated work. |
| Independence | Model repeatability before dependence on new participants | An individual might be able to test more of a system alone. |
| Cooperation | Inspect possible handoffs, write a method, then expand | Testing interfaces between hats may expose important failures early. |

These aren't four enrolled people. They are **four alternative operating laws** applied to the same person's generic organizer/grower/artist/custom hats.

## Starting and comparing a world

1. Open SPAWN 022 locally and create a real operation (or seed the organizer/grower/artist roles).
2. In **Evolutionary World Engine**, enter a generic, shareable purpose. Choose **All unknown** or explicitly reuse existing *self-reported* inventory checks. This checkbox does **not** independently verify physical resources or grant permission to share them.
3. Select **Create four competing world forks**. Four distinct, versioned worlds now share one group ID and the same starting resources.
4. Choose **Compare four virtual turns each**. Each world uses a **deterministic action priority** over the same possible virtual actions: ask a material question, model one sample, model a handoff, document a method, model a repeat test.
5. Inspect the **world comparator**. It displays a common synthetic scoring formula for all worlds, measured entirely in **virtual** sample cards, hypothetical handoffs, method cards, and modeled repeat tests. It is neither a real-world outcome nor a projected probability.
6. Select any world, change one resource to *self-reported found*, *missing*, or *unknown*. That input changes in **every** related world and all virtual turn histories **reset**. Any private workboard tasks and actual observations remain unchanged.
7. Select a world, choose a law, then **Fork as independent version**. The new branch records parent ID and revision but inherits **no virtual events or claims of a completed test**.
8. Select **Stage a REAL field test** to create a distinct, unfinished workboard task linked to the SPAWN 021 Learning Loom. A future worked result counts only after a real observation on the linked task and a second experiment report. No virtual event becomes real evidence automatically.
9. Export a **strict JSON blueprint** or **standalone playable HTML** cartridge.

## Standalone playable HTML

The exported file embeds **source-controlled simulation JavaScript** and a JSON blueprint. It does not reference the original SPAWN app, a CDN, Vercel, GitHub, Supabase, an LLM, or any external runtime.

A recipient can:
- Open the HTML file offline on a desktop or phone browser.
- See the generic world purpose, world law and number of **roles** (not people).
- Change each resource check (unknown / self-reported available / self-reported missing).
- Actually press **Run one virtual turn**, **Run four turns from start**, or **Reset simulation** and watch state updates and an inspectable virtual event log.
- Export a **virtual simulation report JSON** clearly labeled `SIMULATION ONLY — NOT FIELD EVIDENCE`.

The cartridge is executable as a **virtual-world simulator**, not as a mechanism for moving real goods, booking venues, contacting participants, spending money, or making a real social network.

## Transfer & privacy boundary

- JSON blueprint schema: `abundent/world-cartridge/v1`, version 1.
- Only generic role **types**, limited resource category **keys**, an editable world **goal**, and a named operating **strategy** are included.
- Export deliberately resets every material to **unknown** and strips private IDs, gleaning notes, real task observations, physical availability findings, offers/needs, private contacts, virtual turn history and learning results.
- **Review the goal before sharing**. It is user-entered and intentionally retained as the world description. Do not write personally identifying details, confidential information or third-party secrets there.
- HTML export escapes script-breaking characters in the goal before embedding the JSON data. It uses text-only DOM assignment for user material.
- Import accepts only the limited JSON schema; it is not an interpreter for imported JavaScript, HTML, event hooks or arbitrary code. An imported blueprint starts as an untested isolated fork with all inputs unknown.
- Local private SPAWN state backups now optionally include bounded world histories, in addition to prior hats, gleaning and trial ledgers. Backups are different from shareable cartridges.
- Caps: up to 40 local world versions, max 8 role types per world, 12 virtual turns per world and 11 named materials.

## What "evolution" currently means

The operator can **create diverse versions, run comparable simulations, inspect simulated differences, fork a promising branch, alter one law, and stage a separately observed real trial**. This is an evolutionary *experiment loop*, not automatic optimization in the physical world or a guarantee of finding the best possible arrangement.

Virtual scores use identical editorial evaluation weights across strategies (apples-to-apples within the model). All simulations are artificial; these weights are not evidence of real-world social impact or material flow. A genuinely successful new method still requires human experimentation, consent at physical-world crossings, and eventually independent field replication.

## Tests and status

The workflow includes `node --test experiments/lantern-commons-014/test_worlds_022.mjs` and all predecessor suites. Among its tests are: shared starting resources, versioned independent forks, no fake real-world completions, simulation resets, strict schema validation, malicious goal HTML/script escaping, a separate Learning Loom field-test task, and **execution of the actual JavaScript extracted from an exported playable HTML cartridge** under an isolated test browser.

**Not claimed:** production deployment; a public verifiably hosted frontend; independent field trials; verified user safety; community transactions; proven physical impact; or a mathematically optimal world.

The code is a draft, stacked review PR (#171) on SPAWN 021 (#170); main and production services are not modified.
