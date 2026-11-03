# Optional bounded flood: local test area only.
fill 111 64 4 116 64 12 minecraft:water
fill 109 65 13 109 65 13 minecraft:prismarine
scoreboard players set #phase lc_world_event 5
scoreboard players add #interventions lc_world_event 1
data modify storage lantern:world_events history append value {event:"FLOOD",phase:5,impact:"water_expanded",agency:"operator_choice"}
