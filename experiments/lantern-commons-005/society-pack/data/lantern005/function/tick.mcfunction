scoreboard players enable @a l5_action
execute as @a[scores={l5_action=1}] at @s run function lantern005:join
execute as @a[scores={l5_action=10}] at @s run function lantern005:charter/commons
execute as @a[scores={l5_action=11}] at @s run function lantern005:charter/steward
execute as @a[scores={l5_action=20}] at @s run function lantern005:propose
execute as @a[scores={l5_action=30}] at @s run function lantern005:review
execute as @a[scores={l5_action=40}] at @s run function lantern005:build
execute as @a[scores={l5_action=50}] at @s run function lantern005:press
execute as @a[scores={l5_action=60}] at @s run function lantern005:seed
execute as @a[scores={l5_action=61}] at @s run function lantern005:seed_audit
execute as @a[scores={l5_action=70}] at @s run function lantern005:donate/wheat
execute as @a[scores={l5_action=71}] at @s run function lantern005:donate/brick
execute as @a[scores={l5_action=72}] at @s run function lantern005:donate/paper
scoreboard players set @a[scores={l5_action=1..}] l5_action 0
