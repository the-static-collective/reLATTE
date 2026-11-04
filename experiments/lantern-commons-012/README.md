# LANTERN 012 — INTO THE BREACH / THE FIRST HARVEST

**Status:** Experimental source; do not call any new Minecraft run successful until all official Java 26.1.1 jobs, signed byte custody, and descendant world witness gates are actually green.

## Precise goal

Extend [LANTERN 011](https://github.com/the-static-collective/reLATTE/pull/153) from simple preservation of two existing wheat + two stone bricks across generation copies to an actual **Minecraft farming cycle**, without any operator-command-granted food items.

The exact source is a full previously verified Minecraft Java 26.1.1 `silo_heir@0.1.3` saved-world cartridge:
`dd1a1004b02d7fbb17fe868a788178b6d2ce07aebed4080dbafd77fa8e57287d`.
The source world contains a restored, fully matured inherited wheat garden **originally constructed by scripted 006 God Hand**. That provenance matters: the initial mature plants are not the product of naturally self-sufficient agriculture. The stage 012 game bots must physically harvest them and the second generation must plant and naturally grow new wheat.

## Experiment families

```text
LANTERN 011 / silo_heir@0.1.3  FULL actual Java world save
  - two wheat in inherited seed vault at (117,65,17)
  - two stone bricks in inherited silo at (116,65,17)
  - ripe wheat garden inherited from authored 006/007 earlier game
                  |
            ┌─────┴─────┐
            ▼           ▼
 reserve@0.1.4       harvest@0.1.4
 leave crops          NON-OP game player breaks 8 mature wheat plants
 untouched            GAME produces wheat item drops and random seeds
                      player catches vanilla drops, deposits 8 new wheat
                      and at least two harvested seeds into new empty barrels
                           |
                           ▼
                      heir@0.1.5
                      exact byte-verified HARVEST save copied
                      player withdraws one of inherited harvested seeds
                      plants it on a previously harvested empty farmland tile
                      vanilla random ticks grow it from age 0 to 7
                      player breaks and picks up second-generation grown wheat
                      player puts wheat into inherited harvest store
                      uses 3 wheat in genuine 3-wheat Minecraft bread recipe
                      triggers game hunger and actually EATS bread
                      final inherited wheat = 2 vault + 6 harvest store
```

## Resource equations, not intentions

Source save: 2 real wheat in the public seed vault, 2 real bricks in the silo, and a field of 006-authored mature wheat crop **blocks**, which are not counted as stored wheat items.

- **harvest@0.1.4:** 8 mature blocks are broken by an actual separate game player, each producing at least its real 1 wheat drop. New commodity stock = **8 stored wheat + seeds**, while old vault 2 wheat and old bricks 2 remain untouched.
- **reserve@0.1.4:** old crops remain on their blocks; no new harvested wheat items.
- **heir@0.1.5:** one real inherited seed is consumed by in-game planting; the previously empty farmland tile turns into immature wheat, then vanilla *random block ticks* advance age to 7 without any `setblock wheat` or item grants. A real game player harvests it again, producing 1 new wheat item. The same player crafts **3 wheat → 1 bread**, becomes hungry by a game hunger effect, and actually eats the bread. Final stored wheat = **2 + (8 + 1 − 3) = 8**. Its 2 inherited bricks persist.

**Important acceleration:** the second-generation wheat growth is a real, vanilla Minecraft growth mechanic under `gamerule random_tick_speed 1800`. That is test acceleration, not evidence of naturally realistic agricultural timing, and no item grant. Actual total game wheat resources are not being used to feed real people.

## Operational mechanics

Source files:
- `datapack/data/lantern/function/harvest/*.mcfunction`: material-gated public harvest/seed markers, empty barrels, crafting table; no item grants or planted crop commands.
- `live_first_harvest.mjs`: official server-connected non-OP game witness, actual actor `bot.dig` → item pickup, container deposit/withdraw, `bot.placeBlock` real seed placement, random-tick growth, `bot.craft`, and `bot.consume`.
- `run_world.sh`: checks out exact immutable saved-world parent to absent directory, validates Mojang official Java 26.1.1 jar SHA and sources, boots, witnesses, stops, hashes entire save, seals child complete world cartridge.
- `verify_harvest.py`: independently verifies all 3 saved-world snapshots + original parent, game event claims, exact crop/item balances, signatures of hashes only (not reLATTE signatures), chained parent identities and no command-provisioned items.
- `.github/workflows/lantern-012-first-harvest.yml`: four jobs: source safety, two parallel alternate saved-world branches, harvested-save grandchild, complete byte/genealogy verifier.

Never run 006 `prepare` or 007 `mercy` again inside the existing 011 parent saved world. Those commands create field crops from nothing and would invalidate this experiment.

## Scientific honesty and limits

- All 4 saved-world variants share **one original 010 game**, inherited through 011. They are branches/generations, not independent founder worlds.
- The first ripe crop was authored by prior 006 source rules; only second-generation crop growth from actually planted seed is a direct real vanilla growth proof.
- Resource flow is measured **inside a synthetic Minecraft game**, not a human society. Non-OP bots are scripted game clients, not independently consenting people or free-willed civilizations.
- Testing hunger via a game effect does not simulate human nutrition or farm policy.
- Exact world-save hash identities are **not native reLATTE P-256 signatures, admissions, or human authority**. New native HOLD can be requested separately after robust game/source evidence.
- Hash-pinned full-save archives from GitHub Actions expire under repository artifact retention policy, and must be saved separately for durable use. Keep all PRs DRAFT until review.
- Real world farming and food security have many additional factors (labor, water, transport, spoilage, consent, inequality) not measured by the first game trial.

## Next honest milestone

After native success, fork an inherited harvest world across **several repeated game planting/harvesting cycles**, with actual consumption and exhaustion, and compare a helper agent against a selfish hoarder under identical **persistent** initial resources. Only then ask whether sustained shared production emerges more often—not whether the game punishes refusal.
