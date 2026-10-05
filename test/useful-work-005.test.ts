import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import type { P256KeyMaterial } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes, parseJob } from '../src/useful_work/job.ts';
import { claims } from '../src/useful_work/challenge/exchange.ts';
import { buildResult } from '../src/useful_work/merkle_native/result.ts';
import { executeNativeJob, nativeOrganSpec, answerNativeChallenge } from '../src/useful_work/merkle_native/worker.ts';
import { createNativeChallenge, inspectNativeWork, sealNativeMessage } from '../src/useful_work/merkle_native/exchange.ts';
import type { NativeChallenge, NativeContext, NativeResponse } from '../src/useful_work/merkle_native/exchange.ts';
import { verifyNativeChallenge } from '../src/useful_work/merkle_native/verifier.ts';
import type { NativeChecker, NativeReport } from '../src/useful_work/merkle_native/verifier.ts';
import { nativeReceipt } from '../src/useful_work/merkle_native/receipt.ts';
import { nativeTypescriptChecker } from '../src/useful_work/merkle_native/typescript_checker.ts';
import { NATIVE_PYTHON_SCRIPT, nativePythonChecker } from '../src/useful_work/merkle_native/python_checker.ts';
import { appendAudit, auditId, createAudit, MAX_AUDIT_SUBMISSIONS, verifyAudit } from '../src/useful_work/audit/accumulator.ts';
import type { AuditObject, AuditSubmission } from '../src/useful_work/audit/types.ts';
import { conditionalMissProbability } from '../src/useful_work/audit/model.ts';
import type { RandomnessModel } from '../src/useful_work/audit/model.ts';
import { AUDIT_CONTRACT, auditOrganSpec, verifyAuditCrossing } from '../src/useful_work/audit/transport.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const job = JSON.parse(await readFile(join(root, 'fixtures/useful-work-001-golden.json'), 'utf8')).job;
const at = '2026-10-05T00:00:00.000Z';
const time = (n: number) => new Date(Date.parse(at) + n).toISOString();
const model: RandomnessModel = { schema: 'useful-work.audit-randomness-model/v1',
  assumption: 'honest-independent-fresh-uniform-challenges-against-a-fixed-error-set', bad_entry_count: 1 };
async function worker(change?: (counts: number[]) => void) {
  const work = executeNativeJob(job), keys = await generateP256KeyPair();
  if (change) { const counts = [...work.tree.artifact.escape_counts]; change(counts); work.tree = buildResult(work.job, counts); work.manifest.result_id = work.tree.result_id; }
  const crossing = await sealOpaqueOrganCrossing(nativeOrganSpec(work.manifest, work.tree.header, at), keys);
  const context = await inspectNativeWork(crossing, work.artifacts['job-spec']);
  return { work, keys, context };
}
async function round(w: Awaited<ReturnType<typeof worker>>, k = 4, challengeValue?: unknown) {
  const challenger = await generateP256KeyPair();
  const challenge = challengeValue ?? await createNativeChallenge(w.context, k, challenger, at);
  const response = await answerNativeChallenge(w.context, challenge, w.work.tree.bytes, w.keys, at);
  return { context: w.context, work: w.context.crossing, challenge: challenge as Record<string, any>, response, challenger };
}
async function observation(r: Awaited<ReturnType<typeof round>>, label: string, keys?: P256KeyMaterial, checker: NativeChecker = nativeTypescriptChecker, n = 0) {
  const report = await verifyNativeChallenge(r.context, r.challenge, r.response, checker);
  const receipt = await nativeReceipt(report, keys ?? await generateP256KeyPair(), time(n), { world_id: `world:${label}`, receiver_particular: `particular:${label}` });
  return { work: r.work, challenge: r.challenge, response: r.response, receipt };
}
function rehash(a: AuditObject) { const { audit_id: _, ...body } = a; a.audit_id = auditId(body); return a; }
const union = (lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);
test('golden signed audit authenticates every exchange and matches separately derived exact aggregates', async () => {
  const { audit, expected: e } = JSON.parse(await readFile(join(root, 'fixtures/useful-work-005-golden.json'), 'utf8'));
  const rebuilt = await verifyAudit(audit), s = rebuilt.summary;
  assert.equal(rebuilt.audit_id, 'useful-work-audit-v1:27a5b130e900860283e257c05c22b91b84a101df4b867f3a4112ec20fb74a321');
  assert.equal(rebuilt.audit_id, e.audit_id); assert.equal(rebuilt.result_id, e.result_id);
  for (const field of ['submission_count', 'unique_receipt_count', 'replayed_receipt_submissions', 'unique_challenge_count', 'requested_indices', 'observed_indices'] as const) assert.deepEqual(s[field], e[field]);
  assert.deepEqual(s.per_index.map(p => ({ index: p.index, count: p.observation_count })), e.per_index_observation_counts);
  assert.equal(s.overlap.unique_challenge_sample_slots, e.unique_challenge_sample_slots);
  assert.equal(s.overlap.repeated_slots, e.repeated_slots);
  assert.deepEqual(s.overlap.indices_shared_by_challenges, e.indices_shared_by_challenges);
  assert.deepEqual(s.contradictions.filter(p => p.verifier_disagreement).map(p => p.index), e.verifier_disagreement_indices);
  assert.deepEqual(e.conditional_miss_fraction, { numerator: 8, denominator: 27 });
  assert.ok(Math.abs(s.conditional_model!.ex_ante_probability_no_sample_hits_fixed_bad_entry_set.numeric_approximation! - 8 / 27) < 1e-15);
  assert.deepEqual(await createAudit(audit.job_spec, audit.result_id, audit.submissions, audit.model), rebuilt);
});
async function child(args: string[], cwd = root): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; });
    p.once('error', reject); p.once('close', code => resolveResult({ code, stdout, stderr }));
  });
}

