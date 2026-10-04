import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalize, sha256Hex } from '../src/canonical.ts';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing, verifyOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { runOpaqueOrganRoundTrip } from '../src/roundtrip.ts';
import { readFileBundle } from '../src/transport.ts';
import { canonicalBytes, executeJob, organSpec, parseJob, ROLES, verificationReceipt, verifyWork } from '../src/useful_work/index.ts';
import type { WorkManifest } from '../src/useful_work/index.ts';

const golden = JSON.parse(await readFile(new URL('../fixtures/useful-work-001-golden.json', import.meta.url), 'utf8'));
const at = '2026-10-04T00:00:00.000Z';
function work() { return executeJob(golden.job); }
async function crossing(manifest: WorkManifest) {
  return sealOpaqueOrganCrossing(organSpec(manifest, at), await generateP256KeyPair());
}
function sourceFor(artifacts: ReturnType<typeof work>['artifacts']) {
  const byHash = new Map(ROLES.map(role => [`sha256:${sha256Hex(artifacts[role])}`, artifacts[role]]));
  return async (address: string) => {
    const bytes = byHash.get(address);
    if (!bytes) throw new Error('ARTIFACT_UNAVAILABLE');
    return bytes;
  };
}

test('golden: same canonical specification gives byte-identical result across workers', () => {
  const a = work();
  const b = executeJob({ ...golden.job, bounds: { ...golden.job.bounds } });
  assert.equal(a.manifest.job_spec_hash, golden.job_spec_hash);
  assert.equal(a.manifest.result_hash, golden.result_hash);
  assert.deepEqual(a.result, golden.result);
  assert.deepEqual(a.artifacts['canonical-result'], b.artifacts['canonical-result']);
  assert.deepEqual(a.artifacts.presentation, b.artifacts.presentation);
  assert.deepEqual(a.result.escape_counts, [2, 3, 3, 2, 16, 16, 16, 16, 2, 3, 3, 2]);
  assert.equal(canonicalize({ ...a.job, seed: 1 }), a.artifacts['job-spec'].toString());
});

test('altered seed changes job and result identity and affects a nontrivial rendering', async () => {
  const demo = JSON.parse(await readFile(new URL('../examples/useful-work-001/julia-001.json', import.meta.url), 'utf8'));
  const a = executeJob(demo);
  const b = executeJob({ ...demo, seed: 2 });
  assert.notEqual(a.manifest.job_spec_hash, b.manifest.job_spec_hash);
  assert.notEqual(a.manifest.result_hash, b.manifest.result_hash);
  assert.notDeepEqual(a.result.escape_counts, b.result.escape_counts);
});

test('modified but structurally valid result bytes fail hash verification', async () => {
  const a = work();
  const envelope = await crossing(a.manifest);
  const changed = { ...a.result, escape_counts: [...a.result.escape_counts] };
  changed.escape_counts[0]++;
  const source = sourceFor(a.artifacts);
  const report = await verifyWork(envelope, async address =>
    address === `sha256:${a.manifest.result_hash}` ? canonicalBytes(changed) : source(address));
  assert.deepEqual(report.claims, {
    artifact_received: true, artifact_structurally_valid: true,
    artifact_hash_matches: false, computation_independently_verified: false,
  });
  assert.deepEqual(report.errors, ['ARTIFACT_HASH_MISMATCH']);
});

test('a signed, self-consistent false computation passes hashes but fails recomputation', async () => {
  const a = work();
  const falseResult = { ...a.result, escape_counts: a.result.escape_counts.map(() => 0) };
  a.artifacts['canonical-result'] = canonicalBytes(falseResult);
  const manifest = { ...a.manifest, result_hash: sha256Hex(a.artifacts['canonical-result']) };
  const envelope = await crossing(manifest);
  const source = sourceFor(a.artifacts);
  const shallow = await verifyWork(envelope, source, 'hash-only');
  assert.equal(shallow.claims.artifact_hash_matches, true);
  assert.equal(shallow.claims.computation_independently_verified, false);
  assert.deepEqual(shallow.errors, []);
  const full = await verifyWork(envelope, source);
  assert.equal(full.claims.artifact_structurally_valid, true);
  assert.equal(full.claims.artifact_hash_matches, true);
  assert.equal(full.claims.computation_independently_verified, false);
  assert.deepEqual(full.errors, ['COMPUTATION_MISMATCH']);
  const receipt = await verificationReceipt(full, await generateP256KeyPair(), at);
  assert.equal(receipt.kind, 'FAILED');
  assert.equal(await verifyReceipt(receipt), true);
});

