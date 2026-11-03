# This creates EMPTY containers and a pending indicator, never mints materials.
setblock 113 65 17 minecraft:barrel[facing=north]
setblock 116 65 17 minecraft:barrel[facing=north]
setblock 115 65 18 minecraft:iron_block
data modify storage lantern:generations history set value [{generation:"0.1.2",choice:"OFFER_SILO",effect:"AWAIT_TWO_INHERITED_RESOURCE_DEPOSITS"}]
