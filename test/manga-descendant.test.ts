import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  generateP256KeyPair,
  makeTransportFrame,
  readFileBundle,
  sealOpaqueOrganCrossing,
  verifyOpaqueOrganCrossing,
  verifyReceipt,
  writeFileBundle,
} from '../src/index.ts';

function descendantSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-descendant',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/descendants/page-01-motion-001/README.md',
    artifact_kind: 'manga-motion-descendant',
    source_world: 'world:lemonpress',
    source_particular:
      'manga-descendant:9b798be1bf145749faa496e88e8493d0da277bd2206b511c6f173c3af445a00a',
    source_history_head:
      'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656',
    payload_refs: [
      {
        address: 'sha256:f69022ea1ebc9735eb6f30cb0f0bb9b7802f07fb94c0c519b8643fc5b875d2fe',
        role: 'ancestor-page',
        media_type: 'image/png',
      },
      {
        address: 'sha256:d66a559b4be044ea195463128143e76d87d9da9a1d7523bfb18a7118bf3b124f',
        role: 'narration-script',
        media_type: 'text/plain',
      },
      {
        address: 'sha256:fbdbeceda04e4190fc0599a51de75bfe1993998434102a9aa8002800d01a03aa',
        role: 'music-spec',
        media_type: 'application/json',
      },
      {
        address: 'sha256:271fe58e59dcebf878cf2ca808e0848ad0020ff062a066ba7da9bfec0f287360',
        role: 'sound-bed',
        media_type: 'audio/wav',
      },
      {
        address: 'sha256:ae85d6eb91bb79ec44060e3920f7b2e09d2d47ead568ad2496e0588ec84d9d3b',
        role: 'motion-edition',
        media_type: 'video/mp4',
      },
    ],
    donor_claims: {
      status: 'CANDIDATE',
      parent_parcel_id:
        'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656',
      descendant_id:
        'manga-descendant:9b798be1bf145749faa496e88e8493d0da277bd2206b511c6f173c3af445a00a',
      source_page_sha256:
        'f69022ea1ebc9735eb6f30cb0f0bb9b7802f07fb94c0c519b8643fc5b875d2fe',
      duration_seconds: 10,
      frame_rate: 24,
      source_replacement: false,
      deterministic_recipe: true,
    },
    requested_effect: {
      kind: 'candidate-descendant-ingress',
      authority: 'receiver-local',
      preferred_initial_disposition: 'HOLD',
    },
    return_address:
      'relatte:return:lemonpress:manga-descendant:page-01-motion-001',
    created_at: '2026-10-06T21:22:00.000Z',
  };
}

test('creative descendant crosses as a fresh particular while retaining ancestry', async () => {
  const spec = descendantSpec();
  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(crossing.source_particular, spec.source_particular);
  assert.equal(crossing.source_history_head, 'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656');
  assert.equal(crossing.payload_refs.length, 5);
  assert.equal(
    crossing.extensions.organ_adapter.donor_claims.parent_parcel_id,
    'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656',
  );
  assert.equal(
    crossing.extensions.organ_adapter.donor_claims.source_replacement,
    false,
  );
  assert.equal(crossing.requested_effect.authority, 'receiver-local');
});

test('creative descendant survives transport and may be HELD without altering ancestor identity', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-manga-descendant-'));

  try {
    const spec = descendantSpec();
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );
    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T21:23:00.000Z',
      'manga descendant 001 file road',
    );

    const bundlePath = join(base, 'manga-descendant-001.bundle.json');
    await writeFileBundle(bundlePath, frame);
    const delivered = await readFileBundle(bundlePath);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:manga-descendant-incubator',
      receiver_particular: 'particular:manga-descendant-incubator:001',
      contract_ref: 'contract:manga-descendant-incubator-local-law/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T21:24:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const held = await receiver.dispose(
      crossing.crossing_id,
      'HOLD',
      '2026-10-06T21:25:00.000Z',
    );
    assert.equal(await verifyReceipt(held), true);
    assert.equal(held.kind, 'R3_HOLD');

    assert.equal(
      delivered.crossing.source_history_head,
      'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656',
    );
    assert.equal(
      delivered.crossing.extensions.organ_adapter.donor_claims.source_replacement,
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
