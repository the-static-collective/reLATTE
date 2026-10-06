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

const PARENTS = [
  'manga-descendant:b199c792f3ffe320a576c2c3f9106a4b06ad6cccf1905a2741042b0137d671d5',
  'manga-descendant:e8170f03392012bcf66facad89d484e38ecd8b81d9f50a588f1b08a155002580',
] as const;

function crossSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-grandchild',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/crosses/voice-x-glitch-001/README.md',
    artifact_kind: 'two-parent-manga-grandchild',
    source_world: 'world:lemonpress',
    source_particular: 'manga-grandchild:14f2b4920b76cf0448b9251f25a93da2f0caed8808ad5a748c7ba00655b62804',
    source_history_head:
      'parent-set:sha256:c947e2cd062ae960f97491fd937332cba5a62faa8faf5373fda56b04ed35cbdb',
    payload_refs: [
      {
        address: 'id:manga-descendant:b199c792f3ffe320a576c2c3f9106a4b06ad6cccf1905a2741042b0137d671d5',
        role: 'parent-voice',
        media_type: 'application/vnd.lemonpress.descendant-id',
      },
      {
        address: 'id:manga-descendant:e8170f03392012bcf66facad89d484e38ecd8b81d9f50a588f1b08a155002580',
        role: 'parent-glitch',
        media_type: 'application/vnd.lemonpress.descendant-id',
      },
      {
        address:
          'sha256:e37b49756551aa137f524637caea2deedcd57139eb434595bce853e8d6984e61',
        role: 'cross-recipe',
        media_type: 'application/json',
      },
      {
        address:
          'sha256:f6921cdb3669b8d1e33e2cbee50251dc8b9f78dc1267851969b812a6925c6731',
        role: 'hybrid-audio',
        media_type: 'audio/wav',
      },
      {
        address:
          'sha256:47c76926f41b391ad84ebf2b8cc9735045f1747fdcaf238b0e491fe0c67a2ec9',
        role: 'hybrid-motion',
        media_type: 'video/mp4',
      },
    ],
    donor_claims: {
      status: 'CANDIDATE',
      parents: [...PARENTS],
      parent_count: 2,
      parent_set_sha256: 'c947e2cd062ae960f97491fd937332cba5a62faa8faf5373fda56b04ed35cbdb',
      novel_trait: 'voice hinges gate glitch rupture',
      source_replacement: false,
      inheritance_mode: 'two-parent-composition',
    },
    requested_effect: {
      kind: 'candidate-two-parent-descendant-ingress',
      authority: 'receiver-local',
      preferred_initial_disposition: 'HOLD',
    },
    return_address:
      'relatte:return:lemonpress:manga-cross:voice-x-glitch-001',
    created_at: '2026-10-06T22:02:00.000Z',
  };
}

test('two explicit parents cross without collapsing to one parent authority', async () => {
  const spec = crossSpec();
  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(crossing.source_particular, 'manga-grandchild:14f2b4920b76cf0448b9251f25a93da2f0caed8808ad5a748c7ba00655b62804');
  assert.equal(
    crossing.source_history_head,
    'parent-set:sha256:c947e2cd062ae960f97491fd937332cba5a62faa8faf5373fda56b04ed35cbdb',
  );
  assert.deepEqual(
    crossing.extensions.organ_adapter.donor_claims.parents,
    [...PARENTS],
  );
  assert.equal(
    new Set(crossing.extensions.organ_adapter.donor_claims.parents).size,
    2,
  );

  const parentRefs = crossing.payload_refs
    .filter((ref: any) => ref.role.startsWith('parent-'))
    .map((ref: any) => ref.address);

  assert.deepEqual(
    new Set(parentRefs),
    new Set(PARENTS.map((id) => 'id:' + id)),
  );
});

test('two-parent grandchild survives file transport and owner-local HOLD', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-manga-cross-'));

  try {
    const spec = crossSpec();
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );

    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T22:03:00.000Z',
      'two-parent manga cross file road',
    );
    const path = join(base, 'voice-x-glitch-001.bundle.json');
    await writeFileBundle(path, frame);
    const delivered = await readFileBundle(path);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:manga-cross-incubator',
      receiver_particular: 'particular:manga-cross-incubator:001',
      contract_ref: 'contract:manga-cross-local-law/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T22:04:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const held = await receiver.dispose(
      crossing.crossing_id,
      'HOLD',
      '2026-10-06T22:05:00.000Z',
    );
    assert.equal(await verifyReceipt(held), true);
    assert.equal(held.kind, 'R3_HOLD');

    assert.deepEqual(
      delivered.crossing.extensions.organ_adapter.donor_claims.parents,
      [...PARENTS],
    );
    assert.equal(
      delivered.crossing.extensions.organ_adapter.donor_claims.novel_trait,
      'voice hinges gate glitch rupture',
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
