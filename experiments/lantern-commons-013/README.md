# LANTERN COMMONS 013 — The Living Commons

**A playable, offline, forkable browser model.** This is a distinct medium from the verified Minecraft Java 26.1.1 world-save cartridge series (010–012). It is not a Minecraft game client, a reLATTE signed crossing, or a human sociology experiment.

## One-click start

Open **Lantern_013_The_Living_Commons.html** in any modern browser on your phone, Mac or PC. No server, API key or command line is needed. The file is self-contained (no remote JavaScript, fonts or images). Four major buttons are the entire operating model: Create life, Disturb the peace, Let them be, Fork reality.

Each actor has finite food/seed/wood and protected personal grain reserves. Actual human minds are **not** represented: role-based decisions and conversation replies are developer-authored and entirely inspectable. The browser farming yield is a toy model, not the actual Minecraft game mechanics.

## A 90-second playtest

1. **Create life** to introduce a neighbor who arrives without free supplies.
2. **Disturb the peace → Drought** to change the environmental constraints.
3. **Let them be → Watch seven days** to watch their autonomous authored strategies, voluntary assistance or refusals, and field/resource events.
4. **Fork reality** to seal a cryptographically content-addressed model snapshot. The original remains unchanged.
5. **World Shelf → Explore copy** on the original foundation, then choose **Rain** instead of drought. Seal the alternate outcome. Choose **Compare** to inspect differences.
6. Ask an inhabitant *“Why won't you share?”* or *“How could we build irrigation?”* and get a scripted answer using current state.

## Storage, provenance and safety

* The current working copy auto-saves into this browser's localStorage when allowed. Some sandboxes and privacy modes block this; a warning appears. **Export whole shelf** regularly if you want durable or portable history. The Export button downloads a JSON file; Import validates each model cartridge's SHA-256 content identity before accepting it.
* A sealed cartridge contains a full snapshot of the **browser model's state**, engine version, parent cartridge SHA-256, branch/version label and a SHA-256 identity. Checkout copies, never edits the stored parent.
* Use `example-world-shelf.json` via Import to load prebuilt drought and rain branches sharing one original founder. It will not replace your current working world.
* Spoken/chat messages are not included in world exports. Browser saves are local by default and no network calls are made by the app; explicit outbound links to public GitHub evidence exist.
* Limit: 12 fictional inhabitants; 64 stored model cartridges; 180 journal lines per working world. Save exports and start new shelves when needed.
* State integrity is checked locally and ensures unaltered bytes of exports **unless an adversary deliberately recomputes hashes**. SHA-256 is not an authentication signature, a proof of independent consent, or an anti-cheat security boundary.

## What this does NOT do

The browser does **not** open, mutate or generate Minecraft `.mca` worlds, transfer items in actual Minecraft, create signed source-native reLATTE crossings, deploy anything to Abundent, authorize real-world actions, or demonstrate that humans cooperate. The verified LANTERN 012 physical in-game harvest and the full-world zipped Minecraft cartridges remain their own lineage.

Minecraft source proof: https://github.com/the-static-collective/reLATTE/actions/runs/41748390711

Review source PR: https://github.com/the-static-collective/reLATTE/pull/155

## Inspection

Source for this portable HTML is also split into `engine.js`, `ui.js` and `index.template.html` (the built single-file HTML embeds both). Tests are in `test_engine.mjs` and can be run by developers using `node --test test_engine.mjs`. The GitHub PR uses a separate CI gate to check engine logic and embedded-source parity.

Next honest step: a separately authorized bridge that converts a subset of the browser events into **real Minecraft world-copy transformations**, with an independent non-OP observer, hash-pinned source parent, and native HOLD receipts. Until such a bridge actually passes the official Minecraft workflow, treat the browser and game worlds as distinct artifacts.