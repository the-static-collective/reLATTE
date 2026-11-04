# Actual crop was planted through non-OP game-client use of inherited seed.
# Neither this function nor any other 012 function sets or grows crop blocks.
setblock 112 66 19 minecraft:emerald_block
data modify storage lantern:harvest history append value {generation:"0.1.5",event:"NEW_WHEAT_MATURED_NATURALLY",proof:"ORIGINAL_HARVESTED_TILE_REPLANTED_BY_PLAYER",operator_items_minted:0}
