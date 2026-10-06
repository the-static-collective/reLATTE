# Useful Work Kernel 009 — Measured Resource Adapters

009 introduces four separately scoped observation contracts. A signed measurement
names its source, raw readings, subject, units, collector and declared job association.
Another key replays the signature, structure and arithmetic. This gives attributable
observations, without a generic `resource_proven` flag or an exclusive job-cost estimate.

```text
linux/proc/v1          → CPU process ticks       → exact process-time observation
external/power-meter/v1→ signed meter readings   → exact meter-energy delta
node/fs-stat/v1        → opened file + bytes     → logical/allocation snapshot
linux/sysfs-net/v1     → interface counters      → exact interface-byte deltas
                               ↓
               separately signed scoped measurements
                               ↓
                 independent replay receipts
                               ↓
           portable inventory → opaque RECEIVE / HOLD
```

```text
CPU TIME ≠ ENERGY
PROCESS TIME ≠ EXCLUSIVE WORK
METER READING ≠ CAUSATION
MEASUREMENT ≠ ECONOMIC VALUE
```

## Run and retain it

Node 22.18+; the live collectors/demo require Linux and `getconf`. Tests also use
Python 3.10+ with standard library only. Portable verification needs only Node
and public records; it does not access `/proc`, `/sys`, the original file or a meter.

```sh
npm ci
npm run verify
npm run useful-work-009 -- demo examples/useful-work-001/julia-001.json
```

The demo samples a **separate live worker process** before and after producing its
native result. It snapshots a real artifact file and observes real loopback counters
around an HTTP transfer. Its energy example is **simulated signed meter readings**,
explicitly labeled `simulation/v1` in the provider's signed provenance and in the
output summary. No physical energy measurement is performed. No power meter, sensor
certificate, calibrated device or hardware attestation is available in this demo.

The frozen example records 70 ms process CPU, 7,412 logical artifact bytes, 8,192
filesystem-reported allocation bytes and 8,302 received/transmitted interface bytes.
Actual runs differ, and even a zero CPU tick delta is a valid observation at the
OS counter's resolution. The simulated meter delta is ½ Wh. These quantities are
different observations; none is converted into another or into economic value.

Fresh output directories are required; use `--out <new-directory>` for reruns.
Default `output/useful-work-009/` contains:

- `native-context.json`: canonical job and authenticated 004 work crossing.
- `cpu/`, `energy/`, `storage/`, `network/`: raw signed `measurement.json` crossings
  and separately signed `receipt.json` replay receipts.
- `energy-meter/`: pinned public meter identity and signed reading transport bundles.
- `demo-provenance.json`: explicit separation of live Linux observations and the
  simulated energy example.
- `resource-input.json`: self-contained inventory input.
- `resources/resources.json`, `summary.json`, `crossing.json`, `receiver/`: portable
  verified inventory, readable observations, signed reference and durable HOLD.
- `artifact.json`, `local-state/`: original file and restricted private demo keys;
  neither is needed for later replay. The storage observation embeds the public
  native bytes it checked, so their identity can be independently replayed.

```sh
npm run useful-work-009 -- verify output/useful-work-009/resources/resources.json --crossing output/useful-work-009/resources/crossing.json --out output/resource-reverified
npm run useful-work-009 -- collect output/useful-work-009/resource-input.json --out output/resource-collected
```

Distinct collector, meter-provider and verifier keys establish attribution, not
physical independence, different people or honest telemetry. The local demo controls
every role key. Collection and replay commands can run in separate processes.

## Common boundary and exact quantities

Each adapter has a distinct family and contract:
`organ:useful-work/resource-{cpu|energy|storage|network}-v1` and
`contract:useful-work/resource-{cpu|energy|storage|network}-v1`.
Measurement payload schema is `useful-work.{kind}-observation/v1`, with exactly:

- `measurement_source`: the adapter's literal source identifier.
- `scope`: `result_id`, `work_crossing_id`, `job_spec_hash`, nullable `execution_ref`
  and literal `association_basis: "collector-declared/v1"`.
