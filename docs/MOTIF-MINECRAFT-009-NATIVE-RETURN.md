# RIFF-RAFT × MOTIF-009 — The Instrument Returned an Actual Game Observation

**Status:** New official vanilla Minecraft 26.1.1 game-world experiment, signed held return, independently reverified and interpreted by MOTIF-021. Remains draft, game-only, noncanonical.

## The complete successful experimental loop

The previous reLATTE Riff-Raft 004/005 experimental generations left a P-256-signed archive of two real **Minecraft** game histories. MOTIF-020's bounded Instrument Garden examined two seeded rival causal explanations and composed a new question that neither prior world B experiment had observed.

**New instrument:** In an independently generated official Minecraft world B (server seed `918273645`), use the existing native nine-stage reLATTE redstone plan and the new MOTIF-generated datapack to remove the repeater at **x=-13, y=66, z=46**. Measure how many of the nine lamps remain powered after game ticks; restore the original circuit. The toy models predicted **3 vs 4** lamps, threshold **≥4**.

### Observed result — NOT a fixture

**World B yielded 3 powered lamps out of 9 at the new fault.** Its classification was `LT_4`.

The source job:
- independently reverified original 004/005 signed game histories and the new signed instrument before touching the game;
- fetched and SHA-1-verified Mojang's official 26.1.1 server jar;
- provisioned a **fresh, localhost-only** vanilla world and installed the actual generated `.mcfunction` datapack;
- ran setup, fault, trigger, waited for vanilla ticks, sampled all nine real server blockstate predicates;
- disconnected the author, kept unloaded-world hazards away using a distinct nonoperator chunk keeper, and connected a **fresh non-operator Minecraft protocol client** to read the same nine fault states;
- reset, repaired the repeater, re-powered the circuit, observed all **nine restored lamps** via the server and a second fresh non-operator client;
- signed the raw result as an entirely **new** P-256 reLATTE crossing child of the instrument crossing and issued a separately signed receiver-local `R3_HOLD`.

The independent second runner **did not trust the source runner's success flag**. It reverified the complete old 004/005 signatures, 008 proposal signature, and new 009 signed bytes, derived the observed fault count from the raw nine game-block entries, checked agreement with the fresh non-OP observer and correct nine-lamp restoration, and intentionally changed a signed byte to confirm rejection.

A separate MOTIF-021 interpreter consumed the verified 3-of-9 game result, updated the seeded Bayesian odds (under the assumed 95% measurement reliability), provisionally favored `position-invariant-prefix`, and returned **HOLD** because the next differentiating test exceeded the current declared budget. A new P-256 signed research return (also `R3_HOLD`) records the learning step without claiming new gameplay.

### Verified actions and artifacts

[Successful **reLATTE-009 official-game + independent re-verification** — GitHub Actions run 42048208699](https://github.com/the-static-collective/reLATTE/actions/runs/42048208699).

Artifacts:
- `motif-009-new-vanilla-world-b-evidence` — actual signed game result, nine-lamp server/client blockstate snapshots, source game log, version metadata and prior proposal.
- `motif-009-independent-game-return` — independently reverified game receipt **and signed MOTIF-021 epistemic update**.

Source commit `d92a02cda7137dc6ae0357b88d8e4289a93db38d`. Observed game crossing `relatte-crossing-v0:732772158271ec11a0684830505bad3bc2e61034e5a1b4bb44da4f97be8816d4`.

### Third organ: real MEMENTO UNDERSTORY

Private MEMENTO branch `experiment/understory-motif-009-verified-game-return` consumes **the real signed result** from that exact run, independently replays the native reLATTE proof again, validates the signed MOTIF-021 interpretive descendant, and constructs six native UNDERSTORY record families. [MEMENTO Actions 42049030794](https://github.com/the-static-collective/MEMENTO/actions/runs/42049030794) passed. **HOLD** and unresolved association are preserved; no private memory files or canon are written.

## Boundaries

- Actual game effects were observed in an isolated Minecraft runtime; no real soil, vegetation, water, power grid or physical resource was changed.
- The independent verifier is a separate GitHub runner rechecking signed evidence and recorded blockstates; it did **not** reconnect to the previous live game. The nonoperator Minecraft observer was a second client on the same game server, not a separately administered physical witness.
- The new game result was genuine, but the two rival hypotheses and 95% measurement reliability were **seeded assumptions**. A 3-of-9 result is not proof that the favored model describes all worlds.
- A signature establishes integrity of bytes and a key, not a human identity, social trust, truth, or owner authority.
- No next game was automatically launched. Inaction cost was explicitly considered, and the new question returned as a held research candidate. All crossings remain receiver-local `R3_HOLD`.

## Reproduction

The runner is `.github/workflows/motif-minecraft-009.yml`. The native modules are:

```
experiments/motif-instrument-009/execute.mjs        # author and read game
experiments/motif-instrument-009/trace-verifier.mjs # pure blockstate validator
experiments/motif-instrument-009/verify.mjs         # independent signed replay
experiments/motif-instrument-009/learn.mjs          # actual MOTIF-021 interpreter
test/motif-instrument-009.test.mjs                  # hostile boundaries
```

The current source CI is pinned to MOTIF-020 commit `1fe5732acddacd52751bb73dc760d4fa30f651fa` and MOTIF-021 commit `c9c5030667beb98da3863c2ec3e9ad828737b8a6`. Changing them requires re-review of the experiment. The original archived 004/005 evidence remains unchanged.
