# LANTERN-007. Call ONLY AFTER lantern:events/prepare and drought in disposable world.
# Two complementary, non-owner-backed gift barrels. Goods cannot emerge from mere declarations.
setblock 104 65 16 minecraft:barrel[facing=north]
setblock 114 65 16 minecraft:barrel[facing=north]
setblock 109 65 16 minecraft:stone_bricks
data modify storage lantern:cooperation history set value []
data modify storage lantern:cooperation history append value {event:"GIFT_STATIONS_OPEN",wheat_role:"AidGrower",bricks_role:"AidMason",minimum_gift_count:2,permission:"VOLUNTARY",effects:"NONE"}
