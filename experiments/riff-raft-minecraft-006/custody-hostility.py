#!/usr/bin/env python3
"""Adversarial cold Git-copy checks. Never mutate the source fixture."""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

import importlib.util
spec=importlib.util.spec_from_file_location(
    "riff_raft_seal_capsule",Path(__file__).with_name("seal-capsule.py"))
assert spec and spec.loader
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
reopen=module.reopen
seal=module.seal
CustodyHold=module.CustodyHold


def refuses(job, title: str) -> None:
    try:
        job()
    except (CustodyHold, OSError, ValueError):
        print("REFUSED:", title)
        return
    raise AssertionError("ADVERSARIAL ARCHIVE MUTATION WAS ACCEPTED: " + title)


def main(source: Path) -> None:
    expected = reopen(source)
    source_bytes = (source / "signed-005-return.bundle.json").read_bytes()
    source_index = (source / "custody-index.json").read_bytes()
    with tempfile.TemporaryDirectory(prefix="riff-raft-006-hostile-") as root:
        sandbox = Path(root)
        signed = sandbox / "signed-005-return.bundle.json"
        index = sandbox / "custody-index.json"
        signed.write_bytes(source_bytes)
        index.write_bytes(source_index)
        assert reopen(sandbox) == expected

        altered = source_bytes.replace(
            b'"R3_HOLD"', b'"R3_ADMIT"', 1,
        )
        assert altered != source_bytes
        signed.write_bytes(altered)
        refuses(lambda: reopen(sandbox),
                "recipient cannot elevate signed HOLD to ADMIT")
        refuses(lambda: seal(source / "signed-005-return.bundle.json", sandbox),
                "sealed Git copy cannot be overwritten by real but different bytes")
        signed.write_bytes(source_bytes)

        modified_index = json.loads(source_index)
        modified_index["archive_grants_no_execution"] = False
        index.write_text(json.dumps(modified_index))
        refuses(lambda: reopen(sandbox),
                "custody index cannot grant authority")
        index.write_bytes(source_index)

        modified_index = json.loads(source_index)
        modified_index["source_workflow_run_id"] += 1
        index.write_text(json.dumps(modified_index))
        refuses(lambda: reopen(sandbox),
                "custody run identity is pinned")
        index.write_bytes(source_index)

        signed.write_bytes(source_bytes[:-1])
        refuses(lambda: reopen(sandbox),
                "signature archive cannot be truncated")
        signed.write_bytes(source_bytes)

        signed.unlink()
        refuses(lambda: reopen(sandbox),
                "a missing archive cannot be inferred from old index")
        signed.write_bytes(source_bytes)

        index.unlink()
        refuses(lambda: reopen(sandbox),
                "index must be present to re-open the sealed source")
        index.write_bytes(source_index)

        assert reopen(sandbox) == expected
    print("RIFF-RAFT-006: seven hostile archive / authority / integrity controls PASSED")


if __name__ == "__main__":
    # Import file hyphen name via explicit on-disk loader, not syspath hacks.
    if len(sys.argv) != 2:
        print("usage: custody-hostility.py <archive-directory>", file=sys.stderr)
        raise SystemExit(2)
    main(Path(sys.argv[1]))
