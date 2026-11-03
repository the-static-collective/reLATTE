# Effect is permitted only through try_restore's material preconditions.
# These are source-owned game-world rules, not human legal consent or a claim of off-game help.
function lantern:events/mercy
setblock 109 65 16 minecraft:gold_block
setblock 109 66 16 minecraft:bell
data modify storage lantern:cooperation history append value {event:"COMMON_GARDEN_RESTORED",source:"TWO_MATERIAL_GIFTS_IN_SEPARATE_BARRELS",donors_verified_humans:false,automatic_admission:false}
