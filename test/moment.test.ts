import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PerspectiveReplica,
  createMomentAnchor,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealPerspectiveClaim,
  verifyCrossingEnvelope,
  verifyMomentAnchor,
  verifyPerspectiveClaim,
} from '../src/index.ts';

async function sourceCrossing(): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r8-source',
    source_world: 'world:r8-source',
    source_history_head: 'local:r8-source:head-001',
    parents: [],
    declared_kind: 'R8_SHARED_MOMENT',
    payload_refs: [{
      address: 'sha256:' + '8'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r8-source',
    created_at: '2026-10-01T22:30:00.000Z',
    extensions: {
      specimen: 'MOMENT-PERSPECTIVE-001',
    },
  }, keys);
}

async function divergentPerspectives(moment: any): Promise<{
  a: any;
  b: any;
}> {
  const keyA = await generateP256KeyPair();
  const keyB = await generateP256KeyPair();

  const a = await sealPerspectiveClaim(
    moment,
    {
      world_id: 'world:observer-a',
      observer_particular: 'particular:observer-a',
    },
    {
      summary: 'The return felt like closure.',
      assertions: [
        'The carrier returned to the same address.',
        'The visible sequence ended cleanly.',
      ],
      uncertainties: [
        'Whether the participants experienced the return as final.',
      ],
    },
    keyA,
    '2026-10-01T22:31:00.000Z',
  );

  const b = await sealPerspectiveClaim(
    moment,
    {
      world_id: 'world:observer-b',
      observer_particular: 'particular:observer-b',
    },
    {
      summary: 'The return felt like a reopening.',
      assertions: [
        'The return introduced a new unresolved relation.',
        'The same ending can function as another beginning.',
      ],
      uncertainties: [
        'Whether the source intended the reopening.',
      ],
    },
    keyB,
    '2026-10-01T22:32:00.000Z',
  );

  return { a, b };
}

test('Moment is a stable address over the exact signed crossing carrier', async () => {
  const crossing = await sourceCrossing();
  const moment = await createMomentAnchor(crossing);

  assert.equal(await verifyCrossingEnvelope(crossing), true);
  assert.equal(await verifyMomentAnchor(moment), true);
  assert.equal(moment.crossing_id, crossing.crossing_id);
  assert.match(moment.moment_id, /^relatte-moment-v0:[0-9a-f]{64}$/);

  const reparsed = JSON.parse(moment.canonical_body);
  assert.equal(reparsed.crossing_id, crossing.crossing_id);
  assert.deepEqual(reparsed, crossing);
});

test('two observers can sign divergent accounts of one unchanged Moment', async () => {
  const crossing = await sourceCrossing();
  const moment = await createMomentAnchor(crossing);
  const { a, b } = await divergentPerspectives(moment);

  assert.equal(await verifyPerspectiveClaim(moment, a), true);
  assert.equal(await verifyPerspectiveClaim(moment, b), true);

  assert.equal(a.crossing_id, b.crossing_id);
  assert.equal(a.contract_ref, b.contract_ref);
  assert.equal(a.contract_ref, moment.moment_id);
  assert.notEqual(a.receipt_id, b.receipt_id);
  assert.notDeepEqual(a.signing.public_key, b.signing.public_key);
  assert.notEqual(
    a.extensions.perspective.account.summary,
    b.extensions.perspective.account.summary,
  );

  assert.equal(a.semantic_effect, 'none');
  assert.equal(b.semantic_effect, 'none');
  assert.equal(a.pre_state_ref, moment.moment_id);
  assert.equal(a.post_state_ref, moment.moment_id);
  assert.equal(b.pre_state_ref, moment.moment_id);
  assert.equal(b.post_state_ref, moment.moment_id);
});

