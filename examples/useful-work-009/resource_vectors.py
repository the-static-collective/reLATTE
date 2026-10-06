"""Independent integer resource projections and native storage identity replay.

No TypeScript, collector, OS, meter or mathematical implementation imports.
Node authenticates signatures. stdin: resource bundle; freeze <bundle> <new-fixture>.
"""
import base64
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import sys


def jcs(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def hash_value(domain, value):
    return hashlib.sha256(domain.encode() + jcs(value)).hexdigest()


def fraction(numerator, denominator=1):
    value = Fraction(numerator, denominator)
    return dict(numerator=str(value.numerator), denominator=str(value.denominator))


def claim(crossing, kind):
    return crossing["extensions"]["organ_adapter"]["donor_claims"]["resource_" + kind]


def cpu(evidence):
    a, b = evidence["start"], evidence["end"]
    def fields(snapshot):
        text = snapshot["proc_stat"]
        assert text[:text.index(" (")] == str(snapshot["pid"])
        parts = text[text.rindex(") ") + 2:].split()
        return int(parts[11]), int(parts[12]), int(parts[19])
    au, ast, ai = fields(a); bu, bst, bi = fields(b)
    assert (a["boot_id"], a["pid"], ai, a["clock_ticks_per_second"]) == (b["boot_id"], b["pid"], bi, b["clock_ticks_per_second"])
    assert bu >= au and bst >= ast
    return dict(cpu_time_observed=fraction((bu - au + bst - ast) * 1000, int(a["clock_ticks_per_second"])), unit="milliseconds",
                user_ticks_observed=str(bu - au), system_ticks_observed=str(bst - ast), clock_ticks_per_second=a["clock_ticks_per_second"])


def energy(evidence):
    a, b = claim(evidence["start"], "energy-meter-reading"), claim(evidence["end"], "energy-meter-reading")
    for k in ["meter_id", "channel_id", "counter_epoch"]: assert a[k] == b[k] == evidence["meter"][k]
    assert a["unit"] == b["unit"] and a["provenance"] == b["provenance"] and int(b["sequence"]) > int(a["sequence"])
    delta = int(b["cumulative_reading"]) - int(a["cumulative_reading"])
    assert delta >= 0
    return dict(energy_watt_hours_observed=fraction(delta, 1000 if a["unit"] == "milliwatt-hours" else 3600000), unit="watt-hours",
                meter_counter_delta=str(delta), meter_counter_unit=a["unit"], reading_origin=a["provenance"]["reading_origin"])


def storage(evidence, job, identity):
    data = base64.b64decode(evidence["artifact_base64"], validate=True)
    a = json.loads(data); counts = a["escape_counts"]
    assert data == jcs(a) and hashlib.sha256(data).hexdigest() == evidence["file_sha256"]
    assert evidence["stat_before"] == evidence["stat_after"] and len(data) == int(evidence["stat_before"]["size"])
    population = job["width"] * job["height"]
    assert len(counts) == population and all(type(c) is int and 0 <= c <= job["iterations"] for c in counts)
    size = 1 << (population - 1).bit_length()
    nodes = [bytes.fromhex(hash_value("UsefulWork-NativePixel-v1|", dict(index=i, count=counts[i]))) if i < population else
             bytes.fromhex(hash_value("UsefulWork-NativePadding-v1|", dict(index=i))) for i in range(size)]
    while len(nodes) > 1:
        nodes = [hashlib.sha256(b"UsefulWork-NativeNode-v1|" + nodes[i] + nodes[i + 1]).digest() for i in range(0, len(nodes), 2)]
    header = dict(schema="useful-work.merkle-result/v1", algorithm="sha256-jcs-pixel-tree/v1", job_spec_hash=hash_value("", job),
                  width=job["width"], height=job["height"], counts_root=nodes[0].hex())
    assert a["result"] == header and identity == "useful-work-merkle-result-v1:" + hash_value("UsefulWork-MerkleResult-v1|", header)
    return dict(logical_file_bytes_observed=str(len(data)), filesystem_allocated_bytes_observed=str(int(evidence["stat_before"]["blocks"]) * 512), unit="bytes")


def network(evidence):
    a, b = evidence["start"], evidence["end"]
    for k in ["boot_id", "network_namespace", "interface_name"]: assert a[k] == b[k]
    assert int(a["ifindex_raw"]) == int(b["ifindex_raw"])
    rx, tx = int(b["rx_bytes_raw"]) - int(a["rx_bytes_raw"]), int(b["tx_bytes_raw"]) - int(a["tx_bytes_raw"])
    assert rx >= 0 and tx >= 0
    return dict(interface_rx_bytes_observed=str(rx), interface_tx_bytes_observed=str(tx), unit="bytes")


def vectors(bundle):
    seen, receipts, records = set(), set(), []
    for entry in bundle["observations"]:
        m = entry["measurement"]
        kind = m["extensions"]["organ_adapter"]["family_ref"].removeprefix("organ:useful-work/resource-").removesuffix("-v1")
        payload = claim(m, kind); evidence = payload["evidence"]
        if kind == "cpu": observed = cpu(evidence)
        elif kind == "energy": observed = energy(evidence)
        elif kind == "network": observed = network(evidence)
        elif kind == "storage": observed = storage(evidence, bundle["job_spec"], payload["scope"]["result_id"])
        else: raise ValueError("UNSUPPORTED_ADAPTER")
        records.append(dict(adapter=kind, measurement_id=m["crossing_id"], observed=observed))
        seen.add(m["crossing_id"]); receipts.add(entry["receipt"]["receipt_id"])
    body = {k: v for k, v in bundle.items() if k != "bundle_id"}
    return dict(bundle_id="useful-work-resource-bundle-v1:" + hash_value("UsefulWork-ResourceBundle-v1|", body),
                unique_measurements=len(seen), unique_replay_receipts=len(receipts), records=records)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "freeze":
        bundle = json.loads(Path(sys.argv[2]).read_text())
        value = dict(provenance="Live Linux process CPU, regular-file snapshot and loopback-interface counters; explicitly simulated signed meter readings. Four separately scoped collector measurements and independent replay receipts. No private keys. Arithmetic and native storage identity independently replayed in Python; Node verifies signatures.", bundle=bundle, expected=vectors(bundle))
        with Path(sys.argv[3]).open("x") as output: json.dump(value, output, ensure_ascii=False, separators=(",", ":")); output.write("\n")
    else:
        json.dump(vectors(json.load(sys.stdin)), sys.stdout, ensure_ascii=False, separators=(",", ":")); sys.stdout.write("\n")
