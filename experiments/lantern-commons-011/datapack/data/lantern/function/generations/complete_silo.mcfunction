# Building-marker only. The actual wheat/bricks remain visible in invested barrels.
setblock 115 65 18 minecraft:gold_block
data modify storage lantern:generations history append value {generation:"0.1.2",event:"SILO_BUILT",source:"REAL_WHEAT_AND_BRICK_BARREL_GIFTS",new_items_created:0}
