# LANTERN COMMONS 007 — Radical cooperation, beginning with consent and reality

**Status:** staged, **bounded** source-native Minecraft experiment. Draft, not merged. Do not treat a simulated game mechanic as evidence that a particular real political/economic system is superior.

## Thesis: gift without compulsion, common benefit without confiscation

Two separately connected non-OP Minecraft game agents are each provisioned **exactly two in-game items** on a disposable official Java 26.1.1 Survival Superflat server. They inspect a real in-game drought:

- `AidGrower` controls two wheat items.
- `AidMason` controls two stone bricks.
- Neither can individually meet the conditions of the publicly visible garden-repair mechanic.
- Both can refuse. Nothing automatically moves out of the agents' game inventories.
- The original `LANTERN-006` God Hand drought is re-used; its environmental state is physically observed before/after the proposed repair.
- An authored but disabled "creature" layer outputs **proposals**, not commands or authority to override players.

The vanilla game datapack opens separate barrels. The players **actually use Mineflayer container interactions** to deposit item stacks. On each game tick, `lantern:cooperation/try_restore` evaluates an **in-world dual material predicate**, requiring **two wheat physically present in the grower barrel AND two stone bricks physically present in the mason barrel**. A real public benefit (garden water and wheat return, public bell built) is then constructed in the game. The referee does **not** command the repair; the game-owned item-gated datapack function does.

Three separately seeded Minecraft scenarios with the same initial material distribution, game scripts, climate and project offer:

| Scenario | Grower | Mason | Game acceptance | Expected |
|---|---|---|---|---|
| GIFT | gives two wheat | gives two stone bricks | both verified by game | garden+bell built |
| REFUSE | gives, then withdraws | explicitly refuses | no admission | drought remains, grower items restored |
| SPOOF | gives, then withdraws | claims gift without actually transferring | no admission | drought remains; false receipt has no effect |

The simulated choices are predetermined policies with explicit input, not learning, moral agency or demonstrated behavior by real people. They are game clients, not independently verified natural persons. The spoof is an adversarial test for claims versus actual effects.

## How the source path works

```text
Operator provisions two equal tiny finite in-game inventories
              │
              ▼
God Hand creates then droughts a common garden
              │
              ▼
Agent A (wheat)      Agent B (stone bricks)
      │                     │
      ▼                     ▼
voluntary actual game inventory contribution or refusal
      │                     │
      └────────┬────────────┘
               ▼
MINECRAFT tick predicate checks TWO real distinct barrels
               │
        either ingredient absent -> no effect
        both ingredient stacks present -> actual garden restored
               │
               ▼
fresh NON-OP independent game observer checks blocks
               │
               ▼
source-bound evidence with per-agent untrusted intent receipts
               │
               ▼
reLATTE candidate and separately keyed HOLD (not ADMIT)
```

## Proof criteria / failures

1. Two non-OP actor clients and a third non-OP independent **game-observer** client must join an actual official vanilla Java 26.1.1 server.
2. Two items are given to each agent by the bounded operator; game inventories are checked. The game does not mint extra resources on a refusal or spoof path.
3. Before material exchange, each world independently exhibits exactly the same in-game drought markers and empty donation barrels.
4. One gift **alone** MUST NOT restore any public benefit.
5. Both real item transfers MUST restore garden, crops, and bell through game-owned `tick`, not by calling a build effect from the operator.
6. Actual refusal or false claimed gift MUST NOT restore the garden.
7. The grower must retrieve its unused contribution when the partner refuses or spoofs; supply conservation and exit without penalty are recorded.
8. Both successes and refusals keep their history; no scoring of human worth or coercive punishment for refusal.
9. Only if all independent Java worlds pass and the **actual signed source-parent 006** is verified can the native reLATTE candidate be created and held by another receiver.
10. The candidate is **R3_HOLD**. No valid game outcome grants human authority, production execution rights, or payment.

## Playable buttons

This source creates an isolated **cooperation datapack**, intended to be installed *with* the 006 God Hand datapack in a disposable Java 26.1.1 game.

After `/function lantern:events/prepare` and `/function lantern:events/drought`, run:

```mcfunction
/function lantern:cooperation/setup
/function lantern:cooperation/show
```

The operator supplies actual inventory items to consenting players, each opens its role barrel and places resources in it. The datapack's tick checks resource presence and triggers the public garden restoration if both gifts are actually in their barrels. Operators never need to execute the restoration function.

**Safety:** These world-event functions overwrite fixed physical coordinates and 006 also changes global in-game weather; **never use in an existing valuable or inhabited server** without owner control. On a public/private multiplayer server, use proper online identity and permission checks; CI uses fake offline clients and does NOT authenticate a human identity, so this is NOT production resource governance.

## What this does not yet reproduce

A full city with persistent histories, market contracts, trade/reputation algorithms, human-verified cooperative motives, autonomously learning AI creature, social trust, new economic science, or real food restoration.

The actual phenomenon tested is smaller and falsifiable: **different voluntary policies, combined with independently verified complementary material contributions, yield a bounded shared-world effect while refusal and false claims do not.** Later versions can test whether independently adaptive agents develop robust mutual aid in situations where unilateral gain, shared risk, fairness, and hostile actors interact.

Source-ancestry doors: [world events 006](https://github.com/the-static-collective/reLATTE/pull/143); [cartridge transfer 005](https://github.com/the-static-collective/reLATTE/pull/141); [Cartridge Forge startup](https://github.com/the-static-collective/reLATTE/issues/132).
