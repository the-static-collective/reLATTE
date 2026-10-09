# RIFF-RAFT-MINECRAFT-005 — The Counterfactual Post Office

**New capability:** verified observations from a previous GHoT → reLATTE → two Minecraft worlds → GHoT loop can be used as the **input to new game questions**. We do not silently promote the result of one run into permission to start another.

## The realized substrate

- Source Minecraft-004 proof: [Actions run 37987898459](https://github.com/the-static-collective/reLATTE/actions/runs/37987898459), independently verified and returned as `HOLD`. Exact return crossing `relatte-crossing-v0:0b61b9476c0ab3e2b57a5090781d2591e8c1145ac84c2eea2f67efb301d54fa3`.
- GHoT source-verified counterfactual producer: `ghot/riff_raft_counterfactual.py`, commit `bec31b30ef7f7b6d07314da1ce96793fb8c45a4a`.
- GHoT signed verifier for new return: `ghot/riff_raft_counterfactual_return.py`. Both producer and GHoT receiver are pinned in the CI workflow.
- Existing reLATTE official Minecraft 26.1.1, same restricted game server author, separate fresh non-OP readback client and signed reLATTE instance/candidate contracts.
- Normative `src/` remains unchanged. 005 is a bounded opt-in experimental adapter.

## World A vs B: evidence-driven different next experiments

| | World A | World B |
|--|--|--|
| Previous game observation (004) | 3 lamps lit on fault | 6 lamps lit on fault |
| Counterfactual policy | move link downstream by 2 stages | move link upstream by 4 stages |
| Proposed position | repeater x=2 | repeater x=-28 |
| New expected lit on fault | **5 of 9** | **2 of 9** |
| Full causal sequence to verify | 0 → 5 → 0 → 9 | 0 → 2 → 0 → 9 |

The second experiment is proposed from actually observed previous game-state data, not an altered relabeling of the original fixture. The GHoT source converter recomputes the old count from actual `causal_signature.broken` booleans in its independently verified 004 signed packet and checks against the actual old repeater location.

## The source-to-new-quest crossing

```text
Original official Minecraft worlds:
  Signed 004 A R3_HOLD + B R3_HOLD -> signed 004 return -> GHoT HOLD
             |
             | exact crossing id, receipt id, payload SHA256
             V
   GHoT counterfactual composer (separate checkout, pinned SHA)
             |
             | verify source first; read actual observed fault values
             V
   two SHA-256 proposals (NO world authority, NO direct actuation)
             |                             |
             V                             V
   reLATTE 005 instance A           reLATTE 005 instance B
   source/admission pinned          source/admission pinned
   official isolated server A       official isolated server B
   bounded OP command               bounded OP command
   server-checked 5 lamps           server-checked 2 lamps
   restore and 9 lit                restore and 9 lit
   fresh non-OP witness             fresh non-OP witness
   signed held candidate            signed held candidate
             \                             /
              \      independently compare/
               V                           V
        reLATTE counterfactual return, SIGNED R3_HOLD
         carries both new raw signed outcomes + full 004 ancestor
                             |
                GHoT separately verifies:
             prior 004, both new instances,
              both new held results, return
                             |
                        LOCAL HOLD
```

## Workflow

`.github/workflows/riff-raft-minecraft-005.yml` first downloads the *specific* signed 004 return from GitHub Actions run `37987898459` (requires `actions:read`). It checks out a pinned GHoT source file and runs the native Python signer/witness verification, generates two source-pinned quest manifests and persists the original ancestor.

Then two completely separate official vanilla Minecraft CI runners independently use those manifest bytes and explicitly set:
```text
MC_RIFF_RAFT_PLAN=1
MC_RIFF_RAFT_REDSTONE=1
MC_RIFF_RAFT_REDSTONE_FAULT=1
MC_RIFF_RAFT_DYNAMIC_QUEST=1
MC_RIFF_RAFT_COUNTERFACTUAL=1
```

An operator-client requests only the source-derived legal in-game repeater position. The vanilla game server checks lamp blockstates. The trigger is removed; the broken link is repaired; one redstone input must light all nine lamps. The OP author disconnects before fresh non-OP readback of nine lamp states. The results' signed instance extensions, source proposal SHA-256, parent proof identities, game observed state hash and original GAME-only authority policy are verified again when composing the cross-world return.

The return is one **signed, read-only, receiver-local `R3_HOLD`** plus new raw evidence and the full prior 004 signed source. GHoT independently verifies previous results AGAIN—not merely trusting the reporter's statement that a 004 check succeeded.

### Verification

```sh
npm run verify
node --test --experimental-strip-types test/riff-raft-minecraft-005.test.ts
```

The extra hostile tests include old-source mismatch, changed selection policy, forged physical-world claims, source id substitution, falsified new lamp expectation, and unsigned-two-world shorthand. Native CI is the only authority for claiming a real Minecraft outcome; unit-test success alone is not a completed game-world experiment.

### Conservatism

This is still a **two-policy, five-repeater** bounded design. It is not an AI that autonomously chooses any terrain intervention. It does not exercise GHoT's full resource conservation with real inventories, nor demonstrate natural soil systems, seed growth, hydrology, habitat safety, sensors, radio transmitters, human land authority, or robotics.

**Causal evidence creates the next *question*, never the next *grant*.**

The old 004 source artifact has a 7-day GitHub retention, so 005's pinned source gate will refuse to run after expiration. Durable evidence replication is a future custody experiment; never silently replace an expired parent artifact with an unpinned one.
