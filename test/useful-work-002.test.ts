import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonicalize, sha256Hex } from '../src/canonical.ts';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes, parseJob, SCALE } from '../src/useful_work/job.ts';
import { executeJob, organSpec, ROLES } from '../src/useful_work/worker.ts';
import { verifyWork } from '../src/useful_work/verifier.ts';
import { PYTHON_SCRIPT, runPython, verifyWorkPython } from '../src/useful_work/python_verifier.ts';
import { verificationReceipt } from '../src/useful_work/receipt.ts';
import { compareWorkReceipts } from '../src/useful_work/comparison.ts';
import type { RenderJob } from '../src/useful_work/job.ts';
import type { VerificationResult } from '../src/useful_work/verification_types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const golden = JSON.parse(await readFile(join(root, 'fixtures/useful-work-001-golden.json'), 'utf8'));
const demo = JSON.parse(await readFile(join(root, 'examples/useful-work-001/julia-001.json'), 'utf8'));
const at = '2026-10-05T00:00:00.000Z';
const boundary: RenderJob = { ...golden.job, width: 1, height: 1, parameters: { c_real_q: 0, c_imag_q: 0 },
  bounds: { min_real_q: SCALE, max_real_q: 3 * SCALE, min_imag_q: -1, max_imag_q: 1 } };
// seed=1 offsets are +89104,-201702. First state is (0,1), so the
// real numerator is -1: truncation gives 0; Python floor division gives -1.
const negativeRounding: RenderJob = { ...boundary,
  bounds: { min_real_q: -1, max_real_q: 1, min_imag_q: 0, max_imag_q: 2 },
  parameters: { c_real_q: 2 * SCALE - 89104, c_imag_q: 201703 } };

function vectors(): RenderJob[] {
  let state = 0x002c0ffe;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const jobs: RenderJob[] = [golden.job, demo, boundary,
    { ...boundary, seed: 0xffffffff, bounds: { ...boundary.bounds, min_real_q: 2 * SCALE, max_real_q: 2 * SCALE + 2 } },
    { ...boundary, seed: 0, iterations: 4096, bounds: { min_real_q: -1, max_real_q: 1, min_imag_q: -1, max_imag_q: 1 } },
    { ...golden.job, width: 512, height: 1, iterations: 1 },
    { ...golden.job, width: 1, height: 512, iterations: 1 }, negativeRounding,
  ];
  for (let i = 0; i < 192; i++) {
    const seed = next(), width = next() % 13 + 1, height = next() % 11 + 1, iterations = next() % 128 + 1;
    // Include both fractal neighborhoods and the full permitted bounds/constant ranges.
    const bounds = i % 3 ? { ...demo.bounds } : {
      min_real_q: -4 * SCALE + next() % (6 * SCALE), max_real_q: 4 * SCALE,
      min_imag_q: -4 * SCALE + next() % (6 * SCALE), max_imag_q: 4 * SCALE,
    };
    jobs.push({ ...demo, seed, width, height, iterations, bounds,
      parameters: i % 3 ? { c_real_q: -13421773 + next() % 1000000, c_imag_q: 2100000 + next() % 1000000 } :
        { c_real_q: next() % (4 * SCALE + 1) - 2 * SCALE, c_imag_q: next() % (4 * SCALE + 1) - 2 * SCALE },
    });
  }
  return jobs;
}
function sourceFor(work: ReturnType<typeof executeJob>) {
  const bytes = new Map(ROLES.map(role => [`sha256:${sha256Hex(work.artifacts[role])}`, work.artifacts[role]]));
  return async (address: string) => {
    const value = bytes.get(address);
    if (!value) throw new Error('ARTIFACT_UNAVAILABLE');
    return value;
  };
}
async function crossing(work: ReturnType<typeof executeJob>) {
  return sealOpaqueOrganCrossing(organSpec(work.manifest, at), await generateP256KeyPair());
}
async function attest(report: VerificationResult, label: string) {
  return verificationReceipt(report, await generateP256KeyPair(), at,
    { world_id: `world:${label}`, receiver_particular: `particular:${label}` });
}
async function child(args: string[], cwd = root): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const processChild = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    processChild.stdout.on('data', chunk => { stdout += chunk; });
    processChild.stderr.on('data', chunk => { stderr += chunk; });
    processChild.once('error', reject);
    processChild.once('close', code => resolveResult({ code, stdout, stderr }));
  });
}

