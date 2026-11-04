# SPAWN 018 — Gleaning Engine: one person, many hats, material-first world-building

**Owning source:** Lantern_018_Gleaning_World_Builder.html

## Change of operating question

Rather than asking "Who do we need to recruit?", ask **"What is the smallest real action we could finish with resources we already control?"**

One human can operate community organizer, grower, artist and custom hats at the same time. Each hat has its own needs, work, and opportunities, but the person may already possess the material or skill one hat needs while acting in another.

SPAWN 018 adds a **local-first gleaning field** to SPAWN 017:

- **Derive a vertical slice:** from the operation's type, title, goal and task descriptions, a deterministic offline catalogue suggests a minimum action (run-of-show, inventory of one item, tiny creative set, photo workflow, signal-chain test, or a first publication draft). The catalogue is not an LLM or a web inventory scan.
- **Ask, never assume:** for each proposed ingredient, ask whether the person actually has it, where they might look, what a smaller substitute could be, or whether it is missing. Supplies, usable skill, permitted access, available time, and possible consent-based contacts are all distinct types of things to glean.
- **Keep an inventory of self-reports:** marked **I have it**, **Go look**, **Not available**, **Not relevant**; optional private evidence notes. A resource is never marked found by the tool itself.
- **Show the next smallest question:** if an essential ingredient is unknown, ask. If missing, show the cheaper alternative or a smaller proof; if two starter ingredients are confirmed, prompt an actual test. Neither input checks nor generated plans certify physical readiness.
- **Reuse across one's own hats:** a confirmed resource under one operation can be shown as a possible reusable input to another operation, with a separate check of quantity, compatibility, permission and current availability. It is never silently booked, double-spent, claimed by another person or published.
- **Explicit promotion to internal Commons:** only after a person marks an ingredient available can they choose **Offer this across my own hats**. That adds a local internal offer signal and does not contact the Supabase Commons, generate a token, or consent to a third-party transfer.
- **Gamification grounded in truth:** world-progress counts self-reported resources found, questions answered, and previously self-reported completed actions. There is no reward currency, simulated inventory, fabricated partner, or inflated proof of impact.
- **Teach SPAWN new questions:** add a custom micro-quest for an odd supply, free material, skill, opportunity or possible relationship. The *question* can be exported with a method cartridge, while found/not-found responses and private notes are stripped. Each cartridge still needs manual review for sensitive text.
- **Persist and back up:** SPAWN 018 has a separate local browser storage key from SPAWN 017. Its private JSON backup and confirmed restore include the gleaning journal. A SPAWN 017 v1 backup can be imported through the same private-restore tool to migrate the basic operations; there is no silent migration from another browser storage namespace.

## A three-hat real-use trial

1. Seed the **organizer**, **grower**, and **artist** operations. These are all one human, not three accounts.
2. In the organizer hat, choose the smallest verified first slice: for example, draft a one-page gathering schedule using confirmed details and a writing device. Do not claim an unconfirmed venue or date.
3. In the grower hat, ask whether one actual item is available, then inventory its quantity, condition and handling limitations. Mark a box **found** only if you actually have a suitable one; do not infer available food or safe handling from the role name.
4. In the artist hat, ask whether you have an instrument, a ten-minute window, and needed cables or recording ability. Shrink the test to a single piece without purchasing anything.
5. Enter a custom gleaning question like "old USB-MIDI adapter": look in the spare-cable box before treating it as a purchase requirement.
6. Confirm one input under one hat; inspect how another hat might reuse that input. If useful, explicitly add an internal offer or create a verification task. This is still one person coordinating their own resources.
7. Record an actual attempt and its observation on the original operations board. Fork an operation, then preview the method cartridge: it should contain no completion claims, no inventory findings, and no private evidence notes.
8. Download a private backup separately and test restore with deliberate confirmation.

## Boundaries

- Runs as one standalone static HTML file, entirely offline. No file access, camera access, background fetch, AI API call, crawling of a person's house, user-contact discovery, mass notification, external publication, or cloud synchronization.
- **Question recommendations are catalogue-derived**, limited to interpreted keywords and operation types. They can be imperfect. The human can add and correct them.
- Starter ingredient labels are **not a full safety or feasibility analysis**. Safe electrical power, food hygiene, lawful access and permissions, physical transport and handling may be needed regardless of a tiny first slice.
- "I have it" means **the operator reports it available**. The tool does not verify ownership, quality, capacity, availability at a future time, or permission to share. A possible contact is not an enrolled member.
- **Self-reported progress is not verified impact**; no automatic badge asserts otherwise.
- Do not type names, exact home locations, contact details, passwords, credentials or sensitive case narratives into shareable cartridge titles, questions, hints or alternatives. Method preview is explicit; the private backup is never suitable for publication.
- The offline page has a separate optional external link to the existing Supabase Commons Desk. No user entries are sent there automatically. The other service retains its own permission rules.
- 24 operations, 11 catalogue questions per operation plus up to 12 custom questions, 24 local capability signals per hat, text bounds and capped backup validation.

## Testing & deployment

Run: node --test experiments/lantern-commons-014/test_glean_018.mjs (Node 20+) to test offline source, first questions across three hats, no guessed inventory, possible reuse, missing-material results, custom reusable questions and state validation. Existing 017 and earlier Solo Desk tests remain in CI.

**Status boundary:** A source branch and passing CI are a reviewable implementation, not an independently verified live frontend, real physical inventory, or multi-person federation. Do not silently replace the existing Supabase-hosted Commons Desk or GitHub Pages. The next necessary proof is a solo human actually finding an overlooked resource and using it to finish a smaller action.
