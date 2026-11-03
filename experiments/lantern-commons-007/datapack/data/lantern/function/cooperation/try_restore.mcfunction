# One vanilla game-world authority gate, replayed each tick; either barrel missing => zero effect.
# Do not use a claimed player receipt as the material predicate.
execute if block 109 65 13 minecraft:redstone_block if items block 104 65 16 container.* minecraft:wheat[minecraft:count~{min:2}] if items block 114 65 16 container.* minecraft:stone_bricks[minecraft:count~{min:2}] run function lantern:cooperation/restore
