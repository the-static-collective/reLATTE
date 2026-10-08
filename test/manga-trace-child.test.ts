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
  'manga-grandchild:14f2b4920b76cf0448b9251f25a93da2f0caed8808ad5a748c7ba00655b62804',
  'manga-descendant:d214463302401bc85d2fdcc4f01f28e75929e8f52617f2db672c7770e4c22126',
] as const;

function traceSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-trace-child',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/crosses/trace-child-001/README.md',
    artifact_kind: 'two-parent-retrieval-survivable-manga-child',
    source_world: 'world:lemonpress',
    source_particular: 'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79',
    source_history_head:
      'parent-set:sha256:66da597547d386789371de48dfaa7481e4e470ed78fb7b2b8053b2fa34297d4b',
    payload_refs: [
      {
        address: 'id:manga-grandchild:14f2b4920b76cf0448b9251f25a93da2f0caed8808ad5a748c7ba00655b62804',
        role: 'parent-grandchild',
        media_type: 'application/vnd.lemonpress.descendant-id',
      },
      {
        address: 'id:manga-descendant:d214463302401bc85d2fdcc4f01f28e75929e8f52617f2db672c7770e4c22126',
        role: 'parent-crawler',
        media_type: 'application/vnd.lemonpress.descendant-id',
      },
      {
        address:
          'sha256:cacf5d99ed05debf13c490791d908cb335d4f5cfc780bf2dc07065ebedee5aec',
        role: 'main-audiovisual-body',
        media_type: 'video/mp4',
      },
      {
        address:
          'sha256:e12f0d41678c83592bb7c171332f4325e19ab5b2fc101c54d64bd443fc647165',
        role: 'trace-body',
        media_type: 'application/json',
      },
      {
        address:
          'sha256:549635bbcce4afe9d8b241437e6cd281bd5dd19cb097ade35f0337b238ea0917',
        role: 'event-markers',
        media_type: 'application/json',
      },
      {
        address:
          'sha256:ed1631dba7f27592f89f62e88e9d482a35f9a3ee7a9da896dfe24633d2125678',
        role: 'fragment-shards',
        media_type: 'application/json',
      },
      {
        address:
          'sha256:d37648a548452d25cb053c3e03c4db7c36da87400e732295da6d838b762ce212',
        role: 'trace-index',
        media_type: 'text/markdown',
      },
      {
        address:
          'sha256:ae26957e4fc806847f388a8f3587bfc4aee20a95b352eab4a43847336c8230b1',
        role: 'recovery-proof',
        media_type: 'application/json',
      },
    ],
    donor_claims: {
      status: 'CANDIDATE',
      parents: [...PARENTS],
      parent_count: 2,
      parent_set_sha256: '66da597547d386789371de48dfaa7481e4e470ed78fb7b2b8053b2fa34297d4b',
      novel_trait: 'RUPTURE -> TRACE EMISSION',
      survives_without_main_body: true,
      recovery_proof_sha256:
        'ae26957e4fc806847f388a8f3587bfc4aee20a95b352eab4a43847336c8230b1',
      source_replacement: false,
    },
    requested_effect: {
      kind: 'candidate-retrieval-survivable-descendant-ingress',
      authority: 'receiver-local',
      preferred_initial_disposition: 'HOLD',
    },
    return_address:
      'relatte:return:lemonpress:manga-trace-child-001',
    created_at: '2026-10-06T22:24:00.000Z',
  };
}

test('Trace Child carries living body and retrievable bones without collapsing parent identity', async () => {
  const spec = traceSpec();
  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(crossing.source_particular, 'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79');
  assert.deepEqual(
    crossing.extensions.organ_adapter.donor_claims.parents,
    [...PARENTS],
  );
  assert.equal(
    crossing.extensions.organ_adapter.donor_claims.survives_without_main_body,
    true,
  );
  assert.equal(
    crossing.extensions.organ_adapter.donor_claims.novel_trait,
    'RUPTURE -> TRACE EMISSION',
  );

  const roles = new Set(crossing.payload_refs.map((ref: any) => ref.role));
  for (const role of [
    'main-audiovisual-body',
    'trace-body',
    'event-markers',
    'fragment-shards',
    'trace-index',
    'recovery-proof',
  ]) {
    assert.equal(roles.has(role), true, 'missing payload role ' + role);
  }
});

test('Trace Child survives transport into RECEIVE and HOLD as one fresh particular', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-trace-child-'));

  try {
    const crossing = await sealOpaqueOrganCrossing(
      traceSpec(),
      await generateP256KeyPair(),
    );

    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T22:25:00.000Z',
      'trace child 001 file road',
    );
    const path = join(base, 'trace-child-001.bundle.json');
    await writeFileBundle(path, frame);
    const delivered = await readFileBundle(path);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:trace-child-incubator',
      receiver_particular: 'particular:trace-child-incubator:001',
      contract_ref: 'contract:trace-child-local-law/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T22:26:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const held = await receiver.dispose(
      crossing.crossing_id,
      'HOLD',
      '2026-10-06T22:27:00.000Z',
    );
    assert.equal(await verifyReceipt(held), true);
    assert.equal(held.kind, 'R3_HOLD');

    assert.equal(
      delivered.crossing.extensions.organ_adapter.donor_claims.survives_without_main_body,
      true,
    );
    assert.equal(
      delivered.crossing.source_history_head,
      'parent-set:sha256:66da597547d386789371de48dfaa7481e4e470ed78fb7b2b8053b2fa34297d4b',
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
