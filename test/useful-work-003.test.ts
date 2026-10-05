import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { makeTransportFrame, readFileBundle, writeFileBundle } from '../src/transport.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { sha256Hex } from '../src/canonical.ts';
import { canonicalBytes, SCALE } from '../src/useful_work/job.ts';
import { executeJob, organSpec } from '../src/useful_work/worker.ts';
import { sampleOrbit } from '../src/useful_work/algorithm.ts';
import { PYTHON_SCRIPT, runPython } from '../src/useful_work/python_verifier.ts';
import { buildCommitment, deriveSampleIndices, verifyMembership } from '../src/useful_work/challenge/commitment.ts';
import { claims, createChallenge, inspectChallenge, inspectSampleWork, sealSampleMessage } from '../src/useful_work/challenge/exchange.ts';
import type { Challenge, SampleResponse } from '../src/useful_work/challenge/exchange.ts';
import type { RenderJob } from '../src/useful_work/job.ts';
import { answerChallenge } from '../src/useful_work/challenge/worker.ts';
import { verifyChallenge } from '../src/useful_work/challenge/verifier.ts';
import type { ChallengeReport, SampleChecker } from '../src/useful_work/challenge/verifier.ts';
import { typescriptChecker } from '../src/useful_work/challenge/typescript_checker.ts';
import { pythonChecker } from '../src/useful_work/challenge/python_checker.ts';
import { challengeReceipt, compareChallengeReceipts } from '../src/useful_work/challenge/receipt.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const golden = JSON.parse(await readFile(join(root, 'fixtures/useful-work-003-golden.json'), 'utf8'));
const at = '2026-10-05T00:00:00.000Z';
async function setup(job = golden.job, sampleCount = 4, change?: (counts: number[]) => void) {
  const work = executeJob(job), keys = await generateP256KeyPair();
  const counts = [...work.result.escape_counts]; change?.(counts);
  const tree = buildCommitment(work.manifest.job_spec_hash, work.manifest.result_hash, counts);
  const spec = organSpec(work.manifest, at); spec.donor_claims.sample_commitment = tree.commitment;
  const crossing = await sealOpaqueOrganCrossing(spec, keys);
  const context = await inspectSampleWork(crossing, work.artifacts['job-spec']);
  const challenger = await generateP256KeyPair();
  const challenge = await createChallenge(context, sampleCount, challenger, at);
  const response = await answerChallenge(context, challenge, counts, keys, at);
  return { work, counts, keys, tree, context, challenger, challenge, response };
}
async function attest(report: ChallengeReport, label: string) {
  return challengeReceipt(report, await generateP256KeyPair(), at, { world_id: `world:${label}`, receiver_particular: `particular:${label}` });
}
async function child(args: string[], cwd = root): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; });
    p.once('error', reject); p.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('Kernel 003 standalone Python golden: indices, padded Merkle root/proofs, sampled terminal states', async () => {
  for (const v of golden.coordinate_vectors) assert.deepEqual(deriveSampleIndices(golden.work_id, golden.challenge_id, v.population, v.sample_count), v.indices);
  const tree = buildCommitment(golden.commitment.job_spec_hash, golden.commitment.result_hash, golden.counts);
  assert.deepEqual(tree.commitment, golden.commitment);
  for (const s of golden.proofs) {
    assert.deepEqual(tree.proof(s.index), s.proof);
    assert.equal(verifyMembership(tree.commitment, s.index, s.count, s.proof), true);
    assert.equal(verifyMembership(tree.commitment, s.index, s.count + 1, s.proof), false);
  }
  assert.deepEqual(golden.orbits.map((s: any) => sampleOrbit(golden.job, s.index)), golden.orbits);
  assert.deepEqual((await pythonChecker()(canonicalBytes(golden.job), golden.orbits.map((s: any) => s.index))).samples, golden.orbits);
  const one = buildCommitment('1'.repeat(64), '2'.repeat(64), [3]);
  assert.deepEqual(one.proof(0), []);
  assert.equal(verifyMembership(one.commitment, 0, 3, []), true);
  assert.equal(verifyMembership(one.commitment, 1, 3, []), false);
});

