import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, sealReceipt, verifyReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { makeTransportFrame, readFileBundle, writeFileBundle } from '../src/transport.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes, hashValue, SCALE } from '../src/useful_work/job.ts';
import type { RenderJob } from '../src/useful_work/job.ts';
import { claims, inspectSampleWork } from '../src/useful_work/challenge/exchange.ts';
import { runPython } from '../src/useful_work/python_verifier.ts';
import { executeNativeJob, nativeOrganSpec, answerNativeChallenge } from '../src/useful_work/merkle_native/worker.ts';
import { RESULT_ID_PREFIX, buildResult, inspectArtifact, resultId, verifyResultProof } from '../src/useful_work/merkle_native/result.ts';
import { createNativeChallenge, inspectChallenge, inspectNativeWork, sealNativeMessage } from '../src/useful_work/merkle_native/exchange.ts';
import type { NativeChallenge, NativeResponse } from '../src/useful_work/merkle_native/exchange.ts';
import { verifyNativeChallenge } from '../src/useful_work/merkle_native/verifier.ts';
import type { NativeChecker, NativeReport } from '../src/useful_work/merkle_native/verifier.ts';
import { nativeTypescriptChecker } from '../src/useful_work/merkle_native/typescript_checker.ts';
import { NATIVE_PYTHON_SCRIPT, nativePythonChecker } from '../src/useful_work/merkle_native/python_checker.ts';
import { nativeReceipt, compareNativeReceipts } from '../src/useful_work/merkle_native/receipt.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const golden = JSON.parse(await readFile(join(root, 'fixtures/useful-work-004-golden.json'), 'utf8'));
const small = golden.cases[0], demo = golden.cases[3], at = '2026-10-05T00:00:00.000Z';
async function setup(job = small.job, sampleCount = 4, change?: (counts: number[]) => void) {
  const work = executeNativeJob(job), keys = await generateP256KeyPair();
  if (change) {
    const counts = [...work.tree.artifact.escape_counts]; change(counts);
    work.tree = buildResult(work.job, counts); work.artifacts['merkle-result'] = work.tree.bytes; work.manifest.result_id = work.tree.result_id;
  }
  const crossing = await sealOpaqueOrganCrossing(nativeOrganSpec(work.manifest, work.tree.header, at), keys);
  const context = await inspectNativeWork(crossing, work.artifacts['job-spec']);
  const challenger = await generateP256KeyPair(), challenge = await createNativeChallenge(context, sampleCount, challenger, at);
  const response = await answerNativeChallenge(context, challenge, work.tree.bytes, keys, at);
  return { work, keys, context, challenger, challenge, response };
}
function python(action: 'render' | 'verify' | 'sample', request: unknown, script = NATIVE_PYTHON_SCRIPT) {
  return runPython(action, request, { script });
}
function sampleRequest(s: Awaited<ReturnType<typeof setup>>) {
  return { job_base64: s.work.artifacts['job-spec'].toString('base64'), result_header: s.context.header, result_id: s.context.result_id,
    samples: claims(s.response).merkle_response.samples.map((v: any) => ({ index: v.index, committed_count: v.committed_count, proof: v.proof })) };
}
async function attest(report: NativeReport, world: string) {
  return nativeReceipt(report, await generateP256KeyPair(), at, { world_id: `world:${world}`, receiver_particular: `particular:${world}` });
}
async function child(args: string[], cwd = root): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; });
    p.once('error', reject); p.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('Merkle-native golden vectors: both runtimes produce the same sole identity, artifact bytes and pixel-1928 proof', async () => {
  const independent = await python('render', { jobs: golden.cases.map((c: any) => c.job) });
  for (const [i, vector] of golden.cases.entries()) {
    const work = executeNativeJob(vector.job);
    assert.equal(work.manifest.result_id, vector.result_id); assert.deepEqual(work.tree.header, vector.result_header);
    assert.equal(independent[i].result_id, vector.result_id);
    assert.deepEqual(independent[i].artifact, work.tree.artifact);
    assert.deepEqual(canonicalBytes(independent[i].artifact), work.tree.bytes);
    if (vector.artifact) assert.deepEqual(work.tree.artifact, vector.artifact);
    for (const sample of vector.samples) {
      assert.deepEqual(work.tree.proof(sample.index), sample.proof);
      assert.equal(verifyResultProof(vector.result_header, vector.result_id, sample.index, sample.committed_count, sample.proof), true);
    }
    const output = await python('sample', { job_base64: work.artifacts['job-spec'].toString('base64'), result_header: vector.result_header,
      result_id: vector.result_id, samples: vector.samples.map((s: any) => ({ index: s.index, committed_count: s.committed_count, proof: s.proof })) });
    assert.equal(output.sampled_entries_bound_to_result_identity, true);
    assert.deepEqual(output.samples, vector.samples.map((s: any) => ({ index: s.index, count: s.count, final_real_q: s.final_real_q, final_imag_q: s.final_imag_q })));
  }
  assert.ok(demo.samples.some((s: any) => s.index === 1928));
  assert.deepEqual(executeNativeJob(golden.cases[1].job).tree.proof(0), []);
});

