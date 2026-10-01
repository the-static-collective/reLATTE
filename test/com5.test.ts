import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCom5CrossingDraft,
  computeCom5CapsuleId,
  evaluateCom5Capsule,
  generateP256KeyPair,
  sealCom5Capsule,
  sealCrossingEnvelope,
  sealReceipt,
  verifyCom5Capsule,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

function load(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sourceCapsule(): any {
  return load('fixtures/com5-capsule-001.json');
}

test('COM5 capsule seals to a stable content address and verifies', () => {
  assert.equal(verifyCom5Capsule(sourceCapsule()), true);
  const sealed = sealCom5Capsule(sourceCapsule());
  assert.match(sealed.capsule_id!, /^relatte-com5-v0:[0-9a-f]{64}$/);
  assert.equal(verifyCom5Capsule(sealed), true);
  assert.equal(computeCom5CapsuleId(sealed), sealed.capsule_id);
});

test('COM5 requires exact five-stage order', () => {
  const specimen = sourceCapsule();
  [specimen.stages[0], specimen.stages[1]] = [specimen.stages[1], specimen.stages[0]];
  assert.throws(() => sealCom5Capsule(specimen), /INVALID_COM5_STAGE_ORDER/);
});

test('origin and non-authority are part of capsule identity', () => {
  const base = sealCom5Capsule(sourceCapsule());

  const changedAttribution = sourceCapsule();
  changedAttribution.origin.attribution[0] += ' [changed]';

  const changedNonAuthority = sourceCapsule();
  changedNonAuthority.origin.non_authorities[0] = 'SOURCE_PERSON = GRAMMAR';

  assert.notEqual(base.capsule_id, sealCom5Capsule(changedAttribution).capsule_id);
  assert.notEqual(base.capsule_id, sealCom5Capsule(changedNonAuthority).capsule_id);
});

test('unknown capsule fields cannot ride outside content identity', () => {
  const specimen = sourceCapsule();
  specimen.unsigned_sidecar = 'must not ride';
  assert.throws(() => sealCom5Capsule(specimen), /UNEXPECTED_COM5_FIELD/);
});

test('same signed COM5 crossing can receive divergent lawful local dispositions', async () => {
  const capsule = sealCom5Capsule(sourceCapsule());
  const sourceKeys = await generateP256KeyPair();

  const crossingDraft = buildCom5CrossingDraft(capsule, {
    source_particular: 'particular:com5-pirate-dock',
    source_world: 'world:relatte-com5-lab',
    created_at: '2026-10-01T18:41:00.000Z',
  });
  const crossing = await sealCrossingEnvelope(crossingDraft, sourceKeys);

  assert.equal(await verifyCrossingEnvelope(crossing), true);
  assert.equal(crossing.declared_kind, 'COM5_GRAMMAR_CAPSULE');
  assert.equal(crossing.payload_refs[0].address, capsule.capsule_id);

  const performancePolicy = load('fixtures/com5-receiver-performance.json');
  const archivePolicy = load('fixtures/com5-receiver-archive.json');

  const performanceDraft = evaluateCom5Capsule(
    capsule,
    crossing.crossing_id,
    performancePolicy,
    '2026-10-01T18:42:00.000Z',
  );
  const archiveDraft = evaluateCom5Capsule(
    capsule,
    crossing.crossing_id,
    archivePolicy,
    '2026-10-01T18:43:00.000Z',
  );

  const performanceReceipt = await sealReceipt(performanceDraft, await generateP256KeyPair());
  const archiveReceipt = await sealReceipt(archiveDraft, await generateP256KeyPair());

  assert.equal(performanceReceipt.crossing_id, crossing.crossing_id);
  assert.equal(archiveReceipt.crossing_id, crossing.crossing_id);

  assert.equal(performanceReceipt.kind, 'COM5_ADMIT');
  assert.equal(performanceReceipt.semantic_effect, 'descendant-created');

  assert.equal(archiveReceipt.kind, 'COM5_REFUSE');
  assert.equal(archiveReceipt.semantic_effect, 'none');
  assert.deepEqual(archiveReceipt.residual_refs, [capsule.capsule_id]);

  assert.equal(await verifyReceipt(performanceReceipt), true);
  assert.equal(await verifyReceipt(archiveReceipt), true);
  assert.notEqual(performanceReceipt.receipt_id, archiveReceipt.receipt_id);

  assert.equal(performanceReceipt.extensions.com5.commune.shared_address, capsule.capsule_id);
  assert.equal(archiveReceipt.extensions.com5.commune.shared_address, capsule.capsule_id);
  assert.equal(performanceReceipt.extensions.com5.commune.agreement_required, false);
  assert.equal(archiveReceipt.extensions.com5.commune.agreement_required, false);
});

test('missing required non-authority blocks local admission', () => {
  const specimen = sourceCapsule();
  specimen.origin.non_authorities = specimen.origin.non_authorities.filter(
    (law: string) => law !== 'INFLUENCE != ENDORSEMENT',
  );

  const policy = load('fixtures/com5-receiver-performance.json');
  const draft = evaluateCom5Capsule(
    specimen,
    'relatte-crossing-v0:' + 'a'.repeat(64),
    policy,
    '2026-10-01T18:44:00.000Z',
  );

  assert.equal(draft.kind, 'COM5_REFUSE');
  assert.equal(draft.semantic_effect, 'none');
  assert.match(String(draft.note), /non-authority/);
});
