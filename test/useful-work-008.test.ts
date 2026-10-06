import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, sealCrossingEnvelope, sealReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { claims } from '../src/useful_work/challenge/exchange.ts';
import { executeNativeJob, nativeOrganSpec } from '../src/useful_work/merkle_native/worker.ts';
import { inspectNativeWork } from '../src/useful_work/merkle_native/exchange.ts';
import { publishPlan, scheduleSlot } from '../src/useful_work/audit_clock/policy.ts';
import { emitRandomness } from '../src/useful_work/audit_clock/provenance.ts';
import { iso } from '../src/useful_work/audit_clock/wire.ts';
import type { AuditPolicy } from '../src/useful_work/audit_clock/types.ts';
import { commitService, inspectCommitment, inspectPublication, publishService } from '../src/useful_work/service/commitment.ts';
import { issueServiceChallenge, inspectServiceChallenge, answerServiceChallenge, inspectServiceResponse } from '../src/useful_work/service/exchange.ts';
import { observeService, inspectServiceReceipt } from '../src/useful_work/service/receipt.ts';
import { appendServiceHistory, createServiceHistory, sealServiceCut, serviceHistoryId, verifyServiceHistory, sealServiceHistoryCrossing, verifyServiceHistoryCrossing } from '../src/useful_work/service/history.ts';
import type { ServiceHistoryInput, ServiceHistory } from '../src/useful_work/service/history.ts';
import { sealServiceMessage, UNPROVEN } from '../src/useful_work/service/wire.ts';
import type { Wire } from '../src/useful_work/service/wire.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(join(root, 'fixtures/useful-work-008-golden.json'), 'utf8'));
const job = fixture.history.job_spec;
const epoch = Date.parse('2026-10-05T00:00:00.000Z'), t = (ms: number) => iso(epoch + ms);
async function setup(rounds = 4) {
  const result = executeNativeJob(job);
  const [worker, planner, provider, challenger, observer, host] = await Promise.all(Array.from({ length: 6 }, () => generateP256KeyPair()));
  const work = await sealOpaqueOrganCrossing(nativeOrganSpec(result.manifest, result.tree.header, t(0)), worker);
  const native = await inspectNativeWork(work, canonicalBytes(job));
  const policy: AuditPolicy = { schema: 'useful-work.audit-plan/v1', result_id: native.result_id, work_crossing_id: work.crossing_id,
    job_spec_hash: native.header.job_spec_hash, declared_at: t(0), sample_count: 4, expires_at: t(0),
    schedule: { starts_at: t(1000), cadence_ms: 1000, rounds, issue_window_ms: 200, response_window_ms: 500 },
    randomness_rule: { schema: 'signed-external-event/v1', source_world: 'world:test-service-provider', public_key: provider.publicKeyJwk, stream_id: 'test-service', first_sequence: 42 },
    challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1', challenger: { world_id: 'world:test-service-challenger', public_key: challenger.publicKeyJwk },
    observer: { world_id: 'world:test-service-observer', public_key: observer.publicKeyJwk } };
  policy.expires_at = scheduleSlot(policy, rounds - 1).response_deadline;
  const plan = await publishPlan(policy, planner);
  const commitment = await commitService(native, plan, 'https://example.test/chunks', host, 'world:test-service-host', t(1));
  const s = await inspectCommitment(native, plan, commitment), publication = await publishService(s, observer, t(2));
  const input: Omit<ServiceHistoryInput, 'cut'> = { job_spec: job, work, plan, commitment, publication, events: [], challenges: [], responses: [], receipts: [], prior_cuts: [] };
  return { worker, planner, provider, challenger, observer, host, result, native, policy, plan, commitment, publication, s, input };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function issue(s: Setup, index = 0, value = (index + 1).toString(16).padStart(64, '0')) {
  const event = await emitRandomness(s.plan, index, s.provider, t(1010 + index * 1000), value);
  const challenge = await issueServiceChallenge(s.s, s.publication, event, s.challenger);
  s.input.events.push(event); s.input.challenges.push(challenge); return { event, challenge };
}
type Issue = Awaited<ReturnType<typeof issue>>;
async function answer(s: Setup, i: Issue, index = 0, observedAt = 1040 + index * 1000) {
  const response = await answerServiceChallenge(s.s, s.publication, i.event, i.challenge, s.result.tree.bytes, s.host, t(1030 + index * 1000));
  const receipt = await observeService(s.s, s.publication, i.event, i.challenge, response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020 + index * 1000), observed_at: t(observedAt) }, s.observer);
  s.input.responses.push(response); s.input.receipts.push(receipt); return { response, receipt };
}
const snapshot = async (s: Setup, at: number) => createServiceHistory({ ...s.input, cut: await sealServiceCut(s.input, s.observer, t(at)) });
function rehash(h: ServiceHistory) { const { history_id: _, ...body } = h; h.history_id = serviceHistoryId(body); return h; }
async function responseWith(s: Setup, original: Wire, mutate: (payload: Wire) => void) {
  const payload = structuredClone(claims(original).service_response); mutate(payload);
  return sealServiceMessage('response', payload, s.host, s.s.declaration.host.world_id, original.created_at);
}
async function child(args: string[], cwd = root, stdin?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((yes, no) => {
    const p = spawn(args[0], args.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; });
    p.once('error', no); p.once('close', code => yes({ code, stdout, stderr })); p.stdin.end(stdin === undefined ? undefined : JSON.stringify(stdin));
  });
}
async function oracle(history: ServiceHistory) {
  const r = await child(['python3', '-B', 'examples/useful-work-008/service_vectors.py'], root, history);
  assert.equal(r.code, 0, r.stderr); return JSON.parse(r.stdout);
}
async function checkOracle(h: ServiceHistory) {
  const v = await oracle(h);
  assert.equal(v.history_id, h.history_id); assert.equal(v.inventory_hash, claims(h.cut).service_cut.inventory_hash);
  assert.deepEqual(v.statuses, h.summary.slots.map(s => s.status));
  assert.deepEqual(v.schedule_accounting, h.summary.schedule_accounting);
  assert.equal(v.bytes_returned, h.summary.bytes_returned); assert.deepEqual(v.verified_chunk_indices, h.summary.verified_chunk_indices);
  for (const [index, ch] of h.challenges.entries()) {
    const expected = v.challenge_vectors[index], payload = claims(ch).service_challenge;
    assert.equal(expected.challenge_id, ch.crossing_id); assert.equal(expected.nonce, payload.nonce);
    const reports = h.receipts.map(r => r.extensions.useful_work_service).filter(r => r.scope.challenge_id === ch.crossing_id);
    reports.forEach(r => assert.deepEqual(r.scope.requested_indices, expected.indices));
  }
  for (const v1 of v.receipt_vectors) {
    const report = h.receipts.find(r => r.receipt_id === v1.receipt_id)!.extensions.useful_work_service;
    assert.deepEqual(report.evidence, v1.evidence);
    for (const key of ['bytes_returned', 'artifact_chunk_proof_verified', 'requested_bytes_matched', 'response_observed', 'response_within_observer_window']) assert.equal(report.claims[key], v1[key]);
  }
  return v;
}

