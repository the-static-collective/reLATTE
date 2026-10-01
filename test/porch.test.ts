import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCom5CrossingDraft,
  computePorchId,
  evaluateCom5Capsule,
  evaluateCreativeCustoms,
  generateP256KeyPair,
  sealCom5Capsule,
  sealCrossingEnvelope,
  sealPorch,
  sealReceipt,
  verifyPorch,
  verifyReceipt,
} from '../src/index.ts';

function load(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function capsule(): any {
  return load('fixtures/com5-capsule-001.json');
}

function porch(): any {
  return load('fixtures/porch-com5-creative-001.json');
}

async function signedCrossing(capsuleValue = capsule()): Promise<any> {
  const sealed = sealCom5Capsule(capsuleValue);
  const draft = buildCom5CrossingDraft(sealed, {
    source_particular: 'particular:porch-test-source',
    source_world: 'world:porch-test-source',
    created_at: '2026-10-01T19:11:00.000Z',
  });
  return sealCrossingEnvelope(draft, await generateP256KeyPair());
}

test('porch fixture has a stable content address and verifies', () => {
  const source = porch();
  assert.equal(verifyPorch(source), true);
  const sealed = sealPorch(source);
  assert.equal(sealed.porch_id, source.porch_id);
  assert.equal(computePorchId(source), source.porch_id);
});

test('porch identity binds all declared surfaces and rejects sidecars', () => {
  const base = porch();

  const changed = porch();
  changed.return.requested_receipts.push('new-receipt');
  assert.notEqual(computePorchId(base), computePorchId(changed));

  const injected = porch();
  injected.unsigned_sidecar = 'must not ride';
  assert.throws(() => sealPorch(injected), /UNEXPECTED_PORCH_FIELD/);
});

test('rights-bearing release requires an explicit license reference', () => {
  const source = porch();
  source.release.offered_refs = ['artifact:commons-seed'];
  assert.throws(() => sealPorch(source), /INVALID_PORCH_RELEASE_LICENSE/);

  source.release.license_refs = ['license:example-explicit'];
  assert.doesNotThrow(() => sealPorch(source));
});

test('matching COM5 arrival receives signed CUSTOMS_WELCOME with no semantic effect', async () => {
  const sourceCapsule = sealCom5Capsule(capsule());
  const crossing = await signedCrossing(sourceCapsule);
  const draft = evaluateCreativeCustoms(
    porch(),
    sourceCapsule,
    crossing,
    '2026-10-01T19:12:00.000Z',
  );

  assert.equal(draft.kind, 'CUSTOMS_WELCOME');
  assert.equal(draft.semantic_effect, 'none');
  assert.equal(draft.crossing_id, crossing.crossing_id);
  assert.equal((draft.extensions as any).customs.laws.includes('WELCOME != ADMIT'), true);

  const receipt = await sealReceipt(draft, await generateP256KeyPair());
  assert.equal(await verifyReceipt(receipt), true);
});

test('unknown grammar is held at the porch', async () => {
  const unknown = capsule();
  unknown.grammar.grammar_id = 'grammar:unknown-garden/v0';
  const sealed = sealCom5Capsule(unknown);
  const crossing = await signedCrossing(sealed);
  const draft = evaluateCreativeCustoms(
    porch(),
    sealed,
    crossing,
    '2026-10-01T19:13:00.000Z',
  );

  assert.equal(draft.kind, 'CUSTOMS_HOLD');
  assert.equal(draft.semantic_effect, 'none');
  assert.deepEqual(draft.residual_refs, [sealed.capsule_id]);
});

test('explicitly refused grammar is refused at customs', async () => {
  const refused = capsule();
  refused.grammar.grammar_id = 'grammar:impersonation/v0';
  const sealed = sealCom5Capsule(refused);
  const crossing = await signedCrossing(sealed);
  const draft = evaluateCreativeCustoms(
    porch(),
    sealed,
    crossing,
    '2026-10-01T19:14:00.000Z',
  );

  assert.equal(draft.kind, 'CUSTOMS_REFUSE');
  assert.equal(draft.semantic_effect, 'none');
});

test('missing required non-authority is refused at customs', async () => {
  const unsafe = capsule();
  unsafe.origin.non_authorities = unsafe.origin.non_authorities.filter(
    (law: string) => law !== 'INFLUENCE != ENDORSEMENT',
  );
  const sealed = sealCom5Capsule(unsafe);
  const crossing = await signedCrossing(sealed);
  const draft = evaluateCreativeCustoms(
    porch(),
    sealed,
    crossing,
    '2026-10-01T19:15:00.000Z',
  );

  assert.equal(draft.kind, 'CUSTOMS_REFUSE');
  assert.match(String(draft.note), /non-authority/);
});

test('customs rejects a crossing that does not actually carry the inspected capsule', async () => {
  const one = sealCom5Capsule(capsule());
  const crossing = await signedCrossing(one);

  const other = capsule();
  other.grammar.grammar_id = 'grammar:other/v0';
  const sealedOther = sealCom5Capsule(other);

  assert.throws(
    () => evaluateCreativeCustoms(
      porch(),
      sealedOther,
      crossing,
      '2026-10-01T19:16:00.000Z',
    ),
    /CUSTOMS_CROSSING_CAPSULE_MISMATCH/,
  );
});

test('WELCOME does not imply ADMIT', async () => {
  const sourceCapsule = sealCom5Capsule(capsule());
  const crossing = await signedCrossing(sourceCapsule);

  const customsDraft = evaluateCreativeCustoms(
    porch(),
    sourceCapsule,
    crossing,
    '2026-10-01T19:17:00.000Z',
  );
  assert.equal(customsDraft.kind, 'CUSTOMS_WELCOME');

  const downstreamRefusal = evaluateCom5Capsule(
    sourceCapsule,
    crossing.crossing_id,
    {
      contract_ref: 'synthetic:downstream-local-law/v0',
      world_id: 'world:downstream',
      receiver_particular: 'particular:downstream',
      accepted_grammar_ids: [],
      required_non_authorities: [],
      admit_effect: 'descendant-created',
      miss_disposition: 'REFUSE',
      miss_reason: 'local world does not admit this grammar',
    },
    '2026-10-01T19:18:00.000Z',
  );

  assert.equal(downstreamRefusal.kind, 'COM5_REFUSE');
  assert.equal(downstreamRefusal.semantic_effect, 'none');
});
