# RIFF-RAFT-MINECRAFT-001 — MAKE GROUND, BUT LET THE WORLD ANSWER

> A Rube Goldberg terraformer rehearsed in **official vanilla Minecraft**, carried through reLATTE, and sourced to the real GHoT Riff-Raft experiment.

## Source ancestry

- [GHoT THE RIFF-RAFT-002 — Make Ground Rube Goldberg Terraformer, draft PR #113](https://github.com/the-static-collective/GHoT/pull/113), exact source **`a63624f1be6a533f5ab927b1e4e8b1a629f1ba53`**.
- Earlier [RIFF-RAFT-001](https://github.com/the-static-collective/GHoT/pull/111) routes simulated resources through a multi-steward land/shore/river/floating topology.
- reLATTE's [VANILLA-WORLDBUILDER-006](https://github.com/the-static-collective/reLATTE/pull/74) composes an actual Mojang flat world with bounded `/fill` and `/setblock` effects verified by an independent vanilla server and a freshly connected, non-operator observer.
- reLATTE's [COMPOSITION-INSTANCE-001](https://github.com/the-static-collective/reLATTE/pull/77) enforces `INSTANCE -> R3_ADMIT -> runtime -> fresh observer -> CANDIDATE -> R3_HOLD`.
- The source MAKE GROUND documents remain in Drive. Source principles: **TERRAFORMING != TOTAL DESIGN; SEED RELEASE != PLANT ESTABLISHMENT; SELF-CHECK != INDEPENDENT WORLD CONTACT**.

**Scope:** This branch implements a Minecraft world-authoring variation, nine verifiable in-game station anchors, a precisely pinned GHoT simulation-document manifest, TypeScript hostile tests, and a new official-vanilla Minecraft CI workflow. It does **not** implement automated in-game redstone causality between all stations; that is a further experiment, not an achievement to silently assume.

## Nine stations in the world

This branch changes no normative `src/`, no stable `schemas/`, and no reLATTE core. It adds a strictly **opt-in** world authoring mode `MC_RIFF_RAFT_PLAN=1`.

The existing bounded world grammar composes four districts and a world-heart. A Riff-Raft authoring adapter appends a fixed, signaled nine-station trail to the **northern edge**:

| Cue | Vanilla block marker | Intent versus reality |
| --- | --- | --- |
| READ_FIELD | note block | The signal bell can mark a field observation invitation; it is **not** a real soil sensor |
| LAY_BONES | stone bricks | Earthworks model, not an erosion-certified berm |
| CATCH_WATER | blue stained glass | Bounded water-storage **symbol**; avoids pretending game-world water became usable freshwater |
| MAKE_SHADE | oak leaves | Shade marker, not measured microclimate |
| MAKE_GROUND | rooted dirt | Soil substrate image, not living soil ecology |
| SEED_NUCLEUS | oak sapling | Planted attempt, not established vegetation |
| FEED_FIELD | composter | Compost cycle symbol, not automatically created biomass |
| WITNESS_DELTA | observer | An in-game observer block is symbolic; actual independent observation is the **fresh, non-OP protocol client** |
| ONE_METER_OUTWARD | amethyst block | A candidate next region, **not** land claim or ecological success |

The stations are at `(x,65,44)`, x = −40, −30, ..., +40. Each has a stable substrate and a server-and-client-checkable final anchor. One copper-colored track connects the scene visually; it is **not powered redstone**. Minecraft operations are bounded by inherited `WORLD_BOUNDS`. The existing four districts are kept intact.

A source-defined GHoT `README` or simulation name is not automatically authority to spawn new world effects. The in-repo `donor-manifest.json` pins the GHoT source document and commit, nine stage names and four explicit nonclaims. It is **only a document/stage identity handoff**, **not** actual GHoT runtime receipts, a verified imported Python log, a signed GHoT capability transfer, a complete independent reading of GHoT commit bytes, or a physical device reading. A future experiment should replace it with an actual GHoT signed work result if owners agree.

## reLATTE composition roles

```text
GHoT simulation ancestry @ SHA
     |
  bounded document/stage manifest
     |
  reLATTE source observation of manifest BYTES
     |
  signed R3_HOLD donor INTENT
     |                  no world side effects yet
  operator selects opt-in Minecraft runtime
     |
  CompositionInstanceSpec includes riff-raft capability
     |
  signed INSTANCE -> R3_ADMIT (instance only)
     |
  official vanilla 26.1.1 server
     |
  Mineflayer operator issues bounded block commands
     |
  vanilla server witnesses EVERY action sample and nine anchors
     |
  operator disconnects
     |
  fresh distinct non-OP observer reconstructs region
     |
  exact observed-state digest + action trace
     |
  signed CANDIDATE -> R3_HOLD
     |
     X no self-admission
```

Even if the official Minecraft test passes, its evidence supports **block placement and world-state observation only**. It never demonstrates physical soil improvement, fish safety, wave energy, independent GHoT simulator execution, redstone-driven plant growth, genuine ecosystem succession, or field restoration.

`PLAN != ACTIONS != OBSERVED STATE`

`GAME SUCCESS != ECOLOGICAL SUCCESS`

`GHOT OFFER != MINECRAFT COMMAND AUTHORITY`

`INSTANCE ADMISSION != RESULT ADMISSION`

`AUTHOR != OBSERVER`

`WORLD-BUILDER RECEIPT != SIGNED REAL-WORLD FIELD WITNESS`

## Running the bounded tests

Run without network, Minecraft server, GHoT adapter installation, or hardware:

```sh
npm install
node --test --experimental-strip-types test/riff-raft-minecraft-001.test.ts
npm run verify
```

These tests check the original four districts unchanged, nine bounded and exact-ordered stage anchors, SHA-stable plan production, byte-different donor observations, strict tamper/refusal scenarios, reLATTE signature validity of an **intent** on HOLD, and signed instance-only admission without fake candidate evidence.

## Running a native vanilla proof

The workflow `.github/workflows/riff-raft-minecraft-001.yml` performs the high-cost physical game-simulation crossing: download official Mojang 26.1.1 server with SHA-1 verification, install pinned Mineflayer and RCON clients, run `MC_RIFF_RAFT_PLAN=1`, have the bot issue the actual voxel commands, observe them from a distinct non-OP client, verify the nine anchors from the server, and produce a signed reLATTE candidate HOLD.

Artifacts include server logs, version metadata, action trace, world map, crossing/receipt evidence, observed field hash, and saved native world region.

This is an **isolated localhost-only CI server**, not a public multiplayer instance or always-on hosted Riff-Raft realm. JavaScript event causality is not automatically wired into redstone just because Minecraft stations exist.

### Integrity and security limitations

The source manifest is bound to one *claimed* GHoT commit and exact local content. No automatic fetch of that source commit is executed by this bridge, so the manifest's **semantic fidelity** to future GHoT changes is unverified. Additional changes to GHoT require explicit refreshed provenance, consent and tests; never silently accept another SHA.

The signed crossing signs a locally constructed reLATTE envelope and the simulated donor bytes; it does **not** verify actual physical events. The true Minecraft observer stage is separate and never skipped merely because the signature verifies.

## Next frontier

**RIFF-RAFT-MINECRAFT-002 — THE LIVING REDSTONE CHAIN.**

Use survival-mode mechanics on a bounded isolated vanilla plot: a human may start one redstone event that actually propagates a nine-station physical-game causal chain. Meter each step as a distinct game-state observation and reconcile inventory/water and trigger provenance. Test chunk unloading, missing blocks, block-update timing, partial failures, server restart, and intervention with a separate observer. End the chain with a candidate proposal, **not** unauthorized Terraformer execution.

Then compare **three distinct result classes** rather than merging them:

1. an intended Minecraft stage;
2. an actual game-world block/trigger observation;
3. an independent real-world field observation (currently **none**).

**The first voxel seed can become a world experiment without pretending the voxel world is the physical world.**
