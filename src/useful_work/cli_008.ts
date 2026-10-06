import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { generateP256KeyPair } from '../protocol.ts';
import { sealOpaqueOrganCrossing } from '../organ.ts';
import { canonicalBytes, parseJob } from './job.ts';
import { boundedRead, bundle, fresh, held, json, loadBundle, now, readWorkerKeys } from './cli_io.ts';
import { inspectNativeWork } from './merkle_native/exchange.ts';
import { inspectArtifact } from './merkle_native/result.ts';
import { publishPlan, scheduleSlot } from './audit_clock/policy.ts';
import { emitRandomness } from './audit_clock/provenance.ts';
import { equal, iso } from './audit_clock/wire.ts';
import type { AuditPolicy } from './audit_clock/types.ts';
import { commitService, inspectCommitment, publishService } from './service/commitment.ts';
import type { ServiceContext } from './service/commitment.ts';
import { issueServiceChallenge } from './service/exchange.ts';
import { requestService, serviceHttpServer } from './service/http.ts';
import { appendServiceHistory, createServiceHistory, sealServiceCut, sealServiceHistoryCrossing, verifyServiceHistory, verifyServiceHistoryCrossing, MAX_SERVICE_HISTORY_BYTES } from './service/history.ts';
import type { ServiceHistory, ServiceHistoryInput } from './service/history.ts';
import { SERVICE_CONTRACT } from './service/wire.ts';

