import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, sealCrossingEnvelope } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { claims } from '../src/useful_work/challenge/exchange.ts';
import { executeNativeJob, nativeOrganSpec, answerNativeChallenge } from '../src/useful_work/merkle_native/worker.ts';
import { inspectNativeWork, nativeMessageSpec, sealNativeMessage } from '../src/useful_work/merkle_native/exchange.ts';
import type { NativeChallenge } from '../src/useful_work/merkle_native/exchange.ts';
import { verifyNativeChallenge } from '../src/useful_work/merkle_native/verifier.ts';
import { nativeTypescriptChecker } from '../src/useful_work/merkle_native/typescript_checker.ts';
import { nativePythonChecker } from '../src/useful_work/merkle_native/python_checker.ts';
import { nativeReceipt } from '../src/useful_work/merkle_native/receipt.ts';
import { verifyAudit } from '../src/useful_work/audit/accumulator.ts';
import { CLOCK_CONTRACT, CLOCK_LAWS, expectedCrossingId, iso, sealClockMessage } from '../src/useful_work/audit_clock/wire.ts';
import { deriveSampleIndices } from '../src/useful_work/challenge/commitment.ts';
import type { Wire } from '../src/useful_work/audit_clock/wire.ts';
import { inspectPlan, parsePolicy, planId, publishPlan, scheduleSlot } from '../src/useful_work/audit_clock/policy.ts';
import { emitRandomness, issueScheduledChallenge, observe, scheduledNonce } from '../src/useful_work/audit_clock/provenance.ts';
import { appendHistory, createHistory, historyId, sealHistoryCut, verifyHistory } from '../src/useful_work/audit_clock/history.ts';
import { sealHistoryCrossing, verifyHistoryCrossing } from '../src/useful_work/audit_clock/transport.ts';
import type { AuditHistory, AuditPolicy, HistoryInput } from '../src/useful_work/audit_clock/types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const job = JSON.parse(await readFile(join(root, 'fixtures/useful-work-001-golden.json'), 'utf8')).job;
const epoch = Date.parse('2026-10-05T00:00:00.000Z');
const t = (n: number) => iso(epoch + n);
async function setup(rounds = 8) {
  const result = executeNativeJob(job), [worker, planner, provider, challenger, observer] = await Promise.all(Array.from({ length: 5 }, () => generateP256KeyPair()));
  const work = await sealOpaqueOrganCrossing(nativeOrganSpec(result.manifest, result.tree.header, t(0)), worker);
  const context = await inspectNativeWork(work, canonicalBytes(job));
  const policy: AuditPolicy = { schema: 'useful-work.audit-plan/v1', result_id: context.result_id, work_crossing_id: work.crossing_id, job_spec_hash: context.header.job_spec_hash,
    declared_at: t(0), sample_count: 4, expires_at: t(0), schedule: { starts_at: t(1000), cadence_ms: 1000, rounds, issue_window_ms: 200, response_window_ms: 500 },
    randomness_rule: { schema: 'signed-external-event/v1', source_world: 'world:test-external-provider', public_key: provider.publicKeyJwk, stream_id: 'test-source-stream', first_sequence: 40 },
    challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1', challenger: { world_id: 'world:test-challenger', public_key: challenger.publicKeyJwk }, observer: { world_id: 'world:test-clock-observer', public_key: observer.publicKeyJwk } };
  policy.expires_at = scheduleSlot(policy, rounds - 1).response_deadline;
  const plan = await publishPlan(policy, planner), p = await inspectPlan(plan);
  const publication = await observe(plan, 'PLAN_PUBLISHED', null, plan.crossing_id, observer, t(1));
  const input: Omit<HistoryInput, 'cut'> = { job_spec: job, work, plan, publication, events: [], issues: [], responses: [], receipts: [], observations: [], prior_cuts: [] };
  return { result, worker, planner, provider, challenger, observer, policy, p, context, plan, input };
}
type Setup = Awaited<ReturnType<typeof setup>>;
async function issue(s: Setup, index: number, value = (index + 1).toString(16).padStart(64, '0')) {
  const event = await emitRandomness(s.plan, index, s.provider, t(1010 + index * 1000), value);
  const issued = await issueScheduledChallenge(s.context, s.plan, s.input.publication, event, s.challenger);
  s.input.events.push(event); s.input.issues.push(issued);
  s.input.observations.push(await observe(s.plan, 'ISSUE_SEEN', index, issued.issuance.crossing_id, s.observer, t(1020 + index * 1000)));
  return { event, ...issued };
}
async function answer(s: Setup, issued: Awaited<ReturnType<typeof issue>>, index: number, seenAt = 1040 + index * 1000, mode = 'honest') {
  const response = await answerNativeChallenge(s.context, issued.challenge, s.result.tree.bytes, s.worker, t(1030 + index * 1000));
  s.input.responses.push(response); s.input.observations.push(await observe(s.plan, 'RESPONSE_SEEN', index, response.crossing_id, s.observer, t(seenAt)));
  const checker = mode === 'offline' ? nativePythonChecker({ executable: '/missing/python' }) : mode === 'mutant' ? async (...args: Parameters<typeof nativeTypescriptChecker>) => {
    const checked = await nativeTypescriptChecker(...args); checked.samples[0].final_real_q = (BigInt(checked.samples[0].final_real_q) + 1n).toString(); return checked;
  } : nativeTypescriptChecker;
  const report = await verifyNativeChallenge(s.context, issued.challenge, response, checker);
  const receipt = await nativeReceipt(report, await generateP256KeyPair(), t(seenAt + 1), { world_id: 'world:test-verifier', receiver_particular: 'particular:test-verifier' });
  s.input.receipts.push(receipt); return { response, receipt, report };
}
const snapshot = async (s: Setup, at: number) => createHistory({ ...s.input, cut: await sealHistoryCut(s.input, s.observer, t(at)) });
function rehash(h: AuditHistory) { const { history_id: _, ...body } = h; h.history_id = historyId(body); return h; }
async function child(args: string[], cwd = root) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; }); p.once('error', reject); p.once('close', code => resolveResult({ code, stdout, stderr }));
  });
}

