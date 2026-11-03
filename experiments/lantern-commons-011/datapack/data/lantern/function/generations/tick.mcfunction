# Material game gate: existing parent 2 wheat + 2 bricks must be moved by
# independent real player inventory/container operations into these NEW stores.
execute if block 115 65 18 minecraft:iron_block if items block 113 65 17 container.* minecraft:wheat[minecraft:count~{min:2}] if items block 116 65 17 container.* minecraft:stone_bricks[minecraft:count~{min:2}] run function lantern:generations/complete_silo
execute if block 117 66 18 minecraft:iron_block if block 115 65 18 minecraft:gold_block if items block 117 65 17 container.* minecraft:wheat[minecraft:count~{min:2}] if items block 116 65 17 container.* minecraft:stone_bricks[minecraft:count~{min:2}] run function lantern:generations/complete_heir
