# Minecraft-010 — CRATER / The Minimum Causal Witness

**Status:** a new experimental Minecraft run has been executed and independently verified. This is a **game-only**, noncanonical research branch with signed **R3_HOLD**, not an autonomous public server deployment or physical-world claim.

## The question came from the preceding game

In the successful earlier reLATTE-009 experiment, an official vanilla Minecraft World B game actually measured **3 of 9** powered lamps at repeater fault **x = −13**. The return was independently verified, and MOTIF-021 conditionally favored one seeded hypothesis while holding the next expensive question.

MOTIF-022 reconsidered the **measurement procedure**, not merely the next guess. The actual 009 blockstate sequence was a contiguous lit prefix; if the same invariant holds under another bounded fault in World A, the two seeded hypotheses predicting **2 versus 3** lamps can be separated by inspecting the **third lamp**, rather than measuring all nine as the primary instrument.

Its new protocol selected:

| Parameter | Real test |
| --- | --- |
| Official server | Vanilla Minecraft Java 26.1.1, Mojang JAR SHA-1 verified |
| World | **A**, newly provisioned on localhost only |
| Seed | `381654729` |
| Fault | Repeater **x = −28, y = 66, z = 46** |
| Discriminator | Stage 3 lamp **x = −20, y = 65, z = 46** |
| Sentinel | Stage 4 lamp **x = −10, y = 65, z = 46** |
| Primary sensor | Two lamp-blockstate predicate reads, performed **before** the full census |
| Falsification audit | All nine server blockstates + fresh non-operator Minecraft protocol client |
| Restoration | All nine restored lamps checked by server and a second fresh non-OP client |

The instrument builder was not a copied, handpicked Minecraft target: `compose.mjs` **reverified the actual signed 009 game** and invoked MOTIF-022's `forgeMinimalWitness` from a pinned public checkout. reLATTE's existing Riff-Raft Minecraft planner constructed the new game apparatus and generated the actual `motif022:read_micro` vanilla function. A new P-256 signed, receiver-held proposed instrument was a child of the 009 game crossing.

## Actual outcome — two independent game worlds, two different experiments

**World A at fault −28: 2/9 lamps powered.**

- The **third** and **fourth** lamp were both **off** when read through the two-command in-game micro-probe.
- A subsequent census of **all nine** server lamp states independently observed a two-lamp contiguous prefix.
- A fresh non-operator Minecraft client agreed with the full fault pattern after author disconnect.
- Reset and repair restored **all nine powered lamps**, rechecked by another fresh non-OP client.
- The micro-probe predicted **2**, and the full nine-lamp audit measured **2**.
- The observation was signed as a **new** game-evidence crossing with a separate receiver-local **R3_HOLD**.
- A **second GitHub runner** reverified the complete old 004→005→008→009 lineage, the new 010 proposal and actual 010 result signatures, and recomputed the micro-versus-full game readings from the signed source.

The observed 2-of-9 pattern favors the same *seeded* position-invariant-prefix hypothesis as the earlier World B 3-of-9 result. This is evidence about these particular game fixtures, not proof of universal signal propagation or any human/physical environment.

## Successful execution and reproduction

[reLATTE Minecraft-010 live official-game workflow, complete with independent verifier](https://github.com/the-static-collective/reLATTE/actions/runs/42058320590).

The actual code paths:

```text
experiments/motif-instrument-010/compose.mjs          # prior P256 history → MOTIF-022 micro instrument
experiments/motif-instrument-010/ci-run.mjs           # official localhost Minecraft server lifecycle
experiments/motif-instrument-010/execute.mjs          # two-lamp read first, nine-lamp fault/repair witness
experiments/motif-instrument-010/trace-verifier.mjs   # pure gameplay/authority/instrument validator
experiments/motif-instrument-010/verify.mjs           # library for independent P256 ancestry and raw trace
experiments/motif-instrument-010/independent-check.mjs # independent second-runner CLI entrypoint
test/motif-instrument-010.test.mjs
test/motif-instrument-010-trace.test.mjs
.github/workflows/motif-minecraft-010.yml
.github/workflows/motif-minecraft-010-live.yml
```

The live workflow installs the previously prepared signed instrument from the exact pinned source CI artifact, downloads and verifies the authentic Mojang server jar, runs a fresh World A test on an ephemeral GitHub-hosted localhost server, and independently verifies its signed return in another runner. A 9-lamp recheck can refute a false cheap-sensor inference; mismatched, non-prefix and out-of-model results remain HOLD rather than being silently converted into success.

## What has *not* been proved

1. The **planning costs** (2.36 cost units versus the old estimate 5.5) are *seeded assumptions*. The full independent nine-lamp audit makes the total experiment more intensive than simply two lamp reads. We proved a **compressed primary measurement**, not measured savings of computation, electricity or money.
2. The hypotheses, priors and presumed 95% sensor reliability were hand-seeded, not learned from independent calibration.
3. The game run involved a separately connected non-OP observer, but that isn't an independently administered human operator; the independent verifier checked recorded signatures and bytes without reconnecting to the already completed game.
4. No physical water, soil, plants, power network, trusted person or user's live Minecraft server was touched.
5. Nothing was admitted into MEMENTO's persistent UNDERSTORY history or reLATTE canonical configuration, and no autonomous subsequent game was launched.

## The next genuine scientific question

Deliberately **falsify** the presumed prefix with a controlled lateral Minecraft power source. Would MOTIF's shortened sensor recognize when its own compressive representation stops being trustworthy, preserve the contradictory game receipt in UNDERSTORY, and choose a different measurement grammar? That would test its ability to improve a **method**, not merely update a prediction.