test('golden signed history matches independently derived plan/slot/full-challenge identities and all scheduled slots', async () => {
  const { history, expected: e } = JSON.parse(await readFile(join(root, 'fixtures/useful-work-006-golden.json'), 'utf8'));
  const { history: rebuilt } = await verifyHistory(history);
  assert.equal(rebuilt.history_id, 'useful-work-audit-history-v1:1574bc5ec739c69cba75eee071b10b2dcdd8f89905d4762513fcd78f7b601708');
  assert.equal(rebuilt.summary.plan_id, e.plan_id);
  assert.deepEqual(rebuilt.summary.slots.map(s => s.status), e.statuses);
  for (const field of ['planned_slots', 'issued_slots', 'answered_slots', 'completed_observation_slots'] as const) assert.equal(rebuilt.summary.schedule_accounting[field], e[field]);
  const policy = (await inspectPlan(rebuilt.plan)).policy;
  for (const [index, issue] of rebuilt.issues.entries()) {
    const v = e.challenge_vectors[index];
    assert.deepEqual(scheduleSlot(policy, v.slot.index), v.slot); assert.equal(issue.challenge.crossing_id, v.challenge_id);
    assert.equal(claims(issue.challenge).merkle_challenge.nonce, v.nonce);
    assert.deepEqual(deriveSampleIndices(policy.work_crossing_id, v.challenge_id, 12, policy.sample_count), v.indices);
  }
});

test('independent Python clock derivation cross-checks 64 generated policies including windows, source sequence and sample sizes', async () => {
  const s = await setup(), vectors: any[] = [], expected: any[] = [];
  let state = 0x6006;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  for (let n = 0; n < 64; n++) {
    const p = structuredClone(s.policy); p.sample_count = random() % 12 + 1; p.schedule.rounds = random() % 256 + 1;
    p.schedule.cadence_ms = random() % 86_400_000 + 1; p.schedule.issue_window_ms = random() % 86_400_000 + 1;
    p.schedule.response_window_ms = random() % 86_400_000 + 1; p.randomness_rule.first_sequence = random();
    p.expires_at = scheduleSlot(p, p.schedule.rounds - 1).response_deadline; parsePolicy(p);
    const slot = scheduleSlot(p, random() % p.schedule.rounds), at = iso(Date.parse(slot.scheduled_at) + random() % p.schedule.issue_window_ms);
    const event_id = 'relatte-crossing-v0:' + createHash('sha256').update('generated-clock-event-' + n).digest('hex');
    const context = { plan: s.plan, policy: p, plan_id: planId(p) }, nonce = scheduledNonce(context, slot.index, event_id);
    const payload: NativeChallenge = { schema: 'useful-work.merkle-challenge/v1', work_crossing_id: p.work_crossing_id, result_id: p.result_id, sample_count: p.sample_count, nonce };
    const challenge_id = expectedCrossingId(nativeMessageSpec('challenge', payload, at, p.challenger.world_id), p.challenger.public_key);
    vectors.push({ policy: p, event_id, slot_index: slot.index, emitted_at: at, population: 12 });
    expected.push({ plan_id: context.plan_id, slot, nonce, challenge_id, indices: deriveSampleIndices(p.work_crossing_id, challenge_id, 12, p.sample_count) });
  }
  const output = await new Promise<string>((resolveOutput, reject) => {
    const p = spawn('python3', ['-B', 'examples/useful-work-006/clock_vectors.py'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; }); p.once('error', reject);
    p.once('close', code => code === 0 ? resolveOutput(stdout) : reject(new Error(stderr))); p.stdin.end(JSON.stringify(vectors));
  });
  assert.deepEqual(JSON.parse(output), expected);
});

