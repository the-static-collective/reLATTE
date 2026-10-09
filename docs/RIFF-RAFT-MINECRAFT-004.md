# RIFF-RAFT-MINECRAFT-004 — Dynamic Terraforming Quests

**Source:** [GHoT Riff-Raft-004 dynamic quest proposer](https://github.com/the-static-collective/GHoT/tree/experiment/riff-raft-004-dynamic-quest-offers), pinned to commit `9aee07370ffb4ace0fcfaffb840359dc8797c0f0`. The independent GHoT receiver is pinned separately to commit `8e0e7efb2fc214e465652c7e5f7bdc6c2b4ff15c`. This experiment stacks on [the green two-world return, PR #101](https://github.com/the-static-collective/reLATTE/pull/101).

## What is *actually* dynamic

Minecraft-003 proved two different physical game worlds under **the same fixed fault** had the same 0/3/0/9 causal trace. Minecraft-004 permits GHoT to author two **different bounded interventions**, one per world.

The GHoT proposer consumes an **explicit fictional priority** (not actual site sensor data, not operator authority, not machine actuation), and returns a deterministically hashed quest that chooses only from an allowlisted set of repeater fault locations. The two priorities are:

- A / `rain-retention`: remove repeater at x=−13; expected game-world fault **3 lit, 6 dark**.
- B / `biomass-return`: remove repeater at x=17; expected game-world fault **6 lit, 3 dark**.

The names are conceptual. They do **not** represent real water capture or biomass production.

Each independent GitHub Actions runner checks out **GHoT at the pinned proposer commit**, issues an explicitly chosen priority, invokes GHoT to write its own JSON quest manifest, and passes that manifest into reLATTE's admitted composition instance. reLATTE rejects any altered source identity, seed, priority, allowed failure position, expected result, failed owner decision or forged physical effects. The original Minecraft 003 default path remains unchanged.

## Two actual game worlds

```text
  GHoT / READ-ONLY QUEST PROPOSER
      /                        \
  World A                      World B
  priority rain-retention      priority biomass-return
  seed 381654729               seed 918273645
  remove repeater x=-13        remove repeater x=17
         ↓                            ↓
  server reads blockstates     server reads blockstates
  0/9 -> 3/9 -> 0/9 -> 9/9    0/9 -> 6/9 -> 0/9 -> 9/9
         ↓                            ↓
  fresh distinct non-OP        fresh distinct non-OP
  protocol observer            protocol observer
  signed R3_HOLD               signed R3_HOLD
         \                         /
          reLATTE compare SOURCE INTENT
          against each world's actual TRACE
                         ↓
              verified DIVERGENCE
                         ↓
           signed reLATTE return R3_HOLD
                         ↓
            GHoT independent P256
             verification + local HOLD
```

The native test uses official Mojang 26.1.1, an operator bot, RCON, an isolated localhost-only game server per runner, and a fresh non-OP client for independent readback. The comparator reads the exact source JSON bytes and verifies source P-256 signatures and hashes, original composition instance ancestry, final observer lamp blockstates, source GHoT quest sha, and differences between intentionally chosen interventions. Identical world hashes or identical fault outcomes **fail** this new experiment.

## The important distinction

The simulated GHoT *proposal* is hashed and included in the runtime identity and signed result. The actual Minecraft server has to make an **independently observed** result. reLATTE does not promote a proposal to a witnessed fact merely because both contain the same words.

Different observed causal outcomes can both be lawful, because each answer is evaluated against **its own previously selected intervention**. Our experiment is not searching for agreement; it is searching for a faithful relation between intervention and consequence.

Both original signed results and the third signed portable reLATTE crossing are independently verified in GHoT, and GHoT's return is local **HOLD**. These are temporary CI self-signed identities; cryptographic validity does not confer membership, physical rights, or organizational authority.

## Run

```bash
npm run verify
node --test --experimental-strip-types test/riff-raft-minecraft-004.test.ts
```

The workflow is `.github/workflows/riff-raft-minecraft-004.yml`: two separate vanilla servers, two GHoT-generated quest manifests, a multi-runner evidence comparison, and a pinned Python GHoT receiver. Final artifacts include each independently observed Minecraft world and the signed return and GHoT reception.

## Law

```text
GHOT PROPOSAL != MINECRAFT ACTION
PRIORITY LABEL != ECOLOGICAL OBSERVATION
DIVERGENCE != ERROR
DIFFERENT EXPECTATIONS != FALSE EQUIVALENCE
MINECRAFT STATE != PHYSICAL SOIL
SIGNED CROSSING != OWNER ADMISSION
RECEIPT != PERMISSION
```

Future tests can be generated from locally selected available game tasks and measured game-state changes, rather than merely choosing from two bounded fixtures. That would be a new experiment, not something this one claims already to have proven.
