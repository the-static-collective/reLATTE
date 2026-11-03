# LANTERN COMMONS 006 — The Hand Above the World
**Status:** operator-selected game-world event experiment. Draft, not merged or production.

Inspired by the distinctive toy-god / blessing-and-catastrophe play of *Black & White* (2001). This is an original Minecraft experiment, not a remake, modification or affiliation.

## First playable organ
A bounded 19×19 synthetic sky-island staging region at absolute Overworld coordinates **x=100…118, z=0…18, y=63…66**. It is constructed only in a fresh/disposable **Minecraft Java Edition 26.1.1** Creative world; using it in a lived-in save would overwrite existing blocks and is **not** safe.

At an **operator-owned server console** (cheats/OP), use:
```
/function lantern:events/prepare
/function lantern:events/drought
/function lantern:events/mercy    # or /function lantern:events/abstain
/function lantern:events/show
```
Optional side doors (not required by the currently verified comparison workflow):
```
/function lantern:events/tempest
/function lantern:events/flood
```
The weather commands act on the whole **disposable game world**, not solely on the arena, so the experiment is opt-in and not safe for shared inhabited servers.

The `prepare` act makes a water-supported crop garden and pond. `drought` removes water and crops. Operator intervention `mercy` restores crops and water; `abstain` records an explicit decision without changing the environment. `tempest` summons actual vanilla game lightning and `flood` expands water in the laboratory zone. These are **game-only interventions**; they do not imply moral value, karma, player intentions, or real physical world effects.

`data get storage lantern:world_events history` shows a local fictional event log. The game command log is **not cryptographically authenticated** by itself. The separate independent non-OP observer code records actual block names at six sample positions at three stages, operator command replies, source function SHA256s and world-save metadata.

The player-facing "God hand" in this first cut is a manually selected `/function` command. It does not yet have a gesture UI or agent autonomy.

## A versus B
Two independent official Java 26.1.1 world servers are created in GitHub Actions:
- **MERCY**: PREPARE → DROUGHT → RESTORE.
- **ABSTAIN**: PREPARE → DROUGHT → LEAVE WORLD AS-IS.

Both begin with the same documented build and drought script, but intentionally different seeds, then diverge according to a scripted operator choice. The desired result is **a material-world divergence in independently observed game blocks**, NOT a claim about human economic or ethical effectiveness.

The comparison job verifies the parent signed 005 practice cartridge from [successful 005 run](https://github.com/the-static-collective/reLATTE/actions/runs/41693910023) while its 7-day artifact is available. It then creates a **new, signed, parent-linked reLATTE CrossingEnvelopeV0**, a separate LocalReceiver RECEIVE receipt, a signed **R3_HOLD**, verified payload custody, and restarts its local journal.

## Non-negotiable distinctions
- `GAME WEATHER != PHYSICAL CLIMATE`
- `SCRIPTED OPERATORS != FREE-WILLED VILLAGERS`
- `DIFFERENT SEEDS != CONTROLLED ECONOMIC EXPERIMENT`
- `ENVIRONMENTAL DIVERGENCE != MORAL VERDICT`
- `GAME COMMAND RESPONSE != INDEPENDENT GAME OBSERVATION`
- `R3_HOLD != ADMIT` and `CARTRIDGE != AUTHORITY`
- `PARTIAL 003 PACK != WHOLE LANTERN SOCIETY`

No live server endpoint is exposed. Client and RCON bind localhost on disposable CI runners. No authority is granted over another player or group. In the current version, weather is global to the disposable world, while material changes target only the 19×19 staged area.

## Next game
A player-directed World Hand UI, consent-gated event prompts, dynamic events reacting to player-built structures, emergent multi-node migration and third-world reproduction. Those features need separate tests, source acceptance and actual player permission. The 006 code does not implement them yet.
