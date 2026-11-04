# Third-generation branch: a genuine EMPTY bread store and actual crafting table.
setblock 112 65 18 minecraft:barrel[facing=north]
# Separate EMPTY barrel for wheat from a naturally regrown seed: do not mix with inherited grain.
setblock 113 65 18 minecraft:barrel[facing=north]
setblock 112 65 17 minecraft:crafting_table
setblock 112 66 19 minecraft:iron_block
data modify storage lantern:harvest history append value {generation:"0.1.5",choice:"PLANT_INHERITED_SEEDS",operator_items_minted:0}
