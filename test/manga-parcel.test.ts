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

function mangaParcelSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-parcel',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/README.md',
    artifact_kind: 'manga-parcel',
    source_world: 'world:lemonpress',
    source_particular:
      'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656',
    source_history_head:
      'sha256:7531b551c433fe947658bb9731e9271a8636f1e3a5f57b41827c1925bed295ff',
    payload_refs: [
      {
        address: 'sha256:7531b551c433fe947658bb9731e9271a8636f1e3a5f57b41827c1925bed295ff',
        role: 'source-pixels',
        media_type: 'image/png',
      },
      {
        address: 'sha256:6f4defc2b216064cd48153cf08c3429679d9a03791b6ca39f97a3129724eb27c',
        role: 'issue-plan',
        media_type: 'application/json',
      },
    ],
    donor_claims: {
      status: 'INCUBATING',
      source_sha256:
        '7531b551c433fe947658bb9731e9271a8636f1e3a5f57b41827c1925bed295ff',
      plan_sha256:
        '6f4defc2b216064cd48153cf08c3429679d9a03791b6ca39f97a3129724eb27c',
      virtual_page_count: 5,
      source_pixel_mutation: false,
      descendant_slots_state: 'UNBORN',
      rights_basis: 'user-declared-controlled-source',
      rights_verification: 'not-independently-verified',
    },
    requested_effect: {
      kind: 'candidate-creative-incubation',
      authority: 'receiver-local',
      allowed_local_dispositions: ['HOLD', 'ADMIT', 'REFUSE', 'RETURN'],
    },
    return_address: 'relatte:return:lemonpress:manga-parcel-001',
    created_at: '2026-10-06T21:06:00.000Z',
  };
}

test('LemonPRESS Manga Parcel 001 crosses the generic opaque-organ membrane unchanged', async () => {
  const spec = mangaParcelSpec();
  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(crossing.declared_kind, 'OPAQUE_ORGAN_ARTIFACT');
  assert.equal(crossing.source_particular, spec.source_particular);
  assert.deepEqual(crossing.payload_refs, spec.payload_refs);
  assert.equal(
    crossing.extensions.organ_adapter.family_ref,
    'organ:lemonpress/manga-parcel',
  );
  assert.equal(
    crossing.extensions.organ_adapter.donor_claims.source_pixel_mutation,
    false,
  );
  assert.equal(crossing.requested_effect.authority, 'receiver-local');
});

test('Manga Parcel 001 survives file transport and arrives HELD without source mutation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-manga-parcel-'));

  try {
    const spec = mangaParcelSpec();
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );
    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T21:07:00.000Z',
      'manga parcel 001 file road',
    );

    const bundlePath = join(base, 'manga-parcel-001.bundle.json');
    await writeFileBundle(bundlePath, frame);
    const delivered = await readFileBundle(bundlePath);

    assert.equal(delivered.crossing.crossing_id, crossing.crossing_id);
    assert.deepEqual(delivered.crossing.payload_refs, spec.payload_refs);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:manga-incubator',
      receiver_particular: 'particular:manga-incubator:001',
      contract_ref: 'contract:manga-incubator-local-law/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T21:08:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const held = await receiver.dispose(
      crossing.crossing_id,
      'HOLD',
      '2026-10-06T21:09:00.000Z',
    );
    assert.equal(await verifyReceipt(held), true);
    assert.equal(held.kind, 'R3_HOLD');

    assert.equal(
      crossing.payload_refs[0].address,
      'sha256:7531b551c433fe947658bb9731e9271a8636f1e3a5f57b41827c1925bed295ff',
    );
    assert.equal(
      crossing.extensions.organ_adapter.donor_claims.source_pixel_mutation,
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
