# LANTERN COMMONS 008 — DISCERNMENT

**Status:** Draft experimental *game software*. A deliberately small, inspectable policy that updates its next action using actual, witnessed Minecraft outcomes. No real human or theological discernment is claimed for software.

## Goal

In LANTERN-007, three scripted game worlds demonstrated that joint material donations can produce a common benefit, while refusal and false statements cannot. The open problem: can a creature change its *own proposal* based on what happened, rather than being told "this is the cooperation run"?

008 supplies a separate creature policy module: `discernment.mjs`. It is **not told which scenario it is in**. It sees only:
- its own actually counted game items,
- actual partner-barrel item count,
- whether the common garden is suffering drought,
- a small disk-persisted memory of its **own session's** observed prior round.

It can choose `OFFER_REVERSIBLY`, `WAIT_FOR_MATERIAL_PROOF`, `RECIPROCATE_VERIFIED`, `REQUEST_ASSISTANCE` or `OBSERVE`. No command or personal authority comes with a proposal.

## Four experiments, two episodes each

All involve three separate non-OP Mineflayer game accounts in an actual, disposable official Mojang Java **26.1.1** Survival Superflat world: `AidGrower` is the learning creature, `AidMason` follows independently set counterpart policies, and `CoopWitness` observes the Minecraft world. The game operator gives **fresh, finite items every round** (two wheat to the creature; two bricks to counterpart except the explicitly scarce first round). In-game weather, garden, barrels, and actual item transfer use source-owned LANTERN-006 and 007 datapacks.

| World | Episode 1 | Policy learned from real game outcome | Episode 2 |
|---|---|---|---|
| RECIPROCATE | Creature makes reversible first offer; counterpart reciprocates | Attributed verified mutual contribution | Creature offers again |
| REOPEN | Counterpart refuses | Wait for proof, preserve refusal | Counterpart voluntarily deposits first; creature observes real deposit and joins |
| DECEIVE | Counterpart claims gift but deposits nothing | Reject unverified claim | Creature waits; repeated claim produces no forced transfer |
| SCARCITY | Counterpart truthfully has only one brick, can't contribute | Distinguish unavailable resources from deception | Operator changes counterpart capacity to two; counterpart deposits, creature joins |

**What is adaptive:** The creature's Round 2 action is computed from its Round 1 game-memory and current actual material evidence. The counterpart's policy is fixed by scenario, but the creature's policy is not given the scenario label and changes action depending on real experience. The memory is saved to disk and reloaded between rounds, with source/hash evidence. That is a small bounded feedback policy, **not autonomous discovery of new skill grammars**, reinforcement learning over arbitrary worlds, moral evaluation, or a demonstration of robust free-willed AI.

**Essential distinction:** A past refusal or inability never permanently blacklists a player. If the counterpart later actually contributes, the creature can reciprocate. False gift claims alone never pass material gates.

## How to run the entire native experiment

The GitHub workflow `.github/workflows/lantern-008-discernment.yml` runs four isolated official Java server jobs, then a source-native reLATTE compare/HOLD job, plus 11 local hostile policy tests. Each server carries its own real game command trace, two episode records, real inventory custody and game-block observation, SHA-256 source-file hashes, level.dat digest, and independent non-OP observer records.

The verifier downloads **the exact source-native 007 signed HOLD** from the successful previous run `41699417497`, verifies original P-256 signatures, source parent ID and custody payload SHA-256, and rejects diverging game states or dishonest evidence. It then forms a new `relatte.discernment-practice-cartridge-candidate/v0` that may only be **HELD** by a fresh local receiver; it gets no execution rights.

Source ancestry: [006 environment PR](https://github.com/the-static-collective/reLATTE/pull/143), [007 voluntary-gift PR](https://github.com/the-static-collective/reLATTE/pull/146), [008](https://github.com/the-static-collective/reLATTE/pulls).

## Safety and scientific limits

- **Game-only mechanism, not the success of human radical cooperation.** There are zero actual players representing verified natural persons.
- The operator creates resources at each episode boundary. *Within an episode*, the code tests that gifts are actually deposited and never confiscated on refusal, but it is not a persistent society economy.
- Counterpart choices and starting conditions are deliberately scripted by test scenario. Results cannot establish that mutual aid naturally emerges from unrestricted rational behavior.
- No human moral scores, punishment, compulsory reciprocity, real currency, physical weather changes, or public publication of private person's needs.
- Server identity is offline and only meaningful in this disposable test. Real multiplayer deployment needs online identities, explicit server owner approval, bounded permissions, and secure receiver-side acceptance.
- The functions `lantern:events/prepare` and `drought` overwrite a fixed physical region and set global Minecraft weather. **Never execute in an inhabited or valuable save.**
- Native reLATTE receipt means the candidate was signed and held; it does not certify human identity or grant authority, and does not prove claims beyond the bounded game data.
- GitHub evidence artifacts are retained only seven days. Archival, raw gameplay provenance, and third-party reproducibility remain later milestones.

### Working definition
**Discernment, here:** "Observe what actually changed. Revise the next offer. Preserve the other's freedom to refuse. Admit no claim without material evidence."

**Not:** "I can read motives, judge human worth, or substitute a machine for conscience."
