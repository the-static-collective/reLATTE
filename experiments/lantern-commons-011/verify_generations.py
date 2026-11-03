#!/usr/bin/env python3
"""Inspect byte-exact multi-generation LANTERN-011 World Save cartridges.
Source-owned SHA evidence, not third-party proof of human identity or reLATTE ADMIT.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

PATH = Path(__file__).with_name("README.md").parent.parent / "lantern-commons-010" / "world_cartridge.py"
spec = importlib.util.spec_from_file_location("world_cartridge_010", PATH)
wc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc)

PARENT_ID = "b45537517d670812a7dc337c4e4881918ff2f477b2b2de7ddc253a7e86f5c5c6"
SCHEMA = "lantern.inherited-world-material-observation/v0"
STAGES = {
    "silo": {
        "version": "0.1.2",
        "oldW": 0, "oldB": 0, "bankW": 2, "bankB": 2, "vault": 0,
        "marker": "gold_block", "heirMarker": "air", "transfers": 4,
    },
    "steward": {
        "version": "0.1.2",
        "oldW": 2, "oldB": 2, "bankW": 0, "bankB": 0, "vault": 0,
        "marker": "lapis_block", "heirMarker": "air", "transfers": 0,
    },
    "silo_heir": {
        "version": "0.1.3",
        "oldW": 0, "oldB": 0, "bankW": 0, "bankB": 2, "vault": 2,
        "marker": "gold_block", "heirMarker": "emerald_block", "transfers": 2,
    },
}


def verify_case(stage, archive, witness, parent):
    if stage not in STAGES:
        raise ValueError("UNKNOWN_GENERATION")
    manifest, files = wc.inspect(archive)
    origin = parent["cartridge_id"]
    expected = STAGES[stage]
    if manifest["branch"] != stage or manifest["version"] != expected["version"]:
        raise ValueError("VERSION_BRANCH_MISMATCH")
    if manifest["parent"] is None:
        raise ValueError("NO_HERITAGE")
    if (manifest["parent"]["cartridge_id"] != origin or
            manifest["parent"]["world_tree_sha256"] != parent["world_tree_sha256"] or
            manifest["parent"]["version"] != parent["version"] or
            manifest["parent"]["branch"] != parent["branch"]):
        raise ValueError("WRONG_PARENTS")
    if (manifest["world_seed"] != parent["world_seed"] or
            manifest["mojang_server_sha1"] != parent["mojang_server_sha1"] or
            manifest["minecraft_java_version"] != "26.1.1"):
        raise ValueError("WORLD_ENGINE_CHANGED")
    raw = Path(witness).read_bytes()
    data = json.loads(raw)
    if (hashlib.sha256(raw).hexdigest() != manifest["observation_sha256"] or
            data["stage"] != stage or
            data["loaded_parent_cartridge_id"] != parent["cartridge_id"] or
            data["world_seed"] != parent["world_seed"] or
            data["game_version"] != "26.1.1"):
        raise ValueError("INDEPENDENT_GAME_OBSERVATION_NOT_BOUND")
    if (data.get("independently_connected_nonop_witness") != "WC011_Witness" or
            data.get("operator_reprovisioned_items") is not False or
            data.get("resource_production_established") is not False or
            data.get("inherited_infrastructure_persisted") is not True):
        raise ValueError("GAME_OBSERVATION_CLAIMS")
    start = data["inherited_material_before"]
    end = data["inherited_material_after"]
    for state in [start, end]:
        if state["wheat_total"] != 2 or state["stone_bricks_total"] != 2:
            raise ValueError("RESOURCE_CREATION_OR_LOSS")
        if state["wheat_total"] != state["oldW"] + state["bankW"] + state["vault"]:
            raise ValueError("WHEAT_NOT_RECONCILED")
        if state["stone_bricks_total"] != state["oldB"] + state["bankB"]:
            raise ValueError("BRICKS_NOT_RECONCILED")
    initial = {"oldW": 0, "oldB": 0, "bankW": 2, "bankB": 2, "vault": 0} if stage == "silo_heir" else {
        "oldW": 2, "oldB": 2, "bankW": 0, "bankB": 0, "vault": 0
    }
    for key, value in initial.items():
        if start[key] != value:
            raise ValueError("INHERITED_PARENT_STOCK_FABRICATED")
    for key in initial:
        if end[key] != expected[key]:
            raise ValueError("NEW_STOCK_FABRICATED")
    blocks = data["final_blocks"]
    for name, value in [
        ("marker", expected["marker"]), ("heirMarker", expected["heirMarker"]),
        ("pond", "water"), ("crop", "wheat"), ("commons", "gold_block"), ("bell", "bell")
    ]:
        if blocks[name] != value:
            raise ValueError("OBSERVED_BLOCK_MISMATCH_" + name)
    if any(re.search(r"\b(give|clear|loot|clone|item replace)\b", row["command"], re.I)
           for row in data["operator_commands"]):
        raise ValueError("OPERATOR_CHEATED_RESOURCE_SUPPLY")
    if len(data["material_transaction_records"]) != expected["transfers"]:
        raise ValueError("PLAYER_ITEM_TRANSFER_COUNT")
    actions = data["material_transaction_records"]
    for i in range(0, len(actions), 2):
        if (actions[i]["operation"] != "REAL_WITHDRAW" or
                actions[i+1]["operation"] != "REAL_DEPOSIT" or
                actions[i]["amount"] != 2 or actions[i+1]["amount"] != 2 or
                actions[i]["kind"] != actions[i+1]["kind"] or
                actions[i]["actor"] != actions[i+1]["actor"] or
                actions[i].get("operator_created_items") != 0 or
                actions[i+1].get("operator_created_items") != 0):
            raise ValueError("UNCORROBORATED_ACTOR_MOVEMENT")
    if stage == "silo":
        if [x["kind"] for x in actions[::2]] != ["wheat","stone_bricks"]:
            raise ValueError("SILO_WRONG_RESOURCES")
        if not data["game_owned_history"].count("SILO_BUILT"):
            raise ValueError("NO_PUBLIC_SILO_WITNESS")
    elif stage == "steward":
        if "STEWARD" not in data["game_owned_history"]:
            raise ValueError("NO_PUBLIC_STEWARDSHIP_WITNESS")
    else:
        if [x["kind"] for x in actions[::2]] != ["wheat"]:
            raise ValueError("VAULT_WRONG_RESOURCES")
        if not all(x in data["game_owned_history"] for x in ["SILO_BUILT","INHERITED_WHEAT_RELOCATED"]):
            raise ValueError("HEIR_MISSING_PARENT_HISTORY")
    if manifest["world_tree_sha256"] == parent["world_tree_sha256"]:
        raise ValueError("CHILD_WORLD_UNCHANGED")
    return {
        "branch": stage, "version": manifest["version"],
        "cartridge_id": manifest["cartridge_id"],
        "world_tree_sha256": manifest["world_tree_sha256"],
        "parent_cartridge_id": parent["cartridge_id"],
        "archive_sha256": hashlib.sha256(Path(archive).read_bytes()).hexdigest(),
        "observation_sha256": hashlib.sha256(raw).hexdigest(),
        "world_files": len(files),
        "stocks": end,
        "source_sha256": data["source_sha256"],
    }


def inspect_lineage(args):
    base, _ = wc.inspect(args.parent)
    if base["cartridge_id"] != PARENT_ID or base["version"] != "0.1.1" or base["branch"] != "mutual_aid":
        raise ValueError("NOT_VERIFIED_ORIGINAL_MUTUAL_AID_WORLD")
    silo = verify_case("silo", args.silo, args.silo_observation, base)
    steward = verify_case("steward", args.steward, args.steward_observation, base)
    silo_parent, _ = wc.inspect(args.silo)
    heir = verify_case("silo_heir", args.silo_heir, args.heir_observation, silo_parent)
    if heir["parent_cartridge_id"] != silo["cartridge_id"]:
        raise ValueError("HEIR_NOT_CHILD_OF_ACTUAL_INVESTMENT_WORLD")
    ids = [base["cartridge_id"], silo["cartridge_id"], steward["cartridge_id"], heir["cartridge_id"]]
    if len(set(ids)) != 4:
        raise ValueError("CARTRIDGE_IDS_MUST_BE_DISTINCT")
    trees = [base["world_tree_sha256"], silo["world_tree_sha256"], steward["world_tree_sha256"], heir["world_tree_sha256"]]
    if len(set(trees)) != 4:
        raise ValueError("WORLD_SAVES_MUST_HAVE_DISTINCT_BYTES")
    if len({json.dumps(x["source_sha256"],sort_keys=True) for x in [silo,steward,heir]})!=1:
        raise ValueError("SOURCE_DRIFT_ACROSS_FORKS")
    lineage={
        "schema":"lantern.multi-generation-world-cartridge-lineage/v0",
        "source_parent":{"branch":"mutual_aid","version":"0.1.1",
            "cartridge_id":base["cartridge_id"],
            "world_tree_sha256":base["world_tree_sha256"],
            "archive_sha256":hashlib.sha256(Path(args.parent).read_bytes()).hexdigest()},
        "generations":[silo,steward,heir],
        "verified_origins":1,"verified_child_snapshots":3,
        "same_seed_same_game_engine":True,
        "real_game_materials_persisted_across_save_copy_boundaries":True,
        "real_game_materials_remaining": {"wheat":2,"stone_bricks":2},
        "world_agency":"game-only, independent non-OP actor inventory transactions",
        "human_social_proof":False,
        "operator_resource_minting":False,
        "content_hashes_are_signed_relatte_receipts":False,
        "world_cartridges_are_permanent_external_storage":False,
        "limits":["Sources are game test data, not human choices",
          "Silo is infrastructure marker; not empirically proven farming yield",
          "One parent world, descendants are copied branches, not new founding worlds",
          "World hashes and finite material balances do not grant authority"]
    }
    out=Path(args.out)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_bytes(wc.canonical(lineage)+b"\n")
    print(json.dumps({"result":"THREE_GENERATION_GAME_MATERIAL_LINEAGE_VERIFIED",
        "original":base["cartridge_id"],
        "new_cartridges":[{k:x[k] for k in ("branch","cartridge_id","parent_cartridge_id","stocks")} for x in [silo,steward,heir]],
        "worlds_with_live_game_observation":3,
        "material_grants_by_operator":0},sort_keys=True))


if __name__=="__main__":
    p=argparse.ArgumentParser()
    for key in ["parent","silo","silo_observation","steward","steward_observation",
                "silo_heir","heir_observation","out"]:
        p.add_argument("--"+key.replace("_","-"),required=True)
    args=p.parse_args()
    try:inspect_lineage(args)
    except Exception as e:
        print(str(e),file=sys.stderr)
        sys.exit(1)