test('008 golden real HTTP history authenticates and matches independent identities/proofs/bytes/schedule vectors', async () => {
  const h = await verifyServiceHistory(fixture.history);
  assert.deepEqual(await checkOracle(h), fixture.expected);
  assert.deepEqual(h.summary.slots.map(s => s.status), ['ANSWERED', 'ANSWERED', 'EXPIRED', 'WITHHELD / UNKNOWN']);
  assert.equal(h.summary.schedule_accounting.planned_slots, 4);
  assert.equal(h.summary.schedule_accounting.in_window_verified_slots, 1);
  assert.equal(h.summary.observer_cuts.length, 2);
  assert.equal(h.summary.claims.observed_history_complete, false);
  for (const r of h.receipts) for (const [k, v] of Object.entries(UNPROVEN)) assert.equal(r.extensions.useful_work_service.claims[k], v);
  assert.ok(!canonicalBytes(fixture).toString().includes('"d":'));
});

test('commitment binds sole result identity, root, signed plan, host, endpoint and exact service window', async () => {
  const s = await setup();
  assert.equal(s.s.declaration.result_id, s.native.result_id);
  assert.notDeepEqual(s.host.publicKeyJwk, s.worker.publicKeyJwk);
  const changes: ((p: Wire) => void)[] = [p => p.counts_root = '0'.repeat(64), p => p.result_id = 'useful-work-merkle-result-v1:' + '0'.repeat(64),
    p => p.plan_id += 'x', p => p.work_crossing_id = s.plan.crossing_id, p => p.service_window.ends_at = t(8000),
    p => p.declared_at = t(1000), p => p.chunk_rule = 'arbitrary-json/v1', p => p.endpoint = 'https://a:b@example.test/chunks',
    p => p.endpoint = 'https://example.test/chunks#fragment', p => p.host.public_key = s.observer.publicKeyJwk,
    p => p.bandwidth_guaranteed = true];
  for (const mutate of changes) {
    const payload = structuredClone(claims(s.commitment).service_commitment); mutate(payload);
    const c = await sealServiceMessage('commitment', payload, s.host, s.s.declaration.host.world_id, payload.declared_at);
    await assert.rejects(inspectCommitment(s.native, s.plan, c));
  }
});

