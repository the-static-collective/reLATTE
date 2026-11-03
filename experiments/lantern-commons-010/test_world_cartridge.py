#!/usr/bin/env python3
"""Strict unit tests for content-addressed world snapshots, using synthetic files.
Real Mojang Anvil world creation is a SEPARATE CI gate.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("world_cartridge", HERE / "world_cartridge.py")
wc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc)


class TestWorldCartridge(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)
        self.world = self.root / "source-world"
        (self.world / "region").mkdir(parents=True)
        (self.world / "datapacks" / "lantern" ).mkdir(parents=True)
        (self.world / "level.dat").write_bytes(b"synthetic-level-not-a-minecraft-save")
        (self.world / "region" / "r.0.0.mca").write_bytes(b"synthetic-anvil-not-valid-minecraft")
        (self.world / "datapacks" / "lantern" / "pack.mcmeta").write_text('{"pack":{}}')
        (self.world / "session.lock").write_bytes(b"ephemeral-process-lock")

    def pack(self, out, version="0.1.0", branch="main", parent=None, world=None):
        args = argparse.Namespace(
            world=str(world or self.world), out=str(out), version=version,
            branch=branch, seed="314159265", mojang_sha1="a" * 40,
            source_sha256="b" * 64, observation_sha256="c" * 64,
            action="unit test simulated world", parent=str(parent) if parent else None
        )
        wc.make_cartridge(args)
        return out

    def test_pack_verify_and_deterministic_bytes(self):
        first = self.pack(self.root / "main1.zip")
        second = self.pack(self.root / "main2.zip")
        m, files = wc.inspect(first)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        self.assertEqual(m["cartridge_id"], wc.inspect(second)[0]["cartridge_id"])
        self.assertEqual(len(files), 3)
        self.assertNotIn("world/session.lock", files)

    def test_checkout_is_new_copy_and_parent_remains_unchanged(self):
        root = self.pack(self.root / "root.zip")
        before = root.read_bytes()
        wc.checkout(root, self.root / "fork")
        (self.root / "fork" / "level.dat").write_bytes(b"other-realization")
        self.assertEqual(before, root.read_bytes())
        child = self.pack(self.root / "child.zip", version="0.1.1",
                          branch="mercy", parent=root, world=self.root / "fork")
        self.assertEqual(wc.inspect(child)[0]["parent"]["cartridge_id"],
                         wc.inspect(root)[0]["cartridge_id"])
        self.assertNotEqual(wc.inspect(child)[0]["world_tree_sha256"],
                            wc.inspect(root)[0]["world_tree_sha256"])

    def test_two_distinct_branches_share_one_parent(self):
        root = self.pack(self.root / "root.zip")
        children = []
        for branch, marker in [("mercy", b"water"), ("abstain", b"dry")]:
            target = self.root / branch
            wc.checkout(root, target)
            (target / "level.dat").write_bytes(marker)
            children.append(self.pack(self.root / (branch + ".zip"), version="0.1.1",
                                      branch=branch, parent=root, world=target))
        args = argparse.Namespace(root=str(root),children=[str(p) for p in children],
                                  out=str(self.root / "lineage.json"))
        wc.compare(args)
        info = json.loads((self.root / "lineage.json").read_text())
        self.assertEqual(len(info["children"]), 2)
        self.assertEqual({x["branch"] for x in info["children"]},{"mercy","abstain"})

    def test_tamper_bytes_fails_verification(self):
        root = self.pack(self.root / "root.zip")
        bogus = self.root / "tamper.zip"
        with zipfile.ZipFile(root) as src, zipfile.ZipFile(bogus,"w") as out:
            for member in src.namelist():
                content=src.read(member)
                if member=="world/level.dat":
                    content=b"tampered!"
                out.writestr(member,content)
        with self.assertRaisesRegex(ValueError, "TAMPERED_WORLD_CONTENT"):
            wc.inspect(bogus)

    def test_tampered_manifest_id_fails(self):
        root = self.pack(self.root / "root.zip")
        bogus = self.root / "tamper-id.zip"
        with zipfile.ZipFile(root) as src, zipfile.ZipFile(bogus,"w") as out:
            for member in src.namelist():
                content=src.read(member)
                if member=="world-cartridge.json":
                    doc=json.loads(content)
                    doc["experiment_action"]="FORGED_ACTION"
                    content=wc.canonical(doc)
                out.writestr(member,content)
        with self.assertRaisesRegex(ValueError, "TAMPERED_MANIFEST"):
            wc.inspect(bogus)

    def test_forbidden_path_traversal_rejected(self):
        bogus=self.root/"escape.zip"
        with zipfile.ZipFile(bogus,"w") as z:
            z.writestr("../outside", b"arbitrary")
            z.writestr("world-cartridge.json",b"{}")
        with self.assertRaisesRegex(ValueError,"UNSAFE_ARCHIVE_PATH"):
            wc.inspect(bogus)
        self.assertFalse((self.root/"outside").exists())

    def test_symlink_inside_world_rejected(self):
        (self.world/"linked").symlink_to(self.world/"level.dat")
        with self.assertRaisesRegex(ValueError,"SYMLINK_IN_WORLD"):
            self.pack(self.root/"root.zip")

    def test_checkout_does_not_overwrite_existing_world(self):
        root=self.pack(self.root/"root.zip")
        destination=self.root/"already-owned-world"
        destination.mkdir()
        (destination/"sentinel").write_text("must remain unchanged")
        with self.assertRaisesRegex(ValueError,"CHECKOUT_REQUIRES_ABSENT_DESTINATION"):
            wc.checkout(root,destination)
        self.assertEqual((destination/"sentinel").read_text(),"must remain unchanged")

    def test_child_without_actual_parent_rejected(self):
        with self.assertRaisesRegex(ValueError,"MISSING_ROOT_OR_PARENT"):
            self.pack(self.root/"child.zip",branch="mercy",version="0.1.1")

    def test_parent_engine_and_seed_cannot_silently_change(self):
        root=self.pack(self.root/"root.zip")
        arg=argparse.Namespace(world=str(self.world),out=str(self.root/"child.zip"),
            version="0.1.1",branch="mercy",seed="9999",mojang_sha1="a"*40,
            source_sha256="b"*64,observation_sha256="c"*64,
            action="fork",parent=str(root))
        with self.assertRaisesRegex(ValueError,"PARENT_SEED_OR_ENGINE_DRIFT"):
            wc.make_cartridge(arg)

    def test_unmodified_fork_is_not_an_independent_branch(self):
        root=self.pack(self.root/"root.zip")
        other=self.pack(self.root/"child.zip",version="0.1.1",
                        branch="mercy",parent=root)
        args=argparse.Namespace(root=str(root),children=[str(other),str(other)],
                                out=str(self.root/"lineage.json"))
        with self.assertRaisesRegex(ValueError,"DUPLICATE_OR_UNCHANGED_BRANCH"):
            wc.compare(args)


if __name__ == "__main__":
    unittest.main()
