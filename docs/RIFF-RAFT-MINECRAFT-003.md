# RIFF-RAFT-MINECRAFT-003 — Two Worlds, One Causal Law, A Return Ticket

Source: GHoT [Riff-Raft-002](https://github.com/the-static-collective/GHoT/pull/113) (commit `a63624f1be6a533f5ab927b1e4e8b1a629f1ba53`), reLATTE [RIFF-RAFT-MINECRAFT-001](https://github.com/the-static-collective/reLATTE/pull/96) and [RIFF-RAFT-MINECRAFT-002](https://github.com/the-static-collective/reLATTE/pull/97).

**The new question:** do two separately provisioned official vanilla Minecraft worlds produce the *same specific causal result* under deliberately different environment seeds, and can a verified reLATTE return crossing reach a sovereign GHoT receiver while retaining HOLD?

## Topology

```text
                  GHoT Riff-Raft Terraformer
                              |
            commit-anchored nine-cue scenario
                              |
                   reLATTE composition
                 /                       \
        CI runner A                      CI runner B
        world seed 381654729             world seed 918273645
        Mojang 26.1.1                    Mojang 26.1.1
        independently started            independently started
        game instance A                  game instance B
        author / fresh observer          author / fresh observer
        fault, reset, repair             fault, reset, repair
        signed R3_ADMIT instance         signed R3_ADMIT instance
        signed R3_HOLD candidate         signed R3_HOLD candidate
                 \                       /
                   reLATTE evidence join
                  source signatures checked
                 0/9 -> 3/9 -> 0/9 -> 9/9
                     comparison only
                              |
                   signed reLATTE R3_HOLD
                    native raw sources
                              |
                   GHoT Python read inbox
                independent P256 verification
                  + source hash + 2 trace checks
                              |
                        local HOLD
                       (no actuation)
```

## Exact independent preparation

In `.github/workflows/riff-raft-minecraft-003.yml`, a matrix of **two separate runner jobs** creates separate localhost-bound Minecraft vanilla 26.1.1 servers with separately generated worlds, distinct seed IDs, fresh author and nonoperator observer clients, isolated work dirs, independently signed reLATTE INSTANCE launches and observed RESULT candidates. They are neither clones of one saved Minecraft world nor one run with two labels. Each run has a distinct `server_seed`, `CompositionInstanceSpec.base_snapshot_ref`, instance ID, world-state hash, and signed crossing ancestry.

Each executes the existing **real** vanilla redstone test, including an intentionally missing middle repeater. The locally server-observed chain must show `000000000`, then `111000000`, then `000000000`, then `111111111`. The author disconnects; a fresh, nonoperator Minecraft protocol client verifies nine `lit=true` lamp block-state properties and the server checks them again.

The two world-state hashes **MUST DIFFER** (the world plan varies by seed). Only the causal signature must be identical. Same Minecraft server version and SHA-1 are required.

## Signed reLATTE replay packet

`experiments/riff-raft-minecraft-003/two-world-replay.mjs` reads **raw** composition and runtime evidence bytes from the two CI artifacts. Before publishing the return, it:

- Checks P-256 signatures on both instance launch crossings and both candidate receipts, all bound to their exact JSON bytes.
- Verifies instance-to-candidate ancestry, candidate HOLD, exact goal/capability/snapshot/source donor commit and separate actor/observer sessions.
- Refuses world identity collapse, same server seed, same game world field hash, changed Mojang version, inconsistent fault/repair, tampered block-state digest or claimed physical effects.
- Compares the same nine-cue causal sequence across two different independently provisioned seeds.
- Issues **one new signed reLATTE R3_HOLD**, binding packet bytes to one crossing and one receiver-local receipt.
- Preserves the raw two-world evidence as portable text in the bundle for independent verification.

The return packet is a candidate, *not* a proxy capability or a grant to remote execution.

## Actual GHoT return

GHoT's [Riff-Raft-003 receiver branch](https://github.com/the-static-collective/GHoT/tree/experiment/riff-raft-003-minecraft-return-intake) contains `ghot/riff_raft_minecraft_return.py`. The coordinating job checks out its exact commit `494a6fc6ddf9c850ec2a9930af54196e2d5fd168` **read-only** and submits the signed portable packet. GHoT uses the pre-existing OpenSSL-backed ECDSA P-256 signature profile to verify all signed crossings and receipts locally; it independently recomputes source evidence hashes, redstone observation digests, and refused-physics flags.

On success, GHoT emits a local JSON **HOLD receipt**, cryptographically verifying source object integrity but refusing execution and owner admission. The return bundle and GHoT intake receipt are retained as GitHub Actions artifacts. This is a *real read-only cross-repository executable interface* in CI; the PRs remain draft/unmerged.

## Test and use

Run without Minecraft:

```bash
npm install
npm run verify
node --test --experimental-strip-types test/riff-raft-minecraft-003.test.ts
```

To run the native official servers, use the GitHub workflow, not an uncontrolled public realm. To compare two complete, already produced artifacts locally:

```bash
node --experimental-strip-types \
  experiments/riff-raft-minecraft-003/two-world-replay.mjs \
  work/two-world-inputs work/two-world-return/riff-raft-return-bundle.json
```

The two input artifact directories should be `riff-raft-minecraft-003-A` and `riff-raft-minecraft-003-B`, each containing its own `composition-evidence.json` and `runtime-evidence.json`.

## Trust and limitation

The results are **game-world observations on two CI runners**, not two physical ecological sites, nor two institutionally independent verifiers. reLATTE signatures use locally generated ephemeral keys; they provide object integrity, not proof of organization ownership. GitHub Actions identity and artifact lineage are separately auditable, while the GHoT Python receiver merely verifies the supplied evidence and cannot live-query Minecraft servers.

The comparator verifies the exact **predetermined causal test**, not arbitrary Minecraft competence or all possible fault modes. Matching observations are evidence of consistency under two seeds, not proof that any unspecified branch of the Rube Goldberg machine will succeed.

**LAW: THE WORLD CAN DISAGREE. THE TWO WORLDS CAN DISAGREE. THE RECEIVER GETS TO HOLD.**

### What follows

Once this is green, the next aperture is dynamic GHoT-generated work proposals choosing new legal in-game interventions and *different* fault locations. Same mission and independently measured outcomes; unlike these fixed nine lamps, future candidate requests should be authored based on observed results. That is the genuinely generative Riff-Raft loop.
