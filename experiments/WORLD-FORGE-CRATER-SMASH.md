# WORLD-FORGE-001 x CRATER-SMASH-002

Status: **experimental, unmerged until review**. Two offline fictional-source world prototypes,
not an admitted reLATTE organ or independently witnessed external crossing.

## Local test and build
Requires Node.js 20+; no install step and no production dependency.

```sh
node --test experiments/world-forge-001/tests/worldforge.test.mjs
node --test experiments/crater-smash-002/tests/crater.test.mjs
node experiments/world-forge-001/src/build.mjs
node experiments/crater-smash-002/src/build.mjs
```

Open `experiments/crater-smash-002/dist/CRATER-SMASH-002-PLAY.html` locally.
Open `experiments/crater-smash-002/dist/godot-alpha/` in Godot 4.x,
or install `experiments/crater-smash-002/dist/minecraft/` in a fresh disposable flat
Minecraft Java 26.1.1 world. The Minecraft functions overwrite blocks; use a throwaway world.
Requires Java 25 and game ownership for official Java 26.1.1 execution.

The original authored cartridge is CC0; code licensing is not asserted by this proposal.
No generated `dist/` files are committed. The first build generates the shared
Minecraft fixture needed by the second build.

## Evidence scope
- Model checks and local browser tests have run in conversation evaluation.
- Generated Godot/Minecraft files have NOT been observed executing in a real engine in
  this integration. CI jobs may validate Godot **after** this PR is opened.
- Minecraft and Godot adapters currently do **not** match browser simulation's repair
  inventory / consent semantics; geometry parity is not procedural parity.
- No signature, independent observer, foreign receiver authority, human participation,
  or source-native PR #101 proof is claimed.
- This does not modify reLATTE normative core.

## Next gates
1. Review this standalone source, preserve original hash/ancestry and fail-closed tests.
2. Independently run official Minecraft 26.1.1 and generated Godot 4.x scenes;
   capture logs, version and world states, and repair discrepancies.
3. Import raw pinned, verified #101 source with distinct author/observer.
4. Rehearse a bounded skill in a *new* engine instance, preserving discrepancies.
5. Receiver local decision remains HOLD / REFUSE until separately authorized.

Related: reLATTE issues #132, #134, #136; draft PRs #101 and #74.

**WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION**