test('fresh challenges aggregate exact unions, overlap, per-index counts and durable incremental progress', async () => {
  const w = await worker(), keys = [await generateP256KeyPair(), await generateP256KeyPair()], submissions: AuditSubmission[] = [];
  let audit: AuditObject | null = null;
  for (let i = 0; i < 3; i++) {
    const r = await round(w), additions = [await observation(r, 'typescript', keys[0], nativeTypescriptChecker, i),
      await observation(r, 'python', keys[1], nativePythonChecker(), i)];
    submissions.push(...additions); audit = audit === null ? await createAudit(job, w.context.result_id, additions, model) : await appendAudit(audit, additions);
  }
  const reports = submissions.map(s => s.receipt.extensions.useful_work_native as NativeReport);
  const expected = union(reports.map(r => r.scope.indices)), s = audit!.summary;
  assert.deepEqual(s.requested_indices, expected); assert.deepEqual(s.proof_bound_indices, expected); assert.deepEqual(s.observed_indices, expected);
  assert.equal(s.unique_challenge_count, 3); assert.equal(s.unique_receipt_count, 6); assert.equal(s.overlap.unique_challenge_sample_slots, 12);
  assert.equal(s.overlap.repeated_slots, 12 - expected.length); assert.equal(s.diversity.verifier_keys.length, 2);
  for (const pixel of s.per_index) {
    const matching = reports.filter(r => r.scope.indices.includes(pixel.index));
    assert.equal(pixel.observation_count, matching.length);
    assert.equal(pixel.challenge_ids.length, new Set(matching.map(r => r.scope.challenge_id)).size);
    assert.deepEqual(pixel.observation_receipt_ids, submissions.filter(v => v.receipt.extensions.useful_work_native.scope.indices.includes(pixel.index)).map(v => v.receipt.receipt_id).sort());
  }
  assert.equal(s.progress.at(-1)!.observed_indices_so_far, expected.length);
  assert.deepEqual(await verifyAudit(JSON.parse(canonicalBytes(audit).toString())), audit);
  assert.deepEqual(await createAudit(job, w.context.result_id, submissions, model), audit);
});