test('altered specification fails, including signed rebinding to an old result', async () => {
  const a = work();
  const envelope = await crossing(a.manifest);
  const changedJob = canonicalBytes({ ...a.job, seed: 2 });
  const originalSource = sourceFor(a.artifacts);
  const tampered = await verifyWork(envelope, async address =>
    address === `sha256:${a.manifest.job_spec_hash}` ? changedJob : originalSource(address));
  assert.equal(tampered.claims.computation_independently_verified, false);
  assert.deepEqual(tampered.errors, ['ARTIFACT_HASH_MISMATCH']);
  a.artifacts['job-spec'] = changedJob;
  const rebind = { ...a.manifest, job_spec_hash: sha256Hex(changedJob) };
  const report = await verifyWork(await crossing(rebind), sourceFor(a.artifacts));
  assert.equal(report.claims.artifact_hash_matches, true);
  assert.deepEqual(report.errors, ['RESULT_JOB_MISMATCH']);
});

test('opaque round trip preserves payload identity; sovereign RECEIVE/HOLD asserts no admission or ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'useful-work-roundtrip-'));
  try {
    const a = work();
    const trip = await runOpaqueOrganRoundTrip({
      schema: 'relatte.opaque-roundtrip-request/v0', spec: organSpec(a.manifest, at),
      receiver_root: join(root, 'receiver'), receiver: {
        world_id: 'world:kernel-test', receiver_particular: 'particular:kernel-test', contract_ref: 'contract:kernel-test/v1',
      },
      bundle_path: join(root, 'bundle.json'), result_path: join(root, 'roundtrip.json'),
      disposition: 'HOLD', transport_created_at: at, received_at: at, disposed_at: at, route_note: 'kernel test',
    });
    const delivered = await readFileBundle(join(root, 'bundle.json'));
    assert.equal(await verifyOpaqueOrganCrossing(delivered.crossing), true);
    assert.equal(canonicalize(delivered.crossing), canonicalize(trip.crossing));
    assert.deepEqual(delivered.crossing.extensions.organ_adapter.donor_claims.useful_work, a.manifest);
    assert.equal(trip.receive_receipt.kind, 'RECEIVED');
    assert.equal(trip.disposition_receipt.kind, 'R3_HOLD');
    assert.equal(trip.receive_receipt.semantic_effect, 'none');
    assert.equal(trip.disposition_receipt.semantic_effect, 'none');
    assert.equal(trip.crossing.extensions.organ_adapter.donor_claims.ownership_asserted, false);
    assert.equal(trip.disposition_receipt.extensions.local_receiver.protected_payload_effect, false);
    assert.equal(await verifyReceipt(trip.receive_receipt), true);
    assert.equal(await verifyReceipt(trip.disposition_receipt), true);
    const restarted = await LocalReceiver.open(join(root, 'receiver'));
    assert.deepEqual(restarted.snapshot().held, [trip.crossing.crossing_id]);
    const report = await verifyWork(delivered.crossing, sourceFor(a.artifacts));
    assert.equal(report.claims.computation_independently_verified, true);
    const receipt = await verificationReceipt(report, await generateP256KeyPair(), at);
    assert.equal(receipt.schema, 'relatte.receipt/v0');
    assert.equal(receipt.kind, 'VERIFIED');
    assert.equal(receipt.semantic_effect, 'none');
    assert.equal(await verifyReceipt(receipt), true);
    receipt.extensions.useful_work.claims.computation_independently_verified = false;
    assert.equal(await verifyReceipt(receipt), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed or unsupported jobs and resource excess fail explicitly', () => {
  for (const [job, code] of [
    [null, 'INVALID_JOB'], [{ ...golden.job, algorithm: 'unknown' }, 'UNSUPPORTED_ALGORITHM'],
    [{ ...golden.job, seed: -1 }, 'INVALID_SEED'], [{ ...golden.job, width: 1.5 }, 'INVALID_WIDTH'],
    [{ ...golden.job, iterations: 0 }, 'INVALID_ITERATIONS'],
    [{ ...golden.job, width: 512, height: 512, iterations: 4096 }, 'WORK_LIMIT_EXCEEDED'],
    [{ ...golden.job, extra: true }, 'INVALID_JOB_FIELDS'],
    [{ ...golden.job, parameters: { ...golden.job.parameters, mystery: 1 } }, 'INVALID_PARAMETER_FIELDS'],
    [{ ...golden.job, bounds: { ...golden.job.bounds, max_real_q: golden.job.bounds.min_real_q } }, 'EMPTY_BOUNDS'],
  ] as const) {
    assert.throws(() => parseJob(job), new RegExp(code));
  }
});

test('missing, malformed, noncanonical and unsupported payloads never claim computational verification', async () => {
  const a = work();
  const envelope = await crossing(a.manifest);
  const missing = await verifyWork(envelope, async () => { throw new Error('ARTIFACT_UNAVAILABLE'); });
  assert.equal(missing.claims.artifact_received, false);
  assert.deepEqual(missing.errors, ['ARTIFACT_UNAVAILABLE']);
  const cases = [
    ['canonical-result', Buffer.from('{'), 'INVALID_JSON'],
    ['canonical-result', Buffer.from(JSON.stringify(a.result, null, 2)), 'NON_CANONICAL_JSON'],
    ['canonical-result', canonicalBytes({ ...a.result, escape_counts: [1] }), 'INVALID_SAMPLE_COUNT'],
    ['job-spec', canonicalBytes({ ...a.job, algorithm: 'unknown' }), 'UNSUPPORTED_ALGORITHM'],
    ['presentation', Buffer.from('invalid'), 'INVALID_PRESENTATION'],
  ] as const;
  for (const [role, bytes, code] of cases) {
    const index = ROLES.indexOf(role);
    const hash = [a.manifest.job_spec_hash, a.manifest.result_hash, a.manifest.presentation_hash, a.manifest.metadata_hash][index];
    const original = sourceFor(a.artifacts);
    const report = await verifyWork(envelope, async address => address === `sha256:${hash}` ? bytes : original(address));
    assert.equal(report.claims.artifact_received, true);
    assert.equal(report.claims.artifact_structurally_valid, false);
    assert.equal(report.claims.computation_independently_verified, false);
    assert.match(report.errors[0], new RegExp(code));
  }
});

test('signed crossing tampering and payload/manifest confusion fail explicitly', async () => {
  const a = work();
  const envelope = await crossing(a.manifest);
  const altered = structuredClone(envelope);
  altered.extensions.organ_adapter.donor_claims.useful_work.job_spec_hash = '0'.repeat(64);
  await assert.rejects(verifyWork(altered, sourceFor(a.artifacts)), /INVALID_OPAQUE_CROSSING/);
  const spec = organSpec(a.manifest, at);
  spec.payload_refs[0].address = `sha256:${'0'.repeat(64)}`;
  const mismatch = await sealOpaqueOrganCrossing(spec, await generateP256KeyPair());
  const report = await verifyWork(mismatch, sourceFor(a.artifacts));
  assert.deepEqual(report.errors, ['PAYLOAD_MANIFEST_MISMATCH']);
  assert.equal(report.claims.computation_independently_verified, false);
});

function cli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', 'src/useful_work/cli.ts', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

test('CLI end-to-end: portable delivery verifies after relocation without worker or receiver state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'useful-work-cli-'));
  try {
    const jobPath = join(root, 'job.json');
    await writeFile(jobPath, JSON.stringify(golden.job));
    const out = join(root, 'run');
    const run = await cli(['run', jobPath, '--out', out]);
    assert.equal(run.code, 0, run.stderr);
    const delivery = join(root, 'relocated-delivery');
    await cp(join(out, 'delivery'), delivery, { recursive: true });
    for (const [i, role] of ROLES.entries()) {
      const a = work();
      const names = ['job.json', 'result.json', 'render.ppm', 'execution.json'];
      const original = await readFile(join(out, 'worker', names[i]));
      const received = await readFile(join(delivery, 'artifacts', sha256Hex(original)));
      assert.deepEqual(original, received, role);
      if (role === 'canonical-result') assert.deepEqual(original, a.artifacts[role]);
    }
    await rm(out, { recursive: true });
    const verifyOut = join(root, 'later-verifier');
    const later = await cli(['verify', join(delivery, 'crossing.json'), '--out', verifyOut]);
    assert.equal(later.code, 0, later.stderr);
    const receipt = JSON.parse(await readFile(join(verifyOut, 'verification-receipt.json'), 'utf8'));
    assert.equal(receipt.extensions.useful_work.claims.computation_independently_verified, true);
    assert.equal(await verifyReceipt(receipt), true);
    const publicKey = JSON.parse(await readFile(join(verifyOut, 'verifier-public-key.json'), 'utf8'));
    assert.deepEqual(receipt.signing.public_key, publicKey);
    assert.equal(publicKey.d, undefined);
    const hashOnly = await cli(['verify', join(delivery, 'crossing.json'), '--out', join(root, 'shallow'), '--hash-only']);
    assert.equal(hashOnly.code, 0, hashOnly.stderr);
    const shallow = JSON.parse(await readFile(join(root, 'shallow', 'verification-receipt.json'), 'utf8'));
    assert.equal(shallow.extensions.useful_work.claims.artifact_hash_matches, true);
    assert.equal(shallow.extensions.useful_work.claims.computation_independently_verified, false);
    await writeFile(join(delivery, 'artifacts', golden.result_hash), Buffer.from('{}'));
    const failed = await cli(['verify', join(delivery, 'crossing.json'), '--out', join(root, 'failed')]);
    assert.equal(failed.code, 1);
    const failedReceipt = JSON.parse(await readFile(join(root, 'failed', 'verification-receipt.json'), 'utf8'));
    assert.equal(failedReceipt.kind, 'FAILED');
    assert.equal(await verifyReceipt(failedReceipt), true);
    assert.equal(failedReceipt.extensions.useful_work.claims.computation_independently_verified, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
