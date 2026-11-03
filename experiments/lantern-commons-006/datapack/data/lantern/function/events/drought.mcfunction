# Scripted environmental hardship, never an evaluation of player morality.
fill 113 64 4 116 64 12 minecraft:air replace minecraft:water
setblock 107 64 8 minecraft:air
fill 103 65 4 111 65 12 minecraft:air replace minecraft:wheat
fill 103 64 4 111 64 12 minecraft:farmland[moisture=0] replace minecraft:farmland
setblock 109 65 13 minecraft:redstone_block
weather clear 120
scoreboard players set #phase lc_world_event 1
data modify storage lantern:world_events history append value {event:"DROUGHT",phase:1,impact:"water_and_crop_loss"}
