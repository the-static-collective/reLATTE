# WORLD-FORGE-004 — independent readers / bounded visual-state crossing

**Scope:** Experimental stacked draft on [WORLD-FORGE-001 / CRATER-SMASH-002 PR #138](https://github.com/the-static-collective/reLATTE/pull/138). Never an admitted core reLATTE organ.

## This specific crossing
- Two newly provisioned **official Minecraft Java 26.1.1** worlds execute the existing original build→impact→repair commands.
- A **separate Node child process** joins each loopback server as a **non-OP Minecraft protocol client** (Mineflayer) with no RCON credentials. Its own `blockAt` reads the block after each operator command. The parent verifies `ops.json` does not contain this user and retains the original RCON author trace.
- Two freshly generated **Godot 4.4.1** scenes have a real `BoxMesh` recolored at build→impact→repair. An operator-only Godot process serializes three pure scene snapshots; a **separate fresh Godot engine process** reads the saved `PackedScene` meshes and `StandardMaterial3D.albedo_color` without invoking operator code.
- `src/verify.mjs` compares strict actual observed **three-stage visual-state sequences** across each engine/world. It cannot accept self-report, missing intermediate steps, wrong seeds, wrong source hash, non-OP mismatch, incompatible version, missing snapshot hashes, or authority claims. Output stays `HOLD`.

The Godot scenes **map stylized colors to analogous Minecraft material names**; this is *bounded visual-state parity*, not a claim of identical physics, geometry, inventory/repair costs or skill reproduction.

## Reproduce / gates
`node --test experiments/world-forge-004/tests/verify.test.mjs`

GitHub Actions `world-forge-004-independent-witness.yml`: 4 independent engine/world jobs + final cross-engine artifact comparison. Must inspect the exact run's logs, artifacts, commit SHA and engine versions; a green unit test is not a runtime witness.

Minecraft tests create disposable **loopback-only, offline-mode** servers and accept the server EULA solely inside those throwaway CI jobs. Do not aim the datapack at a valued world: its commands alter a bounded chunk area. Godot jobs save `.tscn` snapshots to a disposable workspace.

## What remains unproven
- Minecraft non-OP client is an independent protocol reader, **not** an independent human or trusted institution. Test runner controls both clients and infrastructure.
- Godot fresh-process observation reads serialized scene artifacts **after** operator actions, not live networked gameplay.
- Existing original fixture digest is pinned, but this workflow has **not** verified native reLATTE PR #101 source signatures / ancestry.
- No actual resource-cost or salvage parity, portable skill certification, external consequences, automatic admission, person/host consent, physical effects, or money.
- A tampered environment or test runner can mislead these observers; evidentiary guarantees are bounded to the declared CI runtime.

**WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION**

Parent specs: reLATTE #132, #134, #136; original source PR #138. Do not merge automatically.
