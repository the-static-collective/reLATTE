# LANTERN COMMONS 002 — The Living Society (game experiment)

**State:** reviewable draft product specification and external conversation artifact. **Not a merged datapack, verified live Minecraft run, signed native reLATTE witness, or production release.**

This is the 1×2×4 prototype: Jubilee Arcade (play) × Skill Cartridge Forge (candidate extraction) × Living Community (local, voluntary governance). The first game implementation is an attached conversation ZIP named `Lantern_Commons_002_Living_Society.zip`, with full source builders available separately as `Lantern_Commons_002_Source.zip`. The ZIPs are **NOT committed to this branch**, and GitHub cannot reproduce them from this branch alone; this document fixes exact artifact fingerprints and integration acceptance tests.

## Conversation artifacts / fingerprints

- Data pack: `Lantern_Commons_002_Living_Society.zip` SHA-256 `5e0ad74a4fe439d4e7744542a0a880f3f3674cae8ff675ae6a28bbb15b6770d0`.
- Full source ZIP (Python builders and tests): `Lantern_Commons_002_Source.zip`; calculate its SHA independently after download.
- Minecraft Java **26.1.1** data pack format **101.1**; Java 25 is required by the actual game.
- Self-contained ZIP root: `pack.mcmeta`, `data/minecraft/tags/function/{load,tick}.json`, `data/lantern/function/**`, `README.md`, `cartridge.json`.
- Datapack contains **82** `.mcfunction` functions, including the original founding town, initial tutorial, society actions, source-bound candidate, and local-only journal.
- Static verification: **102** internal function references resolved, all function bytes SHA-256 manifest entries matched. A Python **reference state model**, distinct from the Minecraft implementation, ran **6** charter/project success scenarios and deliberate refusal/self-review/underfunding failures. **Native Java/Minecraft tests: ZERO**.

## Player experience

In a disposable Creative Superflat Java world (never a treasured save), place the ZIP inside `datapacks/`, `/reload`, stand at the intended ground level, then `/function lantern:found`. Open `/trigger lc_action set 9` for chat menus; non-operators may trigger after an operator installs/founds the pack.

Original stage tutorial remains: Charter -> Garden -> Forge -> Press -> Giving Tree -> Council HOLD -> Crossing Gate. New role-specific in-game actions are numbered 12–25.

At Campfire, one of three constitutional **experiment parameters** is selected once for that world: Commons, Market, Stewardship. Different rules yield different declared material requirements for two possible *candidate projects*: Community Kitchen and Tool Library. Gameplay contributions are one **actual consumed in-game item** at a time: wheat at the Giving Tree, stone bricks at the Forge, paper at the Press.

One player proposes a project. A **different Minecraft player account** may APPROVE or REFUSE at Council. The game prevents the same tagged proposer from performing both actions but cannot authenticate that two game accounts represent distinct human people. Approval without adequate material does not build. If a project is approved and resourced, a player builds a new structure; one block is checked locally. At the Press, an observable completed project permits a `cartridge candidate` flag. This is **not** proof of repeatability in a fresh world.

A local event journal uses `storage lantern:journal`, at most 200 events, recording resource counters and Minecraft player UUIDs. **It never uploads data.** Inspect with `/data get storage lantern:journal events`; redact/obtain consent before sharing personal player identifiers. In-game audits check specific blocks only, not independent clients.

Read `society-rules.json` in this folder for the exact budget matrix and test limitations. The prototype keeps **one selected project in each disposable game world**; later iterations may support multiple successive independent projects.

## What a future honest reLATTE native run must do

1. Import the original exact artifact bytes, verify SHA-256 and inspect executable Python builder/reproduction source.
2. Run official vanilla Java 26.1.1 in at least two separately provisioned saves, with different world seeds and separately keyed clients/observer identities.
3. Capture complete *intent, actual in-game command/action trace, real observed block-state evidence, and local receipt history*; compare and preserve differences. Current artifact has NONE of that.
4. Generate a schema-bound `skill-cartridge-candidate/v0` from the world history, preserving limits, source authors, failed paths, licenses and explicit missing claims. MEMENTO's practice-grammar candidate remains a separately owned research donor.
5. Independently reproduce a bounded building practice in a third fresh world, against new coordinates/site constraints and a fresh non-OP observer.
6. Bring native signed crossing bytes to an owner-local receiver that defaults HOLD; let the receiver ADMIT or REFUSE only under its independently checked contract.
7. Recruit one real consenting third-party human reviewer for social-governance and accessibility observations; separate game participation from real field consent.
8. Consider a physical Jubilee Arcade pilot only with the host's approval and no publication of private needs, player UUIDs or attendee records.

## Boundaries

`IN-GAME LEDGER != CURRENCY` / `SECOND GAME ACCOUNT != SECOND VERIFIED HUMAN` / `VISIBLE BLOCK != INDEPENDENT WITNESS` / `AUTHORING != COMPETENCE` / `CANDIDATE != GRANT` / `GAME SUCCESS != COMMUNITY SUCCESS` / `CHARTER PARAMETER != ETHICAL RANK`.

No automatic code execution on import, real finance routing, church partnership, authorization over other persons, token minting, or external publishing.

Related: [Cartridge Forge startup issue #132](https://github.com/the-static-collective/reLATTE/issues/132), [Lantern Commons field issue #133](https://github.com/the-static-collective/reLATTE/issues/133), [Minecraft world-author PR #74](https://github.com/the-static-collective/reLATTE/pull/74), [two-world signed return PR #101](https://github.com/the-static-collective/reLATTE/pull/101), [MEMENTO practice compiler](https://github.com/the-static-collective/MEMENTO/issues/33), [Jubilee Treasury routing](https://github.com/the-static-collective/Jubilee-treasury/issues/3).

**Do not merge this design document as though it included the actual game implementation.**