test('signed policy fixes result/work/job, slot denominator, cadence, windows and derivation before any challenge', async () => {
  const s = await setup(), p = await inspectPlan(s.plan);
  assert.equal(p.plan_id, planId(s.policy)); assert.deepEqual(p.policy, s.policy);
  assert.equal(scheduleSlot(s.policy, 7).response_deadline, s.policy.expires_at);
  assert.equal(scheduleSlot(s.policy, 7).expected_randomness_sequence, 47);
  assert.notEqual(scheduleSlot(s.policy, 0).slot_id, scheduleSlot(s.policy, 1).slot_id);
  assert.equal(planId(Object.fromEntries(Object.entries(s.policy).reverse()) as unknown as AuditPolicy), p.plan_id);
  const changed = structuredClone(s.policy); changed.sample_count++;
  assert.notEqual(planId(changed), p.plan_id);
  const h = await snapshot(s, 2); assert.equal(h.summary.slots.length, 8); assert.equal(h.summary.status_counts.PLANNED, 8);
  assert.equal(h.summary.evidence_accumulator, null); assert.equal(h.summary.schedule_accounting.schedule_denominator_known, true);
  assert.deepEqual((await verifyHistory(JSON.parse(canonicalBytes(h).toString()))).history, h);
});

test('publication and entropy chronology are attributable, required and explicit; backdated policy alone is insufficient', async () => {
  const s = await setup();
  await assert.rejects(observe(s.plan, 'PLAN_PUBLISHED', null, s.plan.crossing_id, s.observer, t(1000)), /PUBLICATION_MUST_PRECEDE_SCHEDULE/);
  await assert.rejects(emitRandomness(s.plan, 0, s.provider, t(999)), /RANDOMNESS_BEFORE_SLOT/);
  const e = await emitRandomness(s.plan, 0, s.provider, t(1010));
  await assert.rejects(issueScheduledChallenge(s.context, s.plan, null, e, s.challenger), /UNSUPPORTED_TYPE|INVALID_OPAQUE_SIGNATURE/);
  const i = await issue(s, 0); s.input.publication = null;
  await assert.rejects(snapshot(s, 1100), /PUBLICATION_REQUIRED/);
  assert.ok(i.challenge.crossing_id); assert.equal((await snapshot(await setup(), 2)).summary.claims.objective_time_verified, false);
});

test('same signed event and policy deterministically derive one challenge identity; issuer metadata cannot grind samples', async () => {
  const s = await setup(), i = await issue(s, 0);
  const second = await issueScheduledChallenge(s.context, s.plan, s.input.publication, i.event, s.challenger);
  assert.equal(second.challenge.crossing_id, i.challenge.crossing_id); assert.equal(second.issuance.crossing_id, i.issuance.crossing_id);
  assert.equal(claims(i.challenge).merkle_challenge.nonce, scheduledNonce(s.p, 0, i.event.crossing_id));
  for (const field of ['created_at', 'source_particular', 'source_history_head', 'parents'] as const) {
    const changed = structuredClone(i.challenge); changed[field] = field === 'created_at' ? t(1011) : field === 'parents' ? [s.plan.crossing_id] : 'different';
    const altered = await sealCrossingEnvelope(changed, s.challenger); s.input.issues[0] = { issuance: i.issuance, challenge: altered };
    await assert.rejects(snapshot(s, 1100), /SCHEDULED_CHALLENGE_DERIVATION_MISMATCH/);
  }
  const payload = structuredClone(claims(i.challenge).merkle_challenge) as NativeChallenge; payload.nonce = 'f'.repeat(64);
  s.input.issues[0] = { issuance: i.issuance, challenge: await sealNativeMessage('challenge', payload, s.challenger, i.event.created_at, s.policy.challenger.world_id) };
  await assert.rejects(snapshot(s, 1100), /SCHEDULED_CHALLENGE_DERIVATION_MISMATCH/);
});

