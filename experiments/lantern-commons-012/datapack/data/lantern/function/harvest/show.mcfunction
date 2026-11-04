data get storage lantern:harvest history
execute store result score #harvestwheat lc_store if items block 110 65 18 container.* minecraft:wheat
execute store result score #harvestseeds lc_store if items block 111 65 18 container.* minecraft:wheat_seeds
execute store result score #vaultoldwheat lc_store if items block 117 65 17 container.* minecraft:wheat
