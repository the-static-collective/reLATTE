# A different game account must explicitly review; player account != independent human
execute if entity @s[tag=l5_member,tag=!l5_proposer] if entity @s[x=0,y=64,z=0,distance=..12] if score #project l5_project matches 1 run scoreboard players set #project l5_project 2
