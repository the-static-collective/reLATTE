#!/usr/bin/env python3
"""LANTERN-010: content-addressed, immutable, complete Minecraft Java world save cartridges.

Only synthetic disposable worlds. Never archive private/unconsenting player worlds.
No dependency beyond Python standard library. Binary ZIPs are GitHub Actions artifacts,
not Git commits or permanently stored GitHub releases.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import zipfile

SCHEMA = "lantern.world-save-cartridge/v1"
MAX_FILES = 20000
MAX_BYTES = 256 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
EXCLUDED = {"session.lock", ".DS_Store"}
VERSION_RE = re.compile(r"^0\.1\.[0-9]+$")
BRANCH_RE = re.compile(r"^[a-z][a-z0-9_-]{0,30}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


def fail(reason):
    raise ValueError("CARTRIDGE_010_" + reason)


def canonical(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def legal_name(name):
    p = PurePosixPath(name)
    if (not name or name.startswith("/") or "\\" in name or
        any(seg in ("", ".", "..") for seg in name.split("/")) or
        p.as_posix() != name):
        fail("UNSAFE_ARCHIVE_PATH")
    return name


def zipentry(name, payload):
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (0o100644 << 16)
    info.create_system = 3
    return info, payload


def read_world(world):
    world = Path(world)
    if not world.is_dir() or world.is_symlink():
        fail("MISSING_OR_LINKED_WORLD")
    result = {}
    total = 0
    for path in sorted(world.rglob("*")):
        if path.is_symlink():
            fail("SYMLINK_IN_WORLD")
        if path.is_dir():
            continue
        if not path.is_file():
            fail("SPECIAL_FILE_IN_WORLD")
        relative = path.relative_to(world).as_posix()
        legal_name(relative)
        if relative in EXCLUDED:
            continue
        data = path.read_bytes()
        if len(data) > MAX_FILE:
            fail("OVERSIZED_WORLD_FILE")
        total += len(data)
        if total > MAX_BYTES or len(result) >= MAX_FILES:
            fail("OVERSIZED_WORLD")
        result["world/" + relative] = data
    if "world/level.dat" not in result:
        fail("MISSING_LEVEL_DAT")
    if not any(k.startswith("world/region/") and k.endswith(".mca") for k in result):
        fail("MISSING_GENERATED_CHUNKS")
    if not any(k.startswith("world/datapacks/") and k.endswith("/pack.mcmeta") for k in result):
        fail("MISSING_EMBEDDED_DATAPACKS")
    return result


def file_listing(payload):
    return [{"path": k, "sha256": digest(v), "size": len(v)} for k, v in sorted(payload.items())]


def world_tree(files):
    return digest(canonical(files))


def inspect(archive):
    archive = Path(archive)
    with zipfile.ZipFile(archive, "r") as z:
        infos = z.infolist()
        if len(infos) > MAX_FILES + 1:
            fail("TOO_MANY_ZIP_MEMBERS")
        names = [i.filename for i in infos]
        if len(names) != len(set(names)):
            fail("DUPLICATE_MEMBER")
        for member in infos:
            name = legal_name(member.filename)
            if not (name == "world-cartridge.json" or
                    name.startswith("world/")):
                fail("FOREIGN_ZIP_MEMBER")
            if member.is_dir() or (stat.S_IFMT(member.external_attr >> 16) == stat.S_IFLNK):
                fail("UNSAFE_ZIP_KIND")
            if member.file_size > MAX_FILE:
                fail("OVERSIZED_ZIP_MEMBER")
        if "world-cartridge.json" not in names:
            fail("MISSING_MANIFEST")
        if sum(i.file_size for i in infos) > MAX_BYTES:
            fail("OVERSIZED_ZIP")
        manifest = json.loads(z.read("world-cartridge.json"))
        if manifest.get("schema") != SCHEMA or manifest.get("kind") != "FULL_WORLD_SAVE":
            fail("SCHEMA")
        if not VERSION_RE.fullmatch(manifest.get("version", "")):
            fail("VERSION")
        if not BRANCH_RE.fullmatch(manifest.get("branch", "")):
            fail("BRANCH")
        if manifest.get("minecraft_java_version") != "26.1.1":
            fail("GAME_VERSION")
        if not re.fullmatch(r"[0-9]{1,20}", str(manifest.get("world_seed", ""))):
            fail("SEED")
        if not re.fullmatch(r"[0-9a-f]{40}", str(manifest.get("mojang_server_sha1", ""))):
            fail("MOJANG_SOURCE")
        if not SHA_RE.fullmatch(str(manifest.get("source_commit_sha256", ""))):
            fail("SOURCE_COMMIT_DIGEST")
        if not SHA_RE.fullmatch(str(manifest.get("observation_sha256", ""))):
            fail("OBSERVATION_DIGEST")
        parent = manifest.get("parent")
        if parent is None:
            if manifest["branch"] != "main" or manifest["version"] != "0.1.0":
                fail("UNAUTHORIZED_ROOT_VERSION")
        else:
            if not isinstance(parent, dict) or
                not SHA_RE.fullmatch(str(parent.get("cartridge_id", ""))) or
                not SHA_RE.fullmatch(str(parent.get("world_tree_sha256", ""))):
                fail("INVALID_PARENT")
            if manifest["branch"] == "main":
                fail("CHILD_MASQUERADING_AS_ROOT")
        declared = manifest.get("files")
        if not isinstance(declared, list):
            fail("FILES")
        content = {}
        for member in infos:
            if member.filename == "world-cartridge.json":
                continue
            content[member.filename] = z.read(member)
        listing = file_listing(content)
        if listing != declared:
            fail("TAMPERED_WORLD_CONTENT")
        if manifest.get("world_tree_sha256") != world_tree(listing):
            fail("TAMPERED_WORLD_TREE")
        expected = digest(canonical({k: v for k, v in manifest.items() if k != "cartridge_id"}))
        if manifest.get("cartridge_id") != expected:
            fail("TAMPERED_MANIFEST")
        if "world/level.dat" not in content or
           not any(x.startswith("world/region/") and x.endswith(".mca") for x in content):
            fail("INCOMPLETE_WORLD")
        if not any(x.startswith("world/datapacks/") and x.endswith("/pack.mcmeta") for x in content):
            fail("NO_DATAPACK")
        return manifest, content


def make_cartridge(args):
    if not VERSION_RE.fullmatch(args.version) or not BRANCH_RE.fullmatch(args.branch):
        fail("BAD_VERSION_OR_BRANCH")
    if not re.fullmatch(r"[0-9]{1,20}", args.seed):
        fail("BAD_SEED")
    if not re.fullmatch(r"[0-9a-f]{40}", args.mojang_sha1):
        fail("BAD_MOJANG_SHA")
    if not SHA_RE.fullmatch(args.source_sha256) or not SHA_RE.fullmatch(args.observation_sha256):
        fail("BAD_SOURCE_OR_OBSERVATION")
    parent = None
    if args.parent:
        old, _ = inspect(args.parent)
        parent = {
            "cartridge_id": old["cartridge_id"],
            "world_tree_sha256": old["world_tree_sha256"],
            "version": old["version"],
            "branch": old["branch"]
        }
        if args.branch == "main" or args.version == "0.1.0":
            fail("CHILD_REQUIRES_DISTINCT_VERSION_BRANCH")
        if args.seed != old["world_seed"] or args.mojang_sha1 != old["mojang_server_sha1"]:
            fail("PARENT_SEED_OR_ENGINE_DRIFT")
    elif args.branch != "main" or args.version != "0.1.0":
        fail("MISSING_ROOT_OR_PARENT")
    data = read_world(args.world)
    files = file_listing(data)
    manifest = {
        "schema": SCHEMA, "kind": "FULL_WORLD_SAVE",
        "lineage": "LANTERN_COMMONS_WORLD_010",
        "version": args.version, "branch": args.branch, "parent": parent,
        "minecraft_java_version": "26.1.1", "world_seed": args.seed,
        "mojang_server_sha1": args.mojang_sha1,
        "source_commit_sha256": args.source_sha256,
        "observation_sha256": args.observation_sha256,
        "experiment_action": args.action,
        "permission": "DISPOSABLE_GAME_WORLD_ONLY",
        "proof_limit": "World-byte and game-observation proof, not reLATTE signing or human identity.",
        "world_tree_sha256": world_tree(files), "files": files,
    }
    manifest["cartridge_id"] = digest(canonical(manifest))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        fail("NO_OVERWRITE_IMMUTABLE_CARTRIDGE")
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        x, data_bytes = zipentry("world-cartridge.json", canonical(manifest) + b"\n")
        z.writestr(x, data_bytes, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        for key, data_bytes in sorted(data.items()):
            x, _ = zipentry(key, data_bytes)
            z.writestr(x, data_bytes, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    checked, _ = inspect(out)
    if checked["cartridge_id"] != manifest["cartridge_id"]:
        fail("SELF_VALIDATION")
    receipt = {
        "schema": "lantern.world-cartridge-storage-receipt/v1",
        "archive_sha256": digest(out.read_bytes()),
        "cartridge_id": manifest["cartridge_id"],
        "world_tree_sha256": manifest["world_tree_sha256"],
        "archive_size": out.stat().st_size, "version": args.version,
        "branch": args.branch, "parent": parent,
        "source": "zip-bytes + unsigned hashes; not native reLATTE receipt"
    }
    Path(str(out) + ".receipt.json").write_bytes(canonical(receipt) + b"\n")
    print(json.dumps(receipt, sort_keys=True))
    return receipt


def checkout(archive, dest):
    manifest, content = inspect(archive)
    dest = Path(dest)
    if dest.exists():
        fail("CHECKOUT_REQUIRES_ABSENT_DESTINATION")
    dest.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".lantern-checkout-", dir=str(dest.parent)))
    try:
        for name, bytes_ in content.items():
            target = temp / name.removeprefix("world/")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bytes_)
        if file_listing(read_world(temp)) != manifest["files"]:
            fail("CHECKOUT_WORLD_TAMPER")
        os.replace(temp, dest)
        print(json.dumps({"checkout": str(dest), "cartridge_id": manifest["cartridge_id"],
            "files": len(content), "world_tree_sha256": manifest["world_tree_sha256"]}))
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise


def compare(args):
    root, _ = inspect(args.root)
    if root["parent"] is not None:
        fail("ROOT_MUST_BE_PARENTLESS")
    children = []
    unique_branches = set()
    for path in args.children:
        child, _ = inspect(path)
        parent = child["parent"]
        if (parent is None or parent["cartridge_id"] != root["cartridge_id"] or
            parent["world_tree_sha256"] != root["world_tree_sha256"] or
            child["world_seed"] != root["world_seed"] or
            child["mojang_server_sha1"] != root["mojang_server_sha1"]):
            fail("CHILD_NOT_FROM_IMMUTABLE_ROOT")
        if child["branch"] in unique_branches or child["world_tree_sha256"] == root["world_tree_sha256"]:
            fail("DUPLICATE_OR_UNCHANGED_BRANCH")
        unique_branches.add(child["branch"])
        children.append({"branch": child["branch"], "version": child["version"],
            "cartridge_id": child["cartridge_id"], "world_tree_sha256": child["world_tree_sha256"],
            "archive_sha256": digest(Path(path).read_bytes()),
            "parent_cartridge_id": parent["cartridge_id"]})
    if len(children) < 2 or len({x["world_tree_sha256"] for x in children}) != len(children):
        fail("INSUFFICIENT_INDEPENDENT_FORKS")
    lineage = {"schema": "lantern.world-lineage/v1",
        "parent": {"branch": "main", "version": root["version"],
            "cartridge_id": root["cartridge_id"], "world_tree_sha256": root["world_tree_sha256"],
            "archive_sha256": digest(Path(args.root).read_bytes())},
        "children": sorted(children, key=lambda c: c["branch"]),
        "claim": "full saved worlds with verified, immutable, shared source ancestry",
        "nonclaims": ["same-seed branches are NOT independent founding worlds",
            "hash verification is NOT a signed reLATTE crossing",
            "archived worlds are NOT permanent until moved to durable storage",
            "not a human social or economic experiment"]}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_bytes(canonical(lineage) + b"\n")
    print(json.dumps({"result": "IMMUTABLE_PARENT_AND_DISTINCT_WORLD_FORKS_VERIFIED",
        "parent": root["cartridge_id"], "forks": [c["branch"] for c in children],
        "lineage_file": args.out}))


def parser():
    p = argparse.ArgumentParser()
    cmds = p.add_subparsers(dest="cmd", required=True)
    pack = cmds.add_parser("pack")
    pack.add_argument("--world", required=True)
    pack.add_argument("--out", required=True)
    pack.add_argument("--version", required=True)
    pack.add_argument("--branch", required=True)
    pack.add_argument("--seed", required=True)
    pack.add_argument("--mojang-sha1", required=True)
    pack.add_argument("--source-sha256", required=True)
    pack.add_argument("--observation-sha256", required=True)
    pack.add_argument("--action", required=True)
    pack.add_argument("--parent")
    ver = cmds.add_parser("verify")
    ver.add_argument("archive")
    co = cmds.add_parser("checkout")
    co.add_argument("archive")
    co.add_argument("destination")
    lineage = cmds.add_parser("lineage")
    lineage.add_argument("--root", required=True)
    lineage.add_argument("--children", nargs="+", required=True)
    lineage.add_argument("--out", required=True)
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    try:
        if args.cmd == "pack":
            make_cartridge(args)
        elif args.cmd == "verify":
            m, files = inspect(args.archive)
            print(json.dumps({"result": "VALID_WORLD_CARTRIDGE",
                "cartridge_id": m["cartridge_id"], "version": m["version"],
                "branch": m["branch"], "world_files": len(files),
                "archive_sha256": digest(Path(args.archive).read_bytes())}))
        elif args.cmd == "checkout":
            checkout(args.archive, args.destination)
        elif args.cmd == "lineage":
            compare(args)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
