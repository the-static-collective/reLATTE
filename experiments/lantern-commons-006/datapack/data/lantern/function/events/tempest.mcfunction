# Optional Black & White-style thunder miracle; physical-world claims forbidden.
weather thunder 120
summon minecraft:lightning_bolt 114 67 2
setblock 109 65 13 minecraft:crying_obsidian
scoreboard players set #phase lc_world_event 4
scoreboard players add #interventions lc_world_event 1
data modify storage lantern:world_events history append value {event:"TEMPEST",phase:4,impact:"game_lightning_and_weather",agency:"operator_choice"}
