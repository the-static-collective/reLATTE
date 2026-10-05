"""Regenerate pinned Kernel 004 vectors using only the independent Python world."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("native", root / "independent/merkle_result_v1.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
small = json.loads((root / "fixtures/useful-work-001-golden.json").read_text())["job"]
demo = json.loads((root / "examples/useful-work-001/julia-001.json").read_text())
cases = []
for label, job, indices in [
    ("small-padded", small, [0, 4, 11]),
    ("singleton", dict(small, width=1, height=1), [0]),
    ("seven-leaves", dict(small, width=7, height=1), [0, 3, 6]),
    ("pixel-1928", demo, [0, 1928, 3071]),
]:
    rendered, levels = native.tree(job, native.math.render(job)["escape_counts"])
    artifact = rendered["artifact"]
    samples = native.math.sample_job(native.math.canonical_bytes(job), indices)["samples"]
    entry = dict(label=label, job=job, result_id=rendered["result_id"], result_header=artifact["result"],
                 samples=[dict(s, committed_count=artifact["escape_counts"][s["index"]],
                               proof=native.proof(levels, s["index"])) for s in samples])
    if label != "pixel-1928":
        entry["artifact"] = artifact
    cases.append(entry)
fixture = dict(provenance="Pinned from the independent Python implementation of the prose Merkle-native contract; no worker algorithm imports.", cases=cases)
(root / "fixtures/useful-work-004-golden.json").write_text(json.dumps(fixture, indent=2) + "\n")