test('receipt replay and real same-key rechecks add no new random draws or coverage', async () => {
  const w = await worker(), r = await round(w), keys = await generateP256KeyPair(), first = await observation(r, 'world', keys);
  const original = await createAudit(job, w.context.result_id, [first], model);
  const recheck = await observation(r, 'world', keys, nativeTypescriptChecker, 1);
  const audit = await appendAudit(original, [first, recheck]), s = audit.summary;
  assert.equal(s.submission_count, 3); assert.equal(s.unique_receipt_count, 2); assert.equal(s.replayed_receipt_submissions, 1);
  assert.equal(s.unique_challenge_count, 1); assert.equal(s.challenges[0].same_verifier_rechecks, 1);
  assert.deepEqual(s.same_verifier_rechecked_challenge_ids, [r.challenge.crossing_id]);
  assert.deepEqual(s.observed_indices, original.summary.observed_indices);
  assert.deepEqual(s.conditional_model, original.summary.conditional_model);
  assert.deepEqual(s.progress.slice(1).map(p => p.newly_observed_indices), [[], []]);
  for (const p of s.per_index) assert.equal(p.observation_count, 2);
  // A second valid ECDSA signature over the same claim ID is also a replay.
  const report = first.receipt.extensions.useful_work_native as NativeReport;
  const again = await nativeReceipt(report, keys, at, { world_id: first.receipt.world_id, receiver_particular: first.receipt.receiver_particular });
  assert.equal(again.receipt_id, first.receipt.receipt_id);
  const sameClaim = await appendAudit(original, [{ ...first, receipt: again }]);
  assert.equal(sameClaim.summary.unique_receipt_count, 1); assert.equal(sameClaim.summary.per_index[0].observation_count, 1);
});

test('every replayed receipt is still authenticated; invalid duplicates cannot hide behind a valid receipt ID', async () => {
  const w = await worker(), first = await observation(await round(w), 'world');
  const invalid = structuredClone(first); invalid.receipt.signing.signature = 'A'.repeat(86);
  await assert.rejects(createAudit(job, w.context.result_id, [first, invalid]), /INVALID_RECEIPT_SIGNATURE/);
  const a = await createAudit(job, w.context.result_id, [first]);
  await assert.rejects(appendAudit(a, [invalid]), /INVALID_RECEIPT_SIGNATURE/);
  const badChallenge = structuredClone(first); badChallenge.challenge.signing.signature = 'A'.repeat(86);
  await assert.rejects(createAudit(job, w.context.result_id, [first, badChallenge]), /INVALID_OPAQUE_SIGNATURE/);
  const badResponse = structuredClone(first); badResponse.response.signing.signature = 'A'.repeat(86);
  await assert.rejects(createAudit(job, w.context.result_id, [badResponse]), /INVALID_OPAQUE_SIGNATURE/);
});

test('world/key/source diversity describes attribution and runtime changes do not invent implementations or randomness', async () => {
  const w = await worker(), r = await round(w), keys = await generateP256KeyPair(), first = await observation(r, 'first-label', keys);
  const report = structuredClone(first.receipt.extensions.useful_work_native) as NativeReport;
  report.implementation!.runtime = 'another runtime claim';
  const renamed = await nativeReceipt(report, keys, time(1), { world_id: 'world:second-label', receiver_particular: 'particular:second-label' });
  const anotherKey = await nativeReceipt(report, await generateP256KeyPair(), time(2), { world_id: 'world:second-label', receiver_particular: 'particular:second-label' });
  const audit = await createAudit(job, w.context.result_id, [first, { ...first, receipt: renamed }, { ...first, receipt: anotherKey }], model), s = audit.summary;
  assert.equal(s.diversity.verifier_worlds.length, 2); assert.equal(s.diversity.verifier_keys.length, 2);
  assert.equal(s.diversity.implementations.length, 1); assert.equal(s.diversity.implementations[0].runtimes.length, 2);
  assert.equal(s.unique_challenge_count, 1); assert.deepEqual(s.conditional_model!.sample_sizes, [4]);
  assert.equal(s.claims.consensus_asserted, false); assert.equal(s.claims.authority_asserted, false);
  const keyMetadata = structuredClone(first); keyMetadata.receipt.signing.public_key.ext = true;
  assert.equal(await verifyReceipt(keyMetadata.receipt), true);
  assert.equal((await appendAudit(audit, [keyMetadata])).summary.diversity.verifier_keys.length, 2);
});

