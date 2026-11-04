#!/usr/bin/env python3
"""Byte-verified first-harvest world-cartridge lineage.

This validates real official Minecraft witnesses plus actual full world saves.
It does not claim food production by real people, randomized social science,
or signed source-native reLATTE authorization.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("wc010",HERE.parent/"lantern-commons-010"/"world_cartridge.py")
wc=importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc)
ORIGIN="dd1a1004b02d7fbb17fe868a788178b6d2ce07aebed4080dbafd77fa8e57287d"
BANNED=re.compile(r"^(?:give|clear|loot|clone|item|fill|setblock|summon)\b",re.I)
SCHEMA="lantern.first-harvest-game-observation/v0"

def need(test,code):
    if not test:raise ValueError("HARVEST_012_"+code)

def verify(stage,archive,observation,parent):
    full,files=wc.inspect(archive)
    need(full["parent"] is not None,"MISSING_PARENT")
    need(full["parent"]["cartridge_id"]==parent["cartridge_id"],"WRONG_PARENT_ID")
    need(full["parent"]["world_tree_sha256"]==parent["world_tree_sha256"],"WRONG_PARENT_TREE")
    need(full["parent"]["version"]==parent["version"] and
         full["parent"]["branch"]==parent["branch"],"WRONG_PARENT_NAME")
    need(full["world_seed"]==parent["world_seed"] and
         full["mojang_server_sha1"]==parent["mojang_server_sha1"] and
         full["minecraft_java_version"]=="26.1.1","ENGINE_CHANGED")
    need(full["branch"]==stage and
         full["version"]==("0.1.5" if stage=="heir" else "0.1.4"),"VERSION")
    raw=Path(observation).read_bytes()
    obs=json.loads(raw)
    need(full["observation_sha256"]==hashlib.sha256(raw).hexdigest(),"OBS_HASH")
    need(obs.get("schema")==SCHEMA and obs.get("mode")==stage and
         obs.get("loaded_parent_cartridge_id")==parent["cartridge_id"],"OBS_ID")
    need(obs.get("operator_item_provisions")==0 and
         obs.get("independent_nonop_game_observer")=="WC012_Witness","FAKE_INVENTORY_AUTHORITY")
    need(obs.get("world_seed")=="314159265" and obs.get("game_version")=="26.1.1",
         "GAME_VERSION")
    need(all(re.fullmatch(r"[0-9a-f]{64}",v) for v in obs["exact_source_sha256"].values()),
         "SOURCE_SHA")
    need(all(not BANNED.match(x["command"].strip()) for x in obs["command_history"]),
         "ITEM_INJECTION_COMMAND")
    start=obs["inherited_parent_state"]
    end=obs["finished_world_state"]
    for x in [start,end]:
        need(x["stock"]["vault_wheat"]==2 and x["stock"]["silo_bricks"]==2 and
             x["stock"]["silo_wheat"]==0,"INHERITED_GOODS_TAMPERED")
        need(x["blocks"]["pond"]=="water" and x["blocks"]["publicBell"]=="bell",
             "COMMON_INFRASTRUCTURE_LOST")
    if stage in ("reserve","harvest"):
        need(start["stock"]["harvest_wheat"]==0 and
             start["stock"]["harvested_seeds"]==0 and
             start["blocks"]["marker"]=="air" and
             start["blocks"]["replanted"]=="wheat","NOT_SAME_ORIGINAL_PARENT")
    if stage=="reserve":
        need(end["stock"]["harvest_wheat"]==0 and
             end["blocks"]["marker"]=="lapis_block" and
             not obs["witnessed_real_crop_actions"] and
             not obs["witnessed_real_item_transactions"],"RESERVE_CHANGED_MATERIAL")
    elif stage=="harvest":
        entries=obs["witnessed_real_crop_actions"]
        need(8<=len(entries)<=18 and all(x["event"]=="REAL_BLOCK_BREAK_AND_ITEM_PICKUP" and
             x["before"]=="wheat[age=7]" and x["after"]=="air" and
             x["position"][0] in (103,104) and 4<=x["position"][2]<=12 and
             isinstance(x["grain_inventory_added"],int) and
             x["grain_inventory_added"]>=0 for x in entries),"NO_REAL_RIPE_CROP_HARVEST")
        need(len(set(tuple(x["position"]) for x in entries))==len(entries),
             "CROP_TILE_REUSED_WITHOUT_REAL_REGROWTH")
        need(sum(x["grain_inventory_added"] for x in entries)==end["stock"]["harvest_wheat"],
             "DROPS_NOT_RECONCILED_WITH_ITEM_BANK")
        need(end["stock"]["harvest_wheat"]>=8 and
             end["stock"]["harvested_seeds"]>=2 and
             end["blocks"]["replanted"]=="air" and
             end["blocks"]["marker"]=="gold_block","HARVEST_YIELD_NOT_IN_SAVED_WORLD")
        moves=obs["witnessed_real_item_transactions"]
        need(len(moves)==2 and
             {(x["item"],x["action"]) for x in moves}==
                {("wheat","ACTUAL_GAME_DEPOSIT"),("wheat_seeds","ACTUAL_GAME_DEPOSIT")},
             "FARMER_DID_NOT_DEPOSIT_REAL_DROPS")
    else:
        need(start["stock"]["harvest_wheat"]>=8 and
             start["stock"]["harvested_seeds"]>=2 and
             start["blocks"]["marker"]=="gold_block" and
             start["blocks"]["replanted"]=="air","HEIR_NOT_THE_HARVEST_CHILD")
        crop=obs["witnessed_real_crop_actions"]
        names=[x["event"] for x in crop]
        need(names==["REAL_NON_OP_PLAYER_PLANTED_INHERITED_SEED",
             "VANILLA_RANDOM_TICKS_MATURED_REAL_PLAYER_SEED",
             "REAL_BLOCK_BREAK_AND_ITEM_PICKUP"],"SECOND_GENERATION_CROP_PROOF")
        need(crop[1]["random_tick_speed"]==1800 and
             crop[1]["operator_setblock_wheat"] is False and
             crop[2]["crop_origin"]=="PLAYER_PLANTED_AND_RANDOM_TICK_MATURED",
             "FAKE_CROP_GENERATION")
        need(end["stock"]["harvest_wheat"]==start["stock"]["harvest_wheat"]-3 and
             end["stock"]["regrown_wheat"]==1 and
             end["stock"]["harvested_seeds"]>=1 and
             end["blocks"]["replanted"]=="air" and
             end["blocks"]["heirMarker"]=="emerald_block","FOOD_AND_CROP_LEDGER")
        food=obs["crafted_and_consumed_food"]
        need([x["action"] for x in food]==["VANILLA_CRAFT_BREAD",
            "ACTUAL_VANILLA_GAME_BREAD_EATEN"],"REAL_CRAFT_OR_EATING_MISSING")
        need(food[0]["wheat_spent"]==3 and food[0]["bread_created"]==1 and
             food[1]["bread_items_consumed"]==1 and
             food[1]["wheat_equivalent_spent"]==3 and
             food[1]["hunger_before"]<20,"VANILLA_CONSUMPTION_CLAIM")
        moves=obs["witnessed_real_item_transactions"]
        source_bank=start["stock"]["harvest_wheat"]
        need([(x["action"],x["item"],x["amount"]) for x in moves]==[
            ("ACTUAL_GAME_WITHDRAW","wheat_seeds",1),
            ("ACTUAL_GAME_DEPOSIT","wheat",1),
            ("ACTUAL_GAME_WITHDRAW","wheat",source_bank),
            ("ACTUAL_GAME_DEPOSIT","wheat",source_bank-3)],
            "ILLEGAL_HEIR_RESOURCES")
    return {"branch":stage,"version":full["version"],"cartridge_id":full["cartridge_id"],
        "parent_cartridge_id":parent["cartridge_id"],"world_tree_sha256":full["world_tree_sha256"],
        "archive_sha256":hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
        "game_observation_sha256":hashlib.sha256(raw).hexdigest(),
        "world_files":len(files),"source_sha256":obs["exact_source_sha256"],
        "inherited_stock":start["stock"],"ending_stock":end["stock"],
        "real_game_crop_events":len(obs["witnessed_real_crop_actions"])}

def main(a):
    parent,_=wc.inspect(a.parent)
    need(parent["cartridge_id"]==ORIGIN and parent["branch"]=="silo_heir" and
         parent["version"]=="0.1.3","NOT_VERIFIED_011_HEIR_SOURCE")
    reserve=verify("reserve",a.reserve,a.reserve_observation,parent)
    harvest=verify("harvest",a.harvest,a.harvest_observation,parent)
    harvest_m,_=wc.inspect(a.harvest)
    heir=verify("heir",a.heir,a.heir_observation,harvest_m)
    need(heir["parent_cartridge_id"]==harvest["cartridge_id"],
         "NOT_REAL_GRANDCHILD")
    ms=[reserve,harvest,heir]
    need(len({x["cartridge_id"] for x in ms})==3 and
         len({x["world_tree_sha256"] for x in ms})==3,"IDENTICAL_BRANCHES")
    need(all(x["source_sha256"]==ms[0]["source_sha256"] for x in ms),
         "CHANGED_SOURCE_BETWEEN_WORLDS")
    lineage={"schema":"lantern.first-harvest-multigeneration-dag/v0",
        "parent":{"branch":"silo_heir","version":"0.1.3",
            "cartridge_id":parent["cartridge_id"],
            "world_tree_sha256":parent["world_tree_sha256"],
            "archive_sha256":hashlib.sha256(Path(a.parent).read_bytes()).hexdigest()},
        "children":ms,
        "world_saves_really_copied":True,"game_client_witnessed":True,
        "initial_inherited_wheat":2,"parent_mature_field":"authored 006/007 environment",
        "freshly_harvested_wheat_items":harvest["ending_stock"]["harvest_wheat"],
        "heir_additional_crops_from_player_seed":1,
        "grain_converted_and_eaten_as_bread":3,
        "operator_inventory_item_minting":0,
        "final_heir_wheat":{"vault":2,
            "harvest_bank":heir["ending_stock"]["harvest_wheat"],
            "second_generation_bank":heir["ending_stock"]["regrown_wheat"]},
        "claims_limit":["Game-only virtual farming and consumption",
          "Parent standing ripe field is inherited from older authored game construction",
          "Natural crop random ticking accelerated from default to 1800",
          "No closed-loop multi-crop farm or population survival proven",
          "No independently verified humans, moral consent, or reLATTE ADMIT"]}
    dest=Path(a.out)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(wc.canonical(lineage)+b"\n")
    print(json.dumps({"result":"REAL_GAME_HARVEST_PLANT_REGROW_CRAFT_EAT_GENERATIONS_VERIFIED",
        "origin":parent["cartridge_id"],
        "versions":[{k:x[k] for k in ("branch","version","cartridge_id","parent_cartridge_id")} for x in ms],
        "wheat_original":2,"wheat_harvested_in_old_field":harvest["ending_stock"]["harvest_wheat"],
        "wheat_harvested_from_player_seed":1,
        "wheat_eaten_as_bread_equivalent":3,"wheat_final":2+heir["ending_stock"]["harvest_wheat"]+heir["ending_stock"]["regrown_wheat"],
        "operator_new_item_grants":0},sort_keys=True))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for name in ["parent","reserve","reserve_observation","harvest",
                 "harvest_observation","heir","heir_observation","out"]:
        p.add_argument("--"+name.replace("_","-"),required=True)
    a=p.parse_args()
    try:main(a)
    except Exception as e:
        print(str(e),file=sys.stderr)
        sys.exit(1)
