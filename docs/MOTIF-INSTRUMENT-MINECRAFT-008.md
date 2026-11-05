# reLATTE-008 — THE INSTRUMENT GARDEN GOES TO MINECRAFT

**Experimental draft · Minecraft game-only · source-provenance verified · game execution not yet performed by this branch.**

This is the first proposed *new experiment* composed by MOTIF's Instrument Garden out of already signed, historically observed reLATTE Riff-Raft Minecraft results.

## Starting with reality instead of invented receipts

This branch stacks directly on reLATTE's `riff-raft-minecraft-007-two-custodians`. The original signed 004+005 returned native Mojang 26.1.1 game results are permanently archived in the branch:

`fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json`

`verifyExistingCustodyBytes` independently rechecks the exact fixture SHA256 `da6c556051f197e1d07578b5e435ae3b7132538c7c098a4add9e4acfd4572d42`, native P-256 signatures, original 004 and 005 raw Minecraft game traces, and the previous `R3_HOLD` dispositions. It reconstructs these authentic earlier **game** observations:

| World | Original fault | Counterfactual fault |
| --- | --- | --- |
| A | x=-13 → 3/9 lamps | x=2 → 5/9 lamps |
| B | x=17 → 6/9 lamps | x=-28 → 2/9 lamps |

These previously signed observations are **not** newly run by this project.

## Seeded new Minecraft experiment

MOTIF-020 is imported from its own pinned public GitHub checkout at runtime. Its first two *explicitly hypothetical* models agree with all old observations, and disagree when World B is measured at an as-yet-untried **x=-13 repeater fault**.

It compares available measurements using Bayesian expected information, cost, latency, the cost of inaction, a resource budget, and a HOLD option.

It selects a new, permissioned, Minecraft-only **instrument**:

- World B, vanilla seed `918273645`;
- build a new nine-stage Riff-Raft redstone circuit using the native reLATTE `buildRiffRaftRedstonePlan` and `validateWorldPlan` methods;
- remove the repeater at `x=-13 y=66 z=46`, allow vanilla ticks to propagate, and count nine lamps;
- compare whether powered lamps ≥ **4**, which discriminates the two toy models;
- restore the repeater and original circuit;
- require independent nonoperator final block-state readback before promoting any new **game** observation.

The plan generator emits a `pack.mcmeta` and seven executable `.mcfunction` files under `data/motif020/function/`. These are real vanilla command-language assets, not decorative pseudo-code; the source program is *not* automatically dispatched to a Minecraft server.

## Two distinct signed histories

**Old:** the archived 005 return and 004 ancestor are independently verified as already witnessed Minecraft game outcomes; their original HOLDs remain intact.

**New:** `sealSyntheticQuest` uses reLATTE's actual `makePolyglotHop`, `generateP256KeyPair`, `verifyCrossingEnvelope`, and `verifyReceipt` to create a new signed **game-proposal** crossing, child of the original 005 crossing, with a separate native receiver-local **R3_HOLD**.

The latter is *only* a signed receipt of a proposed instrument and a buildable datapack. It does **not** claim a server observed that datapack, any lamp lit in a new world, permission to execute actions, real soil restoration, physical custody, human identity, or prior-world admission. Generated keys are ephemeral; no trusted organizational key is claimed.

## Reproduce

From a local checkout of this reLATTE branch and a separate checkout of MOTIF-020:

```sh
npm install
MOTIF_ROOT="$(cd ../MOTIF && pwd)" node --test --experimental-strip-types test/motif-instrument-008.test.ts
MOTIF_ROOT="$(cd ../MOTIF && pwd)" node --experimental-strip-types experiments/motif-instrument-008/compose.mjs
```

The first test rechecks the original signed source. The second command writes:

```
work/motif-minecraft-instrument-008/
  decision.json
  proposal.json
  signed-held-proposal.json
  readback.json
  datapack/pack.mcmeta
  datapack/data/motif020/function/{setup,trigger,fault,reset,repair,read_lamps,restored}.mcfunction
```

The GitHub workflow `.github/workflows/motif-instrument-minecraft-008.yml` checks out the exact public MOTIF source commit `1fe5732acddacd52751bb73dc760d4fa30f651fa`; any future change to the MOTIF-020 engine requires consciously re-pinning and rerunning both suites. It also uploads the packaged instrument as an inspectable Actions artifact.

## Honest limits

The **selected target** is new to *World B*, not to Minecraft in general. The two models are seeds, not learned explanations. A Minecraft datapack is a usable game experiment blueprint, **not** evidence of executing it. The executable and real-time in-game observation/signed return interface is the next work item. Game observation never becomes real-world agronomy. The original cryptographic signatures establish integrity of old experimental game evidence, not source ownership by a human.

The output is HOLD even if the game instructions are good; permission to execute remains a separate operator choice. No GitHub action here writes to MEMENTO UNDERSTORY, JAR;VIS, reLATTE main or real land.
