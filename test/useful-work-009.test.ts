import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sha256Hex } from '../src/canonical.ts';
import { generateP256KeyPair, sealReceipt, sealCrossingEnvelope } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { executeNativeJob, nativeOrganSpec } from '../src/useful_work/merkle_native/worker.ts';
import { inspectNativeWork } from '../src/useful_work/merkle_native/exchange.ts';
import { cpuProjection, parseProcStat } from '../src/useful_work/resources/cpu.ts';
import { networkProjection } from '../src/useful_work/resources/network.ts';
import { signMeterReading } from '../src/useful_work/resources/energy.ts';
import { captureCpu, captureNetwork, captureStorage, collectorProvenance } from '../src/useful_work/resources/collectors.ts';
import { signObservation, inspectObservation, replayObservation, inspectObservationReceipt } from '../src/useful_work/resources/observation.ts';
import { createResourceBundle, verifyResourceBundle, resourceBundleId, sealResourceBundleCrossing, verifyResourceBundleCrossing } from '../src/useful_work/resources/bundle.ts';
import { sealResourceMessage, contractFor, RESOURCE_KINDS, NON_AUTHORITY } from '../src/useful_work/resources/wire.ts';
import type { ResourceKind, Wire } from '../src/useful_work/resources/wire.ts';
import type { ResourceInput, ResourceBundle } from '../src/useful_work/resources/bundle.ts';
import { parseResourceClaim } from '../src/useful_work/valuation/resource.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(join(root, 'fixtures/useful-work-009-golden.json'), 'utf8'));
const job = JSON.parse(await readFile(join(root, 'fixtures/useful-work-001-golden.json'), 'utf8')).job;
const t = (ms: number) => new Date(Date.parse('2026-10-06T12:00:00.000Z') + ms).toISOString();
const boot = '11111111-2222-3333-4444-555555555555';
function procStat(pid: number, user: string, system: string, start = '500', command = 'worker (contains) parens)') {
  const fields = Array.from({ length: 50 }, () => '0'); fields[0] = 'R'; fields[11] = user; fields[12] = system; fields[19] = start;
  return `${pid} (${command}) ${fields.join(' ')}\n`;
}
const provenance = { host_ref: 'host:test-resources', runtime: 'fixture:v1', collector_source_sha256: 'a'.repeat(64), capture_mode: 'imported-records/v1' as const };
async function setup() {
  const result = executeNativeJob(job), [worker, collector, meter, verifier] = await Promise.all(Array.from({ length: 4 }, () => generateP256KeyPair()));
  const work = await sealOpaqueOrganCrossing(nativeOrganSpec(result.manifest, result.tree.header, t(0)), worker);
  const native = await inspectNativeWork(work, canonicalBytes(job));
  const cpu = { start: { observed_at: t(100), boot_id: boot, pid: 7, clock_ticks_per_second: '1000', proc_stat: procStat(7, '500', '100') },
    end: { observed_at: t(200), boot_id: boot, pid: 7, clock_ticks_per_second: '1000', proc_stat: procStat(7, '41728', '100') } };
  const network = { start: { observed_at: t(100), boot_id: boot, network_namespace: 'net:[500]', interface_name: 'lo', ifindex_raw: '1\n', rx_bytes_raw: '9007199254740993\n', tx_bytes_raw: '800\n' },
    end: { observed_at: t(200), boot_id: boot, network_namespace: 'net:[500]', interface_name: 'lo', ifindex_raw: '1\n', rx_bytes_raw: '9007199254741993\n', tx_bytes_raw: '900\n' } };
  const stat = { dev: '10', ino: '11', size: String(result.tree.bytes.length), blocks: '8', mode: '33188', mtime_ns: '100', ctime_ns: '200' };
  const storage = { started_at: t(100), finished_at: t(200), file_path: '/declared/artifact.json', stat_before: stat, stat_after: { ...stat },
    artifact_base64: result.tree.bytes.toString('base64'), file_sha256: sha256Hex(result.tree.bytes) };
  const meterIdentity = { world_id: 'world:test-meter', public_key: meter.publicKeyJwk, meter_id: 'test-meter', channel_id: 'shared-outlet', counter_epoch: 'epoch-1' };
  const reading = { schema: 'useful-work.energy-meter-reading/v1', measurement_source: 'external/power-meter/v1',
    meter_id: meterIdentity.meter_id, channel_id: meterIdentity.channel_id, counter_epoch: meterIdentity.counter_epoch, sequence: '50',
    cumulative_reading: '100000', unit: 'milliwatt-hours', observed_at: t(100),
    provenance: { reading_origin: 'operator-import/v1', device_ref: 'device:test-meter', calibration_ref: 'calibration:declared-only', telemetry_ref: null } };
  const energy = { meter: meterIdentity, start: await signMeterReading(reading, meter, meterIdentity.world_id),
    end: await signMeterReading({ ...reading, sequence: '51', cumulative_reading: '102500', observed_at: t(200) }, meter, meterIdentity.world_id) };
  return { result, native, work, worker, collector, meter, verifier, cpu, network, storage, energy, reading };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function observation(s: Setup, kind: ResourceKind, evidence: unknown = s[kind]) {
  const measurement = await signObservation(s.native, kind, evidence,
    kind === 'energy' ? { ...provenance, capture_mode: 'signed-meter-ingest/v1' } : provenance,
    s.collector, 'world:test-resource-collector', t(300), 'execution:declared-test-association');
  const receipt = await replayObservation(s.native, measurement, s.verifier, 'world:test-resource-verifier', t(400)); return { measurement, receipt };
}
function payload(m: Wire, kind: ResourceKind) { return m.extensions.organ_adapter.donor_claims['resource_' + kind]; }
async function changedMeasurement(s: Setup, entry: Wire, kind: ResourceKind, change: (p: Wire) => void) {
  const p = structuredClone(payload(entry, kind)); change(p); return sealResourceMessage(kind, p, s.collector, 'world:test-resource-collector', t(300));
}
async function child(args: string[], cwd = root, input?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((yes, no) => {
    const p = spawn(args[0], args.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; }); p.once('error', no); p.once('close', code => yes({ code, stdout, stderr }));
    p.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
async function oracle(b: ResourceBundle) {
  const result = await child(['python3', '-B', 'examples/useful-work-009/resource_vectors.py'], root, b); assert.equal(result.code, 0, result.stderr);
  const expected = JSON.parse(result.stdout); assert.equal(expected.bundle_id, b.bundle_id);
  assert.equal(expected.unique_measurements, b.summary.unique_measurements); assert.equal(expected.unique_replay_receipts, b.summary.unique_replay_receipts);
  for (const [index, record] of expected.records.entries()) {
    const entry = b.observations[index]; assert.equal(record.measurement_id, entry.measurement.crossing_id);
    assert.deepEqual(record.observed, payload(entry.measurement, record.adapter).observed);
    assert.deepEqual(record.observed, entry.receipt.extensions.useful_work_resource.observed);
  }
  return expected;
}
const rehash = (b: ResourceBundle) => { const { bundle_id: _, ...body } = b; b.bundle_id = resourceBundleId(body); return b; };

test('009 signed golden bundle replays all four adapters and matches independent integer and native-artifact vectors', async () => {
  const b = await verifyResourceBundle(fixture.bundle); assert.deepEqual(await oracle(b), fixture.expected);
  assert.equal(b.summary.unique_measurements, 4);
  assert.equal((b.summary.by_adapter.energy[0].observed as Wire).reading_origin, 'simulation/v1');
  for (const entry of b.observations) for (const [key, value] of Object.entries(NON_AUTHORITY)) assert.equal(entry.receipt.extensions.useful_work_resource.claims[key], value);
  assert.ok(!canonicalBytes(fixture).toString().includes('"d":'));
  assert.ok(!canonicalBytes(b.summary).toString().includes('resource_proven'));
});

test('CPU observation names linux/proc/v1 and exactly replays 41,228 ms without energy or exclusive-work claims', async () => {
  const s = await setup(), e = await observation(s, 'cpu'); const v = await inspectObservationReceipt(s.native, e.measurement, e.receipt);
  const report: Wire = v.report;
  assert.deepEqual(report.observed.cpu_time_observed, { numerator: '41228', denominator: '1' });
  assert.equal(report.measurement_source, 'linux/proc/v1'); assert.equal(report.claims.cpu_energy_inferred, false);
  assert.equal(report.claims.process_exclusive_work_verified, false); assert.equal(report.claims.descendant_process_time_included, false);
  assert.deepEqual(parseProcStat(s.cpu.start.proc_stat, 7), { user_ticks: 500n, system_ticks: 100n, start_ticks: 500n });
});

test('CPU ticks preserve integers above 2^53, fractional milliseconds and legitimate zero deltas', async () => {
  const s = await setup(); s.cpu.start.proc_stat = procStat(7, '9007199254740993', '0'); s.cpu.end.proc_stat = procStat(7, '9007199254740994', '0');
  s.cpu.start.clock_ticks_per_second = s.cpu.end.clock_ticks_per_second = '1024';
  const e = await observation(s, 'cpu'); assert.deepEqual(payload(e.measurement, 'cpu').observed.cpu_time_observed, { numerator: '125', denominator: '128' });
  const b = await createResourceBundle({ job_spec: job, work: s.work, observations: [e] }); await oracle(b);
  s.cpu.end.proc_stat = s.cpu.start.proc_stat;
  assert.deepEqual(cpuProjection(s.cpu).observed.cpu_time_observed, { numerator: '0', denominator: '1' });
});

test('CPU PID reuse, reboot, tick-rate changes, reset/wrap and malformed raw counters fail as unsupported evidence', async () => {
  const s = await setup();
  for (const change of [(e: Wire) => e.end.pid = 8, (e: Wire) => e.end.boot_id = '00000000-0000-0000-0000-000000000000',
    (e: Wire) => e.end.proc_stat = procStat(7, '41728', '100', '501'), (e: Wire) => e.end.clock_ticks_per_second = '100',
    (e: Wire) => e.end.proc_stat = procStat(7, '499', '100'), (e: Wire) => e.end.proc_stat = procStat(7, '41728', '99'),
    (e: Wire) => e.end.observed_at = t(99), (e: Wire) => e.end.proc_stat = procStat(7, '18446744073709551616', '100'),
    (e: Wire) => e.start.clock_ticks_per_second = '0']) {
    const evidence = structuredClone(s.cpu); change(evidence); await assert.rejects(observation(s, 'cpu', evidence));
  }
});

test('energy verifies two pinned provider signatures and exact Wh conversion while calibration and causation remain unverified', async () => {
  const s = await setup(), e = await observation(s, 'energy'), p = payload(e.measurement, 'energy');
  assert.deepEqual(p.observed.energy_watt_hours_observed, { numerator: '5', denominator: '2' });
  assert.equal(p.observed.reading_origin, 'operator-import/v1'); assert.equal(p.claims.signed_meter_readings_verified, true);
  assert.equal(p.claims.physical_meter_verified, false); assert.equal(p.claims.meter_calibration_verified, false);
  assert.equal(p.claims.job_energy_causation_verified, false); assert.equal(p.claims.exclusive_job_energy_verified, false);
  const start = await signMeterReading({ ...s.reading, unit: 'millijoules', cumulative_reading: '0' }, s.meter, s.energy.meter.world_id);
  const end = await signMeterReading({ ...s.reading, unit: 'millijoules', sequence: '51', cumulative_reading: '3600001', observed_at: t(200) }, s.meter, s.energy.meter.world_id);
  const fractional = await observation(s, 'energy', { meter: s.energy.meter, start, end });
  assert.deepEqual(payload(fractional.measurement, 'energy').observed.energy_watt_hours_observed, { numerator: '3600001', denominator: '3600000' });
  await oracle(await createResourceBundle({ job_spec: job, work: s.work, observations: [e, fractional] }));
});

test('energy rejects wrong providers, channel/epoch substitutions, unadvanced sequences, resets and unit/origin changes', async () => {
  const s = await setup();
  const cases: ((r: Wire) => void)[] = [r => r.channel_id = 'another-outlet', r => r.counter_epoch = 'epoch-2', r => r.meter_id = 'another-meter',
    r => r.sequence = '50', r => r.cumulative_reading = '99999', r => r.unit = 'millijoules', r => r.provenance.reading_origin = 'simulation/v1', r => r.observed_at = t(99)];
  for (const mutate of cases) {
    const spec = { ...structuredClone(s.reading), sequence: '51', cumulative_reading: '102500', observed_at: t(200) }; mutate(spec);
    const end = await signMeterReading(spec, s.meter, s.energy.meter.world_id);
    await assert.rejects(observation(s, 'energy', { ...s.energy, end }));
  }
  const rogue = await signMeterReading({ ...s.reading, sequence: '51', cumulative_reading: '102500', observed_at: t(200) }, s.worker, s.energy.meter.world_id);
  await assert.rejects(observation(s, 'energy', { ...s.energy, end: rogue }), /SIGNER_MISMATCH/);
  const invalid = structuredClone(s.energy); invalid.end.signing.signature = 'invalid'; await assert.rejects(observation(s, 'energy', invalid), /SIGNATURE/);
});

test('storage separates native logical bytes from reported filesystem allocation, including sparse snapshots', async () => {
  const s = await setup(); s.storage.stat_before.blocks = s.storage.stat_after.blocks = '0';
  const e = await observation(s, 'storage'), p = payload(e.measurement, 'storage');
  assert.equal(p.observed.logical_file_bytes_observed, String(s.result.tree.bytes.length)); assert.equal(p.observed.filesystem_allocated_bytes_observed, '0');
  assert.equal(p.claims.native_artifact_bytes_identity_verified, true); assert.equal(p.claims.continuous_storage_verified, false);
  assert.equal(p.claims.filesystem_allocation_is_physical_cost, false); assert.equal(p.claims.exclusive_physical_storage_verified, false);
  await oracle(await createResourceBundle({ job_spec: job, work: s.work, observations: [e] }));
});

test('storage rejects changing file metadata, inconsistent size/hash, noncanonical bytes and wrong native content', async () => {
  const s = await setup();
  for (const change of [(e: Wire) => e.stat_after.ino = '12', (e: Wire) => e.stat_after.mtime_ns = '101',
    (e: Wire) => e.stat_before.size = e.stat_after.size = '0', (e: Wire) => e.file_sha256 = '0'.repeat(64),
    (e: Wire) => e.stat_before.mode = e.stat_after.mode = '40960',
    (e: Wire) => { const bytes = Buffer.from(' ' + s.result.tree.bytes.toString()); e.artifact_base64 = bytes.toString('base64'); e.file_sha256 = sha256Hex(bytes); e.stat_before.size = e.stat_after.size = String(bytes.length); },
    (e: Wire) => { const artifact = structuredClone(s.result.tree.artifact); artifact.escape_counts[0]++; const bytes = canonicalBytes(artifact); e.artifact_base64 = bytes.toString('base64'); e.file_sha256 = sha256Hex(bytes); e.stat_before.size = e.stat_after.size = String(bytes.length); }]) {
    const evidence = structuredClone(s.storage); change(evidence); await assert.rejects(observation(s, 'storage', evidence));
  }
});

test('interface counters retain exact integer bytes and cannot become bandwidth, service bytes or path evidence', async () => {
  const s = await setup(), e = await observation(s, 'network'), p = payload(e.measurement, 'network');
  assert.deepEqual(p.observed, { interface_rx_bytes_observed: '1000', interface_tx_bytes_observed: '100', unit: 'bytes' });
  for (const key of ['physical_bandwidth_verified', 'service_bytes_verified', 'network_path_verified', 'job_bytes_causation_verified', 'host_uptime_verified', 'reads_are_atomic']) assert.equal(p.claims[key], false);
  await oracle(await createResourceBundle({ job_spec: job, work: s.work, observations: [e] }));
});

test('interface resets, reboot, namespace/name/index substitutions, traversal labels and unsafe counters fail', async () => {
  const s = await setup();
  for (const change of [(e: Wire) => e.end.rx_bytes_raw = '0', (e: Wire) => e.end.tx_bytes_raw = '0', (e: Wire) => e.end.ifindex_raw = '2',
    (e: Wire) => e.end.network_namespace = 'net:[501]', (e: Wire) => e.end.interface_name = 'eth0',
    (e: Wire) => e.end.boot_id = '00000000-0000-0000-0000-000000000000', (e: Wire) => e.start.interface_name = '../proc',
    (e: Wire) => e.end.rx_bytes_raw = '18446744073709551616\n', (e: Wire) => e.end.tx_bytes_raw = '-1', (e: Wire) => e.end.observed_at = t(99)]) {
    const evidence = structuredClone(s.network); change(evidence); assert.throws(() => networkProjection(evidence));
  }
});

test('measurements bind native result/work/job and reject signed arithmetic, provenance, schema and authority upgrades', async () => {
  const s = await setup();
  for (const kind of RESOURCE_KINDS) {
    const e = await observation(s, kind);
    for (const change of [(p: Wire) => p.scope.result_id = 'useful-work-merkle-result-v1:' + 'f'.repeat(64),
      (p: Wire) => p.scope.job_spec_hash = 'f'.repeat(64), (p: Wire) => p.scope.work_crossing_id = s.energy.start.crossing_id,
      (p: Wire) => p.scope.association_basis = 'causal-proof/v1', (p: Wire) => p.measurement_source = 'resource/proven/v1',
      (p: Wire) => p.claims.exclusive_job_resource_use_verified = true, (p: Wire) => p.claims.resource_proven = true,
      (p: Wire) => p.provenance.collector_source_sha256 = 'missing', (p: Wire) => p.observed.unit = 'money',
      (p: Wire) => p.schema = 'useful-work.resource-proven/v1']) {
      await assert.rejects(inspectObservation(s.native, await changedMeasurement(s, e.measurement, kind, change)));
    }
    const { crossing_id: _, signing: __, ...body } = e.measurement;
    const ground = await sealCrossingEnvelope({ ...body, parents: [s.work.crossing_id] }, s.collector);
    await assert.rejects(inspectObservation(s.native, ground), /ENVELOPE_RULE/);
  }
});

test('separate replay receipts cannot sign before measurements, impersonate collectors/meters or assert stronger physical/economic claims', async () => {
  const s = await setup();
  for (const kind of RESOURCE_KINDS) {
    const e = await observation(s, kind);
    await assert.rejects(replayObservation(s.native, e.measurement, s.collector, 'world:another-label', t(400)), /DISTINCT/);
    await assert.rejects(replayObservation(s.native, e.measurement, s.verifier, 'world:test-resource-verifier', t(299)), /PRECEDES/);
    for (const change of [(r: Wire) => r.extensions.useful_work_resource.claims.economic_value_asserted = true,
      (r: Wire) => r.extensions.useful_work_resource.claims.exclusive_job_resource_use_verified = true,
      (r: Wire) => r.extensions.useful_work_resource.claims.hardware_attestation_verified = true,
      (r: Wire) => r.extensions.useful_work_resource.claims.collector_source_execution_verified = true,
      (r: Wire) => r.extensions.useful_work_resource.measurement_source = 'generic/proven/v1',
      (r: Wire) => r.semantic_effect = 'ADMIT', (r: Wire) => r.post_state_ref = 'owned']) {
      const { receipt_id: _, signing: __, ...body } = structuredClone(e.receipt); change(body);
      await assert.rejects(inspectObservationReceipt(s.native, e.measurement, await sealReceipt(body, s.verifier)), /REPLAY_MISMATCH/);
    }
  }
  const energy = await observation(s, 'energy'); await assert.rejects(replayObservation(s.native, energy.measurement, s.meter, 'world:meter-alias', t(400)), /DISTINCT/);
});

test('measurement creation before interval end and counter/meter structural failures emit no misleading resource receipt', async () => {
  const s = await setup();
  await assert.rejects(signObservation(s.native, 'cpu', s.cpu, provenance, s.collector, 'world:test-resource-collector', t(199)), /BEFORE_OBSERVATION/);
  await assert.rejects(signObservation(s.native, 'energy', s.energy, { ...provenance, capture_mode: 'signed-meter-ingest/v1' }, s.meter, 'world:test-meter', t(300)), /DISTINCT_METER/);
  const e = await observation(s, 'cpu'), forged = structuredClone(e.measurement); forged.signing.signature = 'invalid';
  await assert.rejects(replayObservation(s.native, forged, s.verifier, 'world:test-verifier', t(400)), /SIGNATURE/);
});

test('replays authenticate before deduplication; overlapping intervals and conflicting readings remain separate without totals', async () => {
  const s = await setup(), a = await observation(s, 'cpu'), b = await observation(s, 'cpu', { ...s.cpu, end: { ...s.cpu.end, proc_stat: procStat(7, '42728', '100') } });
  const input: ResourceInput = { job_spec: job, work: s.work, observations: [a, a, b] }, inventory = await createResourceBundle(input);
  assert.equal(inventory.summary.submitted_observations, 3); assert.equal(inventory.summary.unique_measurements, 2);
  assert.equal(inventory.summary.replayed_measurement_submissions, 1); assert.equal(inventory.summary.by_adapter.cpu.length, 2);
  assert.equal(inventory.summary.claims.aggregate_job_resource_cost_computed, false); await oracle(inventory);
  const invalid = structuredClone(a); invalid.measurement.signing.signature = 'invalid'; input.observations.push(invalid);
  await assert.rejects(createResourceBundle(input), /SIGNATURE/);
});

test('missing adapter evidence remains absent and 007 self-reports cannot silently acquire a measured/proven basis', async () => {
  const s = await setup(), b = await createResourceBundle({ job_spec: job, work: s.work, observations: [] });
  for (const kind of RESOURCE_KINDS) assert.deepEqual(b.summary.by_adapter[kind], []);
  assert.throws(() => parseResourceClaim({ schema: 'useful-work.resource-claim/v1', result_id: s.native.result_id, audit_id: null, history_id: null,
    basis: 'linux/proc/v1', amounts: { cpu_ms: 41228, energy_millijoules: null, stored_bytes: null, served_bytes: null, mirrored_bytes: null }, claimed_at: t(300), note: null }), /UNSUPPORTED_RESOURCE_CLAIM_BASIS/);
});

test('bundle and signed inventory reject collector rehashing of totals, deleted records and cross-scope substitutions', async () => {
  const s = await setup(), a = await observation(s, 'cpu'), input = { job_spec: job, work: s.work, observations: [a] };
  const b = await createResourceBundle(input), crossing = await sealResourceBundleCrossing(b, s.verifier, 'world:inventory-holder', t(400));
  const bad = structuredClone(b); bad.summary.unique_measurements++; rehash(bad); await assert.rejects(verifyResourceBundle(bad), /REPLAY/);
  const removed = await createResourceBundle({ ...input, observations: [] }); await assert.rejects(verifyResourceBundleCrossing(crossing, removed), /REFERENCE/);
  await assert.rejects(createResourceBundle({ ...input, job_spec: { ...job, seed: job.seed + 1 } }), /JOB_HASH/);
});

test('resource inventory traverses opaque RECEIVE/HOLD with no ownership, admission or economic entitlement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-resource-hold-'));
  try {
    const s = await setup(), input = { job_spec: job, work: s.work, observations: [await observation(s, 'cpu')] }, b = await createResourceBundle(input);
    const crossing = await sealResourceBundleCrossing(b, s.verifier, 'world:resource-inventory-holder', t(400));
    const receiver = await LocalReceiver.create(join(dir, 'receiver'), { world_id: 'world:resource-holder', receiver_particular: 'particular:resource-holder', contract_ref: contractFor('inventory') });
    await receiver.receive(crossing, t(401)); const disposition = await receiver.dispose(crossing.crossing_id, 'HOLD', t(402));
    assert.equal(disposition.semantic_effect, 'none'); assert.deepEqual((await verifyResourceBundleCrossing(crossing, b)).summary, b.summary);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Linux live collectors capture this process, loopback counters and stable native file metadata; symlinks and invalid subjects reject', { skip: process.platform !== 'linux' }, async () => {
  const s = await setup(), dir = await mkdtemp(join(tmpdir(), 'relatte-resource-collectors-'));
  try {
    const cpu = await captureCpu(process.pid); assert.equal(cpu.pid, process.pid); parseProcStat(cpu.proc_stat, process.pid);
    const network = await captureNetwork('lo'); assert.equal(network.interface_name, 'lo'); networkProjection({ start: network, end: network });
    const file = join(dir, 'artifact.json'); await writeFile(file, s.result.tree.bytes);
    const evidence = await captureStorage(file), e = await observation(s, 'storage', { ...evidence, started_at: t(100), finished_at: t(200) });
    assert.equal(payload(e.measurement, 'storage').observed.logical_file_bytes_observed, String(s.result.tree.bytes.length));
    await symlink(file, join(dir, 'link.json')); await assert.rejects(captureStorage(join(dir, 'link.json')));
    await assert.rejects(captureStorage(dir)); await assert.rejects(captureNetwork('../proc')); await assert.rejects(captureCpu(0));
    const p = await collectorProvenance('host:test'); assert.match(p.collector_source_sha256, /^[a-f0-9]{64}$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('fresh relocated verifier needs no OS collection, meter devices, private keys, Python or mathematical worker modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-resources-portable-'));
  try {
    await cp(join(root, 'src'), join(dir, 'src'), { recursive: true }); await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await writeFile(join(dir, 'package.json'), '{"type":"module"}'); await writeFile(join(dir, 'resources.json'), canonicalBytes(fixture.bundle));
    for (const path of ['src/useful_work/resources/collectors.ts', 'src/useful_work/algorithm.ts', 'src/useful_work/merkle_native/worker.ts', 'src/useful_work/worker.ts']) await rm(join(dir, path));
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_009.ts', 'verify', 'resources.json', '--out', 'verified'], dir);
    assert.equal(result.code, 0, result.stderr); const saved = JSON.parse(await readFile(join(dir, 'verified/resources.json'), 'utf8')); assert.equal(saved.bundle_id, fixture.bundle.bundle_id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('009 live demo measures a separate worker process and actual file/interface sources while energy remains visibly simulated', { skip: process.platform !== 'linux' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-resource-demo-'));
  try {
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_009.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--out', join(dir, 'demo')]);
    assert.equal(result.code, 0, result.stderr); const b = await verifyResourceBundle(JSON.parse(await readFile(join(dir, 'demo/resources/resources.json'), 'utf8')));
    assert.equal(b.summary.unique_measurements, 4); assert.equal(b.summary.by_adapter.cpu[0].provenance.capture_mode, 'live-local/v1');
    assert.equal((b.summary.by_adapter.energy[0].observed as Wire).reading_origin, 'simulation/v1');
    assert.equal((b.summary.by_adapter.energy[0].claims as Wire).physical_meter_verified, false);
    const demo = JSON.parse(await readFile(join(dir, 'demo/demo-provenance.json'), 'utf8')); assert.equal(demo.physical_energy_measurement_performed, false);
    await oracle(b);
    const replay = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_009.ts', 'replay', join(dir, 'demo/native-context.json'), join(dir, 'demo/cpu/measurement.json'),
      '--key', join(dir, 'demo/local-state/verifier-key.json'), '--world', 'world:another-independent-replayer', '--out', join(dir, 'replayed')]);
    assert.equal(replay.code, 0, replay.stderr);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