test('independent Python matches golden bytes/hashes and 200 reproducible generated/edge jobs', async () => {
  const jobs = vectors();
  assert.equal(jobs.length, 200);
  const results = await runPython('render', { jobs });
  assert.deepEqual(results[0].result, golden.result);
  assert.equal(results[0].result_hash, golden.result_hash);
  assert.deepEqual(results[2].result.escape_counts, [1]); // radius equality executes one step
  assert.deepEqual(results[3].result.escape_counts, [0]); // initial coordinate already escaped
  assert.deepEqual(results[4].result.escape_counts, [4096]); // saturated count, not proof of membership
  assert.deepEqual(results[7].result.escape_counts, [1]); // negative numerator truncates toward zero
  const edges = JSON.parse(await readFile(join(root, 'fixtures/useful-work-002-edges.json'), 'utf8'));
  for (const [i, edge] of edges.entries()) {
    assert.deepEqual(results[[2, 7][i]].result, edge.result);
    assert.equal(results[[2, 7][i]].result_hash, edge.result_hash);
    assert.equal(sha256Hex(canonicalBytes(edge.job)), edge.job_spec_hash);
  }
  for (const [i, job] of jobs.entries()) {
    const ts = executeJob(job);
    assert.deepEqual(results[i].result, ts.result, `vector ${i}: ${canonicalize(job)}`);
    assert.equal(results[i].result_hash, ts.manifest.result_hash, `vector ${i}`);
    assert.equal(sha256Hex(canonicalBytes(results[i].result)), ts.manifest.result_hash);
  }
});

test('Python validates maths independently, including bools, work limits and duplicate/noncanonical JSON', async () => {
  const invalid = [
    { ...golden.job, seed: true }, { ...golden.job, algorithm: 'unimplemented' },
    { ...golden.job, iterations: 0 }, { ...golden.job, width: 512, height: 512, iterations: 4096 },
    { ...golden.job, parameters: { ...golden.job.parameters, extra: 1 } },
  ];
  for (const job of invalid) await assert.rejects(runPython('render', { jobs: [job] }));
  assert.throws(() => parseJob(invalid[0]), /INVALID_SEED/);
  const verify = (jobBytes: Buffer, resultBytes: Buffer) => runPython('verify', {
    job_base64: jobBytes.toString('base64'), result_base64: resultBytes.toString('base64'),
  });
  await assert.rejects(verify(Buffer.from(JSON.stringify(golden.job, null, 2)), canonicalBytes(golden.result)), /NON_CANONICAL_JOB/);
  const duplicated = canonicalBytes(golden.job).toString().replace('"seed":1', '"seed":1,"seed":1');
  await assert.rejects(verify(Buffer.from(duplicated), canonicalBytes(golden.result)), /DUPLICATE_JSON_KEY/);
  await assert.rejects(verify(canonicalBytes(golden.job), canonicalBytes({ ...golden.result, job_spec_hash: '0'.repeat(64) })), /RESULT_JOB_MISMATCH/);
  await assert.rejects(verify(canonicalBytes(golden.job), canonicalBytes({ ...golden.result, escape_counts: [1] })), /INVALID_SAMPLE_COUNT/);
});