test('fresh signed challenge identity deterministically selects unique bounded coordinates', async () => {
  const s = await setup();
  const second = await createChallenge(s.context, 4, s.challenger, at);
  assert.notEqual(claims(second).sample_challenge.nonce, claims(s.challenge).sample_challenge.nonce);
  assert.notEqual(second.crossing_id, s.challenge.crossing_id);
  const a = await inspectChallenge(s.context, s.challenge), b = await inspectChallenge(s.context, s.challenge);
  assert.deepEqual(a.indices, b.indices);
  for (const population of [1, 2, 7, 64, 100, 3072, 262144]) {
    const indices = deriveSampleIndices(golden.work_id, golden.challenge_id, population, Math.min(64, population));
    assert.equal(new Set(indices).size, indices.length);
    assert.ok(indices.every(i => i >= 0 && i < population));
  }
  for (const count of [0, 65, 1.5, NaN]) await assert.rejects(createChallenge(s.context, count, s.challenger, at), /INVALID_SAMPLE_COUNT/);
  assert.throws(() => deriveSampleIndices(golden.work_id, golden.challenge_id, 2, 3), /INVALID_SAMPLE_COUNT/);
});

test('32 generated jobs cross-check sampled counts and terminal states in separate runtimes', async () => {
  let random = 0x003c0ffe;
  const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
  for (let n = 0; n < 32; n++) {
    const job = { ...golden.job, seed: next(), width: next() % 13 + 1, height: next() % 11 + 1,
      iterations: next() % 128 + 1, parameters: { c_real_q: next() % (4 * SCALE + 1) - 2 * SCALE, c_imag_q: next() % (4 * SCALE + 1) - 2 * SCALE } };
    const work = executeJob(job);
    const indices = deriveSampleIndices(golden.work_id, golden.challenge_id, job.width * job.height, Math.min(16, job.width * job.height));
    const reference = await typescriptChecker(canonicalBytes(job), indices), independent = await pythonChecker()(canonicalBytes(job), indices);
    assert.deepEqual(reference.samples, independent.samples, `vector ${n}`);
    assert.deepEqual(reference.samples.map(s => s.count), indices.map(i => work.result.escape_counts[i]));
  }
});

