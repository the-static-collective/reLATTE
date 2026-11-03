# GAME-ONLY sandbox: bounded arena x100..118, y63..66, z0..18. Never use on someone's lived world.
fill 100 64 0 118 66 18 minecraft:air
fill 100 63 0 118 63 18 minecraft:polished_deepslate
fill 100 64 0 118 64 18 minecraft:grass_block
fill 103 64 4 111 64 12 minecraft:farmland[moisture=7]
setblock 107 64 8 minecraft:water
fill 103 65 4 106 65 12 minecraft:wheat[age=3]
fill 108 65 4 111 65 12 minecraft:wheat[age=3]
fill 113 64 4 116 64 12 minecraft:water
setblock 109 65 13 minecraft:lapis_block
setblock 114 65 2 minecraft:lightning_rod[facing=up]
weather clear 120
scoreboard objectives add lc_world_event dummy
scoreboard players set #phase lc_world_event 0
scoreboard players set #interventions lc_world_event 0
data modify storage lantern:world_events history set value []
data modify storage lantern:world_events history append value {event:"PREPARE",phase:0,authority:"operator-only",note:"fictional sandbox"}
