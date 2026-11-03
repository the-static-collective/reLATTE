# Operator-only smoke; disposable flat Creative world only. Overwrites one block.
# Do not mistake this author-controlled action for independent observed proof.
setblock ~ ~-1 ~ minecraft:cracked_stone_bricks
execute if block ~ ~-1 ~ minecraft:cracked_stone_bricks run tellraw @s {"text":"WORLD_FORGE_PROBE:BREACHED (self-report)","color":"yellow"}
setblock ~ ~-1 ~ minecraft:sea_lantern
execute if block ~ ~-1 ~ minecraft:sea_lantern run tellraw @s {"text":"WORLD_FORGE_PROBE:RESTORED (self-report; no independent observer)","color":"aqua"}
