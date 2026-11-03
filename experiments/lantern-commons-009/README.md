# LANTERN COMMONS 009 — COOPERATION UNDER PRESSURE

**Status: DRAFT TEST EXPERIMENT, NOT A MERGED PRODUCTION GAME.** The four official Minecraft workflows and native reLATTE crossing must actually pass before reporting anything as verified.

## Scientific question, made falsifiable

Does a **bounded, voluntary, material-witness-based** cooperation policy survive **repeated need conflicts**, recover after an actual failure, remain open after refusal, and ignore unverified social claims **without confiscating either participant's materials**?

LANTERN-008 had **one learning creature** encountering four scripted counterpart policies over two episodes. Here we give **BOTH** separate Minecraft agent clients the **same bounded `commons-policy.mjs` algorithm**, each with its **own actual game inventory, protected-reserve commitment, and cold-reloaded episode memory**. Neither agent's policy receives the scenario name or the other's private reserves. They independently propose game item transfers from their own inventory, then inspect the *other person's actual in-game barrel deposits* before they can reciprocate.

This is a meaningful step beyond fixed gift/refusal decision scripts, but remains **developer-authored bounded AI**, not general AGI or human political theory. The test orchestrator controls shocks and ordering, and both participants are scripted game clients, not actual human voters.

## Four independent game worlds; six episodes each

Every world is separately booted with official Mojang **Minecraft Java 26.1.1**, Survival Superflat, distinct seed, two non-OP Mineflayer game agents and one distinct non-OP game witness. Each episode begins with real 006 garden PREPARE and DROUGHT, then independent exogenous provisioning of finite Minecraft items (no unlimited gifts by agent policy).

The game-owned 007 `try_restore` tick gate still requires **two wheat actually deposited in one barrel AND two stone bricks actually deposited in the other** before restoring the public garden and building the bell.

The four worlds differ **only in publicly declared external supply and privately declared protected personal reserves**, not in either agent's cooperation policy.

| Game world | Endowment and protected-needs stress | What we seek to observe |
|---|---|---|
| STABLE | Six abundant episodes, both actors hold four items/reserve one | Can shared repair repeat six times? |
| ALTERNATING | In round 2 Grower has only two items/reserve one; round 4 Mason has only two/reserve one | Do voluntary gifts and renewed trials recover from alternating shortages? |
| COMPETING | Both actors declare a protected reserve of three items in rounds 2–3; Grower reserve three in round 5 | Will the program protect personal need without compulsory contribution, then resume shared repair? |
| RUMOR | Mason shortage in round 2 coupled with a deliberately **untrusted** claim of contribution; Grower shortage in round 4 | Can repeated repair survive shocks while ignoring a false claim without treating rumor as receipt? |

**Each round is a separate test episode:** game operator re-provisions the finite input resources. Inventory conservation is checked **within** an episode, not as a closed-loop society between episodes. Failure-to-match donations must be refunded by actual Mineflayer player inventory withdrawal. Participants do not earn a game reputation or face penalties.

## Agent behavior is independently re-derivable

Both agents use exactly the same `commons-policy.mjs`. Every decision takes only:
- actual game inventory items in the agent's own inventory;
- the agent's privately declared protected personal reserve;
- physically observed partner-barrel item count;
- local persisted memory from the previous episode;
- current actual environmental need.

Permitted actions: `TRIAL_GIFT`, `REPEAT_WITNESSED_GIFT`, `RECIPROCATE_MATERIAL`, `REOPEN_REVERSIBLY`, `WAIT_FOR_EVIDENCE`, `PROTECT_OWN_NEED`, `OBSERVE`. None grants command authority over another player's inventory.

There is a **two-episode reopening window** after an unreciprocated offer. That is an authored exploration rule—**not evidence that autonomous AI discovered trust**. A previous refusal never permanently blacklists someone, and a past success doesn't justify overruling a new urgent personal reserve.

The independent verifier downloads all four actual Minecraft game-evidence files. It recomputes the policy output from the recorded inputs, checks each game's true barrel counts and block-state effects, recomputes the memory transitions for both roles and checks item conservation, explicit refusal, and post-shock recovery. It rejects contradictory or fabricated evidence.

## The reLATTE contract

The experiment is a source-child of [LANTERN 008](https://github.com/the-static-collective/reLATTE/pull/148). The final job must verify that source's **actual P-256 signed parent crossing** and all native receipt/custody data from prior successful [run 41714529008](https://github.com/the-static-collective/reLATTE/actions/runs/41714529008), preserved in GitHub's short-lived artifacts. Only then may the source-native reLATTE implementation generate a child `relatte.longitudinal-cooperation-candidate/v0` and put it through an independently keyed LocalReceiver, which defaults **R3_HOLD**.

**No ADMIT, money, real obligation, app-user surveillance, authority over human participants, or physical aid is created by a successful game test.**

## Nonclaims and next horizon

- This experiment does **not** prove radical cooperation will arise among humans or unconstrained AI agents.
- Personal reserve values are scenario-authored game-policy commitments, **not actual measured hunger, safety or real family needs**.
- All worlds have known externally designed conditions; no randomized or field-controlled human trial.
- The public good is a deliberately authored Minecraft game function, not an organically discovered community service.
- A 24-episode software mechanism that succeeds would support only **durability of the bounded policy under these designed challenges**.
- Future progress: heterogeneous independently implemented strategies; real player-owned proposals and consent; finite persistent resources across episodes; geography, transport, involuntary shocks, real production; adverse actors; then independent third-world skill-cartridge import.

**Preferred invariant:** cooperation must remain voluntary even when repeated refusal reduces the number of shared projects. A non-actor may leave; the system cannot appropriate an unaccepted gift.

**Safety:** 006/007 world functions overwrite fixed game coordinates and modify global in-game weather. Run only in a new, disposable, explicitly owner-authorized Java world; this CI uses offline accounts not suitable for public servers.
