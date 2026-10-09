# RIFF-RAFT-MINECRAFT-002 — The Living Redstone Chain

**Status:** bounded experiment, stacked on [RIFF-RAFT-MINECRAFT-001](https://github.com/the-static-collective/reLATTE/pull/96). The existing `MC_RIFF_RAFT_REDSTONE=0` behavior is unchanged.

## This time, a block has to actually cause another block to change

[THE RIFF-RAFT-002](https://github.com/the-static-collective/GHoT/pull/113) in GHoT exposes nine human-selected MAKE GROUND cues under strict synthetic resource accounting. [RIFF-RAFT-MINECRAFT-001](https://github.com/the-static-collective/reLATTE/pull/96) proved official vanilla authored Minecraft could represent them as nine individually verified station blocks, with a held reLATTE composition candidate.

The next question is no longer whether nine symbols can be rendered. **Can one admitted in-game input cause all nine independently measured stations to respond through actual vanilla redstone physics, and can an intentional fault halt only the downstream part of the sequence?**

The same source experiment remains pinned to GHoT commit `a63624f1be6a533f5ab927b1e4e8b1a629f1ba53`, but this is still only **a source-manifest handoff**: it does not execute GHoT's Python or import independently authenticated source receipts.

## Circuit

The 001 four districts and nine symbolic station markers remain intact at `z=44`.

The 002 addition is a nearby dedicated redstone lane at `z=46`:

- Nine redstone lamps below redstone wire at `(x, 65, 46)` for x = −40, −30, −20, −10, 0, 10, 20, 30, 40.
- Support blocks under all wire and repeaters.
- Six stretches of genuine `redstone_wire`, with five east-facing four-tick repeaters at x = −28, −13, 2, 17, 32 to restore power across the 80-block chain.
- One explicitly permitted trigger: `/setblock -43 66 46 minecraft:redstone_block`.
- The trigger is **not** placed by the world-building plan; it is a separate logged operator action after all equipment has been assembled and unpowered states independently checked.

**Causality here is Minecraft-world block-update physics, not any demonstrated real-world ecological feedback.**

## Native runtime proof sequence

1. Install official Mojang 26.1.1 vanilla server (SHA1-verified Mojang download), pinned Mineflayer client and RCON.
2. Admit the reLATTE CompositionInstance for the *game runtime only*; author issues only bounded `/fill` and `/setblock` commands on an isolated plot.
3. Check **all 9 lamps unlit** via server-side blockstate predicates.
4. Fault injection: explicitly replace the repeater at x=−13 with air, trigger a pulse and inspect **3 lit upstream + 6 dark downstream**, using server-observed `minecraft:redstone_lamp[lit=true]` state predicates.
5. Remove the trigger. Prove **9 unlit** after reset.
6. Reinstall the repeater, issue one operator trigger, and require **9 lit** with no stage-by-stage activation commands.
7. Disconnect the OP author, revoke author privilege and connect a **fresh non-operator protocol observer**. Independently inspect the lamps' `lit=true` properties in the client's reconstructed game world and confirm against the vanilla server.
8. Bind a digest of that observation **in addition to** the voxel block scan hash, because the original map records block types without lamp on/off properties.
9. Seal resulting world candidate and proofs in reLATTE as **R3_HOLD**—instance admission never admits its own output.
10. Preserve source-manifest ancestry, original/powered/failed/reset/observer stage states, exact action commands, native world save, and signed crossing/receipt artifacts.

A missing repeater, wrong state, missing fresh observer, mismatched source commit, inappropriate claim of physical ecology, or unexpected command behavior aborts the proof. The test fixture is a **game-world topology** only. Passing it neither proves real soil recovery nor that a real-world switch, fish pump, wave generator or Riff-Raft raft is safe to operate.

## Controls / expected data

| Phase | Stage lamps | Claimed evidence |
| --- | --- | --- |
| Before trigger | 0/9 | Vanilla server blockstate |
| Broken repeater | 3/9 (stages 1–3) | Server observes stopped in-game propagation |
| Reset | 0/9 | Same vanilla server after power is removed |
| Repaired and triggered | 9/9 | One input drives bounded in-game chain |
| Fresh non-OP observer | 9/9 | Independent client sees powered states |
| reLATTE destination | R3_HOLD | Signed result, no self-admission |

### Running

```bash
npm run verify
node --test --experimental-strip-types test/riff-raft-minecraft-002.test.ts
```

The native CI workflow `.github/workflows/riff-raft-minecraft-002.yml` installs and boots the official Mojang server, sets:
```bash
MC_RIFF_RAFT_PLAN=1
MC_RIFF_RAFT_REDSTONE=1
MC_RIFF_RAFT_REDSTONE_FAULT=1
```
and uploads the collected evidence. It is not a public Minecraft server, and all game-world commands are isolated to its CI server. All other existing experiments should behave as before when the opt-in env vars are unset.

## Three worlds: do not mix them

- **GHoT**: simulated resource proposals, checked conservation, owner-reviewed input cues. GHoT has not actually distributed any power or water into this Minecraft runtime.
- **Minecraft**: a real official game server, with real *in-game* redstone propagation and direct independent client observation, contingent on successful CI.
- **Physical world**: no actuation, ecology, energy, hydrology, equipment or human settlement has been observed; there is no physical-world admission.

Laws:

```text
SYMBOL != CAUSALITY
GAME CAUSALITY != PHYSICAL CAUSALITY
TRIGGER != AUTOMATIC AUTHORIZATION
BROKEN LINK != ABSENT SOURCE
BRIGHT LAMP != VERIFIED ECOLOGICAL GAIN
BLOCK-ID HASH != COMPLETE BLOCK-STATE HASH
SIGNATURE != SOURCE INDEPENDENCE
INSTANCE ADMISSION != RESULT ADMISSION
```

## Next step

**RIFF-RAFT-MINECRAFT-003 — THE REPLAYABLE REDSTONE RECEIPT**: independent temporal witnesses on separate vanilla runtimes replay distinct fault patterns and prove identical cause/effect claims before passing observation candidates to GHoT's resource simulator. An admission would still be owner-local; no physical-control export permitted.
