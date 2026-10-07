import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessFoundationBundle, forbidPrivateEvidence, replayParticularity, signingKeyIdentity, sealCrossingEnvelope, sealReceipt, assessTwoWitnessHandoff, createCapabilityGrant, hasCapability } from '../src/index.ts';
import { scenario } from './support/foundation.ts';
// @ts-ignore JS specimen orchestration intentionally uses separate processes.
import { buildFatherHandSpecimen } from '../scripts/foundation-of-trust-specimen.mjs';
// @ts-ignore Independent JS verification path.
import { independentlyVerify } from '../scripts/foundation-of-trust-independent.mjs';
// @ts-ignore Filesystem transport boundary.
import { readPublicBundleDirectory } from '../scripts/foundation-of-trust-artifacts.mjs';
// @ts-ignore Existing three-runner boundary, strengthened by this campaign.
import { verify as verifyCustody, receiver as custodyReceiver } from '../scripts/two-witness-custody-002.mjs';

async function custodyArtifacts(sourceDir: string, receiverDir: string, attack = '') {
  const s = await scenario();
  const sourceJob = { role: 'sender', run_id: '123', machine_fingerprint: '1'.repeat(64) };
  const receiverJob = { role: 'receiver', run_id: attack === 'mixed-run' ? '124' : '123', machine_fingerprint: attack === 'identical-machine' ? '1'.repeat(64) : '2'.repeat(64) };
  const crossing = await sealCrossingEnvelope({ ...s.crossing, extensions: { ...s.crossing.extensions, custody_002: { job: sourceJob, private_key_exported: false, law: 'PRIVATE KEY != PUBLIC WITNESS' } } }, s.keys[0]);
  const receipt = await sealReceipt({ ...s.receipts[0], crossing_id: crossing.crossing_id, extensions: { ...s.receipts[0].extensions, custody_002: { job: receiverJob, source_job: sourceJob, private_key_exported: false, law: 'DISTINCT RUNNER != DISTINCT HUMAN' } } }, attack === 'reuse-key' ? s.keys[0] : s.keys[1]);
  const source: any = { schema: 'relatte.two-witness-custody-source/v0', job: sourceJob, crossing, scope: 'public-source-witness-only;private-key-never-exported' };
  const receiver: any = { schema: 'relatte.two-witness-custody-receiver/v0', source_job: sourceJob, receiver_job: receiverJob, receipt, local_assessment: await assessTwoWitnessHandoff({ crossing, receiver_receipt: receipt }), scope: 'separate-ephemeral-runner;fresh-receiver-key;private-key-never-exported' };
  if (attack === 'unsigned-metadata') receiver.receiver_job = { ...receiverJob, machine_fingerprint: 'f'.repeat(64) };
  if (attack === 'A-private-in-B') receiver.privateKey = await crypto.subtle.exportKey('jwk', s.keys[0].privateKey);
  if (attack === 'C-private-leak') source.privateKey = await crypto.subtle.exportKey('jwk', s.keys[1].privateKey);
  await mkdir(sourceDir); await mkdir(receiverDir);
  await writeFile(join(sourceDir, 'source-witness.json'), JSON.stringify(source));
  await writeFile(join(receiverDir, 'receiver-witness.json'), JSON.stringify(receiver));
}