- `provenance`: declared `host_ref`, collector `runtime`, `collector_source_sha256`
  and `capture_mode`. Local sources accept `live-local/v1` or `imported-records/v1`;
  the energy ingestor requires `signed-meter-ingest/v1`.
- `evidence`: adapter-specific raw public records.
- `observed`: adapter-specific quantities derived from those records.
- `claims`: that adapter's exact, bounded claim set and common limitations.

The result identity remains 004's sole native Merkle identity. Work/job binding is
authenticated before accepting a measurement. `execution_ref` is a collector's
association label; it does not establish that all observed resources were caused
by this useful-work job. Observations can precede result publication; signatures
can bind the identified result after the readings exist.

Counters are canonical decimal unsigned 64-bit **strings**, never floating-point
numbers. Raw sysfs counters retain their optional trailing newline. Counter deltas,
unit conversions and allocation arithmetic use BigInt. Fractional milliseconds/Wh
use reduced `{numerator,denominator}` decimal strings; there is no rounding. Counter
resets or wraps are rejected as unsupported intervals, never automatically repaired
or called fraud. Observe again under a new subject/epoch when appropriate.

Timestamps use exact UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. End readings cannot predate
starts; measurement signing cannot predate the observation's end; a replay receipt
cannot predate its measurement. These checks establish consistency of **attributed
clock claims**, not an objective clock. Equal claimed sample times are permitted
at coarse resolution. No time-based resource rate is computed.

The collector fingerprint identifies the claimed collection module, not proof that
the signer executed it. Host labels, boot IDs, PID/namespace identifiers, paths,
device references and raw OS data remain signed source claims. A dishonest collector
can fabricate plausible raw records. Replay verifies their structure/arithmetic;
it cannot prove the physical collection happened.

## CPU — `linux/proc/v1`

Evidence is `{start,end}`. Each snapshot carries `observed_at`, `boot_id`, `pid`,
`clock_ticks_per_second` and the complete textual `/proc/<pid>/stat` record.
The collector obtains tick frequency using `getconf CLK_TCK`.

The parser locates the entire parenthesized command name, including spaces and
parentheses, then extracts Linux fields 14 (`utime`), 15 (`stime`) and 22
(`starttime`). Both snapshots must match boot ID, PID, process start ticks and tick
frequency. Each time counter must be nondecreasing. PID reuse, reboot, changed
frequency and a reset/wrap fail explicitly.

```text
cpu_time_observed (ms) = 1000 × (Δutime + Δstime) / clock_ticks_per_second
```

The observation also retains separate user/system tick deltas and the tick rate.
The 41,228 ms test vector uses 41,228 ticks at 1,000 ticks/second. Time can exceed
the wall-clock interval for a multithreaded process; that is not rejected or turned
into a core-count claim.

`cpu_counter_delta_replayed` and `process_instance_fields_matched` are true after
validation. `os_counter_authenticity_verified`, `process_exclusive_work_verified`
and `cpu_energy_inferred` remain false. Child-process counters (`cutime`/`cstime`)
are deliberately excluded; `descendant_process_time_included` is false. This is
OS-accounted user/system process time, not cycles, electricity, exclusive job work,
all descendant work or a trusted hardware measurement.

## Energy — `external/power-meter/v1`

The provider signs `useful-work.energy-meter-reading/v1` crossings under a separate
`resource-energy-meter-reading-v1` contract. A reading contains `meter_id`,
`channel_id`, `counter_epoch`, uint64 `sequence`, uint64 `cumulative_reading`,
`unit`, `observed_at` and provenance with `reading_origin`, `device_ref`, nullable
`calibration_ref` and nullable `telemetry_ref`.

Origins are `device-telemetry/v1`, `operator-import/v1` or `simulation/v1`. They are
provider declarations, not certification that a physical meter exists or is honest.
The demo signs `simulation/v1`; import commands can sign actual operator readings
or retain a device provider's records without changing the verification boundary.

Energy evidence pins a `meter` identity containing its public key, world, meter,
channel and counter epoch, plus signed `start`/`end` readings. Both provider
signatures are authenticated against that pinned identity. Unit and provenance must
match; the end sequence must advance and the counter cannot decrease.

