"""Operator-directed, single-process local demonstration ledger. No reLATTE imports.

It owns only its balances and idempotent entries. It does not interpret ACCEPT,
resolve values, enforce protocol obligations or transfer money/legal ownership.
Input request carries opaque correlation IDs; the operator chooses to execute it.
"""
import json
import os
from pathlib import Path
import sys


def write_new(path, value):
    with open(path, "x") as f:
        os.chmod(path, 0o600)
        json.dump(value, f, sort_keys=True)


def fraction(n):
    return dict(numerator=str(n), denominator="1")


def main():
    command, state_path, *args = sys.argv[1:]
    path = Path(state_path)
    if command == "init":
        write_new(path, dict(schema="external.field-ledger/v1", balances={"B": "100", "A": "0"}, entries={}))
        return
    if command != "transfer" or len(args) != 2:
        raise ValueError("Usage: ledger.py init <state> | transfer <state> <operator-request> <new-record>")
    request = json.loads(Path(args[0]).read_text())
    assert set(request) == {"entry_ref", "amount", "acceptance_ref", "evidence_ref"}
    assert request["amount"] == "12" and all(isinstance(request[k], str) and 0 < len(request[k]) <= 256 for k in request)
    ledger = json.loads(path.read_text()); assert ledger["schema"] == "external.field-ledger/v1"
    ref = request["entry_ref"]
    if ref in ledger["entries"]:
        record = ledger["entries"][ref]
        assert record["request"] == request, "ENTRY_REFERENCE_CONFLICT"
    else:
        b, a = int(ledger["balances"]["B"]), int(ledger["balances"]["A"])
        assert b >= 12, "INSUFFICIENT_CREDITS"
        record = dict(schema="external.field-ledger-entry/v1", request=request, entry_ref=ref,
                      debit=dict(account_ref="field-account:B", before=fraction(b), after=fraction(b - 12)),
                      credit=dict(account_ref="field-account:A", before=fraction(a), after=fraction(a + 12)))
        ledger["balances"] = dict(B=str(b - 12), A=str(a + 12)); ledger["entries"][ref] = record
        temporary = Path(str(path) + ".pending"); write_new(temporary, ledger); os.replace(temporary, path)
    write_new(args[1], record)


if __name__ == "__main__":
    main()
