import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateP256KeyPair } from '../../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../../src/organ.ts';
import { sha256Hex } from '../../src/canonical.ts';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { boundedRead, held, json, now, readWorkerKeys } from '../../src/useful_work/cli_io.ts';
import { inspectNativeWork } from '../../src/useful_work/merkle_native/exchange.ts';
import { inspectSampleWork } from '../../src/useful_work/challenge/exchange.ts';
import { inspectCommitment } from '../../src/useful_work/service/commitment.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';
import { WORLD_KEYS, worldId, roleIdentity, valuationPolicy } from '../../src/useful_work/field_test/profile.ts';
import type { WorldRole } from '../../src/useful_work/field_test/profile.ts';

const [command, roleText, rootText, inputPath, outputPath] = process.argv.slice(2), role = roleText as WorldRole;
if (!Object.hasOwn(WORLD_KEYS, role) || !rootText || !inputPath || !outputPath) throw new Error('INVALID_FIELD_ACTOR_ARGUMENTS');
const root = resolve(rootText), world = worldId(role);
const read = async (path: string) => JSON.parse((await boundedRead(path, 192 * 1024 * 1024)).toString('utf8'));
const key = (name = 'primary') => readWorkerKeys(join(root, 'state', name + '.json'));
const input = command === 'init' ? null : await read(inputPath);
const native = (p: Wire) => inspectNativeWork(p.native.work, canonicalBytes(p.job_spec));
const legacy = (p: Wire) => inspectSampleWork(p.legacy.work, canonicalBytes(p.job_spec));
const service = async (i: Wire) => inspectCommitment(await native(i.packet), i.plan, i.commitment);
const allow = (...roles: WorldRole[]) => { if (!roles.includes(role)) throw new Error('FIELD_ACTOR_ROLE_RESTRICTION'); };
async function save(value: unknown) { await json(outputPath, value); }
async function ipc(kind: string) { if (!process.send) throw new Error('FIELD_IPC_REQUIRED'); process.send({ kind, pid: process.pid }); }
async function waitMessage(kind: string) {
  await new Promise<void>((yes, no) => {
    const timer = setTimeout(() => { process.off('message', receive); no(new Error('FIELD_ACTOR_IPC_TIMEOUT')); }, 60_000);
    const receive = (m: any) => { if (m?.kind === kind) { clearTimeout(timer); process.off('message', receive); yes(); } };
    process.on('message', receive);
  });
}
async function main() {
  if (command === 'init') {
    await mkdir(join(root, 'state'), { recursive: true, mode: 0o700 }); await mkdir(join(root, 'local'), { mode: 0o700 });
    const keys: Wire = {};
    for (const name of WORLD_KEYS[role]) {
      const k = await generateP256KeyPair(); await json(join(root, 'state', name + '.json'), await crypto.subtle.exportKey('jwk', k.privateKey), true);
      keys[name] = { world_id: roleIdentity(role, name), public_key: k.publicKeyJwk };
    }
    await save({ schema: 'useful-work.field-actor/v1', role, world_id: world, keys, process_id: process.pid }); return;
  }
  if (command === 'produce') {
    allow('A'); await ipc('ready'); await waitMessage('run');
    const { executeJob, organSpec } = await import('../../src/useful_work/worker.ts');
    const { executeNativeJob, nativeOrganSpec } = await import('../../src/useful_work/merkle_native/worker.ts');
    const { buildCommitment } = await import('../../src/useful_work/challenge/commitment.ts');
    const start = (await import('../../src/useful_work/resources/collectors.ts')).captureCpu;
    const cpuStart = await start(process.pid), result = executeNativeJob(input.job_spec), cpuEnd = await start(process.pid);
    const old = executeJob(input.job_spec), oldSpec = organSpec(old.manifest, now()), nativeSpec = nativeOrganSpec(result.manifest, result.tree.header, now());
    oldSpec.source_world = nativeSpec.source_world = world;
    oldSpec.donor_claims = { ...oldSpec.donor_claims, sample_commitment: buildCommitment(old.manifest.job_spec_hash, old.manifest.result_hash, old.result.escape_counts).commitment };
    const k = await key(), work = await sealOpaqueOrganCrossing(nativeSpec, k), oldWork = await sealOpaqueOrganCrossing(oldSpec, k);
    await writeFile(join(root, 'local/artifact.json'), result.tree.bytes, { flag: 'wx' });
    await json(join(root, 'local/cpu.json'), { start: cpuStart, end: cpuEnd });
    await save({ schema: 'useful-work.field-packet/v1', job_spec: result.job,
      native: { work, artifact_base64: result.tree.bytes.toString('base64') }, legacy: { work: oldWork,
        artifacts: Object.values(old.artifacts).map(bytes => ({ address: 'sha256:' + sha256Hex(bytes), base64: bytes.toString('base64') })) } });
    await ipc('produced'); await waitMessage('stop'); return;
  }
  if (command === 'legacy-check') {
    allow('B', 'C');
    const source = async (address: string) => Buffer.from(input.packet.legacy.artifacts.find((a: Wire) => a.address === address).base64, 'base64');
    const report = role === 'B' ? await (await import('../../src/useful_work/verifier.ts')).verifyWork(input.packet.legacy.work, source) :
      await (await import('../../src/useful_work/python_verifier.ts')).verifyWorkPython(input.packet.legacy.work, source);
    if (report.errors.length) throw new Error('FIELD_LEGACY_CHECK_FAILED');
    await save(await (await import('../../src/useful_work/receipt.ts')).verificationReceipt(report, await key('math'), now(),
      { world_id: roleIdentity(role, 'math'), receiver_particular: 'particular:field:legacy' })); return;
  }
  if (command === 'legacy-issue') {
    allow('B'); const { createChallenge } = await import('../../src/useful_work/challenge/exchange.ts');
    await save(await createChallenge(await legacy(input.packet), 6, await key('challenger'), now())); return;
  }
  if (command === 'legacy-answer') {
    allow('A'); const { answerChallenge } = await import('../../src/useful_work/challenge/worker.ts');
    const old = JSON.parse(Buffer.from(input.packet.legacy.artifacts.find((a: Wire) => a.address === input.packet.legacy.work.payload_refs.find((r: Wire) => r.role === 'canonical-result').address).base64, 'base64').toString());
    await save(await answerChallenge(await legacy(input.packet), input.challenge, old.escape_counts, await key(), now())); return;
  }
  if (command === 'legacy-sample-check') {
    allow('B', 'C'); const { verifyChallenge } = await import('../../src/useful_work/challenge/verifier.ts');
    const checker = role === 'B' ? (await import('../../src/useful_work/challenge/typescript_checker.ts')).typescriptChecker : (await import('../../src/useful_work/challenge/python_checker.ts')).pythonChecker();
    const report = await verifyChallenge(await legacy(input.packet), input.challenge, input.response, checker);
    if (report.errors.length) throw new Error('FIELD_LEGACY_SAMPLE_FAILED');
    await save(await (await import('../../src/useful_work/challenge/receipt.ts')).challengeReceipt(report, await key('math'), now(),
      { world_id: roleIdentity(role, 'math'), receiver_particular: 'particular:field:legacy-samples' })); return;
  }
  if (command === 'plan') {
    allow('B'); const { publishPlan, scheduleSlot } = await import('../../src/useful_work/audit_clock/policy.ts');
    const n = await native(input.packet), b = input.actors.B, c = input.actors.C;
    const policy = { schema: 'useful-work.audit-plan/v1' as const, result_id: n.result_id, work_crossing_id: n.crossing.crossing_id, job_spec_hash: n.header.job_spec_hash,
      declared_at: now(), sample_count: 6, expires_at: '', schedule: input.schedule ?? { starts_at: new Date(Date.now() + 5000).toISOString(), cadence_ms: 200, rounds: 2, issue_window_ms: 12000, response_window_ms: 1000 },
      randomness_rule: { schema: 'signed-external-event/v1' as const, source_world: c.keys.randomness.world_id, public_key: c.keys.randomness.public_key, stream_id: 'field-' + input.purpose, first_sequence: 1 },
      challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1' as const, challenger: b.keys.challenger, observer: b.keys.observer };
    policy.expires_at = scheduleSlot(policy, 1).response_deadline;
    await save(await publishPlan(policy, await key('planner'))); return;
  }
  if (command === 'randomness') {
    allow('C'); await save(await (await import('../../src/useful_work/audit_clock/provenance.ts')).emitRandomness(input.plan, input.slot, await key('randomness'), now())); return;
  }
  if (command === 'audit-publication' || command === 'audit-issue' || command === 'audit-history') {
    allow('B'); const { observe, issueScheduledChallenge } = await import('../../src/useful_work/audit_clock/provenance.ts');
    if (command === 'audit-publication') { await save(await observe(input.plan, 'PLAN_PUBLISHED', null, input.plan.crossing_id, await key('observer'), now())); return; }
    if (command === 'audit-issue') { await save(await issueScheduledChallenge(await native(input.packet), input.plan, input.publication, input.event, await key('challenger'))); return; }
    const { createHistory, sealHistoryCut } = await import('../../src/useful_work/audit_clock/history.ts');
    const cut = await sealHistoryCut(input, await key('observer'), now()); await save(await createHistory({ ...input, cut })); return;
  }
  if (command === 'audit-answer') {
    allow('A'); await save(await (await import('../../src/useful_work/merkle_native/worker.ts')).answerNativeChallenge(await native(input.packet), input.challenge,
      Buffer.from(input.packet.native.artifact_base64, 'base64'), await key(), now())); return;
  }
  if (command === 'native-check') {
    allow('B', 'C', 'D'); const { verifyNativeChallenge } = await import('../../src/useful_work/merkle_native/verifier.ts');
    const checker = role === 'B' ? (await import('../../src/useful_work/merkle_native/typescript_checker.ts')).nativeTypescriptChecker : role === 'C' ?
      (await import('../../src/useful_work/merkle_native/python_checker.ts')).nativePythonChecker() : (await import('./fault-checker.ts')).faultChecker;
    const report = await verifyNativeChallenge(await native(input.packet), input.challenge, input.response, checker);
    if ((role !== 'D' && report.errors.length) || (role === 'D' && !report.errors.length)) throw new Error('FIELD_EXPECTED_MATHEMATICAL_OUTCOME_MISSING');
    await save(await (await import('../../src/useful_work/merkle_native/receipt.ts')).nativeReceipt(report, await key(role === 'D' ? 'fault' : 'math'), now(),
      { world_id: roleIdentity(role, role === 'D' ? 'fault' : 'math'), receiver_particular: 'particular:field:native-samples' })); return;
  }
  if (command === 'server') {
    allow('A'); let context: Awaited<ReturnType<typeof inspectCommitment>> | undefined;
    const server = (await import('../../src/useful_work/service/http.ts')).serviceHttpServer(async () => { if (!context) throw new Error('FIELD_HOST_NOT_COMMITTED'); return context; },
      Buffer.from(input.packet.native.artifact_base64, 'base64'), await key());
    await new Promise<void>((yes, no) => { server.once('error', no); server.listen(input.port ?? 0, input.bind_host ?? '127.0.0.1', () => yes()); });
    await save({ endpoint: input.public_endpoint ?? `http://127.0.0.1:${(server.address() as { port: number }).port}/native` }); await ipc('listening');
    process.on('message', async (message: any) => {
      if (message?.kind === 'commit') {
        try { const i = await read(message.path); context = await service(i); await ipc('committed'); }
        catch { await ipc('commit-failed'); }
      }
    });
    try { await waitMessage('stop'); } finally { await new Promise<void>(yes => { server.close(() => yes()); server.closeAllConnections(); }); } return;
  }
  if (command === 'service-commit') {
    allow('A'); await save(await (await import('../../src/useful_work/service/commitment.ts')).commitService(await native(input.packet), input.plan, input.endpoint, await key(), world, now())); return;
  }
  if (command === 'service-publication' || command === 'service-issue' || command === 'service-request' || command === 'service-history') {
    allow('B');
    if (command === 'service-history') { const { createServiceHistory, sealServiceCut } = await import('../../src/useful_work/service/history.ts');
      const cut = await sealServiceCut(input, await key('observer'), now()); await save(await createServiceHistory({ ...input, cut })); return; }
    const s = await service(input);
    if (command === 'service-publication') { await save(await (await import('../../src/useful_work/service/commitment.ts')).publishService(s, await key('observer'), now())); return; }
    if (command === 'service-issue') { await save(await (await import('../../src/useful_work/service/exchange.ts')).issueServiceChallenge(s, input.publication, input.event, await key('challenger'))); return; }
    await save(await (await import('../../src/useful_work/service/http.ts')).requestService(s, input.publication, input.event, input.challenge, await key('observer'), input.timeout_ms ?? 2000)); return;
  }
  if (command === 'network-start' || command === 'resource-observation') {
    allow('A'); const { captureNetwork, captureStorage, collectorProvenance } = await import('../../src/useful_work/resources/collectors.ts');
    if (command === 'network-start') { await json(join(root, 'local/network-start.json'), await captureNetwork(input.interface_name ?? 'lo')); await save({ captured: true }); return; }
    const n = await native(input.packet), cpu = await read(join(root, 'local/cpu.json'));
    const networkStart = await read(join(root, 'local/network-start.json'));
    const network = { start: networkStart, end: await captureNetwork(networkStart.interface_name) }, storage = await captureStorage(join(root, 'local/artifact.json'));
    const { signObservation } = await import('../../src/useful_work/resources/observation.ts'), measurements = [];
    for (const [kind, evidence] of [['cpu', cpu], ['storage', storage], ['network', network]] as const) measurements.push(await signObservation(n, kind, evidence,
      await collectorProvenance(input.host_ref ?? 'host:field-same-linux-host'), await key(), world, now(), 'execution:field-A-native-render'));
    await save(measurements); return;
  }
  if (command === 'resource-replay') {
    allow('C'); const { replayObservation } = await import('../../src/useful_work/resources/observation.ts'), n = await native(input.packet), observations = [];
    for (const measurement of input.measurements) observations.push({ measurement, receipt: await replayObservation(n, measurement, await key(), world, now()) });
    await save(await (await import('../../src/useful_work/resources/bundle.ts')).createResourceBundle({ job_spec: n.job, work: n.crossing, observations })); return;
  }
  if (command === 'offer') {
    allow('B'); await save(await (await import('../../src/useful_work/settlement/exchange.ts')).publishOffer(input, await key(), world, now())); return;
  }
  if (command === 'valuate') {
    allow('B', 'D'); const { createContext } = await import('../../src/useful_work/valuation/context.ts'), { evaluate } = await import('../../src/useful_work/valuation/evaluator.ts');
    const context = await createContext({ result_id: input.evidence.result_id, job_spec: input.evidence.job_spec, work: input.evidence.work, audit: input.evidence.audit,
      history: input.evidence.audit_history, resource_claims: [], canonical_artifact: Buffer.from(input.packet.native.artifact_base64, 'base64').toString('utf8') });
    await save(await evaluate(context, valuationPolicy(role as 'B' | 'D', input.packet.job_spec), await key(), now(), { world_id: world, particular: 'particular:field:local-value' })); return;
  }
  if (command === 'present') {
    allow('A'); const evidence = await (await import('../../src/useful_work/settlement/evidence.ts')).createEvidence(input.evidence);
    const presentation = await (await import('../../src/useful_work/settlement/exchange.ts')).presentEvidence(input.offer, evidence, await key(), world, now());
    await save({ schema: 'useful-work.field-presentation/v1', offer: input.offer, evidence, presentation }); return;
  }
  if (command === 'decide') {
    allow('B'); const { decide } = await import('../../src/useful_work/settlement/exchange.ts'), observedAt = now();
    const decision = await decide(input.offer, input.evidence, input.presentation, input.choice ?? 'ACCEPT', input.observed_at ?? observedAt,
      input.reason ?? 'Named matching verifiers, two audit slots, one timely service slot, three scoped resource observations and my local valuation pass. Disagreement and expired service remain retained.', await key(), world, now());
    await save({ schema: 'useful-work.offer-exchange/v1', offer: input.offer, evidence: input.evidence, presentation: input.presentation, decision }); return;
  }
  if (command === 'settlement-observe') {
    allow('adapter'); const { verifyExchange } = await import('../../src/useful_work/settlement/exchange.ts');
    const v = await verifyExchange(input.exchange), external = input.external_record;
    if (external.request.acceptance_ref !== v.bundle.decision.receipt_id || external.request.evidence_ref !== v.evidence.bundle.evidence_id || external.request.amount !== '12') throw new Error('FIELD_LEDGER_CORRELATION_MISMATCH');
    const transfer = v.offer.terms.transfer, evidence = { entry_ref: external.entry_ref, debit: external.debit, credit: external.credit };
    const { observeSettlement, recordHash } = await import('../../src/useful_work/settlement/observation.ts');
    await save(await observeSettlement(v.bundle, { transfer, evidence, record_ref: external.entry_ref, observed_at: now(), provenance: {
      record_origin: 'operator-import/v1', provider_ref: 'external:field-python-ledger', adapter_version: 'field-ledger-import/v1', record_sha256: recordHash({ transfer, record_ref: external.entry_ref, evidence }) } }, await key(), world, now())); return;
  }
  if (command === 'settlement-replay') {
    allow('C'); const receipt = await (await import('../../src/useful_work/settlement/observation.ts')).replaySettlement(input.exchange, input.observation, await key(), world, now());
    await save(await (await import('../../src/useful_work/settlement/bundle.ts')).createSettlementBundle({ exchange: input.exchange, observations: [{ observation: input.observation, receipt }] })); return;
  }
  if (command === 'hold' || command === 'retain') {
    if (command === 'retain') {
      allow('A', 'B', 'C', 'D'); const verified = await (await import('../../src/useful_work/field_test/archive.ts')).verifyFieldReference(input.archive, input.crossing);
      await writeFile(join(root, 'local/public-archive.json'), canonicalBytes(verified.archive), { flag: 'wx' });
      await json(join(root, 'local/public-archive-reference.json'), verified.crossing);
    }
    allow('A', 'B', 'C', 'D'); const record = await held(join(root, 'local', 'receiver-' + input.name), input.crossing, world, input.contract_ref);
    await save({ role, received: record.received, hold: record.hold }); return;
  }
  if (command === 'preserve') {
    allow('C'); await save(await (await import('../../src/useful_work/field_test/archive.ts')).sealFieldArchive(input, await key(), now())); return;
  }
  throw new Error('UNKNOWN_FIELD_ACTOR_COMMAND');
}
main().then(() => { if (process.connected) process.disconnect?.(); }).catch(error => {
  console.error(error.message); process.exitCode = 1; if (process.connected) process.disconnect?.();
});