test('Python bridge has no transitive worker algorithm import and runs with that file absent', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'useful-work-independent-'));
  try {
    await cp(join(root, 'src'), join(temp, 'src'), { recursive: true });
    await cp(join(root, 'independent'), join(temp, 'independent'), { recursive: true });
    await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    await rm(join(temp, 'src/useful_work/algorithm.ts'));
    await rm(join(temp, 'src/useful_work/worker.ts'));
    await rm(join(temp, 'src/useful_work/verifier.ts'));
    const work = executeJob(golden.job);
    const envelope = await crossing(work);
    await writeFile(join(temp, 'input.json'), JSON.stringify({ crossing: envelope,
      artifacts: Object.fromEntries(ROLES.map(role => [`sha256:${sha256Hex(work.artifacts[role])}`, work.artifacts[role].toString('base64')])) }));
    await writeFile(join(temp, 'check.mjs'), `
import { readFileSync } from 'node:fs';
import { verifyWorkPython } from './src/useful_work/python_verifier.ts';
const input = JSON.parse(readFileSync('input.json', 'utf8'));
console.log(JSON.stringify(await verifyWorkPython(input.crossing, async address => Buffer.from(input.artifacts[address], 'base64'))));
`);
    const output = await child(['check.mjs'], temp);
    assert.equal(output.code, 0, output.stderr);
    assert.equal(JSON.parse(output.stdout).claims.computation_independently_verified, true);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('both runtimes sign matched recomputation evidence; hash-only is incomparable, not a contradiction', async () => {
  const work = executeJob(golden.job), envelope = await crossing(work), source = sourceFor(work);
  const ts = await verifyWork(envelope, source), py = await verifyWorkPython(envelope, source);
  assert.equal(ts.claims.computation_independently_verified, true);
  assert.equal(py.claims.computation_independently_verified, true);
  assert.deepEqual(py.computation, ts.computation);
  assert.notEqual(py.implementation?.source_sha256, ts.implementation?.source_sha256);
  const a = await attest(ts, 'typescript'), b = await attest(py, 'python');
  assert.equal(await verifyReceipt(a), true); assert.equal(await verifyReceipt(b), true);
  const comparison = await compareWorkReceipts([a, b]);
  assert.equal(comparison.relation, 'compatible');
  assert.equal(comparison.comparison_id, (await compareWorkReceipts([b, a])).comparison_id);
  const shallow = await attest(await verifyWork(envelope, source, 'hash-only'), 'hash-only');
  assert.equal((await compareWorkReceipts([shallow, b])).relation, 'incomparable');
  const unavailable = await attest(await verifyWorkPython(envelope, source, { executable: '/not/a/python/runtime' }), 'offline');
  assert.equal(unavailable.kind, 'FAILED');
  assert.equal(unavailable.extensions.useful_work.claims.computation_independently_verified, false);
  assert.equal((await compareWorkReceipts([a, unavailable])).relation, 'incomparable');
});

test('both verifier worlds reject hash-consistent malformed metadata before any computation claim', async () => {
  for (const [change, error] of [
    [{ samples: golden.job.width * golden.job.height - 1 }, 'METADATA_SAMPLE_MISMATCH'],
    [{ started_at: 'not-a-timestamp' }, 'INVALID_METADATA_STARTED_AT'],
    [{ extra: true }, 'INVALID_METADATA_FIELDS'],
  ] as const) {
    const work = executeJob(golden.job);
    work.artifacts['execution-metadata'] = canonicalBytes({ ...work.metadata, ...change });
    work.manifest.metadata_hash = sha256Hex(work.artifacts['execution-metadata']);
    const envelope = await crossing(work), source = sourceFor(work);
    const reports = await Promise.all([verifyWork(envelope, source), verifyWorkPython(envelope, source)]);
    for (const report of reports) {
      assert.deepEqual(report.claims, { artifact_received: true, artifact_structurally_valid: false,
        artifact_hash_matches: true, computation_independently_verified: false });
      assert.deepEqual(report.errors, [error]);
      assert.equal(report.computation, undefined);
    }
    const receipts = await Promise.all(reports.map((report, i) => attest(report, `metadata-world-${i}`)));
    for (const receipt of receipts) assert.equal(await verifyReceipt(receipt), true);
    assert.equal((await compareWorkReceipts(receipts)).relation, 'incomparable');
  }
});

test('scope comparison rejects tampering, cross-wiring, one-key impersonation and signed unsupported claims', async () => {
  const work = executeJob(golden.job), envelope = await crossing(work), source = sourceFor(work);
  const report = await verifyWork(envelope, source);
  const a = await attest(report, 'a'), b = await attest(await verifyWorkPython(envelope, source), 'b');
  const changed = structuredClone(b); changed.extensions.useful_work.computation.recomputed_result_hash = '0'.repeat(64);
  await assert.rejects(compareWorkReceipts([a, changed]), /INVALID_COMPARISON_RECEIPT/);
  const otherWork = executeJob({ ...golden.job, seed: 2 });
  const otherReport = await verifyWorkPython(await crossing(otherWork), sourceFor(otherWork));
  await assert.rejects(compareWorkReceipts([a, await attest(otherReport, 'other')]), /INCOMPARABLE_SUBJECTS/);
  const shallowLie = await verifyWork(envelope, source, 'hash-only'); shallowLie.claims.computation_independently_verified = true;
  await assert.rejects(compareWorkReceipts([a, await attest(shallowLie, 'liar')]), /MISSING_COMPUTATION_EVIDENCE/);
  const keys = await generateP256KeyPair();
  const sameKey = await Promise.all(['world:a', 'world:b'].map(world_id => verificationReceipt(report, keys, at, { world_id, receiver_particular: world_id })));
  await assert.rejects(compareWorkReceipts(sameKey), /DISTINCT_WORLDS_AND_KEYS/);
});

const mutations = [
  { name: 'exclusive-radius', pyFrom: 'imaginary * imaginary > 4 * Q * Q', pyTo: 'imaginary * imaginary >= 4 * Q * Q',
    tsFrom: 'zi * zi <= 4n * q * q', tsTo: 'zi * zi < 4n * q * q' },
  { name: 'seed-endianness', pyFrom: 'digest[i:i + 4], "big"', pyTo: 'digest[i:i + 4], "little"',
    tsFrom: 'readUInt32BE', tsTo: 'readUInt32LE' },
  { name: 'negative-floor-division', pyFrom: 'return -magnitude if numerator < 0 else magnitude', pyTo: 'return numerator // denominator',
    tsFrom: 'const nextReal = (zr * zr - zi * zi) / q + cr;',
    tsTo: 'const numerator = zr * zr - zi * zi;\n        const nextReal = (numerator < 0n ? -((-numerator + q - 1n) / q) : numerator / q) + cr;' },
];

for (const mutation of mutations) {
  test(`actual Python source mutation ${mutation.name} is detected and produces scoped contradictory receipts`, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'useful-work-py-mutant-'));
    try {
      const source = await readFile(PYTHON_SCRIPT, 'utf8');
      assert.ok(source.includes(mutation.pyFrom), 'mutation must edit actual source');
      const path = join(temp, 'mutant.py');
      await writeFile(path, source.replaceAll(mutation.pyFrom, mutation.pyTo));
      const jobs = vectors();
      const mutated = await runPython('render', { jobs }, { script: path });
      const index = jobs.findIndex((job, i) => canonicalize(executeJob(job).result) !== canonicalize(mutated[i].result));
      assert.ok(index >= 0, 'corpus must kill this actual algorithm mutation');
      const work = executeJob(jobs[index]), envelope = await crossing(work);
      const ts = await verifyWork(envelope, sourceFor(work));
      const py = await verifyWorkPython(envelope, sourceFor(work), { script: path });
      assert.equal(ts.claims.computation_independently_verified, true);
      assert.equal(py.claims.artifact_hash_matches, true);
      assert.equal(py.claims.artifact_structurally_valid, true);
      assert.deepEqual(py.errors, ['COMPUTATION_MISMATCH']);
      assert.equal(py.implementation?.source_sha256, sha256Hex(Buffer.from(source.replaceAll(mutation.pyFrom, mutation.pyTo))));
      const receipts = [await attest(ts, 'typescript-original'), await attest(py, 'python-' + mutation.name)];
      const comparison = await compareWorkReceipts(receipts);
      assert.equal(comparison.relation, 'contradictory');
      assert.deepEqual(comparison.observations.map(o => o.conclusion).sort(), ['matched', 'mismatched']);
      assert.equal(comparison.semantic_effect, 'none'); assert.equal('winner' in comparison, false);
      const receiver = await LocalReceiver.create(join(temp, 'receiver'), {
        world_id: 'world:holding-peer', receiver_particular: 'particular:holding-peer', contract_ref: 'contract:local',
      });
      await receiver.receive(envelope, at); await receiver.dispose(envelope.crossing_id, 'HOLD', at);
      assert.deepEqual(receiver.snapshot().held, [envelope.crossing_id]);
      assert.equal(receiver.getDispositionReceipt(envelope.crossing_id)?.semantic_effect, 'none');
    } finally { await rm(temp, { recursive: true, force: true }); }
  });

  test(`shared TypeScript worker/verifier source mutation ${mutation.name} can agree locally while Python contradicts`, async () => {
    const temp = await mkdtemp(join(tmpdir(), 'useful-work-ts-mutant-'));
    try {
      await cp(join(root, 'src'), join(temp, 'src'), { recursive: true });
      await cp(join(root, 'package.json'), join(temp, 'package.json'));
      await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
      const path = join(temp, 'src/useful_work/algorithm.ts');
      const original = await readFile(path, 'utf8');
      assert.ok(original.includes(mutation.tsFrom));
      await writeFile(path, original.replaceAll(mutation.tsFrom, mutation.tsTo));
      const jobs = [boundary, demo, negativeRounding];
      await writeFile(join(temp, 'jobs.json'), JSON.stringify(jobs));
      await writeFile(join(temp, 'mutated-worker.mjs'), `
import { readFileSync } from 'node:fs';
import { executeJob, organSpec, ROLES } from './src/useful_work/worker.ts';
import { sha256Hex } from './src/canonical.ts';
import { generateP256KeyPair } from './src/protocol.ts';
import { sealOpaqueOrganCrossing } from './src/organ.ts';
import { verifyWork } from './src/useful_work/verifier.ts';
const records=[];
for (const job of JSON.parse(readFileSync('jobs.json','utf8'))) {
  const work=executeJob(job);
  const crossing=await sealOpaqueOrganCrossing(organSpec(work.manifest,'${at}'),await generateP256KeyPair());
  const artifacts=Object.fromEntries(ROLES.map(role=>['sha256:'+sha256Hex(work.artifacts[role]),work.artifacts[role].toString('base64')]));
  const report=await verifyWork(crossing,async address=>Buffer.from(artifacts[address],'base64'));
  records.push({crossing,artifacts,report,result:work.result});
}
console.log(JSON.stringify(records));
`);
      const childResult = await child(['mutated-worker.mjs'], temp);
      assert.equal(childResult.code, 0, childResult.stderr);
      const records = JSON.parse(childResult.stdout);
      const index = jobs.findIndex((job, i) => canonicalize(executeJob(job).result) !== canonicalize(records[i].result));
      assert.ok(index >= 0);
      const chosen = records[index];
      assert.equal(chosen.report.claims.computation_independently_verified, true, 'shared mutant is self-consistent');
      assert.equal(chosen.report.implementation.source_sha256, sha256Hex(Buffer.from(original.replaceAll(mutation.tsFrom, mutation.tsTo))));
      const py = await verifyWorkPython(chosen.crossing, async address => Buffer.from(chosen.artifacts[address], 'base64'));
      assert.equal(py.claims.artifact_hash_matches, true);
      assert.deepEqual(py.errors, ['COMPUTATION_MISMATCH']);
      const comparison = await compareWorkReceipts([await attest(chosen.report, 'typescript-' + mutation.name), await attest(py, 'python-original')]);
      assert.equal(comparison.relation, 'contradictory');
      assert.equal(comparison.subject?.result_hash, chosen.report.manifest.result_hash);
      assert.equal(comparison.semantic_effect, 'none');
      assert.equal('winner' in comparison, false);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}

test('Kernel 002 demo leaves two signed receipts; later Python verification survives relocation', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'useful-work-002-demo-'));
  try {
    const out = join(temp, 'demo');
    const result = await child(['src/useful_work/cli_002.ts', 'demo', 'examples/useful-work-001/julia-001.json', '--out', out]);
    assert.equal(result.code, 0, result.stderr);
    const receipts = await Promise.all(['typescript', 'python'].map(async label =>
      JSON.parse(await readFile(join(out, 'two-worlds', label, 'verification-receipt.json'), 'utf8'))));
    for (const receipt of receipts) assert.equal(await verifyReceipt(receipt), true);
    assert.equal((await compareWorkReceipts(receipts)).relation, 'compatible');
    const relocated = join(temp, 'portable'); await cp(join(out, 'delivery'), relocated, { recursive: true });
    await rm(out, { recursive: true });
    const later = await child(['src/useful_work/cli_002.ts', 'verify', join(relocated, 'crossing.json'), '--out', join(temp, 'later')]);
    assert.equal(later.code, 0, later.stderr);
    const report = JSON.parse(await readFile(join(temp, 'later/python/verifier-result.json'), 'utf8'));
    assert.equal(report.claims.computation_independently_verified, true);
    assert.equal(report.implementation.id, 'useful-work/python-q24/v1');
    const compare = await child(['src/useful_work/cli_002.ts', 'compare', join(temp, 'later/typescript/verification-receipt.json'),
      join(temp, 'later/python/verification-receipt.json'), '--out', join(temp, 'comparison')]);
    assert.equal(compare.code, 0, compare.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'comparison/comparison.json'), 'utf8')).relation, 'compatible');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('disagreement laboratory leaves durable contradictory receipts and both local HOLD histories', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'useful-work-002-lab-test-'));
  try {
    const out = join(temp, 'experiment');
    const run = await child(['examples/useful-work-002/disagreement.ts', '--out', out]);
    assert.equal(run.code, 0, run.stderr);
    const experiment = JSON.parse(await readFile(join(out, 'experiment.json'), 'utf8'));
    assert.equal(experiment.scenarios.length, 2);
    for (const scenario of experiment.scenarios) {
      const receipts = await Promise.all(['typescript', 'python'].map(async label =>
        JSON.parse(await readFile(join(out, scenario.label, 'two-worlds', label, 'verification-receipt.json'), 'utf8'))));
      assert.equal((await compareWorkReceipts(receipts)).comparison_id, scenario.comparison_id);
      assert.deepEqual(receipts.map(r => r.extensions.useful_work.claims.computation_independently_verified), [true, false]);
      assert.equal(receipts[1].extensions.useful_work.errors[0], 'COMPUTATION_MISMATCH');
      const receiver = await LocalReceiver.open(join(out, scenario.label, 'receiver'));
      assert.deepEqual(receiver.snapshot().held, [scenario.subject.crossing_id]);
      const source = await readFile(join(out, scenario.label,
        scenario.label === 'typescript-mutant' ? 'mutated-reference.ts' : 'mutated-reference.py'));
      const mutantReceipt = receipts[scenario.label === 'typescript-mutant' ? 0 : 1];
      assert.equal(mutantReceipt.extensions.useful_work.implementation.source_sha256, sha256Hex(source));
      assert.equal('winner' in scenario, false);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