test('source/key/stream/sequence and exact slot bindings are verified, not source labels alone', async () => {
  const s = await setup(), i = await issue(s, 0), other = await issue(s, 1);
  const foreign = await sealClockMessage('randomness', claims(i.event).audit_clock_randomness, await generateP256KeyPair(), s.policy.randomness_rule.source_world, i.event.created_at);
  s.input.events[0] = foreign; await assert.rejects(snapshot(s, 2500), /CLOCK_SIGNER_MISMATCH/); s.input.events[0] = i.event;
  const changed = structuredClone(claims(i.issuance).audit_clock_issuance); changed.randomness_event_id = other.event.crossing_id;
  s.input.issues[0].issuance = await sealClockMessage('issuance', changed, s.challenger, s.policy.challenger.world_id, other.event.created_at);
  await assert.rejects(snapshot(s, 2500), /SCHEDULED_CHALLENGE_DERIVATION_MISMATCH|ISSUANCE_SLOT_BINDING_MISMATCH/);
  s.input.issues[0] = i;
  const wrongSequence = structuredClone(claims(i.event).audit_clock_randomness); wrongSequence.sequence = 39;
  s.input.events[0] = await sealClockMessage('randomness', wrongSequence, s.provider, s.policy.randomness_rule.source_world, i.event.created_at);
  await assert.rejects(snapshot(s, 2500), /RANDOMNESS_SEQUENCE_OUTSIDE_PLAN/);
});

test('one observed history distinguishes all lifecycle states without a computational or guilt verdict', async () => {
  const s = await setup(); await answer(s, await issue(s, 0), 0); await issue(s, 1); await issue(s, 5);
  s.input.observations.push(await observe(s.plan, 'MISS_REPORTED', 2, null, s.observer, t(3300)));
  const h = await snapshot(s, 6500), summary = h.summary;
  assert.deepEqual(summary.slots.map(s => s.status), ['ANSWERED', 'EXPIRED', 'MISSED', 'WITHHELD / UNKNOWN', 'WITHHELD / UNKNOWN', 'ISSUED', 'PLANNED', 'PLANNED']);
  assert.deepEqual(summary.status_counts, { PLANNED: 2, ISSUED: 1, ANSWERED: 1, MISSED: 1, EXPIRED: 1, 'WITHHELD / UNKNOWN': 2 });
  assert.equal(summary.schedule_accounting.planned_slots, 8); assert.equal(summary.schedule_accounting.completed_observation_slots, 1);
  assert.equal(summary.schedule_accounting.slots_without_complete_mathematical_observation, 7);
  assert.equal(summary.evidence_accumulator!.summary.conditional_model, null);
  for (const field of ['guilt_asserted', 'nonresponse_proves_computation_failure', 'observed_history_complete', 'authority_asserted', 'compute_time_inferred'] as const) assert.equal(summary.claims[field], false);
  for (const law of CLOCK_LAWS) assert.ok(summary.laws.includes(law));
});

test('unissued/unanswered slots survive even when there are zero successful receipts', async () => {
  const s = await setup(), empty = await snapshot(s, 9000);
  assert.equal(empty.summary.status_counts['WITHHELD / UNKNOWN'], 8); assert.equal(empty.summary.evidence_accumulator, null);
  assert.equal(empty.summary.schedule_accounting.slots_without_complete_mathematical_observation, 8);
  await issue(s, 0); const h = await snapshot(s, 9000);
  assert.equal(h.summary.slots[0].status, 'EXPIRED'); assert.equal(h.summary.schedule_accounting.issued_slots_without_observed_response, 1);
});