test('challenge is fixed by pre-slot publication, signed fresh slot event and complete envelope, with no metadata grinding', async () => {
  const s = await setup(), i = await issue(s);
  await assert.rejects(issueServiceChallenge(s.s, null, i.event, s.challenger));
  await assert.rejects(publishService(s.s, s.observer, t(1000)), /PRECEDE_SCHEDULE/);
  await assert.rejects(publishService(s.s, s.host, t(3)), /SIGNER_MISMATCH/);
  const late = await emitRandomness(s.plan, 0, s.provider, t(1201));
  await assert.rejects(issueServiceChallenge(s.s, s.publication, late, s.challenger), /AFTER_ISSUE_WINDOW/);
  const alternate = await emitRandomness(s.plan, 1, s.provider, t(2010));
  await assert.rejects(inspectServiceChallenge(s.s, s.publication, alternate, i.challenge), /DERIVATION_MISMATCH/);
  const payload = structuredClone(claims(i.challenge).service_challenge); payload.nonce = 'f'.repeat(64);
  const ground = await sealServiceMessage('challenge', payload, s.challenger, s.policy.challenger.world_id, i.challenge.created_at);
  await assert.rejects(inspectServiceChallenge(s.s, s.publication, i.event, ground), /DERIVATION_MISMATCH/);
  const { crossing_id: _, signing: __, ...body } = i.challenge;
  const metadata = await sealCrossingEnvelope({ ...body, parents: [s.commitment.crossing_id] }, s.challenger);
  await assert.rejects(inspectServiceChallenge(s.s, s.publication, i.event, metadata), /ENVELOPE_RULE/);
  const badPublication = await sealServiceMessage('publication', { ...claims(s.publication).service_publication, commitment_id: s.plan.crossing_id }, s.observer, s.policy.observer.world_id, t(2));
  await assert.rejects(inspectPublication(s.s, badPublication));
});

test('a separate host serves native bytes/proofs without worker authority; wrong host and wrong exchange fail explicitly', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  await inspectServiceResponse(s.s, i.challenge.crossing_id, a.response);
  assert.equal(a.response.source_world, s.s.declaration.host.world_id);
  assert.equal(s.input.work.source_world, 'world:useful-work-native-worker');
  await assert.rejects(answerServiceChallenge(s.s, s.publication, i.event, i.challenge, s.result.tree.bytes, s.worker, t(1030)), /HOST_KEY/);
  const rogue = await sealServiceMessage('response', claims(a.response).service_response, s.worker, s.s.declaration.host.world_id, t(1030));
  await assert.rejects(inspectServiceResponse(s.s, i.challenge.crossing_id, rogue), /SIGNER_MISMATCH/);
  const wrong = await responseWith(s, a.response, p => p.challenge_id = s.commitment.crossing_id);
  await assert.rejects(inspectServiceResponse(s.s, i.challenge.crossing_id, wrong), /CONTEXT_MISMATCH/);
  const artifact = structuredClone(s.result.tree.artifact); artifact.escape_counts[0]++;
  await assert.rejects(answerServiceChallenge(s.s, s.publication, i.event, i.challenge, canonicalBytes(artifact), s.host, t(1030)), /LEAVES_IDENTITY/);
});