test('64 generated/edge jobs cross-check canonical result structures and identities independently', async () => {
  let state = 0x004c0ffe; const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const jobs = golden.cases.map((v: any) => v.job);
  for (let i = 0; i < 60; i++) jobs.push({ ...small.job, seed: next(), width: next() % 13 + 1, height: next() % 11 + 1,
    iterations: next() % 128 + 1, parameters: { c_real_q: next() % (4 * SCALE + 1) - 2 * SCALE, c_imag_q: next() % (4 * SCALE + 1) - 2 * SCALE } });
  const independent = await python('render', { jobs }); assert.equal(jobs.length, 64);
  for (const [i, job] of jobs.entries()) {
    const work = executeNativeJob(job);
    assert.equal(work.tree.result_id, independent[i].result_id, `vector ${i}`);
    assert.deepEqual(work.tree.bytes, canonicalBytes(independent[i].artifact), `vector ${i}`);
  }
});

test('same specification gives identical native result; seed, dimensions, leaf count and ordering are bound', () => {
  const a = executeNativeJob(small.job), b = executeNativeJob(small.job);
  assert.equal(a.manifest.result_id, b.manifest.result_id); assert.deepEqual(a.tree.bytes, b.tree.bytes);
  const counts = a.tree.artifact.escape_counts;
  const anotherSeed = buildResult({ ...small.job, seed: 2 }, counts);
  assert.equal(anotherSeed.header.counts_root, a.tree.header.counts_root);
  assert.notEqual(anotherSeed.result_id, a.tree.result_id); // top node binds job even if all counts happen to agree
  const reshaped = buildResult({ ...small.job, width: 3, height: 4 }, counts);
  assert.equal(reshaped.header.counts_root, a.tree.header.counts_root); assert.notEqual(reshaped.result_id, a.tree.result_id);
  const reordered = [...counts]; [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.notEqual(buildResult(small.job, reordered).result_id, a.tree.result_id);
  assert.notEqual(executeNativeJob({ ...small.job, width: 5 }).tree.result_id, a.tree.result_id);
  assert.deepEqual(Object.keys(a.manifest).sort(), ['schema', 'job_spec_hash', 'result_id', 'presentation_hash', 'metadata_hash'].sort());
  assert.equal(JSON.stringify(a.tree.artifact).includes('result_hash'), false);
});

test('a proof must reach the named artifact identity, including its job and dimensions, in both runtimes', async () => {
  const s = await setup(), request = sampleRequest(s), sample = request.samples[0];
  const changes = [
    { result_id: RESULT_ID_PREFIX + '0'.repeat(64) },
    { result_header: { ...request.result_header, job_spec_hash: '1'.repeat(64) } },
    { result_header: { ...request.result_header, width: 3, height: 4 } },
    { result_header: { ...request.result_header, counts_root: '2'.repeat(64) } },
  ];
  for (const change of changes) {
    const changed = { ...request, ...change };
    assert.equal(verifyResultProof(changed.result_header, changed.result_id, sample.index, sample.committed_count, sample.proof), false);
    await assert.rejects(python('sample', changed));
  }
  const other = executeNativeJob({ ...small.job, seed: 2 });
  assert.equal(verifyResultProof(s.context.header, other.manifest.result_id, sample.index, sample.committed_count, sample.proof), false);
  assert.equal(verifyResultProof(s.context.header, s.context.result_id, 12, sample.committed_count, sample.proof), false); // padding
  assert.equal(verifyResultProof(s.context.header, s.context.result_id, sample.index, sample.committed_count, [...sample.proof, '0'.repeat(64)]), false);
});

test('full native artifact validation rebuilds the SAME identity and rejects altered or noncanonical bytes', async () => {
  const work = executeNativeJob(small.job), identity = work.manifest.result_id;
  assert.equal(inspectArtifact(work.tree.bytes, work.job, identity).result_id, identity);
  const request = { job_base64: work.artifacts['job-spec'].toString('base64'), artifact_base64: work.tree.bytes.toString('base64'), result_id: identity };
  const checked = await python('verify', request);
  assert.equal(checked.result_identity_verified, true); assert.equal(checked.computation_independently_verified, true);
  const changed = structuredClone(work.tree.artifact); changed.escape_counts[0]++;
  assert.throws(() => inspectArtifact(canonicalBytes(changed), work.job, identity), /RESULT_LEAVES_IDENTITY_MISMATCH/);
  await assert.rejects(python('verify', { ...request, artifact_base64: canonicalBytes(changed).toString('base64') }), /RESULT_LEAVES_IDENTITY_MISMATCH/);
  const rebound = buildResult(work.job, changed.escape_counts);
  assert.throws(() => inspectArtifact(rebound.bytes, work.job, identity), /RESULT_IDENTITY_MISMATCH/);
  const falseMath = await python('verify', { ...request, artifact_base64: rebound.bytes.toString('base64'), result_id: rebound.result_id });
  assert.equal(falseMath.result_identity_verified, true); assert.equal(falseMath.computation_independently_verified, false);
  assert.throws(() => inspectArtifact(Buffer.from(JSON.stringify(work.tree.artifact, null, 2)), work.job, identity), /NON_CANONICAL/);
  assert.throws(() => inspectArtifact(work.tree.bytes, { ...work.job, seed: 2 }, identity), /RESULT_JOB_MISMATCH/);
});

test('native crossing round trip preserves identity and canonical artifact; RECEIVE/HOLD claims no ownership', async () => {
  const s = await setup(), temp = await mkdtemp(join(tmpdir(), 'uw004-roundtrip-'));
  try {
    for (const [name, crossing] of [['work', s.context.crossing], ['challenge', s.challenge], ['response', s.response]] as const) {
      const path = join(temp, name + '.json'); await writeFileBundle(path, await makeTransportFrame(crossing, 'file-bundle', at, '004'));
      assert.deepEqual((await readFileBundle(path)).crossing, crossing);
    }
    await writeFile(join(temp, 'artifact.json'), s.work.tree.bytes);
    assert.equal(inspectArtifact(await readFile(join(temp, 'artifact.json')), s.work.job, s.context.result_id).result_id, s.context.result_id);
    const ref = s.context.crossing.payload_refs.find((r: any) => r.role === 'merkle-result'); assert.equal(ref.address, s.context.result_id);
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:peer', receiver_particular: 'particular:peer', contract_ref: 'contract:local' });
    await receiver.receive(s.context.crossing, at); const hold = await receiver.dispose(s.context.crossing.crossing_id, 'HOLD', at);
    assert.equal(hold.semantic_effect, 'none'); assert.deepEqual(receiver.snapshot().held, [s.context.crossing.crossing_id]);
    assert.equal(claims(s.context.crossing).ownership_asserted, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('both worlds issue scoped receipts proving sampled membership in the named result identity', async () => {
  const s = await setup(), receipts = [];
  const reports = await Promise.all([verifyNativeChallenge(s.context, s.challenge, s.response, nativeTypescriptChecker), verifyNativeChallenge(s.context, s.challenge, s.response, nativePythonChecker())]);
  for (const [i, report] of reports.entries()) {
    assert.equal(report.scope.result_id, s.work.manifest.result_id); assert.equal(report.scope.result_id, resultId(report.scope.result_header));
    assert.equal(report.claims.sampled_entries_bound_to_result_identity, true); assert.equal(report.claims.sampled_computation_verified, true);
    assert.equal(report.claims.complete_artifact_received, false); assert.equal(report.claims.full_artifact_structure_verified, false); assert.equal(report.claims.full_computation_verified, false);
    assert.deepEqual(report.errors, []); assert.equal(report.checked_count, 4);
    const receipt = await attest(report, 'world-' + i); assert.equal(await verifyReceipt(receipt), true); assert.equal(receipt.semantic_effect, 'none'); receipts.push(receipt);
  }
  assert.deepEqual(reports[0].evidence, reports[1].evidence);
  const comparison = await compareNativeReceipts(receipts); assert.equal(comparison.relation, 'compatible');
  assert.equal(comparison.comparison_id, (await compareNativeReceipts([...receipts].reverse())).comparison_id);
});

test('no silent migration: native work rejects legacy identifiers and parallel result-hash claims', async () => {
  const s = await setup();
  await assert.rejects(inspectSampleWork(s.context.crossing, s.work.artifacts['job-spec']), /UNSUPPORTED_WORK/);
  const spec = nativeOrganSpec(s.work.manifest, s.work.tree.header, at);
  (spec.donor_claims.useful_work_native as any).result_hash = '0'.repeat(64);
  await assert.rejects(inspectNativeWork(await sealOpaqueOrganCrossing(spec, s.keys), s.work.artifacts['job-spec']), /INVALID_NATIVE_MANIFEST/);
  const wrong = nativeOrganSpec({ ...s.work.manifest, result_id: 'sha256:' + '0'.repeat(64) }, s.work.tree.header, at);
  await assert.rejects(inspectNativeWork(await sealOpaqueOrganCrossing(wrong, s.keys), s.work.artifacts['job-spec']), /INVALID_RESULT_ID/);
  const tampered = nativeOrganSpec(s.work.manifest, { ...s.work.tree.header, width: 3, height: 4 }, at);
  await assert.rejects(inspectNativeWork(await sealOpaqueOrganCrossing(tampered, s.keys), s.work.artifacts['job-spec']), /RESULT_JOB_MISMATCH/);
});

test('signed challenge/response context substitution, foreign worker and signature tampering fail before a claim', async () => {
  const s = await setup();
  const challenge = structuredClone(s.challenge); claims(challenge).merkle_challenge.nonce = '0'.repeat(64);
  await assert.rejects(verifyNativeChallenge(s.context, challenge, s.response, nativeTypescriptChecker), /INVALID_OPAQUE_SIGNATURE/);
  const tampered = structuredClone(s.response); claims(tampered).merkle_response.samples[0].count++;
  await assert.rejects(verifyNativeChallenge(s.context, s.challenge, tampered, nativeTypescriptChecker), /INVALID_OPAQUE_SIGNATURE/);
  const foreign = await sealNativeMessage('response', claims(s.response).merkle_response as NativeResponse, await generateP256KeyPair(), at, 'world:foreign');
  await assert.rejects(verifyNativeChallenge(s.context, s.challenge, foreign, nativeTypescriptChecker), /RESPONSE_WORKER_KEY_MISMATCH/);
  const other = await createNativeChallenge(s.context, 4, s.challenger, at); assert.notEqual(other.crossing_id, s.challenge.crossing_id);
  await assert.rejects(verifyNativeChallenge(s.context, other, s.response, nativeTypescriptChecker), /RESPONSE_CONTEXT_MISMATCH/);
  const wrongId = { ...claims(s.response).merkle_response, result_id: RESULT_ID_PREFIX + '0'.repeat(64) } as NativeResponse;
  await assert.rejects(verifyNativeChallenge(s.context, s.challenge, await sealNativeMessage('response', wrongId, s.keys, at, 'world:worker'), nativeTypescriptChecker), /RESPONSE_CONTEXT_MISMATCH/);
  const forgedContext = { ...s.context, jobBytes: canonicalBytes({ ...s.work.job, seed: 2 }) };
  await assert.rejects(verifyNativeChallenge(forgedContext, s.challenge, s.response, nativeTypescriptChecker), /JOB_HASH_MISMATCH/);
});

const mutations: [string, (r: NativeResponse) => void, string][] = [
  ['missing-entry', r => r.samples.pop(), 'SAMPLE_SET_MISMATCH'],
  ['extra-entry', r => r.samples.push(structuredClone(r.samples[0])), 'SAMPLE_SET_MISMATCH'],
  ['duplicate', r => { r.samples[1] = structuredClone(r.samples[0]); }, 'SAMPLE_SET_MISMATCH'],
  ['coordinate', r => { r.samples[0].x++; }, 'SAMPLE_SET_MISMATCH'],
  ['proof', r => { r.samples[0].proof[0] = '0'.repeat(64); }, 'RESULT_PROOF_MISMATCH'],
  ['count', r => { r.samples[0].committed_count = (r.samples[0].committed_count + 1) % 17; }, 'RESULT_PROOF_MISMATCH'],
  ['depth', r => { r.samples[0].proof.pop(); }, 'INVALID_PROOF_DEPTH'],
  ['state', r => { r.samples[0].final_real_q = '-0'; }, 'INVALID_TERMINAL_STATE'],
  ['schema', r => { (r as any).schema = 'unsupported'; }, 'UNSUPPORTED_NATIVE_RESPONSE'],
];
for (const [name, change, code] of mutations) test(`authentic but invalid native ${name} response produces a scoped FAILED receipt`, async () => {
  const s = await setup(), payload = structuredClone(claims(s.response).merkle_response) as NativeResponse; change(payload);
  const response = await sealNativeMessage('response', payload, s.keys, at, 'world:worker');
  let ran = false;
  const checker: NativeChecker = async () => { ran = true; throw new Error('MUST_NOT_RUN'); };
  const report = await verifyNativeChallenge(s.context, s.challenge, response, checker);
  assert.deepEqual(report.errors, [code]); assert.equal(ran, false); assert.equal(report.checked_count, 0);
  assert.equal(report.claims.sampled_entries_bound_to_result_identity, false); assert.equal(report.claims.sampled_computation_verified, false);
  const receipt = await attest(report, name); assert.equal(receipt.kind, 'FAILED'); assert.equal(await verifyReceipt(receipt), true);
});

test('a valid artifact proof is distinct from correct sampled computation, including terminal states', async () => {
  const s = await setup(), payload = structuredClone(claims(s.response).merkle_response) as NativeResponse;
  payload.samples[0].final_real_q = (BigInt(payload.samples[0].final_real_q) + 1n).toString();
  const response = await sealNativeMessage('response', payload, s.keys, at, 'world:worker');
  for (const checker of [nativeTypescriptChecker, nativePythonChecker()]) {
    const report = await verifyNativeChallenge(s.context, s.challenge, response, checker);
    assert.equal(report.claims.sampled_entries_bound_to_result_identity, true); assert.equal(report.claims.sampled_computation_verified, false);
    assert.deepEqual(report.errors, ['SAMPLED_COMPUTATION_MISMATCH']);
  }
});

test('sampling can miss a wrong committed leaf while binding checked entries to exactly that artifact', async () => {
  const s = await setup(small.job, 1, counts => { counts[0]++; });
  assert.notEqual(s.context.result_id, small.result_id);
  let challenge = s.challenge;
  for (let t = 0; (await inspectChallenge(s.context, challenge)).indices.includes(0); t++) {
    assert.ok(t < 100); challenge = await createNativeChallenge(s.context, 1, s.challenger, at);
  }
  const response = await answerNativeChallenge(s.context, challenge, s.work.tree.bytes, s.keys, at);
  const report = await verifyNativeChallenge(s.context, challenge, response, nativePythonChecker());
  assert.equal(report.claims.sampled_entries_bound_to_result_identity, true); assert.equal(report.claims.sampled_computation_verified, true);
  assert.equal(report.scope.result_id, s.context.result_id); assert.equal(report.claims.full_computation_verified, false);
  const all = await createNativeChallenge(s.context, 12, s.challenger, at);
  const hit = await verifyNativeChallenge(s.context, all, await answerNativeChallenge(s.context, all, s.work.tree.bytes, s.keys, at), nativePythonChecker());
  assert.equal(hit.claims.sampled_entries_bound_to_result_identity, true); assert.equal(hit.claims.sampled_computation_verified, false);
  assert.equal(hit.claims.complete_artifact_received, false); assert.equal(hit.claims.full_artifact_structure_verified, false); assert.equal(hit.claims.full_computation_verified, false);
});

test('malformed native structures/challenges fail explicitly, including sparse counts, work budget and impossible dimensions', async () => {
  assert.throws(() => buildResult(small.job, new Array(12)), /INVALID_ESCAPE_COUNT/);
  assert.throws(() => buildResult(small.job, [1]), /INVALID_RESULT_COUNT/);
  assert.throws(() => buildResult({ ...small.job, width: 512, height: 512, iterations: 4096 }, []), /WORK_LIMIT_EXCEEDED/);
  assert.throws(() => resultId({ ...small.result_header, width: 0 }), /INVALID_RESULT_WIDTH/);
  assert.throws(() => resultId({ ...small.result_header, height: true }), /INVALID_RESULT_HEIGHT/);
  assert.throws(() => resultId({ ...small.result_header, algorithm: 'future' }), /UNSUPPORTED_MERKLE_RESULT/);
  const s = await setup();
  for (const change of [{ sample_count: 0 }, { nonce: 'predictable' }, { result_hash: '0'.repeat(64) }]) {
    const challenge = await sealNativeMessage('challenge', { ...claims(s.challenge).merkle_challenge, ...change } as NativeChallenge, s.challenger, at, 'world:challenger');
    await assert.rejects(inspectChallenge(s.context, challenge));
  }
  await assert.rejects(python('render', { jobs: [{ ...small.job, seed: true }] }), /INVALID_SEED/);
  const request = sampleRequest(s); request.samples[0].committed_count = true;
  await assert.rejects(python('sample', request), /INVALID_COMMITTED_COUNT/);
});

test('offline or malformed checker output is FAILED/incomparable; signed stronger claims and same-key worlds are rejected', async () => {
  const s = await setup(), report = await verifyNativeChallenge(s.context, s.challenge, s.response, nativeTypescriptChecker), a = await attest(report, 'a');
  const offline = await verifyNativeChallenge(s.context, s.challenge, s.response, nativePythonChecker({ executable: '/missing/python' }));
  assert.deepEqual(offline.errors, ['PYTHON_UNAVAILABLE']); assert.equal((await compareNativeReceipts([a, await attest(offline, 'offline')])).relation, 'incomparable');
  const malformed: NativeChecker = async (context, samples) => {
    const result = await nativeTypescriptChecker(context, samples); result.samples[1] = result.samples[0]; return result;
  };
  const invalid = await verifyNativeChallenge(s.context, s.challenge, s.response, malformed);
  assert.deepEqual(invalid.errors, ['CHECKER_SAMPLE_SET_MISMATCH']); assert.equal((await attest(invalid, 'invalid-checker')).kind, 'FAILED');
  const other = await setup(), otherReport = await verifyNativeChallenge(other.context, other.challenge, other.response, nativePythonChecker());
  await assert.rejects(compareNativeReceipts([a, await attest(otherReport, 'other-scope')]), /RECEIPT_SCOPE_MISMATCH/);
  const keys = await generateP256KeyPair();
  const same = await Promise.all(['a', 'b'].map(world_id => nativeReceipt(report, keys, at, { world_id, receiver_particular: world_id })));
  await assert.rejects(compareNativeReceipts(same), /DISTINCT_WORLDS_REQUIRED/);
  const tampered = structuredClone(a); tampered.extensions.useful_work_native.scope.result_id = RESULT_ID_PREFIX + '0'.repeat(64);
  await assert.rejects(compareNativeReceipts([a, tampered]), /INVALID_RECEIPT_SIGNATURE/);
  const lie = structuredClone(report); lie.claims.full_computation_verified = true as never;
  await assert.rejects(attest(lie, 'liar'), /INVALID_CHALLENGE_CLAIM/);
  const signedLie = await sealReceipt({ ...a, world_id: 'world:liar', extensions: { useful_work_native: lie } }, await generateP256KeyPair());
  await assert.rejects(compareNativeReceipts([a, signedLie]), /INVALID_CHALLENGE_CLAIM/);
  const wrongScope = structuredClone(report); wrongScope.scope.result_header.width = 3; wrongScope.scope.result_header.height = 4;
  await assert.rejects(attest(wrongScope, 'wrong-scope'), /RESULT_IDENTITY_MISMATCH/);
});

for (const [label, from, to] of [
  ['header-dimensions', 'math.canonical_bytes(header(value))', 'math.canonical_bytes(dict(job_spec_hash=value["job_spec_hash"], counts_root=value["counts_root"]))'],
  ['leaf-order', '{"index": index, "count": count}', '{"count": count}'],
  ['child-order', 'bytes.fromhex(left), bytes.fromhex(right)', 'bytes.fromhex(right), bytes.fromhex(left)'],
] as const) test(`native Python identity mutation ${label} is killed by the pinned vectors and original proofs`, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw004-identity-mutant-'));
  try {
    const source = await readFile(NATIVE_PYTHON_SCRIPT, 'utf8'); assert.ok(source.includes(from));
    const script = join(temp, 'merkle_result_v1.py'); await writeFile(script, source.replaceAll(from, to));
    await cp(join(root, 'independent/julia_q24.py'), join(temp, 'julia_q24.py'));
    const rendered = await python('render', { jobs: [small.job] }, script);
    assert.notEqual(rendered[0].result_id, small.result_id);
    const s = await setup(); await assert.rejects(python('sample', sampleRequest(s), script), /RESULT_(IDENTITY|PROOF)_MISMATCH/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

const boundary: RenderJob = { ...small.job, width: 1, height: 1, parameters: { c_real_q: 0, c_imag_q: 0 },
  bounds: { min_real_q: SCALE, max_real_q: 3 * SCALE, min_imag_q: -1, max_imag_q: 1 } };
test('actual Python math mutation gives contradictory receipts under the SAME valid artifact identity; HOLD stays local', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw004-math-mutant-'));
  try {
    const s = await setup(boundary, 1); await cp(NATIVE_PYTHON_SCRIPT, join(temp, 'merkle_result_v1.py'));
    const path = join(root, 'independent/julia_q24.py'), source = await readFile(path, 'utf8');
    const from = 'imaginary * imaginary > 4 * Q * Q'; assert.ok(source.includes(from));
    await writeFile(join(temp, 'julia_q24.py'), source.replaceAll(from, 'imaginary * imaginary >= 4 * Q * Q'));
    const ts = await verifyNativeChallenge(s.context, s.challenge, s.response, nativeTypescriptChecker);
    const py = await verifyNativeChallenge(s.context, s.challenge, s.response, nativePythonChecker({ script: join(temp, 'merkle_result_v1.py') }));
    assert.equal(ts.claims.sampled_computation_verified, true); assert.equal(py.claims.sampled_computation_verified, false);
    assert.equal(py.claims.sampled_entries_bound_to_result_identity, true); assert.deepEqual(py.errors, ['SAMPLED_COMPUTATION_MISMATCH']);
    assert.notEqual(ts.implementation?.source_sha256, py.implementation?.source_sha256);
    const receipts = [await attest(ts, 'typescript'), await attest(py, 'python-mutant')];
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:peer', receiver_particular: 'particular:peer', contract_ref: 'contract:local' });
    await receiver.receive(s.response, at); await receiver.dispose(s.response.crossing_id, 'HOLD', at); const before = receiver.snapshot();
    const comparison = await compareNativeReceipts(receipts); assert.equal(comparison.relation, 'contradictory'); assert.equal(comparison.subject.result_id, s.context.result_id);
    assert.equal(comparison.semantic_effect, 'none'); assert.equal('winner' in comparison, false); assert.deepEqual(receiver.snapshot(), before);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('shared TypeScript math mutation agrees locally, while Python contradicts mathematics under its valid native result', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw004-ts-mutant-'));
  try {
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true }); await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    const path = join(temp, 'src/useful_work/algorithm.ts'), source = await readFile(path, 'utf8');
    const from = 'zi * zi <= 4n * q * q'; assert.ok(source.includes(from)); await writeFile(path, source.replaceAll(from, 'zi * zi < 4n * q * q'));
    await writeFile(join(temp, 'job.json'), JSON.stringify(boundary));
    await writeFile(join(temp, 'mutant.mjs'), `
import {readFileSync} from 'node:fs';
import {generateP256KeyPair} from './src/protocol.ts';
import {sealOpaqueOrganCrossing} from './src/organ.ts';
import {executeNativeJob,nativeOrganSpec,answerNativeChallenge} from './src/useful_work/merkle_native/worker.ts';
import {inspectNativeWork,createNativeChallenge} from './src/useful_work/merkle_native/exchange.ts';
import {verifyNativeChallenge} from './src/useful_work/merkle_native/verifier.ts';
import {nativeTypescriptChecker} from './src/useful_work/merkle_native/typescript_checker.ts';
const w=executeNativeJob(JSON.parse(readFileSync('job.json','utf8'))),keys=await generateP256KeyPair();
const work=await sealOpaqueOrganCrossing(nativeOrganSpec(w.manifest,w.tree.header,'${at}'),keys),context=await inspectNativeWork(work,w.artifacts['job-spec']);
const challenge=await createNativeChallenge(context,1,await generateP256KeyPair(),'${at}');
const response=await answerNativeChallenge(context,challenge,w.tree.bytes,keys,'${at}');
console.log(JSON.stringify({work,challenge,response,job:w.artifacts['job-spec'].toString('base64'),report:await verifyNativeChallenge(context,challenge,response,nativeTypescriptChecker)}));
`);
    const run = await child(['mutant.mjs'], temp); assert.equal(run.code, 0, run.stderr);
    const data = JSON.parse(run.stdout), ts = data.report as NativeReport; assert.equal(ts.claims.sampled_computation_verified, true);
    const context = await inspectNativeWork(data.work, Buffer.from(data.job, 'base64'));
    const py = await verifyNativeChallenge(context, data.challenge, data.response, nativePythonChecker());
    assert.equal(py.claims.sampled_entries_bound_to_result_identity, true); assert.equal(py.claims.sampled_computation_verified, false);
    assert.equal((await compareNativeReceipts([await attest(ts, 'typescript-mutant'), await attest(py, 'python-original')])).relation, 'contradictory');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('native demo leaves durable receipts; relocated job-only verification survives removal of worker and full mathematics files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw004-portable-'));
  try {
    const out = join(temp, 'demo'), run = await child(['src/useful_work/cli_004.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--out', out]);
    assert.equal(run.code, 0, run.stderr);
    const comparison = JSON.parse(await readFile(join(out, 'worlds/comparison.json'), 'utf8'));
    assert.equal(comparison.relation, 'compatible'); assert.equal(comparison.subject.result_id, demo.result_id);
    const portable = join(temp, 'portable'); await mkdir(join(portable, 'artifacts'), { recursive: true });
    await cp(join(out, 'prepared/delivery/work.json'), join(portable, 'work.json'));
    const work = (await readFileBundle(join(portable, 'work.json'))).crossing, jobHash = claims(work).useful_work_native.job_spec_hash;
    await cp(join(out, 'prepared/delivery/artifacts', jobHash), join(portable, 'artifacts', jobHash));
    await cp(join(out, 'challenge/challenge.json'), join(portable, 'challenge.json')); await cp(join(out, 'answer/response.json'), join(portable, 'response.json'));
    await rm(out, { recursive: true }); // native artifact, presentation, metadata, counts and worker key all absent
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true }); await cp(join(root, 'independent'), join(temp, 'independent'), { recursive: true });
    await cp(join(root, 'package.json'), join(temp, 'package.json')); await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    for (const file of ['algorithm.ts', 'worker.ts', 'verifier.ts', 'challenge/worker.ts', 'challenge/typescript_checker.ts', 'merkle_native/worker.ts', 'merkle_native/typescript_checker.ts']) await rm(join(temp, 'src/useful_work', file));
    const math = join(temp, 'independent/julia_q24.py'); await writeFile(math, (await readFile(math, 'utf8')).replace('def render(job):', 'def render(job):\n    raise ValueError("FULL_RENDER_FORBIDDEN")'));
    const later = await child(['src/useful_work/cli_004.ts', 'verify', join(portable, 'work.json'), join(portable, 'challenge.json'), join(portable, 'response.json'), '--world', 'python', '--out', join(temp, 'later')], temp);
    assert.equal(later.code, 0, later.stderr);
    const receipt = JSON.parse(await readFile(join(temp, 'later/python/verification-receipt.json'), 'utf8'));
    assert.equal(await verifyReceipt(receipt), true); assert.equal(receipt.extensions.useful_work_native.claims.sampled_entries_bound_to_result_identity, true);
    assert.equal(receipt.extensions.useful_work_native.claims.sampled_computation_verified, true); assert.equal(receipt.extensions.useful_work_native.scope.result_id, demo.result_id);
    // The raw Python protocol also verifies identity/proofs with the TypeScript codec deleted.
    await rm(join(temp, 'src/useful_work/merkle_native/result.ts'));
    const s = await setup(); const output = await python('sample', sampleRequest(s), join(temp, 'independent/merkle_result_v1.py'));
    assert.equal(output.result_id, s.context.result_id); assert.equal(output.sampled_entries_bound_to_result_identity, true);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