test('sync is set union, not last-write-wins', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r8-sync-'));
  try {
    const moment = await createMomentAnchor(await sourceCrossing());
    const { a, b } = await divergentPerspectives(moment);

    const replicaA = await PerspectiveReplica.create(
      join(base, 'replica-a'),
      {
        world_id: 'world:replica-a',
        replica_particular: 'particular:replica-a',
      },
      moment,
    );
    const replicaB = await PerspectiveReplica.create(
      join(base, 'replica-b'),
      {
        world_id: 'world:replica-b',
        replica_particular: 'particular:replica-b',
      },
      moment,
    );

    await replicaA.attach(a);
    await replicaB.attach(b);

    assert.equal(replicaA.snapshot().perspective_count, 1);
    assert.equal(replicaB.snapshot().perspective_count, 1);

    await replicaA.syncFrom(replicaB.exportPerspectives());
    await replicaB.syncFrom(replicaA.exportPerspectives());

    const snapA = replicaA.snapshot();
    const snapB = replicaB.snapshot();

    assert.equal(snapA.perspective_count, 2);
    assert.equal(snapB.perspective_count, 2);
    assert.deepEqual(snapA.perspective_ids, snapB.perspective_ids);
    assert.deepEqual(
      new Set(snapA.observer_worlds),
      new Set(['world:observer-a', 'world:observer-b']),
    );

    const accounts = replicaA.exportPerspectives().map(
      (receipt) => receipt.extensions.perspective.account.summary,
    );
    assert.deepEqual(
      new Set(accounts),
      new Set([
        'The return felt like closure.',
        'The return felt like a reopening.',
      ]),
    );

    // Syncing the same set again is idempotent and creates no winner.
    await replicaA.syncFrom(replicaB.exportPerspectives());
    assert.equal(replicaA.snapshot().perspective_count, 2);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('restart replay preserves both divergent perspectives and the same Moment', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r8-replay-'));
  try {
    const root = join(base, 'replica');
    const moment = await createMomentAnchor(await sourceCrossing());
    const { a, b } = await divergentPerspectives(moment);

    const replica = await PerspectiveReplica.create(
      root,
      {
        world_id: 'world:r8-replay',
        replica_particular: 'particular:r8-replay',
      },
      moment,
    );
    await replica.attach(a);
    await replica.attach(b);

    const before = replica.snapshot();
    const beforeBody = replica.moment.canonical_body;

    const reopened = await PerspectiveReplica.open(root);
    const after = reopened.snapshot();

    assert.deepEqual(after, before);
    assert.equal(after.perspective_count, 2);
    assert.equal(reopened.moment.canonical_body, beforeBody);
    assert.equal(reopened.moment.moment_id, moment.moment_id);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('perspectives cannot mutate carrier identity', async () => {
  const crossing = await sourceCrossing();
  const moment = await createMomentAnchor(crossing);
  const { a } = await divergentPerspectives(moment);

  const mutatedAccount = structuredClone(a);
  mutatedAccount.extensions.perspective.account.summary = 'Retconned account.';
  assert.equal(await verifyPerspectiveClaim(moment, mutatedAccount), false);

  const mutatedAnchor = structuredClone(a);
  mutatedAnchor.extensions.perspective.anchor_canonical_body_sha256 =
    '0'.repeat(64);
  assert.equal(await verifyPerspectiveClaim(moment, mutatedAnchor), false);

  const mutatedMoment = structuredClone(moment);
  mutatedMoment.canonical_body = mutatedMoment.canonical_body.replace(
    'R8_SHARED_MOMENT',
    'R8_REWRITTEN_MOMENT',
  );
  assert.equal(await verifyMomentAnchor(mutatedMoment), false);

  assert.equal(moment.crossing_id, crossing.crossing_id);
  assert.equal(JSON.parse(moment.canonical_body).crossing_id, crossing.crossing_id);
});

test('a perspective attached to one Moment cannot be replayed onto another', async () => {
  const crossingA = await sourceCrossing();
  const momentA = await createMomentAnchor(crossingA);
  const { a } = await divergentPerspectives(momentA);

  const keyB = await generateP256KeyPair();
  const crossingB = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r8-source-b',
    source_world: 'world:r8-source-b',
    source_history_head: null,
    parents: [],
    declared_kind: 'R8_SHARED_MOMENT',
    payload_refs: [{
      address: 'sha256:' + '9'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-01T22:33:00.000Z',
    extensions: {},
  }, keyB);
  const momentB = await createMomentAnchor(crossingB);

  assert.equal(await verifyPerspectiveClaim(momentB, a), false);
});

test('tampered stored perspective or Moment fails replica replay', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r8-tamper-'));
  try {
    const root = join(base, 'replica');
    const moment = await createMomentAnchor(await sourceCrossing());
    const { a } = await divergentPerspectives(moment);

    const replica = await PerspectiveReplica.create(
      root,
      {
        world_id: 'world:r8-tamper',
        replica_particular: 'particular:r8-tamper',
      },
      moment,
    );
    await replica.attach(a);

    const perspectiveFile = join(
      root,
      'perspectives',
      (await import('node:crypto'))
        .createHash('sha256')
        .update(a.receipt_id)
        .digest('hex') + '.json',
    );
    const storedPerspective = JSON.parse(
      await readFile(perspectiveFile, 'utf8'),
    );
    storedPerspective.note = 'tampered observer account';
    await writeFile(
      perspectiveFile,
      JSON.stringify(storedPerspective, null, 2) + '\n',
      'utf8',
    );

    await assert.rejects(
      () => PerspectiveReplica.open(root),
      /INVALID_REPLAYED_PERSPECTIVE/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
