import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  MirrorStore,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealPublishedClaim,
  verifyMirrorServeBundle,
  verifyPublishedClaim,
  verifyReceipt,
} from '../src/index.ts';

async function sourceSpecimen(root: string): Promise<{
  crossing: any;
  published: any;
}> {
  const keys = await generateP256KeyPair();
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r7-source',
    source_world: 'world:r7-source',
    source_history_head: 'local:r7-source:head-001',
    parents: [],
    declared_kind: 'R7_TEST',
    payload_refs: [{
      address: 'sha256:' + '7'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r7-source',
    created_at: '2026-10-01T22:00:00.000Z',
    extensions: {
      specimen: 'MIRROR-STORE-SERVE-001',
    },
  }, keys);
  const published = await sealPublishedClaim(
    crossing,
    keys,
    '2026-10-01T22:01:00.000Z',
  );

  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'crossing.json'), JSON.stringify(crossing, null, 2) + '\n', 'utf8');
  await writeFile(join(root, 'published.json'), JSON.stringify(published, null, 2) + '\n', 'utf8');

  return { crossing, published };
}

test('PUBLISHED, STORED, SERVED, and RECEIVED remain distinct claims', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-claims-'));
  try {
    const source = await sourceSpecimen(join(base, 'source'));
    const mirror = await MirrorStore.create(join(base, 'mirror'), {
      world_id: 'world:r7-mirror',
      mirror_particular: 'particular:r7-mirror',
      contract_ref: 'contract:r7-mirror/v0',
    });
    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:r7-receiver',
      receiver_particular: 'particular:r7-receiver',
      contract_ref: 'contract:r7-receiver/v0',
    });

    assert.equal(await verifyPublishedClaim(source.crossing, source.published), true);
    assert.equal(source.published.kind, 'R7_PUBLISHED');

    const stored = await mirror.store(
      source.crossing,
      source.published,
      '2026-10-01T22:02:00.000Z',
    );
    assert.equal(await verifyReceipt(stored), true);
    assert.equal(stored.kind, 'R7_STORED');

    const served = await mirror.serve(
      source.crossing.crossing_id,
      '2026-10-01T22:03:00.000Z',
    );
    assert.equal(await verifyMirrorServeBundle(served, source.crossing.crossing_id), true);
    assert.equal(served.served_receipt.kind, 'R7_SERVED');

    const received = await receiver.receive(
      served.crossing,
      '2026-10-01T22:04:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');

    assert.deepEqual(
      new Set([
        source.published.kind,
        stored.kind,
        served.served_receipt.kind,
        received.kind,
      ]),
      new Set(['R7_PUBLISHED', 'R7_STORED', 'R7_SERVED', 'RECEIVED']),
    );

    assert.equal(source.published.semantic_effect, 'none');
    assert.equal(stored.semantic_effect, 'none');
    assert.equal(served.served_receipt.semantic_effect, 'none');
    assert.equal(received.semantic_effect, 'none');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('two independent mirrors retain the same source object under different local claims', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-mirrors-'));
  try {
    const source = await sourceSpecimen(join(base, 'source'));
    const mirrorB = await MirrorStore.create(join(base, 'mirror-b'), {
      world_id: 'world:r7-mirror-b',
      mirror_particular: 'particular:r7-mirror-b',
      contract_ref: 'contract:r7-mirror-b/v0',
    });
    const mirrorC = await MirrorStore.create(join(base, 'mirror-c'), {
      world_id: 'world:r7-mirror-c',
      mirror_particular: 'particular:r7-mirror-c',
      contract_ref: 'contract:r7-mirror-c/v0',
    });

    const storedB = await mirrorB.store(
      source.crossing,
      source.published,
      '2026-10-01T22:05:00.000Z',
    );
    const storedC = await mirrorC.store(
      source.crossing,
      source.published,
      '2026-10-01T22:06:00.000Z',
    );

    assert.equal(storedB.crossing_id, storedC.crossing_id);
    assert.equal(
      storedB.extensions.mirror.object_id,
      storedC.extensions.mirror.object_id,
    );
    assert.notEqual(storedB.receipt_id, storedC.receipt_id);
    assert.notDeepEqual(storedB.signing.public_key, storedC.signing.public_key);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('dead source can be reconstructed and served from an independently retained mirror', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-dead-source-'));
  try {
    const sourceRoot = join(base, 'source');
    const mirrorBRoot = join(base, 'mirror-b');
    const mirrorCRoot = join(base, 'mirror-c');

    const source = await sourceSpecimen(sourceRoot);
    const crossingId = source.crossing.crossing_id;

    const mirrorB = await MirrorStore.create(mirrorBRoot, {
      world_id: 'world:r7-mirror-b',
      mirror_particular: 'particular:r7-mirror-b',
      contract_ref: 'contract:r7-mirror-b/v0',
    });
    const mirrorC = await MirrorStore.create(mirrorCRoot, {
      world_id: 'world:r7-mirror-c',
      mirror_particular: 'particular:r7-mirror-c',
      contract_ref: 'contract:r7-mirror-c/v0',
    });

    await mirrorB.store(source.crossing, source.published, '2026-10-01T22:07:00.000Z');
    await mirrorC.store(source.crossing, source.published, '2026-10-01T22:08:00.000Z');

    // Kill the source and one mirror. The surviving mirror must be enough.
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(mirrorBRoot, { recursive: true, force: true });

    const surviving = await MirrorStore.open(mirrorCRoot);
    const reconstructed = await surviving.reconstruct(crossingId);

    assert.equal(reconstructed.crossing.crossing_id, crossingId);
    assert.equal(
      reconstructed.record.published_receipt.kind,
      'R7_PUBLISHED',
    );
    assert.equal(reconstructed.record.stored_receipt.kind, 'R7_STORED');

    const served = await surviving.serve(
      crossingId,
      '2026-10-01T22:09:00.000Z',
    );
    assert.equal(await verifyMirrorServeBundle(served, crossingId), true);

    const successorReceiver = await LocalReceiver.create(join(base, 'successor-receiver'), {
      world_id: 'world:r7-successor-receiver',
      receiver_particular: 'particular:r7-successor-receiver',
      contract_ref: 'contract:r7-successor/v0',
    });
    const received = await successorReceiver.receive(
      served.crossing,
      '2026-10-01T22:10:00.000Z',
    );

    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.crossing_id, crossingId);
    assert.equal(successorReceiver.snapshot().received[0], crossingId);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('serve does not imply receive and mirror does not become source', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-noncollapse-'));
  try {
    const source = await sourceSpecimen(join(base, 'source'));
    const mirror = await MirrorStore.create(join(base, 'mirror'), {
      world_id: 'world:r7-mirror',
      mirror_particular: 'particular:r7-mirror',
      contract_ref: 'contract:r7-mirror/v0',
    });

    await mirror.store(source.crossing, source.published, '2026-10-01T22:11:00.000Z');
    const served = await mirror.serve(
      source.crossing.crossing_id,
      '2026-10-01T22:12:00.000Z',
    );

    assert.equal(served.crossing.source_world, 'world:r7-source');
    assert.equal(served.crossing.source_particular, 'particular:r7-source');
    assert.equal(served.served_receipt.world_id, 'world:r7-mirror');
    assert.equal(served.served_receipt.receiver_particular, 'particular:r7-mirror');
    assert.equal(served.served_receipt.semantic_effect, 'none');
    assert.equal(
      Object.values(served).some(
        (value: any) => value?.kind === 'RECEIVED',
      ),
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('tampered retained object or claim fails mirror reopening/reconstruction', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-tamper-'));
  try {
    const source = await sourceSpecimen(join(base, 'source'));
    const root = join(base, 'mirror');
    const mirror = await MirrorStore.create(root, {
      world_id: 'world:r7-mirror',
      mirror_particular: 'particular:r7-mirror',
      contract_ref: 'contract:r7-mirror/v0',
    });

    const stored = await mirror.store(
      source.crossing,
      source.published,
      '2026-10-01T22:13:00.000Z',
    );
    const recordName = (await import('node:crypto'))
      .createHash('sha256')
      .update(source.crossing.crossing_id)
      .digest('hex') + '.json';
    const recordPath = join(root, 'records', recordName);
    const record = JSON.parse(await readFile(recordPath, 'utf8'));

    record.canonical_body = record.canonical_body.replace('R7_TEST', 'R7_EVIL');
    await writeFile(recordPath, JSON.stringify(record, null, 2) + '\n', 'utf8');

    await assert.rejects(
      () => MirrorStore.open(root),
      /MIRROR_BODY_HASH_MISMATCH/,
    );

    assert.equal(await verifyReceipt(stored), true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('published claim cannot be forged by a different key and still match the source', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r7-publish-key-'));
  try {
    const source = await sourceSpecimen(join(base, 'source'));
    const wrongKeys = await generateP256KeyPair();

    await assert.rejects(
      () => sealPublishedClaim(
        source.crossing,
        wrongKeys,
        '2026-10-01T22:14:00.000Z',
      ),
      /PUBLISHED_KEY_MISMATCH/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