test('a late authenticated answer changes the current status while retaining the signed expired snapshot and late timing claim', async () => {
  const s = await setup(), issued = await issue(s, 0), expired = await snapshot(s, 1800);
  assert.equal(expired.summary.slots[0].status, 'EXPIRED');
  const before = { responses: s.input.responses.length, receipts: s.input.receipts.length, observations: s.input.observations.length };
  await answer(s, issued, 0, 1900);
  s.input.prior_cuts.push(expired.cut);
  const cut = await sealHistoryCut(s.input, s.observer, t(2000));
  const additions = { responses: s.input.responses.slice(before.responses), receipts: s.input.receipts.slice(before.receipts), observations: s.input.observations.slice(before.observations) };
  const later = await appendHistory(expired, additions, cut);
  assert.equal(later.summary.slots[0].status, 'ANSWERED'); assert.equal(later.summary.slots[0].response_window_observations[0].within_window, false);
  assert.deepEqual(later.prior_cuts, [expired.cut]); assert.equal(later.summary.observer_cuts.length, 2);
  assert.deepEqual(later, await createHistory({ ...s.input, cut }));
  assert.equal((await verifyHistory(expired)).history.summary.slots[0].status, 'EXPIRED');
});

test('signed absence observations are retained beside conflicting positive observations and are never universal absence proofs', async () => {
  const s = await setup(), i = await issue(s, 0);
  const miss = await observe(s.plan, 'MISS_REPORTED', 0, null, s.observer, t(1300)); s.input.observations.push(miss);
  const h = await snapshot(s, 1400);
  assert.equal(h.summary.slots[0].status, 'ISSUED'); assert.deepEqual(h.summary.slots[0].conflicting_absence_reports, [miss.crossing_id]);
  assert.ok(h.summary.slots[0].observation_ids.includes(miss.crossing_id)); assert.ok(i.challenge.crossing_id);
  await assert.rejects(observe(s.plan, 'MISS_REPORTED', 0, null, s.observer, t(1200)), /INVALID_ABSENCE_OBSERVATION/);
});

test('deleting or inventing records is detectable against the signed inventory even with a recomputed history hash', async () => {
  const s = await setup(); await answer(s, await issue(s, 0), 0); const h = await snapshot(s, 1100);
  const missing = structuredClone(h); missing.responses = []; missing.receipts = []; missing.observations = missing.observations.slice(0, 1); rehash(missing);
  await assert.rejects(verifyHistory(missing), /OBSERVER_INVENTORY_MISMATCH/);
  const totals = structuredClone(h); totals.summary.schedule_accounting.planned_slots = 1; rehash(totals);
  await assert.rejects(verifyHistory(totals), /HISTORY_SUMMARY_MISMATCH/);
  const invented = structuredClone(h); invented.cut.signing.signature = 'A'.repeat(86); rehash(invented);
  await assert.rejects(verifyHistory(invented), /INVALID_OPAQUE_SIGNATURE/);
  const wrongObserver = await sealClockMessage('cut', claims(h.cut).audit_clock_cut, await generateP256KeyPair(), s.policy.observer.world_id, h.cut.created_at);
  await assert.rejects(createHistory({ ...s.input, cut: wrongObserver }), /CLOCK_SIGNER_MISMATCH/);
});

test('every replay is authenticated and retained while signatures over the same claim create no new slots or observations', async () => {
  const s = await setup(), i = await issue(s, 0), a = await answer(s, i, 0);
  s.input.events.push(i.event); s.input.issues.push({ issuance: i.issuance, challenge: i.challenge }); s.input.responses.push(a.response); s.input.receipts.push(a.receipt); s.input.observations.push(s.input.observations[0]);
  const h = await snapshot(s, 1100);
  assert.deepEqual(h.summary.replays, { events: 1, issues: 1, responses: 1, receipts: 1, observations: 1 });
  assert.equal(h.summary.schedule_accounting.unique_challenges, 1); assert.equal(h.summary.evidence_accumulator!.summary.unique_receipt_count, 1);
  const bad = structuredClone(s.input.events.at(-1)!); bad.signing.signature = 'A'.repeat(86); s.input.events[s.input.events.length - 1] = bad;
  await assert.rejects(snapshot(s, 1100), /INVALID_OPAQUE_SIGNATURE/);
  s.input.events[s.input.events.length - 1] = i.event;
  const badReceipt = structuredClone(a.receipt); badReceipt.signing.signature = 'A'.repeat(86); s.input.receipts[s.input.receipts.length - 1] = badReceipt;
  await assert.rejects(snapshot(s, 1100), /INVALID_RECEIPT_SIGNATURE/);
});