test('signed exchange survives opaque transport; both worlds HOLD and sign scoped sampled receipts', async () => {
  const s = await setup(), temp = await mkdtemp(join(tmpdir(), 'work003-roundtrip-'));
  try {
    for (const [label, crossing] of [['work', s.context.crossing], ['challenge', s.challenge], ['response', s.response]] as const) {
      const path = join(temp, label + '.json');
      await writeFileBundle(path, await makeTransportFrame(crossing, 'file-bundle', at, 'test'));
      assert.deepEqual((await readFileBundle(path)).crossing, crossing);
    }
    const reports = await Promise.all([verifyChallenge(s.context, s.challenge, s.response, typescriptChecker), verifyChallenge(s.context, s.challenge, s.response, pythonChecker())]);
    const receipts = [];
    for (const [i, report] of reports.entries()) {
      assert.equal(report.claims.sampled_computation_verified, true);
      assert.equal(report.claims.artifact_hash_verified, false); assert.equal(report.claims.full_computation_verified, false);
      assert.equal(report.checked_count, 4); assert.deepEqual(report.errors, []);
      const receipt = await attest(report, 'world-' + i); receipts.push(receipt);
      assert.equal(await verifyReceipt(receipt), true); assert.equal(receipt.semantic_effect, 'none');
      const receiver = await LocalReceiver.create(join(temp, 'receiver-' + i), { world_id: `world:${i}`, receiver_particular: `particular:${i}`, contract_ref: 'contract:local' });
      await receiver.receive(s.response, at); const hold = await receiver.dispose(s.response.crossing_id, 'HOLD', at);
      assert.equal(hold.semantic_effect, 'none'); assert.deepEqual(receiver.snapshot().held, [s.response.crossing_id]);
    }
    assert.deepEqual(reports[0].evidence, reports[1].evidence);
    const comparison = await compareChallengeReceipts(receipts);
    assert.equal(comparison.relation, 'compatible');
    assert.equal(comparison.comparison_id, (await compareChallengeReceipts([...receipts].reverse())).comparison_id);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('legacy crossings, changed jobs and substituted commitment populations fail explicitly', async () => {
  const s = await setup();
  const legacy = await sealOpaqueOrganCrossing(organSpec(s.work.manifest, at), s.keys);
  await assert.rejects(inspectSampleWork(legacy, s.work.artifacts['job-spec']), /MISSING_SAMPLE_COMMITMENT/);
  await assert.rejects(inspectSampleWork(s.context.crossing, canonicalBytes({ ...golden.job, seed: 2 })), /JOB_HASH_MISMATCH/);
  const spec = organSpec(s.work.manifest, at); spec.donor_claims.sample_commitment = { ...s.tree.commitment, population: 13 };
  await assert.rejects(inspectSampleWork(await sealOpaqueOrganCrossing(spec, s.keys), s.work.artifacts['job-spec']), /COMMITMENT_POPULATION_MISMATCH/);
  await assert.rejects(answerChallenge(s.context, s.challenge, [...s.counts].reverse().map(n => n + 1), s.keys, at), /WORKER_COMMITMENT_MISMATCH/);
});

test('signature tampering, foreign worker key, challenge substitution and response replay fail before attestations', async () => {
  const s = await setup();
  const challenge = structuredClone(s.challenge); claims(challenge).sample_challenge.nonce = '0'.repeat(64);
  await assert.rejects(verifyChallenge(s.context, challenge, s.response, typescriptChecker), /INVALID_OPAQUE_SIGNATURE/);
  const tampered = structuredClone(s.response); claims(tampered).sample_response.samples[0].count++;
  await assert.rejects(verifyChallenge(s.context, s.challenge, tampered, typescriptChecker), /INVALID_OPAQUE_SIGNATURE/);
  const foreign = await sealSampleMessage('response', claims(s.response).sample_response as SampleResponse, await generateP256KeyPair(), at, 'world:forged-worker');
  await assert.rejects(verifyChallenge(s.context, s.challenge, foreign, typescriptChecker), /RESPONSE_WORKER_KEY_MISMATCH/);
  const other = await createChallenge(s.context, 4, s.challenger, at);
  await assert.rejects(verifyChallenge(s.context, other, s.response, typescriptChecker), /RESPONSE_CONTEXT_MISMATCH/);
  const bad = { ...claims(s.challenge).sample_challenge, commitment_root: '0'.repeat(64) };
  const wrongContext = await sealSampleMessage('challenge', bad as Challenge, s.challenger, at, 'world:challenger');
  await assert.rejects(verifyChallenge(s.context, wrongContext, s.response, typescriptChecker), /CHALLENGE_CONTEXT_MISMATCH/);
});

const mutations: [string, (r: SampleResponse) => void, string][] = [
  ['missing', r => r.samples.pop(), 'SAMPLE_SET_MISMATCH'],
  ['extra', r => r.samples.push(structuredClone(r.samples[0])), 'SAMPLE_SET_MISMATCH'],
  ['duplicate', r => { r.samples[1] = structuredClone(r.samples[0]); }, 'SAMPLE_SET_MISMATCH'],
  ['coordinate', r => { r.samples[0].x++; }, 'SAMPLE_SET_MISMATCH'],
  ['proof', r => { r.samples[0].proof[0] = '0'.repeat(64); }, 'COMMITMENT_PROOF_MISMATCH'],
  ['proof-depth', r => { r.samples[0].proof.pop(); }, 'INVALID_PROOF_DEPTH'],
  ['committed-count', r => { r.samples[0].committed_count = (r.samples[0].committed_count + 1) % 17; }, 'COMMITMENT_PROOF_MISMATCH'],
  ['terminal-state', r => { r.samples[0].final_real_q = '-0'; }, 'INVALID_TERMINAL_STATE'],
  ['unsupported-schema', r => { (r as any).schema = 'unknown'; }, 'UNSUPPORTED_RESPONSE_SCHEMA'],
];
for (const [name, mutate, code] of mutations) test(`authentic but invalid ${name} response issues FAILED receipt with no computation claim`, async () => {
  const s = await setup();
  const response = structuredClone(claims(s.response).sample_response) as SampleResponse; mutate(response);
  const crossing = await sealSampleMessage('response', response, s.keys, at, 'world:worker');
  let ran = false;
  const checker: SampleChecker = async () => { ran = true; throw new Error('MUST_NOT_RUN'); };
  const report = await verifyChallenge(s.context, s.challenge, crossing, checker);
  assert.deepEqual(report.errors, [code]); assert.equal(ran, false); assert.equal(report.checked_count, 0);
  assert.equal(report.claims.sampled_computation_verified, false);
  const receipt = await attest(report, name); assert.equal(receipt.kind, 'FAILED'); assert.equal(await verifyReceipt(receipt), true);
});

test('valid proof with false local math evidence fails recomputation; terminal states are checked', async () => {
  const s = await setup();
  for (const field of ['count', 'final_real_q'] as const) {
    const payload = structuredClone(claims(s.response).sample_response) as SampleResponse;
    if (field === 'count') payload.samples[0].count = (payload.samples[0].count + 1) % 17;
    else payload.samples[0].final_real_q = (BigInt(payload.samples[0].final_real_q) + 1n).toString();
    const response = await sealSampleMessage('response', payload, s.keys, at, 'world:worker');
    for (const checker of [typescriptChecker, pythonChecker()]) {
      const report = await verifyChallenge(s.context, s.challenge, response, checker);
      assert.equal(report.claims.commitment_membership_verified, true);
      assert.equal(report.claims.sampled_computation_verified, false);
      assert.deepEqual(report.errors, ['SAMPLED_COMPUTATION_MISMATCH']);
    }
  }
});

test('unsampled committed corruption can pass sampling: full artifact and full computation remain unclaimed', async () => {
  const s = await setup(golden.job, 1, counts => { counts[0] = (counts[0] + 1) % 17; });
  let challenge = s.challenge;
  // Choose a non-hit for this limitation test; production challenges never grind a nonce.
  for (let tries = 0; (await inspectChallenge(s.context, challenge)).indices.includes(0); tries++) {
    assert.ok(tries < 100); challenge = await createChallenge(s.context, 1, s.challenger, at);
  }
  const response = await answerChallenge(s.context, challenge, s.counts, s.keys, at);
  const report = await verifyChallenge(s.context, challenge, response, pythonChecker());
  assert.equal(report.claims.sampled_computation_verified, true);
  assert.equal(report.claims.full_computation_verified, false); assert.equal(report.claims.artifact_hash_verified, false);
  // Even sampling every leaf does not verify its association with the JSON artifact's SHA-256.
  const all = await createChallenge(s.context, 12, s.challenger, at);
  const checked = await verifyChallenge(s.context, all, await answerChallenge(s.context, all, s.counts, s.keys, at), pythonChecker());
  assert.equal(checked.claims.sampled_computation_verified, false); assert.equal(checked.checked_count, 12);
  assert.equal(checked.claims.full_computation_verified, false); assert.equal(checked.claims.artifact_hash_verified, false);
});

test('Python sampled verifier works with worker/full maths files absent and a poisoned full-render function', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'work003-independent-'));
  try {
    const s = await setup();
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true });
    await cp(join(root, 'independent'), join(temp, 'independent'), { recursive: true });
    await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    for (const file of ['algorithm.ts', 'worker.ts', 'verifier.ts', 'challenge/worker.ts', 'challenge/typescript_checker.ts']) await rm(join(temp, 'src/useful_work', file));
    const py = join(temp, 'independent/julia_q24.py');
    await writeFile(py, (await readFile(py, 'utf8')).replace('def render(job):', 'def render(job):\n    raise ValueError("FULL_RENDER_FORBIDDEN")'));
    await writeFile(join(temp, 'input.json'), JSON.stringify({ work: s.context.crossing, challenge: s.challenge, response: s.response, job: s.work.artifacts['job-spec'].toString('base64') }));
    await writeFile(join(temp, 'check.mjs'), `
import {readFileSync} from 'node:fs';
import {inspectSampleWork} from './src/useful_work/challenge/exchange.ts';
import {verifyChallenge} from './src/useful_work/challenge/verifier.ts';
import {pythonChecker} from './src/useful_work/challenge/python_checker.ts';
const i=JSON.parse(readFileSync('input.json','utf8'));
console.log(JSON.stringify(await verifyChallenge(await inspectSampleWork(i.work,Buffer.from(i.job,'base64')),i.challenge,i.response,pythonChecker())));
`);
    const result = await child(['check.mjs'], temp);
    assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).claims.sampled_computation_verified, true);
    await assert.rejects(runPython('sample', { job_base64: s.work.artifacts['job-spec'].toString('base64'), indices: [0, 0] }), /DUPLICATE_SAMPLE_INDEX/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

const boundary: RenderJob = { ...golden.job, width: 1, height: 1, parameters: { c_real_q: 0, c_imag_q: 0 },
  bounds: { min_real_q: SCALE, max_real_q: 3 * SCALE, min_imag_q: -1, max_imag_q: 1 } };
const negative: RenderJob = { ...boundary,
  bounds: { min_real_q: -1, max_real_q: 1, min_imag_q: 0, max_imag_q: 2 },
  parameters: { c_real_q: 2 * SCALE - 89104, c_imag_q: 201703 } };
for (const [label, from, to, job] of [
  ['radius', 'imaginary * imaginary > 4 * Q * Q', 'imaginary * imaginary >= 4 * Q * Q', boundary],
  ['seed', 'seed[i:i + 4], "big"', 'seed[i:i + 4], "little"', golden.job],
  ['rounding', 'return -magnitude if numerator < 0 else magnitude', 'return numerator // denominator', negative],
] as const) test(`actual sampled Python ${label} mutation produces scoped contradictory receipts without a truth winner`, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'work003-mutant-'));
  try {
    const s = await setup(job, Math.min(64, job.width * job.height));
    const source = await readFile(PYTHON_SCRIPT, 'utf8'); assert.ok(source.includes(from));
    const mutated = source.replaceAll(from, to), script = join(temp, 'mutant.py'); await writeFile(script, mutated);
    const ts = await verifyChallenge(s.context, s.challenge, s.response, typescriptChecker);
    const py = await verifyChallenge(s.context, s.challenge, s.response, pythonChecker({ script }));
    assert.equal(ts.claims.sampled_computation_verified, true); assert.equal(py.claims.sampled_computation_verified, false);
    assert.deepEqual(py.errors, ['SAMPLED_COMPUTATION_MISMATCH']);
    assert.equal(py.implementation?.source_sha256, sha256Hex(Buffer.from(mutated)));
    const receipts = [await attest(ts, 'typescript'), await attest(py, 'python-mutant')];
    const comparison = await compareChallengeReceipts(receipts);
    assert.equal(comparison.relation, 'contradictory'); assert.equal(comparison.semantic_effect, 'none'); assert.equal('winner' in comparison, false);
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:peer', receiver_particular: 'particular:peer', contract_ref: 'contract:local' });
    await receiver.receive(s.response, at); await receiver.dispose(s.response.crossing_id, 'HOLD', at);
    const before = receiver.snapshot(); await compareChallengeReceipts(receipts); assert.deepEqual(receiver.snapshot(), before);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('offline verifier is FAILED/incomparable; receipt comparison rejects tampering, cross-scope and same key', async () => {
  const s = await setup();
  const report = await verifyChallenge(s.context, s.challenge, s.response, typescriptChecker), a = await attest(report, 'a');
  const offline = await verifyChallenge(s.context, s.challenge, s.response, pythonChecker({ executable: '/missing/python' }));
  const b = await attest(offline, 'offline'); assert.equal(b.kind, 'FAILED'); assert.deepEqual(offline.errors, ['PYTHON_UNAVAILABLE']);
  assert.equal((await compareChallengeReceipts([a, b])).relation, 'incomparable');
  const tampered = structuredClone(a); tampered.extensions.useful_work_challenge.checked_count++;
  await assert.rejects(compareChallengeReceipts([a, tampered]), /INVALID_RECEIPT_SIGNATURE/);
  const other = await setup(), different = await attest(await verifyChallenge(other.context, other.challenge, other.response, pythonChecker()), 'other');
  await assert.rejects(compareChallengeReceipts([a, different]), /RECEIPT_SCOPE_MISMATCH/);
  const keys = await generateP256KeyPair();
  const same = await Promise.all(['a', 'b'].map(world_id => challengeReceipt(report, keys, at, { world_id, receiver_particular: world_id })));
  await assert.rejects(compareChallengeReceipts(same), /DISTINCT_WORLDS_REQUIRED/);
  const lie = structuredClone(report); lie.claims.full_computation_verified = true as never;
  await assert.rejects(attest(lie, 'liar'), /INVALID_CHALLENGE_CLAIM/);
});

test('shared sampled TypeScript worker/reference mutation agrees locally while Python issues a contradictory scoped receipt', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'work003-ts-mutant-'));
  try {
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true });
    await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    const path = join(temp, 'src/useful_work/algorithm.ts'), original = await readFile(path, 'utf8');
    const from = 'zi * zi <= 4n * q * q'; assert.ok(original.includes(from));
    const mutated = original.replace(from, 'zi * zi < 4n * q * q'); await writeFile(path, mutated);
    await writeFile(join(temp, 'job.json'), JSON.stringify(boundary));
    await writeFile(join(temp, 'mutant.mjs'), `
import {readFileSync} from 'node:fs';
import {generateP256KeyPair} from './src/protocol.ts';
import {sealOpaqueOrganCrossing} from './src/organ.ts';
import {executeJob,organSpec} from './src/useful_work/worker.ts';
import {buildCommitment} from './src/useful_work/challenge/commitment.ts';
import {inspectSampleWork,createChallenge} from './src/useful_work/challenge/exchange.ts';
import {answerChallenge} from './src/useful_work/challenge/worker.ts';
import {verifyChallenge} from './src/useful_work/challenge/verifier.ts';
import {typescriptChecker} from './src/useful_work/challenge/typescript_checker.ts';
const w=executeJob(JSON.parse(readFileSync('job.json','utf8'))),keys=await generateP256KeyPair(),spec=organSpec(w.manifest,'${at}');
spec.donor_claims.sample_commitment=buildCommitment(w.manifest.job_spec_hash,w.manifest.result_hash,w.result.escape_counts).commitment;
const work=await sealOpaqueOrganCrossing(spec,keys),context=await inspectSampleWork(work,w.artifacts['job-spec']);
const challenge=await createChallenge(context,1,await generateP256KeyPair(),'${at}');
const response=await answerChallenge(context,challenge,w.result.escape_counts,keys,'${at}');
console.log(JSON.stringify({work,challenge,response,job:w.artifacts['job-spec'].toString('base64'),report:await verifyChallenge(context,challenge,response,typescriptChecker)}));
`);
    const result = await child(['mutant.mjs'], temp); assert.equal(result.code, 0, result.stderr);
    const data = JSON.parse(result.stdout), ts = data.report as ChallengeReport;
    assert.equal(ts.claims.sampled_computation_verified, true);
    assert.equal(ts.implementation?.source_sha256, sha256Hex(Buffer.from(mutated)));
    const context = await inspectSampleWork(data.work, Buffer.from(data.job, 'base64'));
    const py = await verifyChallenge(context, data.challenge, data.response, pythonChecker());
    assert.equal(py.claims.sampled_computation_verified, false); assert.deepEqual(py.errors, ['SAMPLED_COMPUTATION_MISMATCH']);
    const comparison = await compareChallengeReceipts([await attest(ts, 'typescript-mutant'), await attest(py, 'python-original')]);
    assert.equal(comparison.relation, 'contradictory'); assert.equal('winner' in comparison, false);
    assert.equal(comparison.subject.population, 1);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('signed malformed challenge and untrustworthy checker output fail explicitly', async () => {
  const s = await setup();
  for (const change of [{ sample_count: 0 }, { nonce: 'predictable' }, { unknown: 1 }]) {
    const payload = { ...claims(s.challenge).sample_challenge, ...change };
    const challenge = await sealSampleMessage('challenge', payload as Challenge, s.challenger, at, 'world:challenger');
    await assert.rejects(inspectChallenge(s.context, challenge));
  }
  const checker: SampleChecker = async (bytes, indices) => {
    const result = await typescriptChecker(bytes, indices);
    result.samples[1] = result.samples[0]; return result;
  };
  const report = await verifyChallenge(s.context, s.challenge, s.response, checker);
  assert.deepEqual(report.errors, ['CHECKER_SAMPLE_SET_MISMATCH']);
  assert.equal(report.claims.sampled_computation_verified, false); assert.equal(report.checked_count, 0);
  assert.equal((await attest(report, 'invalid-checker')).kind, 'FAILED');
  const tree = buildCommitment('1'.repeat(64), '2'.repeat(64), [1, 2, 3]);
  assert.equal(verifyMembership({ ...tree.commitment, result_hash: '3'.repeat(64) }, 0, 1, tree.proof(0)), false);
  assert.equal(verifyMembership(tree.commitment, 3, 0, tree.proof(0)), false); // padded entry is never a sample
  assert.throws(() => buildCommitment('1'.repeat(64), '2'.repeat(64), new Array(3)), /INVALID_ESCAPE_COUNT/);
});

