# CRATER-SMASH-002 — THE WORLD SURVIVES

> **The meteor doesn't make a portable skill. The recovery procedure might.**

Status: **bounded fictional model + generated cross-engine scenes**. No independent real-world witness, engine-runtime verification, or receiver admission is claimed.

CRATER-SMASH-002 extends WORLD-FORGE-001's seven-location Jubilee Garden scene with two different crater scenarios, a local-first salvage-and-recovery loop, an inspectable repair-event ledger, a source-bound `recovery-candidate/v0` data model, and an owner-local receiver that defaults to `HOLD` and can `REFUSE` with no effects.

## Try the game (zero setup)

Double-click **`dist/CRATER-SMASH-002-PLAY.html`**. The whole application, styles, data and logic are in one HTML file. There is no network, login, telemetry, persistence or AI API dependency.

1. Choose World A and click **CRATER SMASH!** to simulate an impact.
2. Tap stations on the map and **Scavenge supplies**. Every location has one fictional supply cache.
3. **Repair station** when you have enough materials. A breached pad costs twice as much as a damaged pad; intact stations need no repair.
4. After at least one repair, **Forge recovery candidate**. Its steps come from local simulated *repair events*, not a presumed plan or a visual final state. The candidate defaults to `HOLD`.
5. Switch to World B, simulate its different crater, and choose **Rehearse here (read-only)**. The comparison shows which source repairs have matching model preconditions and which diverge. It **does not repair, permit, or modify** the receiving world.
6. Try **Receiver: REFUSE**. Rehearsal becomes unavailable while refused. Export the world receipt, candidate, and rehearsal report as inspectable JSON.

World A's Garden/Forge take severe damage; World B's Forge gets the direct hit. The same cartridge source digest persists in both. Their independent *fictional local* histories, inventories, and decisions never overwrite each other.

## Run the source and tests

Requires Node 20+ (no npm dependencies):

```sh
cd crater-smash-002
npm test
npm run build
```

For the optional Chromium browser QA: Python with Playwright and an installed Chromium executable are needed. The test script defaults to `/usr/bin/chromium` inside the evaluation environment, so adjust that executable path locally before running.

The project ZIP includes `world-forge-001/` because the generator imports the **exact original cartridge validator, layout projection, hash and Minecraft pad generator**. Do not replace source bytes without updating the source digest and reviewing the consequences.

## Minecraft Java datapack (generated, not runtime tested)

`dist/minecraft/` retains WORLD-FORGE-001's original stage and seven-step quest, and adds `crater:impact_alpha`, `crater:impact_beta`, and `crater:visual_repair_{world}_{station}`.

**ONLY use a new disposable flat Creative world**; commands overwrite blocks. For a sample:

1. Copy `dist/minecraft/` into the new world's `datapacks/crater-smash-002/` such that `pack.mcmeta` is at the datapack root.
2. Use the Minecraft **Java 26.1.1-specific** format chosen by WORLD-FORGE-001. This format has not been independently confirmed or loaded in this build.
3. In game, stand at a deliberately chosen anchor, run `/reload`, `/function worldforge:build_alpha`, then `/function crater:impact_alpha` **without moving**.
4. Use `crater:visual_repair_alpha_garden` and similar commands to recolor the corresponding pedestal. These commands are *visual-only*: Minecraft inventory, salvage, and recipient decisions are **not** implemented in the datapack.

The crater is a **stylized surface scar**, not a physical void carved through the ground. It places blocks at a finite bounded area. It does not secretly issue player commands, integrate a server, or import independent gameplay observations.

## Godot 4.x (generated, not runtime tested)

Open `dist/godot-alpha/` or `dist/godot-beta/` as a Godot 4 project. Move with WASD or arrows; press `I` to visualize the impact, then `E` while near a station to visually restore it. Godot's geometry is generated using procedural ring meshes and colored station blocks. It does *not* implement or claim verified parity for the browser recovery-cost model. Use the browser demo as the executable model for salvage and candidate comparison.

## Source boundaries

```text
SIMULATED IMPACT != REAL IMPACT
MODELLED ACTION TRACE != INDEPENDENT OBSERVER
COMMON SOURCE DIGEST != VERIFIED GAMEPLAY REPRODUCTION
SIMILAR END STATE != MATCHED PRECONDITIONS
PORTABLE REPAIR PROPOSAL != PERMISSION TO EXECUTE
RECEIVER HOLD/REFUSE != AUTO-ADMIT
```

All world events are created locally, recorded as `LOCAL_MODEL_SIMULATION`, and exported as unsigned receipts. The `source_sha256` anchors the unchanged original **design**, not a signature over the new candidate or proof of external events. External reLATTE source-native work remains separate in draft Minecraft PR #101 and the CARTRIDGE-FORGE issue #132. This demo does not import either one's native witness evidence.

## Results

- **37/37** Node test cases passed at build time, including independent world separation, deterministic damage, salvage inventory, repair and reconstruction, signature nonclaims, tamper refusal, and refusal blocking.
- Chromium desktop/mobile UI clickthrough exercised the impact, scavenging, repair, candidate construction, cross-world rehearsal and REFUSE; **zero page errors** and **no horizontal overflow at a 390px mobile viewport**.
- Minecraft 26.1.1 and Godot 4.x engine-runtime tests are **not yet performed**. Generated outputs are *candidate adapters*, not validated cross-engine witness.

## Next actual engineering gate

Execute in a disposable real vanilla Minecraft world and a Godot runtime, capture exact versions and raw observations and verify intermediate sequences; after that integrate pinned reLATTE draft source #101 to establish a real independent proof before claiming transferred capability.

**Rule:** preserve the source, rehearse the rule, respect the refusal.
