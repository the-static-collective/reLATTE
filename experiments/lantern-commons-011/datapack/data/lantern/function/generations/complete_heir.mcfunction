# World-owned witness marker; actual old wheat must be moved to the new vault.
setblock 117 66 18 minecraft:emerald_block
data modify storage lantern:generations history append value {generation:"0.1.3",event:"INHERITED_WHEAT_RELOCATED",source:"REAL_PLAYER_MOVED_PREVIOUS_GENERATION_STOCK",new_items_created:0}