test('distinct challenge IDs with a reused nonce are recorded and excluded from the conditional independence model', async () => {
  const w = await worker(), first = await round(w), payload = claims(first.challenge).merkle_challenge as NativeChallenge;
  const reused = await sealNativeMessage('challenge', payload, first.challenger, time(1), first.challenge.source_world);
  assert.notEqual(reused.crossing_id, first.challenge.crossing_id);
  const second = await round(w, 4, reused), third = await round(w);
  const a = await createAudit(job, w.context.result_id, [await observation(first, 'a'), await observation(second, 'b'), await observation(third, 'c')], model);
  assert.equal(a.summary.unique_challenge_count, 3); assert.equal(a.summary.reused_nonces.length, 1);
  assert.deepEqual(a.summary.reused_nonces[0].challenge_ids, [first.challenge.crossing_id, reused.crossing_id].sort());
  assert.deepEqual(a.summary.conditional_model!.eligible_challenge_ids, [third.challenge.crossing_id]);
  assert.equal(a.summary.conditional_model!.excluded_challenges.length, 2);
  assert.equal(a.summary.conditional_model!.assumptions_verified, false);
  assert.deepEqual(a.summary.conditional_model!.sample_sizes, [4]);
});

test('the same artifact across workers is one audit subject; changed artifact identities fail explicitly', async () => {
  const a = await worker(), b = await worker(); assert.equal(a.context.result_id, b.context.result_id);
  const audit = await createAudit(job, a.context.result_id, [await observation(await round(a), 'a'), await observation(await round(b), 'b')]);
  assert.equal(audit.summary.diversity.worker_keys.length, 2); assert.equal(audit.summary.unique_challenge_count, 2);
  const changed = await worker(counts => { counts[0]++; });
  await assert.rejects(appendAudit(audit, [await observation(await round(changed, 12), 'changed')]), /AUDIT_RESULT_MISMATCH/);
  await assert.rejects(createAudit({ ...job, seed: 2 }, a.context.result_id, audit.submissions), /JOB_HASH_MISMATCH/);
});

test('offline and structurally failed receipts preserve requested/proof coverage without inventing mathematical observations', async () => {
  const w = await worker(), r = await round(w);
  const offline = await observation(r, 'offline', undefined, nativePythonChecker({ executable: '/missing/python' }));
  const audit = await createAudit(job, w.context.result_id, [offline], model);
  assert.equal(audit.summary.coverage.requested_count, 4); assert.equal(audit.summary.coverage.proof_bound_count, 4); assert.equal(audit.summary.coverage.observed_count, 0);
  assert.equal(audit.summary.per_index[0].observation_count, 0); assert.notEqual(audit.summary.per_index[0].committed_count, null);
  assert.deepEqual(audit.summary.conditional_model!.eligible_challenge_ids, []);
  assert.equal(audit.summary.conditional_model!.excluded_challenges[0].reasons[0], 'NO_COMPLETE_MATHEMATICAL_OBSERVATION');
  const payload = structuredClone(claims(r.response).merkle_response) as NativeResponse; payload.samples.pop();
  const response = await sealNativeMessage('response', payload, w.keys, at, r.response.source_world);
  const failed = await observation({ ...r, response }, 'failed');
  const bad = await createAudit(job, w.context.result_id, [failed]);
  assert.equal(bad.summary.coverage.requested_count, 4); assert.equal(bad.summary.coverage.proof_bound_count, 0); assert.equal(bad.summary.coverage.observed_count, 0);
  assert.deepEqual(bad.summary.receipts[0].errors, ['SAMPLE_SET_MISMATCH']);
});

test('signed receipt scope/evidence and positive proof claims are bound to actual authenticated exchanges', async () => {
  const w = await worker(), a = await round(w), b = await round(w), first = await observation(a, 'world');
  await assert.rejects(createAudit(job, w.context.result_id, [{ ...first, challenge: b.challenge, response: b.response }]), /AUDIT_RECEIPT_SCOPE_MISMATCH/);
  const report = structuredClone(first.receipt.extensions.useful_work_native) as NativeReport;
  report.evidence[0].worker.final_real_q = (BigInt(report.evidence[0].worker.final_real_q) + 1n).toString();
  report.evidence[0].matched = false; report.claims.sampled_computation_verified = false; report.errors = ['SAMPLED_COMPUTATION_MISMATCH'];
  const lying = await nativeReceipt(report, await generateP256KeyPair(), at, { world_id: 'world:liar', receiver_particular: 'particular:liar' });
  await assert.rejects(createAudit(job, w.context.result_id, [{ ...first, receipt: lying }]), /AUDIT_RESPONSE_EVIDENCE_MISMATCH/);
  const payload = structuredClone(claims(a.response).merkle_response) as NativeResponse; payload.samples[0].proof[0] = '0'.repeat(64);
  const response = await sealNativeMessage('response', payload, w.keys, at, a.response.source_world);
  const overclaim = structuredClone(first.receipt.extensions.useful_work_native) as NativeReport; overclaim.scope.response_id = response.crossing_id;
  const receipt = await nativeReceipt(overclaim, await generateP256KeyPair(), at, { world_id: 'world:overclaim', receiver_particular: 'particular:overclaim' });
  await assert.rejects(createAudit(job, w.context.result_id, [{ ...first, response, receipt }]), /AUDIT_UNSUPPORTED_RECEIPT_CLAIM/);
});