test('source equivocation forks one slot, and reused event values are visible without creating independent scheduled rounds', async () => {
  const s = await setup(), first = await issue(s, 0), second = await issue(s, 0, 'f'.repeat(64));
  await answer(s, first, 0); await answer(s, second, 0); await issue(s, 1, 'f'.repeat(64));
  const h = await snapshot(s, 2500);
  assert.equal(h.summary.slots[0].randomness_equivocation, true); assert.equal(h.summary.slots[0].challenge_ids.length, 2);
  assert.equal(h.summary.schedule_accounting.planned_slots, 8); assert.equal(h.summary.schedule_accounting.completed_observation_slots, 1);
  assert.equal(h.summary.schedule_accounting.unique_challenges, 3);
  assert.deepEqual(h.summary.randomness_reused_values[0].slot_indices, [0, 1]);
  assert.equal(h.summary.claims.randomness_unpredictability_verified, false); assert.equal(h.summary.evidence_accumulator!.summary.conditional_model, null);
});

test('an authenticated response is distinct from a complete mathematical observation and from matching mathematics', async () => {
  const s = await setup(); const offline = await answer(s, await issue(s, 0), 0, 1040, 'offline');
  const negative = await answer(s, await issue(s, 1), 1, 2040, 'mutant'); const h = await snapshot(s, 2100);
  assert.equal(offline.report.checked_count, 0); assert.equal(negative.receipt.kind, 'FAILED'); assert.equal(negative.report.checked_count, 4);
  assert.equal(h.summary.slots[0].status, 'ANSWERED'); assert.equal(h.summary.slots[0].has_mathematical_observation, false);
  assert.equal(h.summary.slots[1].status, 'ANSWERED'); assert.equal(h.summary.slots[1].has_mathematical_observation, true);
  assert.equal(h.summary.schedule_accounting.completed_observation_slots, 1); assert.equal(h.summary.evidence_accumulator!.summary.contradictions.length, 1);
});

test('late source events remain visible but cannot issue a policy-valid challenge after the issue window', async () => {
  const s = await setup(), event = await emitRandomness(s.plan, 0, s.provider, t(1300)); s.input.events.push(event);
  await assert.rejects(issueScheduledChallenge(s.context, s.plan, s.input.publication, event, s.challenger), /RANDOMNESS_AFTER_ISSUE_WINDOW/);
  const h = await snapshot(s, 1400); assert.equal(h.summary.slots[0].event_ids.length, 1); assert.equal(h.summary.slots[0].status, 'WITHHELD / UNKNOWN');
  s.input.observations.push(await observe(s.plan, 'UNAVAILABLE_REPORTED', 0, null, s.observer, t(1500), 'availability unknown'));
  assert.equal((await snapshot(s, 1500)).summary.slots[0].status_basis, 'ATTRIBUTED_UNAVAILABILITY_REPORT_WITHOUT_INFERRED_INTENT');
});

test('historical signed cuts cannot reorder time, remove their inventory, or refer to dependencies absent at that cut', async () => {
  const s = await setup(), old = await snapshot(s, 2); s.input.prior_cuts.push(old.cut); await issue(s, 0);
  const h = await snapshot(s, 1100); assert.equal(h.summary.observer_cuts.length, 2);
  const removed = structuredClone(h); removed.prior_cuts = []; rehash(removed);
  await assert.rejects(verifyHistory(removed), /OBSERVER_INVENTORY_MISMATCH/);
  const backwardsCut = await sealHistoryCut(s.input, s.observer, t(1));
  await assert.rejects(appendHistory(old, {}, backwardsCut), /OBSERVER_CUT_MOVED_BACKWARDS/);
  const futureObservation = await observe(s.plan, 'ISSUE_SEEN', 0, s.input.issues[0].issuance.crossing_id, s.observer, t(1200)); s.input.observations.push(futureObservation);
  await assert.rejects(snapshot(s, 1100), /OBSERVATION_OUTSIDE_HISTORY_CUT/);
  s.input.observations.pop();
  const falsePrefix = { ...s.input, events: [] }, cut = await sealHistoryCut(falsePrefix, s.observer, t(1100));
  await assert.rejects(createHistory({ ...falsePrefix, cut }), /ISSUANCE_RANDOMNESS_NOT_OBSERVED/);
  const valid = await setup(); await issue(valid, 0);
  const missingEventCut = await sealHistoryCut({ ...valid.input, events: [] }, valid.observer, t(1100));
  valid.input.prior_cuts.push(missingEventCut);
  await assert.rejects(snapshot(valid, 1101), /CUT_INVENTORY_DEPENDENCY_MISSING/);
});

