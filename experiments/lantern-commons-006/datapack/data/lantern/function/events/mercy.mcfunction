# A chosen environmental intervention; no villager/council decision is modified.
fill 103 64 4 111 64 12 minecraft:farmland[moisture=7]
setblock 107 64 8 minecraft:water
fill 113 64 4 116 64 12 minecraft:water
fill 103 65 4 106 65 12 minecraft:wheat[age=7]
fill 108 65 4 111 65 12 minecraft:wheat[age=7]
setblock 109 65 13 minecraft:emerald_block
weather rain 120
scoreboard players set #phase lc_world_event 2
scoreboard players add #interventions lc_world_event 1
data modify storage lantern:world_events history append value {event:"MERCY",phase:2,impact:"water_and_crops_restored",agency:"operator_choice"}
