#!/usr/bin/env python3
"""012: only overlay exact source-authored crop rules into disposable copied save.

Must never modify inherited inventory, world chunks, or user-supplied saves.
"""
from pathlib import Path
import argparse
import shutil

LOCAL=Path("experiments/lantern-commons-012/datapack")
TARGET=Path("work/lantern/server/world/datapacks/lantern-012-first-harvest")

def tree(p):
    if not p.is_dir() or p.is_symlink():
        raise ValueError("BAD_DATAPACK_DIRECTORY")
    records={}
    for x in p.rglob("*"):
        if x.is_symlink():raise ValueError("SYMLINK_DATAPACK")
        if x.is_file():records[x.relative_to(p).as_posix()]=x.read_bytes()
    return records

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--parent",required=True)
    args=p.parse_args()
    parent=Path(args.parent)
    if not parent.exists():raise ValueError("PARENT_WORLD_ARCHIVE_NOT_DOWNLOADED")
    dest=TARGET.parent.parent
    if not (dest/"level.dat").is_file():
        raise ValueError("REFUSE_FRESH_WORLD_WITHOUT_SAVED_PARENT")
    settings=Path("work/lantern/server/server.properties")
    if not settings.is_file():raise ValueError("SERVER_PROPERTIES_NOT_INITIALIZED")
    lines=settings.read_text().splitlines()
    matches=[i for i,x in enumerate(lines) if x.startswith("difficulty=")]
    if len(matches)!=1:raise ValueError("MISSING_UNIQUE_SERVER_DIFFICULTY")
    lines[matches[0]]="difficulty=normal"
    lines.append("spawn-monsters=false")
    settings.write_text("\n".join(lines)+"\n")
    print("GAME_DIFFICULTY_SET_TO_NORMAL_BEFORE_BOOT_FOR_REAL_HUNGER")
    if TARGET.exists():
        if tree(TARGET)!=tree(LOCAL):
            raise ValueError("SOURCE_DATAPACK_UNDECLARED_DRIFT")
        print("EXACT_MATCHING_012_SOURCE_ALREADY_INHERITED")
    else:
        shutil.copytree(LOCAL,TARGET)
        if tree(TARGET)!=tree(LOCAL):raise ValueError("COPY_NOT_EXACT")
        print("012_SOURCE_ONLY_DATAPACK_INSTALLED_ON_COPIED_WORLD")