test('response presence preserves malformed answers and scoped negative receipts; observer subjects cannot cross slots', async () => {
  const s = await setup(), i = await issue(s, 0);
  const response = await sealNativeMessage('response', { schema: 'useful-work.merkle-response/v1', work_crossing_id: s.context.crossing.crossing_id,
    challenge_id: i.challenge.crossing_id, result_id: s.context.result_id, samples: [] }, s.worker, t(1030), s.context.crossing.source_world);
  const report = await verifyNativeChallenge(s.context, i.challenge, response, nativeTypescriptChecker);
  s.input.responses.push(response); s.input.receipts.push(await nativeReceipt(report, await generateP256KeyPair(), t(1040), { world_id: 'world:invalid-response-checker', receiver_particular: 'particular:invalid-response-checker' }));
  const h = await snapshot(s, 1100); assert.equal(h.summary.slots[0].status, 'ANSWERED'); assert.equal(h.summary.slots[0].has_mathematical_observation, false);
  assert.equal(h.summary.evidence_accumulator!.summary.coverage.observed_count, 0); assert.deepEqual(report.errors, ['SAMPLE_SET_MISMATCH']);
  s.input.observations.push(await observe(s.plan, 'RESPONSE_SEEN', 1, response.crossing_id, s.observer, t(2100)));
  await assert.rejects(snapshot(s, 2200), /OBSERVATION_SUBJECT_MISMATCH/);
});

test('malformed policy, unsupported rules, private keys, invalid clocks, excess records and changed contexts fail explicitly', async () => {
  const s = await setup();
  assert.throws(() => parsePolicy({ ...s.policy, challenge_rule: 'unknown' }), /UNSUPPORTED_AUDIT_POLICY/);
  assert.throws(() => parsePolicy({ ...s.policy, expires_at: t(9999) }), /PLAN_EXPIRY_MISMATCH/);
  assert.throws(() => parsePolicy({ ...s.policy, declared_at: s.policy.schedule.starts_at }), /PLAN_MUST_PRECEDE_SCHEDULE/);
  assert.throws(() => parsePolicy({ ...s.policy, schedule: { ...s.policy.schedule, rounds: 257 } }), /INVALID_AUDIT_ROUNDS/);
  assert.throws(() => parsePolicy({ ...s.policy, randomness_rule: { ...s.policy.randomness_rule, public_key: { ...s.provider.publicKeyJwk, d: 'private' } } }), /INVALID_CLOCK_PUBLIC_KEY/);
  await assert.rejects(publishPlan(s.policy, s.provider), /EXTERNAL_RANDOMNESS_KEY_REQUIRED/);
  await assert.rejects(publishPlan({ ...s.policy, observer: { ...s.policy.observer, public_key: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'A'.repeat(43) } } }, s.planner), /INVALID_CLOCK_PUBLIC_KEY/);
  assert.throws(() => iso(NaN), /Invalid time value/);
  const tooMany = { ...s.input, events: Array(1025).fill({}) }; await assert.rejects(createHistory({ ...tooMany, cut: await sealHistoryCut(s.input, s.observer, t(2)) }), /HISTORY_RECORD_COUNT_LIMIT/);
  await assert.rejects(createHistory({ ...s.input, job_spec: { ...job, seed: 2 }, cut: await sealHistoryCut(s.input, s.observer, t(2)) }), /JOB_HASH_MISMATCH/);
  const alteredPolicy = { ...s.policy, result_id: 'useful-work-merkle-result-v1:' + '0'.repeat(64) }, plan = await publishPlan(alteredPolicy, s.planner);
  const input = { ...s.input, plan, publication: null }; await assert.rejects(createHistory({ ...input, cut: await sealHistoryCut(input, s.observer, t(2)) }), /PLAN_WORK_MISMATCH/);
});