test('proof checks and requested byte matching distinguish partial, duplicate, noncanonical, substituted and corrupted content', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  const mutate: ((p: Wire) => void)[] = [p => p.chunks.pop(), p => p.chunks.push(p.chunks[0]), p => p.chunks.reverse(),
    p => p.chunks[0].bytes_base64 = Buffer.from('{"index":999,"count":0}').toString('base64'),
    p => p.chunks[0].bytes_base64 = Buffer.from(' ' + Buffer.from(p.chunks[0].bytes_base64, 'base64').toString()).toString('base64'),
    p => p.chunks[0].bytes_base64 = Buffer.from([255]).toString('base64'),
    p => p.chunks[0].proof[0] = '0'.repeat(64), p => p.chunks = []];
  for (const change of mutate) {
    const response = await responseWith(s, a.response, change);
    const receipt = await observeService(s.s, s.publication, i.event, i.challenge, response,
      { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1040) }, s.observer);
    const { report } = await inspectServiceReceipt(s.s, s.publication, i.event, i.challenge, response, receipt);
    assert.equal(report.claims.response_observed, true); assert.equal(report.claims.requested_bytes_matched, false);
    assert.equal(receipt.kind, 'FAILED'); assert.equal(report.claims.full_computation_verified, false);
    // Includes the actual returned bytes, even when they fail a requested proof.
    assert.equal(report.claims.bytes_returned, claims(response).service_response.chunks.reduce((n: number, c: Wire) => n + Buffer.from(c.bytes_base64, 'base64').length, 0));
    const h = { ...s.input, responses: [response], receipts: [receipt] };
    const history = await createServiceHistory({ ...h, cut: await sealServiceCut(h, s.observer, t(1800)) }); await checkOracle(history);
  }
});

test('valid inclusion for an unrequested leaf does not satisfy the requested byte contract', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  const requested = a.receipt.extensions.useful_work_service.scope.requested_indices;
  const index = s.result.tree.artifact.escape_counts.findIndex((_, n) => !requested.includes(n));
  const response = await responseWith(s, a.response, p => { p.chunks[0] = { index,
    bytes_base64: canonicalBytes({ index, count: s.result.tree.artifact.escape_counts[index] }).toString('base64'), proof: s.result.tree.proof(index) }; });
  const r = await observeService(s.s, s.publication, i.event, i.challenge, response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1040) }, s.observer);
  assert.equal(r.extensions.useful_work_service.claims.artifact_chunk_proof_verified, true);
  assert.equal(r.extensions.useful_work_service.claims.requested_bytes_matched, false);
});

test('observer timing stays separate from host timestamps, byte verification and physical claims', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i, 0, 1701);
  const r = a.receipt.extensions.useful_work_service;
  assert.equal(r.claims.artifact_chunk_proof_verified, true); assert.equal(r.claims.response_observed, true);
  assert.equal(r.claims.requested_bytes_matched, true); assert.equal(r.claims.response_within_observer_window, false);
  assert.equal(a.response.created_at, t(1030));
  const boundary = await observeService(s.s, s.publication, i.event, i.challenge, a.response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1700) }, s.observer);
  assert.equal(boundary.extensions.useful_work_service.claims.response_within_observer_window, true);
  await assert.rejects(observeService(s.s, s.publication, i.event, i.challenge, a.response,
    { endpoint: 'https://another.test/chunks', sent_at: t(1020), observed_at: t(1040) }, s.observer), /OBSERVATION/);
  await assert.rejects(observeService(s.s, s.publication, i.event, i.challenge, a.response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1019) }, s.observer), /OBSERVATION/);
});

test('validly signed invented byte counts, proofs, scope and stronger authority assertions fail replay', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  const changes: ((r: Wire) => void)[] = [r => r.extensions.useful_work_service.claims.bytes_returned++,
    r => r.extensions.useful_work_service.claims.physical_bandwidth_verified = true,
    r => r.extensions.useful_work_service.claims.continuous_storage_verified = true,
    r => r.extensions.useful_work_service.claims.host_uptime_verified = true,
    r => r.extensions.useful_work_service.claims.network_path_verified = true,
    r => r.extensions.useful_work_service.scope.requested_indices.reverse(), r => r.semantic_effect = 'ADMIT',
    r => r.extensions.extra_authority = true, r => r.post_state_ref = 'owned'];
  for (const mutate of changes) {
    const { receipt_id: _, signing: __, ...body } = structuredClone(a.receipt); mutate(body);
    const forged = await sealReceipt(body, s.observer);
    await assert.rejects(inspectServiceReceipt(s.s, s.publication, i.event, i.challenge, a.response, forged), /REPLAY_MISMATCH/);
  }
  await assert.rejects(observeService(s.s, s.publication, i.event, i.challenge, a.response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1040) }, s.host), /OBSERVER_KEY/);
});

