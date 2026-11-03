execute if entity @s[tag=l5_member] if entity @s[x=0,y=64,z=0,distance=..12] if score #policy l5_policy matches 1.. if score #project l5_project matches 0 run function lantern005:propose_pass
