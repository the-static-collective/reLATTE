# Harvest success requires actual fresh drops in new item barrels.
execute if block 110 66 19 minecraft:iron_block if items block 110 65 18 container.* minecraft:wheat[minecraft:count~{min:8}] if items block 111 65 18 container.* minecraft:wheat_seeds[minecraft:count~{min:2}] if items block 117 65 17 container.* minecraft:wheat[minecraft:count~{min:2}] run function lantern:harvest/complete
# Replanted crop was NOT built by commands. Game ticks mature it in inherited world.
execute if block 112 66 19 minecraft:iron_block if block 103 65 6 minecraft:wheat[age=7] if block 110 66 19 minecraft:gold_block run function lantern:harvest/complete_heir