test('all planned slots remain visible, including open, missing, unanswered and observed transport attempts', async () => {
  const s = await setup(), i = await issue(s);
  const r = await observeService(s.s, s.publication, i.event, i.challenge, null,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1040) }, s.observer);
  s.input.receipts.push(r);
  const early = await snapshot(s, 1040); assert.deepEqual(early.summary.slots.map(v => v.status), ['ISSUED', 'PLANNED', 'PLANNED', 'PLANNED']);
  const late = await snapshot(s, 5000); assert.deepEqual(late.summary.slots.map(v => v.status), ['EXPIRED', 'WITHHELD / UNKNOWN', 'WITHHELD / UNKNOWN', 'WITHHELD / UNKNOWN']);
  assert.equal(late.summary.schedule_accounting.planned_slots, 4); assert.equal(late.summary.bytes_returned, 0);
  assert.equal(r.extensions.useful_work_service.claims.response_observed, false);
  assert.equal(late.summary.claims.missing_response_proves_unavailability, false); await checkOracle(late);
});

test('mutable cached contexts cannot substitute role keys or turn an outsider into the pinned observer', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  const cached = { ...s.s, plan: structuredClone(s.s.plan), declaration: structuredClone(s.s.declaration) };
  cached.plan.policy.observer.public_key = s.host.publicKeyJwk;
  const { receipt_id: _, signing: __, ...body } = a.receipt;
  const outsider = await sealReceipt(body, s.host);
  await assert.rejects(inspectServiceReceipt(cached, s.publication, i.event, i.challenge, a.response, outsider), /SIGNER_MISMATCH/);
  await assert.rejects(observeService(cached, s.publication, i.event, i.challenge, a.response,
    { endpoint: s.s.declaration.endpoint, sent_at: t(1020), observed_at: t(1040) }, s.host), /OBSERVER_KEY/);
  cached.declaration.host.public_key = s.worker.publicKeyJwk;
  const wrongHost = await sealServiceMessage('response', claims(a.response).service_response, s.worker, s.s.declaration.host.world_id, t(1030));
  await assert.rejects(inspectServiceResponse(cached, i.challenge.crossing_id, wrongHost), /SIGNER_MISMATCH/);
});

test('exact replays authenticate before deduplication and cannot inflate slots, receipts or byte totals', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i), original = await snapshot(s, 5000);
  s.input.events.push(i.event); s.input.challenges.push(i.challenge); s.input.responses.push(a.response); s.input.receipts.push(a.receipt);
  const replay = await snapshot(s, 5000);
  assert.deepEqual(replay.summary.schedule_accounting, original.summary.schedule_accounting);
  assert.equal(replay.summary.bytes_returned, original.summary.bytes_returned);
  assert.deepEqual(replay.summary.replays, { events: 1, challenges: 1, responses: 1, receipts: 1 });
  await checkOracle(replay);
  const bad = structuredClone(a.response); bad.signing.signature = 'invalid'; s.input.responses.push(bad);
  await assert.rejects(snapshot(s, 5000), /INVALID_OPAQUE_SIGNATURE/);
});

test('source forks and reused randomness are retained without creating extra scheduled rounds', async () => {
  const s = await setup(), i = await issue(s), a = await answer(s, i);
  const fork = await issue(s, 0, 'f'.repeat(64)); await answer(s, fork);
  const next = await issue(s, 1, 'f'.repeat(64)); await answer(s, next, 1);
  const h = await snapshot(s, 5000); assert.equal(h.summary.slots[0].randomness_equivocation, true);
  assert.equal(h.summary.slots[0].challenge_ids.length, 2); assert.equal(h.summary.schedule_accounting.issued_slots, 2);
  assert.equal(h.summary.schedule_accounting.verified_chunk_slots, 2); assert.equal(h.summary.randomness_reused_values.length, 1);
  assert.equal(h.summary.claims.randomness_unpredictability_verified, false); assert.ok(a.receipt.receipt_id); await checkOracle(h);
});

test('append preserves the signed expired prefix while late answers change only the later cut', async () => {
  const s = await setup(), i = await issue(s), expired = await snapshot(s, 1800);
  assert.equal(expired.summary.slots[0].status, 'EXPIRED');
  const a = await answer(s, i, 0, 1801); s.input.prior_cuts.push(expired.cut);
  const cut = await sealServiceCut(s.input, s.observer, t(1802));
  const h = await appendServiceHistory(expired, { responses: [a.response], receipts: [a.receipt] }, cut);
  assert.equal(h.summary.slots[0].status, 'ANSWERED'); assert.equal(h.summary.schedule_accounting.in_window_observed_slots, 0);
  assert.equal((await verifyServiceHistory(expired)).summary.slots[0].status, 'EXPIRED');
  assert.deepEqual(h.prior_cuts, [expired.cut]);
  const rewrite = { ...s.input, events: [await emitRandomness(s.plan, 0, s.provider, t(1010), 'e'.repeat(64))], challenges: [], responses: [], receipts: [] };
  await assert.rejects(createServiceHistory({ ...rewrite, cut: await sealServiceCut(rewrite, s.observer, t(1803)) }), /INVENTORY|PREFIX/);
  await assert.rejects(appendServiceHistory(expired, {}, await sealServiceCut({ ...s.input, responses: [], receipts: [] }, s.observer, t(1700))), /PRIOR_CUT/);
});