test('Kernel 003 demo persists signed exchange and later verification needs only job and portable messages', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'work003-demo-'));
  try {
    const out = join(temp, 'demo');
    const result = await child(['src/useful_work/cli_003.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--out', out]);
    assert.equal(result.code, 0, result.stderr);
    const comparison = JSON.parse(await readFile(join(out, 'worlds/comparison.json'), 'utf8'));
    assert.equal(comparison.relation, 'compatible'); assert.equal(comparison.subject.indices.length, 16);
    const workPath = join(out, 'prepared/delivery/work.json'), work = (await readFileBundle(workPath)).crossing;
    const jobHash = claims(work).useful_work.job_spec_hash;
    const portable = join(temp, 'portable'); await mkdir(join(portable, 'artifacts'), { recursive: true });
    await cp(workPath, join(portable, 'work.json'));
    await cp(join(out, 'prepared/delivery/artifacts', jobHash), join(portable, 'artifacts', jobHash));
    await cp(join(out, 'challenge/challenge.json'), join(portable, 'challenge.json'));
    await cp(join(out, 'answer/response.json'), join(portable, 'response.json'));
    await rm(out, { recursive: true }); // No full artifacts or worker key remain.
    const later = await child(['src/useful_work/cli_003.ts', 'verify', join(portable, 'work.json'), join(portable, 'challenge.json'), join(portable, 'response.json'), '--out', join(temp, 'later')]);
    assert.equal(later.code, 0, later.stderr);
    for (const label of ['typescript', 'python']) {
      const r = JSON.parse(await readFile(join(temp, 'later', label, 'verification-receipt.json'), 'utf8'));
      assert.equal(await verifyReceipt(r), true); assert.equal(r.extensions.useful_work_challenge.claims.sampled_computation_verified, true);
      assert.equal(r.extensions.useful_work_challenge.claims.artifact_hash_verified, false);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