```text
energy_watt_hours_observed = Δcumulative_milliwatt_hours / 1000
energy_watt_hours_observed = Δcumulative_millijoules / 3,600,000
```

`signed_meter_readings_verified` and `meter_counter_delta_replayed` are true.
`physical_meter_verified`, `meter_calibration_verified`, `provider_honesty_verified`,
`job_energy_causation_verified`, `exclusive_job_energy_verified` and
`energy_cpu_time_inferred` remain false. A shared-outlet counter can cover other
processes, cooling, idle power or other devices. Even a valid calibration reference
is only retained provenance under v1, not a verified calibration chain.

## Storage — `node/fs-stat/v1`

The collector opens the specified regular file read-only with `O_NOFOLLOW`, captures
file-descriptor metadata before and after a bounded read and retains the bytes.
Evidence contains absolute `file_path`, read interval, `stat_before`/`stat_after`,
strict `artifact_base64` and `file_sha256`. Stats carry decimal-string `dev`, `ino`,
`size`, `blocks`, `mode`, `mtime_ns` and `ctime_ns`. Both metadata snapshots must
match. Symlink inputs, directories, oversized files, inconsistent size/hash,
noncanonical artifacts and wrong native roots fail explicitly.

The portable verifier recomputes canonical native artifact structure, every leaf,
the counts root and result identity from the embedded bytes, without recomputing
their mathematical job. It also checks byte length against reported file size.

```text
logical_file_bytes_observed = reported size = length of retained native bytes
filesystem_allocated_bytes_observed = reported st_blocks × 512
```

Allocation can be smaller than logical size for a sparse file. It can also be shared,
deduplicated, virtualized or copied later. `native_artifact_bytes_identity_verified`
and `file_metadata_fields_matched` are true; `os_metadata_authenticity_verified`,
`continuous_storage_verified`, `durable_persistence_verified`,
`exclusive_physical_storage_verified` and `filesystem_allocation_is_physical_cost`
remain false. The recorded path describes the opened descriptor's observation,
not permanent ownership, current path resolution or continuous storage.

## Network — `linux/sysfs-net/v1`

Evidence is `{start,end}`. Each snapshot retains `observed_at`, `boot_id`, the
collector's `/proc/self/ns/net` link, interface name and raw sysfs `ifindex`,
`statistics/rx_bytes` and `statistics/tx_bytes` strings. Boot ID, namespace, name and
index must match; both counters must be nondecreasing. Interface names exclude
paths/traversal. The reads are sequential, explicitly non-atomic.

The observation returns separate `interface_rx_bytes_observed` and
`interface_tx_bytes_observed` deltas. V1 sets `interface_counter_delta_replayed` and
`interface_subject_fields_matched` true, while OS authenticity, interface generation,
sysfs-to-namespace binding, job-byte causation, service-byte verification, physical
bandwidth, network path and host uptime remain false.

These are interface counters. They may include unrelated traffic, protocol overhead,
loopback copies or virtual-device behavior. They are not 008's decoded native chunk
bytes. The adapter does not infer throughput, destination, packet path, dedicated
capacity or causal allocation to the useful-work job.

## Receipts, portable inventory and valuation

A second key/world signs an ordinary `VERIFIED` reLATTE replay receipt under the
specific adapter contract, with `semantic_effect: none`. Its `useful_work_resource`
report names the source, measurement ID, scope, collector identity, provenance,
derived observations, interval, limits and four laws. It replays every included
signature, context binding and arithmetic claim. Verifier keys must differ from
the collector and, for energy, the meter provider. Distinct keys/world labels still
do not prove separate people, hardware or execution.

`VERIFIED` means the adapter's **signature/structure/arithmetic replay** passed.
It never means all resource use is proven. Validly signed wrong values, invented
stronger claims, altered scopes or admission/ownership effects fail exact receipt
reconstruction. Unsupported readings emit validation errors, not negative
computational, guilt or economic-entitlement receipts.

