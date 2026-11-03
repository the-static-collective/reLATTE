# WORLD-FORGE-003 — Cross-engine admission gate (draft experiment)

This is a **small, reviewable, executable integration seam**, not a replacement for the owner-authored WORLD-FORGE-001 and CRATER-SMASH-002 source bundles. The **original WORLD-FORGE-001 and CRATER-SMASH-002 source files are now included as sibling experimental directories in this PR**, with the Godot quoted-newline generator correction. This separate 003 gate reuses their pinned fixture digest as an ancestry reference, without admitting the game cartridges as reLATTE authority.

## What is tested

- `src/reconcile.mjs` validates strict typed self-reported state transitions, exact fixture digest, and separate engine/instance labels. It rejects unknown fields, authority claims, and final-only results. Comparison always returns **HOLD**.
- `godot/` creates and moves an actual 3D `BoxMesh` when run. It prints a parseable `WORLD_FORGE_ENGINE_PROBE=...` receipt only after code runs in Godot. Since the program makes its own observations, it is **not an independent witness**.
- `minecraft/` provides an **operator-only**, Java 26.1.1-scoped pack that places one temporary station and checks each block. It has not been executed in an official server. Requires **Java 25**, a legitimate game/server installation, and an empty disposable world; Minecraft command side effects are local and destructive at the cursor.
- CI runs Node tests and attempts real Godot headless import/runtime. A passing Godot test proves *that one generated scene actually executes*, **not** Minecraft/Godot parity or a transferable skill.

## Run locally

```
node --test experiments/world-forge-003/tests/reconcile.test.mjs
```

Godot 4.x: open `experiments/world-forge-003/godot` and run the scene. Look for `WORLD_FORGE_ENGINE_PROBE=...` in the output.
Minecraft Java 26.1.1: place `minecraft/` contents in a **disposable** world datapack folder; from a fixed safe location run `/reload` and `/function wf_probe:run`. It modifies the block beneath the executing player; no actual cross-engine agreement is asserted.

## Real acceptance criteria still open

1. Execute and independently observe official Minecraft 26.1.1 with a raw author command trace and fresh non-OP observer.
2. Execute and independently observe Godot 4.x on new source-native input, not an embedded scripted receipt.
3. Compare intermediate causal transitions, raw bytes, version and signatures from pinned sources, not merely claims in JSON.
4. Obtain receiver-local HOLD/REFUSE and never auto-admit or confer authority.

Canonical doors: reLATTE #132, #134, #136, draft #101. Source files are staged on this draft branch for review, not merged into main.

**WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION.**