test('scheduled plan/history survive opaque transport with sovereign HOLD and no ownership or admission', async () => {
  const s = await setup(), h = await snapshot(s, 9000), temp = await mkdtemp(join(tmpdir(), 'uw006-holder-'));
  try {
    const crossing = await sealHistoryCrossing(h, await generateP256KeyPair(), t(9001));
    assert.deepEqual((await verifyHistoryCrossing(crossing, h)).history, h);
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:006-holder', receiver_particular: 'particular:006-holder', contract_ref: CLOCK_CONTRACT });
    await receiver.receive(s.plan, t(9002)); await receiver.dispose(s.plan.crossing_id, 'HOLD', t(9003));
    await receiver.receive(crossing, t(9004)); await receiver.dispose(crossing.crossing_id, 'HOLD', t(9005));
    assert.equal(receiver.snapshot().held.length, 2); assert.equal(claims(crossing).ownership_asserted, false);
    const other = await snapshot(s, 9001); await assert.rejects(verifyHistoryCrossing(crossing, other), /HISTORY_CROSSING_REFERENCE_MISMATCH/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('real-clock demo retains planned/issued/final snapshots, standalone issuances, 005 export and portable later verification', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw006-demo-'));
  try {
    const out = join(temp, 'demo'), cli = 'src/useful_work/cli_006.ts';
    const run = await child([cli, 'demo', 'examples/useful-work-005/julia-audit.json', '--rounds', '4', '--samples', '4', '--out', out]); assert.equal(run.code, 0, run.stderr);
    const final = (await verifyHistory(JSON.parse(await readFile(join(out, 'history/history.json'), 'utf8')))).history;
    assert.equal(final.summary.schedule_accounting.planned_slots, 4); assert.equal(final.summary.schedule_accounting.completed_observation_slots, 2);
    assert.deepEqual(final.summary.slots.map(s => s.status), ['ANSWERED', 'ANSWERED', 'EXPIRED', 'WITHHELD / UNKNOWN']);
    assert.equal(final.summary.observer_cuts.length, 3);
    const planned = (await verifyHistory(JSON.parse(await readFile(join(out, 'snapshots/planned.json'), 'utf8')))).history; assert.equal(planned.summary.status_counts.PLANNED, 4);
    const audit = await verifyAudit(JSON.parse(await readFile(join(out, 'history/evidence-audit.json'), 'utf8'))); assert.equal(audit.audit_id, final.summary.evidence_accumulator!.audit_id);
    const collected = await child([cli, 'collect', join(out, 'history-input.json'), '--out', join(temp, 'collected')]); assert.equal(collected.code, 0, collected.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'collected/history.json'), 'utf8')).history_id, final.history_id);
    const issued = await child([cli, 'issue', join(out, 'prepared/delivery/work.json'), join(out, 'plan.json'), join(out, 'publication.json'), join(out, 'slot-0/randomness/event.json'), '--key', join(out, 'local-state/challenger-key.json'), '--out', join(temp, 'reissued')]); assert.equal(issued.code, 0, issued.stderr);
    const replayFile = JSON.parse(await readFile(join(temp, 'reissued/challenge.json'), 'utf8')); assert.ok(JSON.stringify(replayFile).includes(final.issues[0].challenge.crossing_id));
    const add = join(temp, 'empty-additions.json'); await writeFile(add, JSON.stringify({ schema: 'useful-work.audit-clock-additions/v1', events: [], issues: [], responses: [], receipts: [], observations: [] }));
    const appended = await child([cli, 'append', join(out, 'history/history.json'), add, '--key', join(out, 'local-state/observer-key.json'), '--out', join(temp, 'appended')]); assert.equal(appended.code, 0, appended.stderr);
    const larger = (await verifyHistory(JSON.parse(await readFile(join(temp, 'appended/history.json'), 'utf8')))).history; assert.equal(larger.prior_cuts.length, 3); assert.deepEqual(larger.summary.schedule_accounting, final.summary.schedule_accounting);
    await cp(join(out, 'history/history.json'), join(temp, 'history.json')); await cp(join(out, 'history/crossing.json'), join(temp, 'crossing.json')); await rm(out, { recursive: true });
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true }); await cp(join(root, 'package.json'), join(temp, 'package.json')); await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    for (const file of ['worker.ts', 'algorithm.ts', 'verifier.ts', 'merkle_native/worker.ts', 'merkle_native/typescript_checker.ts']) await rm(join(temp, 'src/useful_work', file));
    const later = await child([cli, 'verify', 'history.json', '--crossing', 'crossing.json', '--out', 'later'], temp); assert.equal(later.code, 0, later.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'later/history.json'), 'utf8')).history_id, final.history_id);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