Every adapter keeps job association, hardware attestation, objective time, full
computation, exclusive job resource use, economic value, ownership, authority and
consensus explicitly unverified/unasserted. Those common limits accompany the
adapter's own claim set; no CPU-to-energy or meter-to-causation promotion occurs.

`useful-work.resource-bundle/v1` embeds canonical `job_spec`, signed `work`, all
`observations: [{measurement,receipt}]`, rebuilt `summary` and `bundle_id`:

```text
bundle_id = "useful-work-resource-bundle-v1:"
          + SHA256("UsefulWork-ResourceBundle-v1|" || JCS(bundle without bundle_id))
```

The summary retains each unique measurement by adapter with its own provenance,
values and claims. Signatures are checked before replay deduplication. Different
or overlapping observations, shared-meter intervals and repeated snapshots remain
separate; quantities are **not summed, maximized, averaged or selected** as a job
cost. Missing adapters remain empty evidence lists, not zero measurements. Multiple
replay receipts coexist in the raw inventory without voting a source into truth.

A signed opaque inventory crossing binds the exact bundle, scope and ordered
measurement/receipt IDs. Collector rehashing cannot substitute or delete records
while preserving that signed reference. It asserts `complete_history_asserted: false`;
009 has no universal measurement census or scheduled resource denominator.
RECEIVE/HOLD retains observations under owner-local law without transferring
ownership, admitting computation, settling payment or establishing economic value.

007 v1 remains unchanged: resource self-reports keep their declared basis, and
`proven_cpu_ms` stays unknown. A future explicitly versioned local policy may consume
these typed observations under stated trust, causation and overlap rules. 009 does
not automatically reward raw counters or relabel self-reports as measured proof.

Limits: 128 inventory submissions, 24 MiB per measurement, 1 MB per replay receipt,
64 MiB per bundle, 16 MiB native storage bytes, uint64 counters and 1–1,000,000
CPU ticks/second. Raw process stat text is limited to 16 KiB. These are bounded
adapter profiles; unsupported sources need separate versioned contracts.

## Separate process commands

Native context files contain exactly embedded `job_spec` and signed `work`.
Private keys are local P-256 JWKs. Meter identity pins a provider's public key/world
and exact meter/channel/epoch. Signing commands require explicit keys; no collector
silently gains the original worker's identity.

```sh
npm run useful-work-009 -- cpu <native-context.json> --pid <live-pid> --interval-ms 100 --key <collector-key.json> --host-ref <declared-host> --out <new-dir>
npm run useful-work-009 -- network <native-context.json> --interface lo --interval-ms 100 --key <collector-key.json> --out <new-dir>
npm run useful-work-009 -- storage <native-context.json> <canonical-artifact.json> --key <collector-key.json> --out <new-dir>
npm run useful-work-009 -- meter-reading <reading-spec.json> --key <provider-key.json> --world <meter-world> --out <new-dir>
npm run useful-work-009 -- energy <native-context.json> <meter-identity.json> <start-bundle> <end-bundle> --key <collector-key.json> --out <new-dir>
npm run useful-work-009 -- replay <native-context.json> <measurement.json> --key <separate-verifier-key.json> --world <verifier-world> --out <new-dir>
```

CPU/network sample intervals are 10–60,000 ms and do not imply precision or an
exclusive measurement window. Collector commands accept `--world`, `--host-ref`
and optional `--execution-ref`. `replay` takes a raw measurement crossing or a file
transport bundle. `collect` consumes the three embedded input fields; `verify`
checks a saved portable bundle and optional signed inventory crossing.

The [public golden bundle](../../fixtures/useful-work-009-golden.json) freezes live
Linux readings and explicitly simulated energy readings without private keys.
[resource_vectors.py](resource_vectors.py) independently replays process/interface
counters, exact Wh conversions, full native storage identity and bundle hashes.
Tests cover 41,228 ms, fractional/large counters, resets, PID/namespace changes,
meter impersonation, shared sources, forged stronger claims and replay after removing
all collectors, devices, private state, Python and rendering implementations.