test('signed inventories bind missing records; collector rehashing cannot forge counts or stronger summaries', async () => {
  const s = await setup(), i = await issue(s); await answer(s, i); const original = await snapshot(s, 5000);
  const removed = structuredClone(original); removed.receipts = []; rehash(removed);
  await assert.rejects(verifyServiceHistory(removed), /INVENTORY/);
  const changed = structuredClone(original); changed.summary.bytes_returned++; rehash(changed);
  await assert.rejects(verifyServiceHistory(changed), /REPLAY/);
  const stronger = structuredClone(original); (stronger.summary.claims as Wire).host_uptime_verified = true; rehash(stronger);
  await assert.rejects(verifyServiceHistory(stronger), /REPLAY/);
  const missing = { ...s.input, events: [] }; await assert.rejects(createServiceHistory({ ...missing, cut: await sealServiceCut(missing, s.observer, t(5000)) }), /WITHOUT_EVENT/);
  const future = { ...s.input }; await assert.rejects(createServiceHistory({ ...future, cut: await sealServiceCut(future, s.observer, t(1020)) }), /RECEIPT_AFTER_CUT/);
});

test('history crossing remains an opaque RECEIVE/HOLD candidate with a verified portable reference', async () => {
  const s = await setup(), i = await issue(s); await answer(s, i); const h = await snapshot(s, 5000);
  const crossing = await sealServiceHistoryCrossing(h, s.observer, s.policy.observer.world_id, t(5000));
  assert.deepEqual((await verifyServiceHistoryCrossing(crossing, h)).summary, h.summary);
  assert.deepEqual(crossing.requested_effect, { kind: 'candidate-ingress', authority: 'receiver-local' });
  const other = await snapshot(s, 5001); await assert.rejects(verifyServiceHistoryCrossing(crossing, other), /REFERENCE_MISMATCH/);
});

test('fresh CLI verifies relocated public history without artifact, host keys, Python or mathematical modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-serving-portable-'));
  try {
    await cp(join(root, 'src'), join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    for (const path of ['src/useful_work/algorithm.ts', 'src/useful_work/merkle_native/worker.ts', 'src/useful_work/worker.ts']) await rm(join(dir, path));
    await writeFile(join(dir, 'history.json'), canonicalBytes(fixture.history));
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_008.ts', 'verify', 'history.json', '--out', 'verified'], dir);
    assert.equal(result.code, 0, result.stderr); const saved = JSON.parse(await readFile(join(dir, 'verified/history.json'), 'utf8'));
    assert.equal(saved.history_id, fixture.history.history_id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('008 live HTTP demo records in-window bytes, late answer, failed connection and unknown slot, with durable HOLD', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-serving-http-'));
  try {
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_008.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--out', join(dir, 'demo')]);
    assert.equal(result.code, 0, result.stderr);
    const h = await verifyServiceHistory(JSON.parse(await readFile(join(dir, 'demo/history/history.json'), 'utf8')));
    assert.deepEqual(h.summary.schedule_accounting, { planned_slots: 4, issued_slots: 3, answered_slots: 2, verified_chunk_slots: 2,
      in_window_observed_slots: 1, in_window_verified_slots: 1, schedule_denominator_known: true });
    const old = await verifyServiceHistory(JSON.parse(await readFile(join(dir, 'demo/expired-snapshot.json'), 'utf8')));
    assert.equal(old.summary.slots[1].status, 'EXPIRED'); assert.equal(h.summary.slots[1].status, 'ANSWERED');
    assert.equal(h.receipts.at(-1)!.extensions.useful_work_service.claims.response_observed, false);
    await checkOracle(h);
    const input = JSON.parse(await readFile(join(dir, 'demo/history-input.json'), 'utf8')); assert.equal((await createServiceHistory(input)).history_id, h.history_id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
