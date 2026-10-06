import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { sealOpaqueOrganCrossing } from '../organ.ts';
import { verifyAndExtractTransportFrame } from '../transport.ts';
import { canonicalBytes, exactKeys, integer, record } from './job.ts';
import { boundedRead, bundle, fresh, held, json, now, readWorkerKeys } from './cli_io.ts';
import { inspectNativeWork } from './merkle_native/exchange.ts';
import { signObservation, replayObservation } from './resources/observation.ts';
import { signMeterReading } from './resources/energy.ts';
import { createResourceBundle, verifyResourceBundle, sealResourceBundleCrossing, verifyResourceBundleCrossing, MAX_RESOURCE_BUNDLE_BYTES } from './resources/bundle.ts';
import type { ResourceInput } from './resources/bundle.ts';
import { contractFor, MAX_RESOURCE_MESSAGE_BYTES } from './resources/wire.ts';

const readJson = async (path: string) => JSON.parse((await boundedRead(path, MAX_RESOURCE_BUNDLE_BYTES)).toString('utf8'));
const canonicalFile = async (path: string, value: unknown) => writeFile(path, canonicalBytes(value), { flag: 'wx' });
async function nativeAt(path: string) {
  const c = record(await readJson(path), 'INVALID_RESOURCE_CONTEXT'); exactKeys(c, ['job_spec', 'work'], 'INVALID_RESOURCE_CONTEXT');
  return inspectNativeWork(c.work, canonicalBytes(c.job_spec));
}
async function crossingAt(path: string) {
  const v = JSON.parse((await boundedRead(path, MAX_RESOURCE_MESSAGE_BYTES + 100_000)).toString('utf8'));
  if (v.transport === 'file-bundle') return verifyAndExtractTransportFrame(v); return v;
}
async function saveBundle(out: string, value: ResourceInput | Awaited<ReturnType<typeof createResourceBundle>>, crossing?: Record<string, any>) {
  const b = 'bundle_id' in value ? await verifyResourceBundle(value) : await createResourceBundle(value); await fresh(out);
  await canonicalFile(join(out, 'resources.json'), b); await json(join(out, 'summary.json'), b.summary);
  if (crossing) {
    await verifyResourceBundleCrossing(crossing, b); await bundle(join(out, 'crossing.json'), crossing, 'Useful Work Kernel 009');
    await held(join(out, 'receiver'), crossing, 'world:useful-work-resource-holder', contractFor('inventory'));
  }
  console.log(JSON.stringify({ bundle_id: b.bundle_id, unique_measurements: b.summary.unique_measurements,
    adapters: Object.fromEntries(Object.entries(b.summary.by_adapter).map(([kind, observations]) => [kind, observations.map(o => o.observed)])),
    aggregate_job_resource_cost_computed: false, output: out }, null, 2));
}
async function measuredWork(job: unknown) {
  const { captureCpu } = await import('./resources/collectors.ts');
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  const child = fork(fileURLToPath(new URL(`../../examples/useful-work-009/measured-worker.${extension}`, import.meta.url)), [],
    { execArgv: ['--experimental-strip-types'], silent: true });
  let stderr = ''; child.stderr!.on('data', b => { if (stderr.length < 4096) stderr += b.toString(); });
  const message = (kind: string) => new Promise<Record<string, any>>((yes, no) => {
    const timer = setTimeout(() => { cleanup(); no(new Error('MEASURED_WORKER_TIMEOUT')); }, 30_000);
    const received = (value: unknown) => { const m = value as Record<string, any>; if (m.kind === kind) { cleanup(); yes(m); } };
    const failed = (error: Error) => { cleanup(); no(error); };
    const exited = () => { cleanup(); no(new Error('MEASURED_WORKER_EXIT: ' + stderr)); };
    const cleanup = () => { clearTimeout(timer); child.off('message', received); child.off('error', failed); child.off('exit', exited); };
    child.on('message', received); child.once('error', failed); child.once('exit', exited);
  });
  try {
    await message('ready'); const start = await captureCpu(child.pid!); const result = message('result'); child.send({ kind: 'run', job });
    const work = await result, end = await captureCpu(child.pid!); return { work, cpu: { start, end } };
  } finally { child.kill(); }
}
async function demo(jobPath: string, out: string) {
  const { captureNetwork, captureStorage, collectorProvenance } = await import('./resources/collectors.ts');
  await fresh(out); const measured = await measuredWork(await readJson(jobPath));
  const { nativeOrganSpec } = await import('./merkle_native/worker.ts');
  const [worker, collector, meter, verifier] = await Promise.all(Array.from({ length: 4 }, () => generateP256KeyPair()));
  const work = await sealOpaqueOrganCrossing(nativeOrganSpec(measured.work.manifest, measured.work.header, now()), worker);
  const native = await inspectNativeWork(work, canonicalBytes(measured.work.job)), artifact = Buffer.from(measured.work.artifact_base64, 'base64');
  await writeFile(join(out, 'artifact.json'), artifact, { flag: 'wx' });
  await canonicalFile(join(out, 'native-context.json'), { job_spec: native.job, work });
  const networkStart = await captureNetwork('lo');
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(artifact); });
  await new Promise<void>((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', () => { server.off('error', no); yes(); }); });
  try {
    const port = (server.address() as { port: number }).port, response = await fetch(`http://127.0.0.1:${port}/artifact`, { signal: AbortSignal.timeout(5000) });
    if (!Buffer.from(await response.arrayBuffer()).equals(artifact)) throw new Error('NETWORK_DEMO_BYTES_CHANGED');
  } finally { await new Promise<void>((yes, no) => { server.close(e => e ? no(e) : yes()); server.closeAllConnections(); }); }
  const networkEnd = await captureNetwork('lo'), storage = await captureStorage(join(out, 'artifact.json'));
  const meterIdentity = { world_id: 'world:resource-demo-meter', public_key: meter.publicKeyJwk,
    meter_id: 'demo-simulated-meter', channel_id: 'shared-outlet', counter_epoch: 'demo-epoch-1' };
  const meterReading = { schema: 'useful-work.energy-meter-reading/v1', measurement_source: 'external/power-meter/v1',
    meter_id: meterIdentity.meter_id, channel_id: meterIdentity.channel_id, counter_epoch: meterIdentity.counter_epoch,
    sequence: '0', cumulative_reading: '100000', unit: 'milliwatt-hours', observed_at: measured.cpu.start.observed_at,
    provenance: { reading_origin: 'simulation/v1', device_ref: 'simulation:resource-demo-meter', calibration_ref: null, telemetry_ref: null } };
  const meterStart = await signMeterReading(meterReading, meter, meterIdentity.world_id);
  const meterEnd = await signMeterReading({ ...meterReading, sequence: '1', cumulative_reading: '100500', observed_at: measured.cpu.end.observed_at }, meter, meterIdentity.world_id);
  const observations = [], liveProvenance = await collectorProvenance('host:local-resource-demo');
  for (const [kind, evidence] of [['cpu', measured.cpu], ['energy', { meter: meterIdentity, start: meterStart, end: meterEnd }],
    ['storage', storage], ['network', { start: networkStart, end: networkEnd }]] as const) {
    const provenance = kind === 'energy' ? await collectorProvenance('host:local-resource-demo', 'signed-meter-ingest/v1') : liveProvenance;
    const measurement = await signObservation(native, kind, evidence, provenance, collector, 'world:resource-demo-collector', now(), 'execution:resource-demo-worker');
    const receipt = await replayObservation(native, measurement, verifier, 'world:resource-demo-verifier', now());
    observations.push({ measurement, receipt }); const dir = join(out, kind); await mkdir(dir);
    await canonicalFile(join(dir, 'measurement.json'), measurement); await json(join(dir, 'receipt.json'), receipt);
  }
  await mkdir(join(out, 'energy-meter')); await canonicalFile(join(out, 'energy-meter/meter.json'), meterIdentity);
  await bundle(join(out, 'energy-meter/start.json'), meterStart); await bundle(join(out, 'energy-meter/end.json'), meterEnd);
  await json(join(out, 'demo-provenance.json'), { cpu_storage_network: 'live-linux-observations', energy: 'simulated-signed-meter-readings', physical_energy_measurement_performed: false });
  await mkdir(join(out, 'local-state'), { mode: 0o700 });
  for (const [name, keys] of Object.entries({ collector, meter, verifier })) await json(join(out, 'local-state', name + '-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
  const input = { job_spec: native.job, work, observations }, resources = await createResourceBundle(input);
  await canonicalFile(join(out, 'resource-input.json'), input);
  await saveBundle(join(out, 'resources'), resources, await sealResourceBundleCrossing(resources, verifier, 'world:resource-demo-verifier', now()));
}
async function main(args: string[]) {
  const command = args.shift(), inputs: string[] = [], flags: Record<string, string> = {};
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  while (args.length) { const flag = args.shift()!, value = args.shift(); if (!value || value.startsWith('--') || !flag.startsWith('--') || Object.hasOwn(flags, flag)) throw new Error('INVALID_CLI_OPTIONS'); flags[flag] = value; }
  const arity: Record<string, number> = { demo: 1, cpu: 1, network: 1, storage: 2, 'meter-reading': 1, energy: 4, replay: 2, collect: 1, verify: 1 };
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-009 demo <job> | cpu <native-context> --pid <pid> [--interval-ms <ms>] | network <native-context> --interface <name> [--interval-ms <ms>] | storage <native-context> <artifact> | meter-reading <reading.json> | energy <native-context> <meter-identity.json> <start-bundle> <end-bundle> | replay <native-context> <measurement.json> | collect <resource-input> | verify <resources.json> [--crossing <bundle>] [--out <new-directory>]; signing commands require --key <private-jwk> [--world <world>].');
  const signing = ['cpu', 'network', 'storage', 'meter-reading', 'energy', 'replay'].includes(command);
  const allowed = ['--out', ...(signing ? ['--key', '--world'] : []), ...(['cpu', 'network', 'storage', 'energy'].includes(command) ? ['--host-ref', '--execution-ref'] : []),
    ...(['cpu', 'network'].includes(command) ? ['--interval-ms'] : []), ...(command === 'cpu' ? ['--pid'] : []), ...(command === 'network' ? ['--interface'] : []), ...(command === 'verify' ? ['--crossing'] : [])];
  if (Object.keys(flags).some(f => !allowed.includes(f)) || (signing && !flags['--key'])) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-009${command === 'demo' ? '' : '-' + command}`);
  if (command === 'demo') return demo(inputs[0], out);
  if (command === 'collect') return saveBundle(out, await readJson(inputs[0]));
  if (command === 'verify') return saveBundle(out, await verifyResourceBundle(await readJson(inputs[0])), flags['--crossing'] ? await crossingAt(resolve(flags['--crossing'])) : undefined);
  const keys = await readWorkerKeys(resolve(flags['--key']));
  const world = flags['--world'] ?? `world:useful-work-resource-${command === 'replay' ? 'verifier' : command === 'meter-reading' ? 'meter' : 'collector'}`;
  if (command === 'meter-reading') { const crossing = await signMeterReading(await readJson(inputs[0]), keys, world); await fresh(out); return bundle(join(out, 'reading.json'), crossing); }
  const native = await nativeAt(inputs[0]);
  if (command === 'replay') {
    const receipt = await replayObservation(native, await crossingAt(inputs[1]), keys, world, now()); await fresh(out); return json(join(out, 'receipt.json'), receipt);
  }
  const { captureCpu, captureNetwork, captureStorage, collectorProvenance } = await import('./resources/collectors.ts');
  let evidence: unknown;
  if (command === 'storage') evidence = await captureStorage(inputs[1]);
  else if (command === 'energy') evidence = { meter: await readJson(inputs[1]), start: await crossingAt(inputs[2]), end: await crossingAt(inputs[3]) };
  else {
    const interval = integer(Number(flags['--interval-ms'] ?? 100), 10, 60_000, 'INVALID_RESOURCE_INTERVAL');
    const pid = command === 'cpu' ? integer(Number(flags['--pid']), 1, 2_147_483_647, 'INVALID_RESOURCE_PID') : 0;
    const capture = command === 'cpu' ? () => captureCpu(pid) : () => captureNetwork(flags['--interface']);
    const start = await capture(); await new Promise(r => setTimeout(r, interval)); evidence = { start, end: await capture() };
  }
  const kind = command as 'cpu' | 'energy' | 'storage' | 'network';
  const measurement = await signObservation(native, kind, evidence, await collectorProvenance(flags['--host-ref'] ?? 'host:local-resource-collector', kind === 'energy' ? 'signed-meter-ingest/v1' : 'live-local/v1'), keys, world, now(), flags['--execution-ref'] ?? null);
  await fresh(out); await canonicalFile(join(out, 'measurement.json'), measurement);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