test('actual independent Python mutation localizes contradictions to one exact pixel; repetition cannot erase them', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw005-one-pixel-mutant-'));
  try {
    const w = await worker(), r = await round(w), first = await observation(r, 'typescript'), report = first.receipt.extensions.useful_work_native as NativeReport;
    const target = report.scope.indices[1]; await cp(NATIVE_PYTHON_SCRIPT, join(temp, 'merkle_result_v1.py'));
    const source = await readFile(join(root, 'independent/julia_q24.py'), 'utf8');
    const from = '        samples.append({"index": index, **orbit_evidence(real, imaginary, constant, job["iterations"])})'; assert.ok(source.includes(from));
    await writeFile(join(temp, 'julia_q24.py'), source.replace(from, from + `\n        if index == ${target}:\n            samples[-1]["final_real_q"] = str(int(samples[-1]["final_real_q"]) + 1)`));
    const originalPy = await observation(r, 'python', undefined, nativePythonChecker());
    const mutated = await observation(r, 'python-mutant', undefined, nativePythonChecker({ script: join(temp, 'merkle_result_v1.py') }));
    assert.equal(mutated.receipt.kind, 'FAILED');
    let audit = await createAudit(job, w.context.result_id, [first, originalPy, mutated], model);
    assert.deepEqual(audit.summary.contradictions.map(p => p.index), [target]);
    assert.equal(audit.summary.contradictions[0].verifier_disagreement, true);
    assert.deepEqual(audit.summary.contradictions[0].count_mismatch_receipt_ids, []); // terminal-state conflict only
    assert.equal(audit.summary.diversity.implementations.length, 3);
    const matches = [];
    for (let i = 1; i <= 5; i++) matches.push(await observation(r, 'later-matching-world', undefined, nativeTypescriptChecker, i));
    audit = await appendAudit(audit, matches);
    assert.deepEqual(audit.summary.contradictions.map(p => p.index), [target]);
    assert.equal(audit.summary.unique_challenge_count, 1); assert.equal(audit.summary.claims.consensus_asserted, false);
    assert.equal(audit.summary.claims.mathematics_recomputed_by_accumulator, false);
    const p = audit.summary.per_index.find(p => p.index === target)!;
    assert.equal(p.observation_count, 8); assert.equal(p.verifier_predictions.length, 2); assert.equal(p.nonmatching_receipt_ids.length, 1);
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:holder', receiver_particular: 'particular:holder', contract_ref: AUDIT_CONTRACT });
    const crossing = await sealOpaqueOrganCrossing(auditOrganSpec(audit.audit_id, audit.result_id, at), await generateP256KeyPair());
    await receiver.receive(crossing, at); await receiver.dispose(crossing.crossing_id, 'HOLD', at); const before = receiver.snapshot();
    assert.deepEqual(await verifyAuditCrossing(crossing, audit), audit); assert.deepEqual(receiver.snapshot(), before);
    assert.equal(receiver.getDispositionReceipt(crossing.crossing_id)?.semantic_effect, 'none');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('worker-state conflicts remain distinct from verifier disagreement, including unavailable checkers', async () => {
  const w = await worker(), r = await round(w), first = await observation(r, 'world');
  const payload = structuredClone(claims(r.response).merkle_response) as NativeResponse, target = payload.samples[0].index;
  payload.samples[0].final_real_q = (BigInt(payload.samples[0].final_real_q) + 1n).toString();
  const response = await sealNativeMessage('response', payload, w.keys, time(1), r.response.source_world);
  const failed = await observation({ ...r, response }, 'offline', undefined, nativePythonChecker({ executable: '/missing/python' }));
  const audit = await createAudit(job, w.context.result_id, [first, failed]);
  assert.deepEqual(audit.summary.contradictions.map(p => p.index), [target]);
  assert.equal(audit.summary.contradictions[0].verifier_disagreement, false); assert.equal(audit.summary.contradictions[0].worker_evidence_conflict, true);
  assert.equal(audit.summary.per_index.find(p => p.index === target)!.observation_count, 1);
});

test('count-versus-commitment disagreement does not falsely imply worker-versus-verifier disagreement', async () => {
  const w = await worker(counts => { counts[0]++; }), r = await round(w, 12), observationValue = await observation(r, 'world');
  const audit = await createAudit(job, w.context.result_id, [observationValue]);
  assert.deepEqual(audit.summary.contradictions.map(p => p.index), [0]);
  assert.deepEqual(audit.summary.contradictions[0].count_mismatch_receipt_ids, [observationValue.receipt.receipt_id]);
  assert.deepEqual(audit.summary.contradictions[0].worker_mismatch_receipt_ids, []);
  assert.equal(audit.summary.coverage.all_indices_observed, true);
  assert.equal(audit.summary.claims.full_computation_verified, false); assert.equal(audit.summary.claims.authority_asserted, false);
});

test('conditional miss model matches exact small vectors, excludes replay, handles zero and numerical underflow honestly', () => {
  assert.ok(Math.abs(conditionalMissProbability(5, 1, [2, 2]).numeric_approximation! - 9 / 25) < 1e-15);
  assert.ok(Math.abs(conditionalMissProbability(12, 1, [4, 4, 4]).numeric_approximation! - 8 / 27) < 1e-15);
  assert.equal(conditionalMissProbability(12, 0, [4, 4]).numeric_approximation, 1);
  assert.equal(conditionalMissProbability(12, 12, []).numeric_approximation, 1);
  assert.equal(conditionalMissProbability(5, 4, [2]).exact_zero, true);
  const tiny = conditionalMissProbability(262144, 262143, Array(1024).fill(1));
  assert.equal(tiny.exact_zero, false); assert.equal(tiny.numeric_approximation, null); assert.notEqual(tiny.scientific_notation, '0');
  assert.throws(() => conditionalMissProbability(12, 13, [1]), /INVALID_BAD_ENTRY_COUNT/);
  assert.throws(() => conditionalMissProbability(12, 1, [13]), /INVALID_SAMPLE_COUNT/);
});

test('forged persisted totals fail reconstruction even if the attacker recomputes the audit hash', async () => {
  const w = await worker(), first = await observation(await round(w), 'world'), audit = await createAudit(job, w.context.result_id, [first]);
  const changed = structuredClone(audit); changed.summary.coverage.observed_count = 12;
  await assert.rejects(verifyAudit(changed), /AUDIT_ID_MISMATCH/);
  rehash(changed); await assert.rejects(verifyAudit(changed), /AUDIT_SUMMARY_MISMATCH/);
  await assert.rejects(appendAudit(changed, [first]), /AUDIT_SUMMARY_MISMATCH/);
  const forgedReceipt = structuredClone(audit); forgedReceipt.submissions[0].receipt.signing.signature = 'A'.repeat(86); rehash(forgedReceipt);
  await assert.rejects(verifyAudit(forgedReceipt), /INVALID_RECEIPT_SIGNATURE/);
  const crossing = await sealOpaqueOrganCrossing(auditOrganSpec(audit.audit_id, audit.result_id, at), await generateP256KeyPair());
  const other = await appendAudit(audit, [first]);
  await assert.rejects(verifyAuditCrossing(crossing, other), /AUDIT_CROSSING_REFERENCE_MISMATCH/);
});

test('audit timestamps remain signer claims and neither backwards clocks nor replay create compute-time claims', async () => {
  const w = await worker(), r = await round(w), first = await observation(r, 'world', undefined, nativeTypescriptChecker, -1000);
  const audit = await createAudit(job, w.context.result_id, [first, first]);
  assert.equal(audit.summary.receipts[0].signed_timestamp_claims.receipt_created_at, time(-1000));
  assert.equal(audit.summary.claims.compute_time_inferred, false);
  assert.equal(audit.summary.laws.includes('RESPONSE TIME ≠ COMPUTE TIME'), true);
  assert.equal('response_time_ms' in audit.summary, false); assert.equal('compute_time_ms' in audit.summary, false);
});

test('malformed, unsupported, empty and oversized audit inputs/model fail explicitly', async () => {
  const w = await worker(), first = await observation(await round(w), 'world');
  await assert.rejects(createAudit(job, w.context.result_id, []), /AUDIT_SUBMISSION_COUNT_LIMIT/);
  await assert.rejects(createAudit(job, w.context.result_id, Array(MAX_AUDIT_SUBMISSIONS + 1).fill(first)), /AUDIT_SUBMISSION_COUNT_LIMIT/);
  await assert.rejects(createAudit(job, w.context.result_id, [{ ...first, extra: 1 }]), /INVALID_AUDIT_SUBMISSION_FIELDS/);
  await assert.rejects(createAudit(job, w.context.result_id, [first], { ...model, bad_entry_count: 13 }), /INVALID_BAD_ENTRY_COUNT/);
  await assert.rejects(createAudit(job, w.context.result_id, [first], { ...model, assumption: 'consensus' }), /UNSUPPORTED_AUDIT_MODEL/);
  const oversized = structuredClone(first); oversized.receipt.note = 'x'.repeat(1_000_001);
  await assert.rejects(createAudit(job, w.context.result_id, [oversized]), /AUDIT_SUBMISSION_SIZE_LIMIT/);
  const noModel = await createAudit(job, w.context.result_id, [first]); assert.equal(noModel.summary.conditional_model, null);
});

test('Kernel 005 demo persists repeated audit and inputs; collect/append/relocated verification need no worker, Python or render assets', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw005-demo-'));
  try {
    const out = join(temp, 'demo');
    const run = await child(['src/useful_work/cli_005.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--with-mutant', '--assume-honest-fresh', '--bad-entries', '1', '--out', out]);
    assert.equal(run.code, 0, run.stderr);
    const audit = await verifyAudit(JSON.parse(await readFile(join(out, 'audit/audit.json'), 'utf8')));
    assert.equal(audit.summary.unique_challenge_count, 3); assert.equal(audit.summary.unique_receipt_count, 8); assert.equal(audit.summary.replayed_receipt_submissions, 1);
    assert.equal(audit.summary.contradictions.length, 16); assert.equal(audit.summary.diversity.verifier_keys.length, 3);
    const collect = await child(['src/useful_work/cli_005.ts', 'collect', join(out, 'audit-input.json'), '--assume-honest-fresh', '--bad-entries', '1', '--out', join(temp, 'collected')]);
    assert.equal(collect.code, 0, collect.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'collected/audit.json'), 'utf8')).audit_id, audit.audit_id);
    const appended = await child(['src/useful_work/cli_005.ts', 'append', join(out, 'audit/audit.json'), join(out, 'audit-input.json'), '--out', join(temp, 'appended')]);
    assert.equal(appended.code, 0, appended.stderr);
    const larger = await verifyAudit(JSON.parse(await readFile(join(temp, 'appended/audit.json'), 'utf8')));
    assert.deepEqual(larger.summary.observed_indices, audit.summary.observed_indices); assert.equal(larger.summary.unique_receipt_count, 8);
    assert.deepEqual(larger.summary.conditional_model, audit.summary.conditional_model);
    await cp(join(out, 'audit/audit.json'), join(temp, 'audit.json')); await cp(join(out, 'audit/crossing.json'), join(temp, 'crossing.json'));
    await rm(out, { recursive: true }); await cp(join(root, 'src'), join(temp, 'src'), { recursive: true }); await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    for (const file of ['algorithm.ts', 'worker.ts', 'verifier.ts', 'merkle_native/worker.ts', 'merkle_native/typescript_checker.ts']) await rm(join(temp, 'src/useful_work', file));
    const later = await child(['src/useful_work/cli_005.ts', 'verify', 'audit.json', '--crossing', 'crossing.json', '--out', 'later'], temp);
    assert.equal(later.code, 0, later.stderr); // no independent directory or Python subprocess is needed
    const verified = JSON.parse(await readFile(join(temp, 'later/audit.json'), 'utf8'));
    assert.equal(verified.audit_id, audit.audit_id); assert.deepEqual(verified.summary, audit.summary);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
