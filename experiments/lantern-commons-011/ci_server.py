#!/usr/bin/env python3
"""Prepare only disposable Minecraft Java 26.1.1 saves for 011 GitHub runners.
Fail closed on engine changes, stale datapack drift, or non-empty destinations.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

HERE=Path(__file__).resolve().parent
PACK=HERE/"datapack"
WORLD=Path("work/lantern/server/world")
SERVER=Path("work/lantern/server")
SEED="314159265"


def config(save_parent):
    if not WORLD.is_dir() or not (WORLD/"level.dat").is_file():
        raise ValueError("011_MUST_BOOT_REAL_PREVIOUSLY_EXTRACTED_SAVE")
    target=WORLD/"datapacks"/"lantern-011-inherited-resources"
    if not target.exists():
        shutil.copytree(PACK,target,symlinks=False)
    else:
        if target.is_symlink():
            raise ValueError("011_DATAPACK_SYMLINK")
        original={x.relative_to(PACK):x.read_bytes() for x in PACK.rglob("*") if x.is_file()}
        found={x.relative_to(target):x.read_bytes() for x in target.rglob("*") if x.is_file()}
        if found!=original:
            raise ValueError("011_REFUSE_UNCHECKED_SOURCE_CODE_DRIFT")
    prop={
      "server-ip":"127.0.0.1","server-port":"25565",
      "online-mode":"false","enforce-secure-profile":"false",
      "gamemode":"survival","force-gamemode":"true",
      "difficulty":"peaceful","spawn-protection":"0",
      "generate-structures":"false","level-type":"minecraft:flat",
      "level-seed":SEED,"view-distance":"8","simulation-distance":"8",
      "allow-flight":"true","op-permission-level":"4",
      "enable-rcon":"true","rcon.port":"25575",
      "rcon.password":"lantern-ci-only",
      "motd":"LANTERN-011 immutable inherited world cartridges"
    }
    (SERVER/"server.properties").write_text("".join(k+"="+v+"\n" for k,v in prop.items()))
    (SERVER/"eula.txt").write_text("eula=true\n")
    print(json.dumps({"server":"configured-on-localhost","parent":save_parent,
      "world_datapacks":str(target),"existing_world":True,
      "game_items_added":0}))


def official_jar(parent_archive):
    spec_path=HERE.parent/"lantern-commons-010"/"world_cartridge.py"
    import importlib.util
    spec=importlib.util.spec_from_file_location("wc010",spec_path)
    wc=importlib.util.module_from_spec(spec);spec.loader.exec_module(wc)
    parent,_=wc.inspect(parent_archive)
    if parent["world_seed"]!=SEED or parent["minecraft_java_version"]!="26.1.1":
        raise ValueError("011_REFUSE_UNSUPPORTED_PARENT_WORLD")
    manifest=json.load(urllib.request.urlopen("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",timeout=30))
    item=next(x for x in manifest["versions"] if x["id"]=="26.1.1")
    game=json.load(urllib.request.urlopen(item["url"],timeout=30))
    source=game["downloads"]["server"]
    binary=urllib.request.urlopen(source["url"],timeout=120).read()
    observed=hashlib.sha1(binary).hexdigest()
    if observed!=source["sha1"] or observed!=parent["mojang_server_sha1"]:
        raise ValueError("011_GAME_ENGINE_OR_PARENT_VERSION_DRIFT")
    SERVER.mkdir(parents=True,exist_ok=True)
    (SERVER/"server.jar").write_bytes(binary)
    (Path("work/lantern")/"server-meta.json").write_text(json.dumps({
      "id":game["id"],"jar_sha1":observed,
      "original_world_parent_id":parent["cartridge_id"]})+"\n")
    print(json.dumps({"jar":game["id"],"mojang_sha1":observed,
      "source_parent":parent["cartridge_id"]}))


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("action",choices=["config","official"])
    p.add_argument("--parent",required=True)
    args=p.parse_args()
    if args.action=="config": config(args.parent)
    else: official_jar(args.parent)
