# LANTERN 011 — Inherited resources in a lineage of actual world cartridges

**Status:** Draft, experimental; actual game evidence depends on the official Minecraft GitHub Actions workflow and must not be called successful until verified. This is not the whole 003 Lantern Commons civilization.

## Starting point: exact previously verified Mutual Aid world

Source is **not** a fresh procedural build and **not** a reset inventory. It is the complete original [LANTERN 010](https://github.com/the-static-collective/reLATTE/pull/152) `mutual_aid@0.1.1` saved game-world archive from the verified [010 run](https://github.com/the-static-collective/reLATTE/actions/runs/41722731806), cartridge ID:

`b45537517d670812a7dc337c4e4881918ff2f477b2b2de7ddc253a7e86f5c5c6`

The original world really contains its own garden, a public bell, **two in-game wheat** held in the original west barrel, and **two in-game stone bricks** in the original east barrel. Those are inherited from earlier real game clients' joint gifts.

A complete, byte-verified save is checked out into a NEW, absent Minecraft world directory. Its original parent ZIP never changes.

## Two children and a grandchild

```text
010: mutual_aid@0.1.1 (the ACTUAL old full-save ZIP)
   wheat 2 (original barrel) + bricks 2 (original barrel)
   restored garden + community bell
                │
         ┌──────┴──────┐
         │             │
         ▼             ▼
011: steward@0.1.2   silo@0.1.2
  Keep resources       Two separate non-OP game accounts
  in original barrels  WITHDRAW original inherited goods
  Record steward       DEPOSIT both in empty new "public silo" barrels
  choice, no move      Vanilla 011 tick witnesses both real items
                      and builds visible infrastructure marker
                         │
                         ▼
                   silo_heir@0.1.3
                   Copies EXACT silo save and cold-boots it
                   Original stored wheat and bricks must still be present
                   Real non-OP account withdraws inherited wheat 2
                   and deposits same items into NEW seed-vault barrel
                   Game-owned material gate observes inherited vault stock
                   and marks third-generation seed-vault completed
```

Crucially, no operator gives `give`, `clear`, `loot`, item replacement, or world clone commands inside the live world mutation driver. Empty storage containers are created by source-owned Java datapack functions. The only material transfers occur through real `openContainer().withdraw` and `openContainer().deposit` operations executed by the distinct player clients. Neither script nor operator adds any *items*.

**Total resource budget in all descendants:** exactly **2 in-game wheat + 2 in-game stone bricks** throughout. No scarcity magically disappears and no new production is claimed.

| Save generation | Original wheat | Original bricks | Invested wheat | Invested bricks | Seed-vault wheat |
|---|---:|---:|---:|---:|---:|
| Parent Mutual Aid 0.1.1 | 2 | 2 | 0 | 0 | 0 |
| Steward 0.1.2 | 2 | 2 | 0 | 0 | 0 |
| Silo 0.1.2 | 0 | 0 | 2 | 2 | 0 |
| Silo Heir 0.1.3 | 0 | 0 | 0 | 2 | 2 |

The crop and irrigation infrastructure persist in the world bytes. The new `silo` and `seed vault` are **observable infrastructure markers and storage**, not proof that storage construction actually increases agricultural productivity.

## Exact world cartridge identity

All descendants use the same Minecraft Java 26.1.1 jar SHA-1 and seed as the original world, but **the parent cartridge ID is different for the third generation**.

- `steward@0.1.2` and `silo@0.1.2` each have parent **010 mutual_aid@0.1.1**.
- `silo_heir@0.1.3` has parent **011 silo@0.1.2** — it must never claim to descend directly from the original 010 parent.
- Every full world save, not just `level.dat`, is content-hashed in a canonical manifest with a SHA-256 world-tree digest, exact parent ID, bytes, game observation hash, branch label and version.
- A new verifier `verify_generations.py` checks all actual game evidence and **the two-generation parent chain**, including 2 wheat + 2 bricks at the beginning/end of every actual saved-world run, inventory transfer receipts, preserved infrastructure, and refusal to accept injected operator gifts.
- New world zip files upload to GitHub Actions for 90 days if allowed by repository policy. They are downloadable artifacts, **not** source-controlled binary Git objects and **not** permanent releases. Content-lock registry metadata can be committed after real IDs are verified.

## How to reproduce (GitHub)

The relevant workflow is `.github/workflows/lantern-011-generational-resources.yml`. It runs:
1. Offline hostile world-cartridge tests, syntax checks, and source-banned-command audit.
2. Two independent official Mojang Java 26.1.1 worlds launched from **the same 010 full-save cartridge**, independently game-witnessed; one leaves old resources, one transfers them to a new silo using real client interactions.
3. A third official Minecraft world launched from **the exact new silo child archive**, physically moves its inherited wheat to a vault, and records game-owning tick evidence.
4. An independent DAG verifier joins all four full-save ZIPs, checks all parent IDs/world trees/content files and game observations, then emits `lantern.multi-generation-world-cartridge-lineage/v0`.

## How to use the resulting cartridges

Download the requested versioned GitHub Actions artifact, extract its `*.zip` inner world cartridge, and use the existing 010 tool:

```bash
python3 experiments/lantern-commons-010/world_cartridge.py verify silo-v0.1.2.zip
python3 experiments/lantern-commons-010/world_cartridge.py checkout \
  silo-v0.1.2.zip "/path/to/.minecraft/saves/Lantern-Silo-v0.1.2"
```

The destination MUST NOT already exist; this is deliberate no-overwrite safety. Open as a disposable test world with a compatible **Java Edition 26.1.1** client/server, not Minecraft Bedrock. A 2012 Mojave Mac may not support that Java game release; using the GitHub Actions environment or a modern machine for world creation is safer.

## Actual evidence vs speculation

**A successful 011 experiment would establish:** verified finite virtual material persists across copied Minecraft world saves, under one parent-branch history, with byte identity and actual game-client transfers. The source-owned virtual infrastructure survived a second copy boundary.

**It would NOT establish:** human radical-cooperation, human identity, new food production, sustainable closed-loop economy, real-world resource effects, autonomous artificial general intelligence, or source-native signed reLATTE admission of this world. A SHA-based world manifest is distinct from a signed reLATTE receipt, and a game bot's voluntary scripted choice does not prove a real human's consent.

The next properly falsifiable milestone is **real wheat production and consumption across an inherited Minecraft game save** without operator re-provisioning, followed by independent agent strategies that may accept or reject useful shared infrastructure. Do not call a warehouse itself sustainable production.