const readJson = async (path: string) => JSON.parse((await boundedRead(path, MAX_SERVICE_HISTORY_BYTES)).toString('utf8'));
const canonicalFile = async (path: string, value: unknown) => writeFile(path, canonicalBytes(value), { flag: 'wx' });
async function loadContext(path: string): Promise<ServiceContext> {
  const c = await readJson(path);
  return inspectCommitment(await inspectNativeWork(c.work, canonicalBytes(c.job_spec)), c.plan, c.commitment);
}
const publicContext = (s: ServiceContext) => ({ job_spec: s.native.job, work: s.native.crossing, plan: s.plan.plan, commitment: s.commitment });
async function listen(server: Server, port: number, host: string) {
  await new Promise<void>((yes, no) => { server.once('error', no); server.listen(port, host, () => { server.off('error', no); yes(); }); });
}
const close = (server: Server) => new Promise<void>((yes, no) => { server.close(error => error ? no(error) : yes()); server.closeAllConnections(); });
async function until(at: string) {
  const delay = Date.parse(at) - Date.now(); if (delay > 0) await new Promise(r => setTimeout(r, delay));
}
async function saveHistory(out: string, h: ServiceHistory, crossing?: Record<string, any>) {
  h = await verifyServiceHistory(h); await fresh(out);
  await canonicalFile(join(out, 'history.json'), h); await json(join(out, 'summary.json'), h.summary);
  if (crossing) {
    await verifyServiceHistoryCrossing(crossing, h); await bundle(join(out, 'crossing.json'), crossing, 'Useful Work Kernel 008');
    await held(join(out, 'receiver'), crossing, 'world:useful-work-service-holder', SERVICE_CONTRACT);
  }
  console.log(JSON.stringify({ history_id: h.history_id, ...h.summary.schedule_accounting, bytes_returned: h.summary.bytes_returned, output: out }, null, 2));
}
async function demo(jobPath: string, out: string) {
  const { executeNativeJob, nativeOrganSpec } = await import('./merkle_native/worker.ts');
  const job = parseJob(await readJson(jobPath)); await fresh(out);
  const result = executeNativeJob(job);
  const [worker, planner, provider, challenger, observer, host] = await Promise.all(Array.from({ length: 6 }, () => generateP256KeyPair()));
  const work = await sealOpaqueOrganCrossing(nativeOrganSpec(result.manifest, result.tree.header, now()), worker);
  const native = await inspectNativeWork(work, canonicalBytes(job));
  let context: ServiceContext;
  const server = serviceHttpServer(async () => context, result.tree.bytes, host); await listen(server, 0, '127.0.0.1');
  let serverOpen = true;
  try {
    const port = (server.address() as { port: number }).port, declared = now();
    const policy: AuditPolicy = { schema: 'useful-work.audit-plan/v1', result_id: native.result_id, work_crossing_id: work.crossing_id,
      job_spec_hash: native.header.job_spec_hash, declared_at: declared, sample_count: Math.min(4, job.width * job.height), expires_at: declared,
      schedule: { starts_at: iso(Date.now() + 500), cadence_ms: 1200, rounds: 4, issue_window_ms: 700, response_window_ms: 350 },
      randomness_rule: { schema: 'signed-external-event/v1', source_world: 'world:service-demo-provider', public_key: provider.publicKeyJwk, stream_id: 'service-demo', first_sequence: 0 },
      challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1', challenger: { world_id: 'world:service-demo-challenger', public_key: challenger.publicKeyJwk },
      observer: { world_id: 'world:service-demo-observer', public_key: observer.publicKeyJwk } };
    policy.expires_at = scheduleSlot(policy, 3).response_deadline;
    const plan = await publishPlan(policy, planner);
    const commitment = await commitService(native, plan, `http://127.0.0.1:${port}/chunks`, host, 'world:service-demo-host', now());
    context = await inspectCommitment(native, plan, commitment);
    const publication = await publishService(context, observer, now());
    const inventory: Omit<ServiceHistoryInput, 'cut'> = { job_spec: job, work, plan, commitment, publication, events: [], challenges: [], responses: [], receipts: [], prior_cuts: [] };
    await canonicalFile(join(out, 'service-context.json'), publicContext(context));
    await canonicalFile(join(out, 'artifact.json'), result.tree.artifact);
    await mkdir(join(out, 'local-state'), { mode: 0o700 });
    for (const [name, keys] of Object.entries({ host, provider, challenger, observer }))
      await json(join(out, 'local-state', name + '-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
    await bundle(join(out, 'publication.json'), publication, 'Useful Work Kernel 008');
    let expired: ServiceHistory | null = null;
    for (let index = 0; index < 3; index++) {
      const slot = scheduleSlot(policy, index); await until(slot.scheduled_at);
      const event = await emitRandomness(plan, index, provider, now());
      const challenge = await issueServiceChallenge(context, publication, event, challenger);
      inventory.events.push(event); inventory.challenges.push(challenge);
      const dir = join(out, `slot-${index}`); await mkdir(dir);
      await bundle(join(dir, 'event.json'), event); await bundle(join(dir, 'challenge.json'), challenge);
      if (index === 1) {
        await until(iso(Date.parse(slot.response_deadline) + 1));
        expired = await createServiceHistory({ ...inventory, cut: await sealServiceCut(inventory, observer, now()) });
        await canonicalFile(join(out, 'expired-snapshot.json'), expired);
        inventory.prior_cuts.push(expired.cut);
      }
      if (index === 2) { await close(server); serverOpen = false; }
      const observed = await requestService(context, publication, event, challenge, observer, 300);
      if (observed.response) { inventory.responses.push(observed.response); await bundle(join(dir, 'response.json'), observed.response); }
      inventory.receipts.push(observed.receipt); await json(join(dir, 'receipt.json'), observed.receipt);
      await json(join(dir, 'transport-observation.json'), { transport_error: observed.transport_error });
    }
    await until(iso(Date.parse(policy.expires_at) + 1));
    const cut = await sealServiceCut(inventory, observer, now());
    const additions = { events: inventory.events.slice(expired!.events.length), challenges: inventory.challenges.slice(expired!.challenges.length),
      responses: inventory.responses.slice(expired!.responses.length), receipts: inventory.receipts.slice(expired!.receipts.length) };
    const history = await appendServiceHistory(expired, additions, cut);
    await canonicalFile(join(out, 'history-input.json'), { ...inventory, cut });
    const crossing = await sealServiceHistoryCrossing(history, observer, policy.observer.world_id, now());
    await saveHistory(join(out, 'history'), history, crossing);
  } finally { if (serverOpen) await close(server); }
}
async function main(args: string[]) {
  const command = args.shift(), inputs: string[] = [], flags: Record<string, string> = {};
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  while (args.length) {
    const key = args.shift()!, value = args.shift();
    if (!key.startsWith('--') || !value || value.startsWith('--') || Object.hasOwn(flags, key)) throw new Error('INVALID_CLI_OPTIONS'); flags[key] = value;
  }
  const arity: Record<string, number> = { demo: 1, commit: 1, publish: 1, challenge: 3, serve: 2, observe: 4, snapshot: 1, collect: 1, append: 2, verify: 1 };
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-008 demo <job> | commit <native-context> --endpoint <url> --key <key> | publish <service-context> --key <observer-key> | challenge <service-context> <publication-bundle> <event-bundle> --key <challenger-key> | serve <service-context> <artifact> --key <host-key> | observe <service-context> <publication-bundle> <event-bundle> <challenge-bundle> --key <observer-key> | snapshot <inventory> --key <observer-key> | collect <history-input> | append <history> <additions> --key <observer-key> | verify <history> [--crossing <bundle>] [--out <new-directory>]');
  const signing = ['commit', 'publish', 'challenge', 'serve', 'observe', 'snapshot', 'append'].includes(command);
  const allowed = ['--out', ...(signing ? ['--key'] : []), ...(['commit', 'publish', 'snapshot', 'append'].includes(command) ? ['--at'] : []),
    ...(command === 'commit' ? ['--endpoint', '--world'] : []), ...(command === 'verify' ? ['--crossing'] : [])];
  if (Object.keys(flags).some(k => !allowed.includes(k)) || (signing && !flags['--key'])) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-008${command === 'demo' ? '' : '-' + command}`);
  if (command === 'demo') return demo(inputs[0], out);
  if (command === 'verify' || command === 'collect') {
    const h = command === 'verify' ? await verifyServiceHistory(await readJson(inputs[0])) : await createServiceHistory(await readJson(inputs[0]));
    return saveHistory(out, h, flags['--crossing'] ? await loadBundle(resolve(flags['--crossing'])) : undefined);
  }
  const keys = await readWorkerKeys(resolve(flags['--key']));
  if (command === 'snapshot') {
    const inventory = await readJson(inputs[0]), cut = await sealServiceCut(inventory, keys, flags['--at'] ?? now());
    return saveHistory(out, await createServiceHistory({ ...inventory, cut }));
  }
  if (command === 'append') {
    const h = await verifyServiceHistory(await readJson(inputs[0])), additions = await readJson(inputs[1]);
    const { schema: _, history_id: __, summary: ___, ...inventory } = h;
    for (const k of ['events', 'challenges', 'responses', 'receipts'] as const) inventory[k] = [...inventory[k], ...(additions[k] ?? [])];
    inventory.prior_cuts.push(h.cut);
    const cut = await sealServiceCut(inventory, keys, flags['--at'] ?? now());
    return saveHistory(out, await appendServiceHistory(h, additions, cut));
  }
  if (command === 'commit') {
    const n = await readJson(inputs[0]), native = await inspectNativeWork(n.work, canonicalBytes(n.job_spec));
    const commitment = await commitService(native, n.plan, flags['--endpoint'], keys, flags['--world'] ?? 'world:useful-work-service-host', flags['--at'] ?? now());
    const s = await inspectCommitment(native, n.plan, commitment); await fresh(out);
    await canonicalFile(join(out, 'service-context.json'), publicContext(s)); await bundle(join(out, 'commitment.json'), commitment); return;
  }
  const s = await loadContext(inputs[0]);
  if (command === 'serve') {
    const url = new URL(s.declaration.endpoint);
    if (url.protocol !== 'http:') throw new Error('SERVICE_CLI_TLS_ADAPTER_REQUIRED');
    const artifact = await boundedRead(inputs[1], 16 * 1024 * 1024); inspectArtifact(artifact, s.native.job, s.native.result_id);
    const server = serviceHttpServer(async () => s, artifact, keys);
    if (!equal(keys.publicKeyJwk, s.declaration.host.public_key)) throw new Error('SERVICE_HOST_KEY_MISMATCH');
    await listen(server, Number(url.port || 80), url.hostname);
    console.log(JSON.stringify({ endpoint: url.href, commitment_id: s.commitment.crossing_id }));
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void close(server); }); return;
  }
  await fresh(out);
  if (command === 'publish') return bundle(join(out, 'publication.json'), await publishService(s, keys, flags['--at'] ?? now()));
  const publication = await loadBundle(inputs[1]), event = await loadBundle(inputs[2]);
  if (command === 'challenge') return bundle(join(out, 'challenge.json'), await issueServiceChallenge(s, publication, event, keys));
  const challenge = await loadBundle(inputs[3]), observed = await requestService(s, publication, event, challenge, keys);
  if (observed.response) await bundle(join(out, 'response.json'), observed.response);
  await json(join(out, 'receipt.json'), observed.receipt); await json(join(out, 'transport-observation.json'), { transport_error: observed.transport_error });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
