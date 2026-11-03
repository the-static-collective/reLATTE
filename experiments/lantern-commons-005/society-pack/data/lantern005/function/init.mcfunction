# one disposable instance per fresh world; foundation is inert if run twice
execute unless entity @e[type=minecraft:marker,tag=l5_anchor,limit=1] run summon minecraft:marker 0 64 0 {Tags:["l5_anchor"]}
scoreboard players set #policy l5_policy 0
scoreboard players set #project l5_project 0
scoreboard players set #cartridge l5_project 0
scoreboard players set #food l5_bank 0
scoreboard players set #bricks l5_bank 0
scoreboard players set #paper l5_bank 0
scoreboard players set #seed l5_seed 0
setblock 0 64 0 minecraft:campfire
setblock 26 64 26 minecraft:oak_log
setblock -26 64 25 minecraft:smithing_table
setblock 26 64 -25 minecraft:lectern
setblock 0 64 -35 minecraft:lodestone
