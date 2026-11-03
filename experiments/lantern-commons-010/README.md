# LANTERN COMMONS 010 — THE WORLD IS THE CARTRIDGE

> **Source status:** draft branch, generated actual-world artifacts subject to proof from official Minecraft CI. This folder builds an **archive of the full synthetic Minecraft Java world save**, not just a datapack, a build plan, a recipe, a witness observation, or the file `level.dat` alone.

## What is versioned?

Each immutable `*.zip` world cartridge contains:
- `world/level.dat`, region files, game state, data, embedded datapacks, actual built blocks and any other generated save files;
- `world-cartridge.json`: format version, Minecraft Java 26.1.1, official Mojang server SHA-1, per-file SHA-256 and sizes, a deterministic whole-world tree digest, version name, parent cartridge ID and exact parent world digest, *branch name*, observation hash, source-code provenance and a SHA-256 content-addressed cartridge ID.

There is no moving target inside a cartridge: a save's bytes are checked at packaging, receipt, checkout, and lineage comparison. `session.lock` is excluded because it is an ephemeral process lock, not part of durable game history. No valuable/private player save is imported by CI; the only source is a disposable game world made expressly for this experiment.

The cartridge ID is a SHA-256 of a canonicalized JSON manifest that itself includes SHA-256 digests of **all** archived world files; the ZIP has its own independently verifiable archive SHA-256 receipt. **A hash is not a native reLATTE signature or proof of a human witness.** Never conflate these.

### One root, three independently evolving copies

```text
LANTERN WORLD 010 — ROOT v0.1.0
Minecraft seed 314159265 · full actual save · original drought garden
World cartridge ID = SHA-256 manifest
       |
       +--- CHECKOUT COPY A ----> mercy v0.1.1
       |                            operator restored water and crops
       |
       +--- CHECKOUT COPY B ----> abstain v0.1.1
       |                            deliberately recorded no intervention
       |
       +--- CHECKOUT COPY C ----> mutual_aid v0.1.1
                                    TWO separate game clients gifted finite items;
                                    vanilla 007 tick repaired the public garden
```

Each copy is checked out from the **same exact parent ZIP bytes** into an absent destination. Only the copied save is subsequently booted and modified in Minecraft. Child cartridges must have:
- same parent `cartridge_id` and `world_tree_sha256`;
- same Minecraft engine and original world seed;
- unique child `branch` and `cartridge_id`;
- different world-tree bytes reflecting actual events;
- a fresh non-OP game's observed starting state matching the parent;
- independently checked final stage, journal, and actual contributions.

**The worlds share a founder and a seed.** They are alternate *branches of one world history*, not independent civilizations with independent starting seeds. A world-copy version is different from a skill/reLATTE practice cartridge. We should preserve both types and their bridges.

### Naming/versioning

- `main@0.1.0`: first sealed starting world, immutable forever.
- `mercy@0.1.1`, `abstain@0.1.1`, `mutual_aid@0.1.1`: sibling child versions. Branch label and content-addressed ID distinguish siblings sharing a semantic version.
- A future `mercy@0.1.2` would be a child of `mercy@0.1.1` after we extend the lineage graph to more than one generation.
- A later main v0.2.0 will be **a new root generation or explicit merge**, not silent replacement of original bytes. Current v1 manifest verifier intentionally supports a root + direct children and rejects root masquerading.

### Inspect and install copies

Python 3.9+ (standard library, no pip):
```bash
python3 experiments/lantern-commons-010/world_cartridge.py verify root.zip

# An ABSENT destination is mandatory: never overwrite somebody's existing world.
python3 experiments/lantern-commons-010/world_cartridge.py checkout \
    branch-mercy.zip /your/path/to/minecraft/saves/Lantern-Mercy-v0.1.1

# To prove shared origin and distinct child-save hashes:
python3 experiments/lantern-commons-010/world_cartridge.py lineage \
    --root root.zip \
    --children branch-mercy.zip branch-abstain.zip branch-mutual_aid.zip \
    --out lineage.json
```

**Minecraft Java 26.1.1** (Java 25 game runtime), not Android/Bedrock, is needed to load these actual save formats. The MacBook on Mojave may not be able to run this modern game natively, but GitHub Actions can create, inspect and reproduce the world save without that Mac. This is a runnable portable world on compatible Java Minecraft clients, *not* a cross-platform Bedrock world.

### GitHub execution and preservation

`.github/workflows/lantern-010-world-cartridges.yml` runs an offline hostile archive test gate, creates the original **official Mojang world** and seals complete `root.zip`, then downloads and checks out that same root in three **separate GitHub runner VMs**, boots each copy as a real Java Minecraft world, applies a different tested cause, independently observes game blocks, closes each game, seals full child snapshots, and verifies exact genealogical lineage plus observation/receipt SHA-256s.

Successful workflow artifacts (named so people can track versions):
- `lantern-world-010-root-v0.1.0` (includes `root.zip`);
- `lantern-world-010-mercy-v0.1.1`;
- `lantern-world-010-abstain-v0.1.1`;
- `lantern-world-010-mutual_aid-v0.1.1`;
- `lantern-world-010-complete-version-lineage` (content-addressed `lineage.json`).

**Critical durability boundary:** These ZIPs are **Actions artifacts, not Git commits or GitHub Release assets**. Requested retention is 90 days, limited by repository settings. Source code and recipes stay in Git; actual generated world snapshots must be downloaded or moved to a separately approved durable object store/release before they expire. There is **no automatic cloud publication, auto-ADMIT or permission transfer** in this PR.

## System boundaries

Current world contains the verified 006 fictional climate-island and 007 source-owned voluntary donation game logic, not the entirety of the earlier conversation-only Lantern Commons 003 society pack. The world ZIP is a **complete save of the tested game world it actually contains**, with its datapacks and world regions. Claiming that this snapshot includes all uncommitted 003 art/assets would be untrue.

A zipped region save is not the same as an independent human's social history. Real humans, non-OP server identity, third-party review, protective consent, source-native reLATTE signatures, and persistent post-episode resource circulation remain their own later work.

**Design contract:** `WORLD_BRANCH != NEW_FOUNDING_WORLD`, `COPY != NEW SOCIETY`, `SHA256 != NATIVE SIGNATURE`, `WORLD SAVE != WORLD RECIPE`, `GAME WORLD SUCCESS != HUMAN COOPERATION`, `HOLD != ADMIT`, `NO OVERWRITE = DEFAULT`.

### Next cartridge versions

After this run works, the right next step is making **persistent inventory and production state** survive across cartridge generations. Each child should inherit its parent's exact real material constraints rather than receiving a new budget every episode. That will make shocks, markets, drought, trust and resilience meaningful across *versions*, not just across isolated tests.