for (const [attack, reason] of [
  ['A-private-in-B', 'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT'], ['reuse-key', 'WITNESS_KEYS_NOT_DISTINCT'],
  ['identical-machine', 'NO_MACHINE_SEPARATION_EVIDENCE'], ['mixed-run', 'RUN_ID_MISMATCH'],
  ['unsigned-metadata', 'UNSIGNED_RECEIVER_JOB_METADATA'], ['C-private-leak', 'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT'],
] as const) {
  test(`F: ${attack} fails loudly with ${reason}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custody-hostile-'));
    try { await custodyArtifacts(join(dir, 'source'), join(dir, 'receiver'), attack); await assert.rejects(verifyCustody(join(dir, 'source'), join(dir, 'receiver'), { expected_run_id: '123' }), new RegExp(reason)); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('F: B cannot run receiver operation before A public witness exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'custody-order-'));
  try { await assert.rejects(custodyReceiver(join(dir, 'absent-source'), join(dir, 'receiver')), (e: any) => e.code === 'ENOENT'); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test('F: malicious valid participants can fabricate machine declarations; E4 stays UNOBSERVED', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'custody-ceiling-'));
  try {
    await custodyArtifacts(join(dir, 'source'), join(dir, 'receiver'));
    const result = await verifyCustody(join(dir, 'source'), join(dir, 'receiver'), { expected_run_id: '123' });
    assert.equal(result.status, 'CORROBORATED'); assert.equal(result.evidence_level, 'E3 CORROBORATED-KEYS');
    assert.equal(result.machine_separation, 'UNOBSERVED_FROM_SELF_REPORTED_FINGERPRINTS');
    assert.equal(result.custody_evidence.receiver_depended_on_sender_job, 'UNOBSERVED_FROM_ARTIFACTS');
    assert.equal(result.custody_domain_separation, 'UNOBSERVED');
    assert.equal(result.receiver_key_created_after_source_witness, 'UNOBSERVED_FROM_ARTIFACTS');
    assert.equal(result.private_material_never_copied_elsewhere, 'UNOBSERVED');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('G/K: valid historic custody pair cannot stand in for another live run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'custody-replay-'));
  try {
    await custodyArtifacts(join(dir, 'source'), join(dir, 'receiver'));
    const historical = await verifyCustody(join(dir, 'source'), join(dir, 'receiver'), { expected_run_id: null });
    assert.equal(historical.evidence_level, 'E3 CORROBORATED-KEYS'); assert.equal(historical.current_run_acceptability, 'UNOBSERVED');
    await assert.rejects(verifyCustody(join(dir, 'source'), join(dir, 'receiver'), { expected_run_id: '999' }), /CURRENT_RUN_MISMATCH/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('FATHERHAND-HOSTILE-001: A death, B restart, B descendant and fresh verifier replacement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fatherhand-test-'));
  try {
    const { ab, bc2, topology } = await buildFatherHandSpecimen(dir);
    const { A, B, C2 } = topology.identities;
    assert.equal(new Set([A.constitution.particular_id, B.constitution.particular_id, C2.constitution.particular_id]).size, 3);
    assert.equal(new Set([A.public_key.x + A.public_key.y, B.public_key.x + B.public_key.y, C2.public_key.x + C2.public_key.y]).size, 3);
    const founderGrant = createCapabilityGrant({ capability_id: 'founder-only', subject: { kind: 'PARTICULAR', id: A.constitution.particular_id }, created_at: '2026-10-07T00:00:00.000Z' });
    const cold = replayParticularity([A.constitution, B.constitution, C2.constitution, founderGrant]);
    assert.equal(Object.keys(cold.particulars).length, 3); assert.equal(topology.restarted_B.particular_id, B.constitution.particular_id);
    assert.equal(topology.restarted_B.public_key.x, B.public_key.x);
    for (const child of [B, C2]) assert.equal(hasCapability(cold, { particular_id: child.constitution.particular_id, controller_id: 'ungranted', capability_id: 'founder-only' }), false);
    for (const [label, specimen] of [['AB', ab], ['BC2', bc2]] as const) {
      const bundle = await readPublicBundleDirectory(join(dir, label)); forbidPrivateEvidence(bundle);
      const rootsPath = join(dir, label + '-roots.json');
      // C and D are fresh native processes and consume only public durable files.
      const primary = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/foundation-of-trust-artifacts.mjs', join(dir, label), rootsPath, specimen.crossing_id], { encoding: 'utf8' }));
      const secondary = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/foundation-of-trust-independent.mjs', join(dir, label, 'bundle.json'), rootsPath, specimen.crossing_id], { encoding: 'utf8' }));
      assert.equal(primary.status, 'VERIFIED'); assert.equal(secondary.status, 'VERIFIED');
      assert.equal(primary.authority, 'UNOBSERVED'); assert.equal(primary.admission, 'UNOBSERVED'); assert.equal(primary.custody.distinct_human, 'UNOBSERVED');
      assert.notEqual(bundle.records[0].source_particular, bundle.records[1].receiver_particular);
      assert.notEqual(signingKeyIdentity(bundle.records[0]), signingKeyIdentity(bundle.records[1]));
    }
    const next = bc2.bundle.records[0]; assert.ok(next.parents.includes(ab.crossing_id));
    assert.equal(next.source_particular, B.constitution.particular_id); assert.equal(next.extensions.two_witness_handoff.receiver_particular, C2.constitution.particular_id);
    assert.equal(next.extensions.foundation.relation.kind, 'LINEAGE');
    assert.equal((await assessFoundationBundle(ab)).historically_verified, true);
    assert.equal((await assessFoundationBundle(bc2)).historically_verified, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('V: two implementation paths consume the same frozen fixture and reject witness mutation', async () => {
  const root = new URL('../fixtures/foundation-of-trust-001/', import.meta.url);
  for (const label of ['AB', 'BC2']) {
    const bundle = JSON.parse(await readFile(new URL(`${label}/bundle.json`, root), 'utf8'));
    const roots = JSON.parse(await readFile(new URL(`${label}-roots.json`, root), 'utf8'));
    const crossing_id = bundle.records[0].crossing_id;
    assert.equal((await assessFoundationBundle({ bundle, roots, crossing_id })).status, 'VERIFIED');
    assert.equal(independentlyVerify(bundle, roots, crossing_id).status, 'VERIFIED');
    for (let i = 0; i < 2; i++) {
      const changed = structuredClone(bundle); changed.records[i].created_at = '1900-01-01T00:00:00.000Z';
      const first = await assessFoundationBundle({ bundle: changed, roots, crossing_id });
      assert.equal(first.status, 'HOLD'); assert.ok(first.reasons.includes('INVALID_WITNESS_SIGNATURE'));
      assert.equal(independentlyVerify(changed, roots, crossing_id).status, 'HOLD');
    }
  }
});

for (const attack of ['truncate', 'malformed', 'duplicate keys', 'extra file', 'file symlink', 'directory symlink', 'private key']) {
  test(`G/F: public transport ${attack} fails at its actual boundary`, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'broker-hostile-'));
    try {
      const bundle = await readFile(new URL('../fixtures/foundation-of-trust-001/AB/bundle.json', import.meta.url), 'utf8');
      const path = join(dir, 'bundle.json'); let code = '';
      if (attack === 'truncate') { await writeFile(path, bundle.slice(0, 100)); code = 'MALFORMED_ARTIFACT'; }
      if (attack === 'malformed') { await writeFile(path, '{oops'); code = 'MALFORMED_ARTIFACT'; }
      if (attack === 'duplicate keys') { await writeFile(path, '{"a":1,"a":2}'); code = 'DUPLICATE_JSON_KEY'; }
      if (attack === 'extra file') { await writeFile(path, bundle); await writeFile(join(dir, 'unexpected'), 'x'); code = 'UNEXPECTED_ARTIFACT_FILES'; }
      if (attack === 'file symlink') { await symlink(new URL('../fixtures/foundation-of-trust-001/AB/bundle.json', import.meta.url).pathname, path); code = 'UNSAFE_ARTIFACT'; }
      if (attack === 'directory symlink') {
        await writeFile(path, bundle); const link = dir + '-link'; await symlink(dir, link);
        try { await assert.rejects(readPublicBundleDirectory(link), /UNSAFE_ARTIFACT_DIRECTORY/); } finally { await rm(link); }
        return;
      }
      if (attack === 'private key') { const parsed = JSON.parse(bundle); parsed.leak = { d: 'private-material' }; await writeFile(path, JSON.stringify(parsed)); code = 'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT'; }
      await assert.rejects(readPublicBundleDirectory(dir), new RegExp(code));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
