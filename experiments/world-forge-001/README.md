# WORLD-FORGE-001 — A World That Can Walk

**Status:** independent, non-normative game experiment. Source-of-truth: an original fictional scene cartridge. **Not** an admitted reLATTE organ, Minecraft witness import, independently verified game-engine crossing, human consent, money, or a real-world skill claim.

The first bounded hypothesis: one inspectable declarative scene can generate a playable offline browser quest, an operator-triggered Minecraft Java 26.1.1 datapack with seven quest functions, and a Godot 4.x 3D walkable demo. Two layouts (ALPHA and BETA) differ by rotation/translation and keep the original seven semantic steps.

## Run

Requirements: Node.js 20+ (build/tests); no npm dependencies. From this directory:

```sh
node src/build.mjs
node --test tests/*.test.mjs
```

Then **double-click `dist/index.html`**. No local server, login, connection, payment, or installation required for the browser game.

- **Browser:** click “Visit next station” seven times or inspect map pins; use WITNESS → FORGE → OFFER TO ROOM. Export an explicitly **unsigned, synthetic** receipt. Each simulated world has an independent local session state. Receiver may HOLD or REFUSE; there is no ADMIT button.
- **Minecraft:** place `dist/minecraft` directory into the datapacks directory of a **new expendable flat Creative Minecraft Java 26.1.1 world**. Its `pack.mcmeta` must be at the datapack root. Run `/reload`, `/function worldforge:install`, then `/function worldforge:build_alpha` or `build_beta` at your chosen anchor, followed by `/function worldforge:start`, then sequentially `/function worldforge:step/1_garden` … `/function worldforge:step/7_arcade`. Requires permission to run commands. Placement **overwrites** 3×3 pads; do not use in a valued world. Neither real world was run from this environment.
- **Godot:** import `dist/godot-alpha` or `dist/godot-beta` as a project in Godot 4.x. Play, walk with WASD/arrows, E to visit the next station, R to reset. Generated scripts require engine QA on a computer with Godot installed.

The browser is the first playable product surface. Minecraft stations and Godot meshes are initial equivalent **models**, not rendered equivalence proofs. The Minecraft 26.1.1 pack uses `min_format`/`max_format` `[101,1]`. It does not support other game releases by claim.

## Design law

`WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION`.

`SOURCE DESIGN != ENGINE EXECUTION != HUMAN PARTICIPATION`.

All real source imports must default HOLD until exact bytes, source ancestry, license, identity separation, signature policy, independent observation, target version, and receiver permissions are actually verified. No unsigned model receipt may be upgraded into authority.

## Boundary toward CARTRIDGE-FORGE-001

This first pass **does not consume** signed data from reLATTE issue [#132](https://github.com/the-static-collective/reLATTE/issues/132) / draft [#101](https://github.com/the-static-collective/reLATTE/pull/101). It deliberately uses a new CC0 authored fictional cartridge so the export adapters can be evaluated without quietly upgrading the existing synthetic forge demo. The future import adapter must verify actual source-native witness payloads and reject missing independent observations, dishonest intermediate causal states, and unauthorized publication.

## Files

- `cartridges/jubilee-garden.v0.json`: original declarative, bounded fictional demo with seven stations.
- `src/worldforge.mjs`: validation, SHA-256 canonical content digest, two spatial projections, Minecraft 26.1.1 function adapter, Godot scene logic, synthetic model comparison.
- `src/viewer-template.html`: offline browser game template; loaded with fully embedded scene data by builder.
- `src/build.mjs`: deterministic artifact builder; outputs to untracked `dist/`.
- `tests/worldforge.test.mjs`: fail-closed input rejection, deterministic output, independent layouts, parity and anti-authority guards.

### Tests of the tests

Unknown source class, authority escalation, malformed fields, code-like material, overlapping stations, altered station content, off-grid coordinates, incompatible world instances, and missing steps must all refuse or produce distinct provenance. The report's `HOLD` means **not admitted**, not evidence that two official worlds have genuinely executed anything.
