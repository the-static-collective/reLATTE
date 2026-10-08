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

function fossilVisualSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/fossil-visual-descendant',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/crosses/fossil-child-001-visual/README.md',
    artifact_kind: 'admitted-evidence-layered-visual-descendant',
    source_world: 'world:lemonpress',
    source_particular: 'fossil-visual:a0c4deba60f775f48c6cd5add0a941904e92121c65f2f8de1dafe9ca879a3224',
    source_history_head: 'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79',
    payload_refs: [
      {
        address: 'id:manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79',
        role: 'parent-trace-child',
        media_type: 'application/vnd.lemonpress.descendant-id',
      },
      {
        address: 'sha256:b4fcf11da6ab2feeed3190abbfc9e0251dcbd8b7007d0b5f2f6f6c2cbedf9125',
        role: 'fossil-key-art-seed',
        media_type: 'image/png',
      },
      {
        address: 'sha256:b80c239cd82c31f3975215c77c8753adb2c756e118e591aefb6a56fb40425f7a',
        role: 'reconstruction-pass',
        media_type: 'image/png',
      },
      {
        address: 'sha256:ae26957e4fc806847f388a8f3587bfc4aee20a95b352eab4a43847336c8230b1',
        role: 'paired-recovery-proof',
        media_type: 'application/json',
      },
    ],
    donor_claims: {
      status: 'ADMITTED',
      parent_trace_child: 'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79',
      visual_descendant: true,
      evidence_layering: true,
      laws: [
        'RECOVERED != RECONSTRUCTED',
        'SPECULATION != EVIDENCE',
        'RECONSTRUCTION != RESURRECTION',
      ],
    },
    requested_effect: {
      kind: 'admit-visual-descendant-registration',
      authority: 'receiver-local',
    },
    return_address:
      'relatte:return:lemonpress:fossil-child-001-visual',
    created_at: '2026-10-06T22:39:00.000Z',
  };
}

test('Fossil visual descendant crosses with evidence distinctions opaque and intact', async () => {
  const spec = fossilVisualSpec();
  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(crossing.source_particular, 'fossil-visual:a0c4deba60f775f48c6cd5add0a941904e92121c65f2f8de1dafe9ca879a3224');
  assert.equal(crossing.source_history_head, 'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79');
  assert.deepEqual(
    crossing.extensions.organ_adapter.donor_claims.laws,
    [
      'RECOVERED != RECONSTRUCTED',
      'SPECULATION != EVIDENCE',
      'RECONSTRUCTION != RESURRECTION',
    ],
  );
  assert.equal(crossing.requested_effect.authority, 'receiver-local');
});

test('owner-local receiver may ADMIT the visual descendant without changing trace authority', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-fossil-visual-'));

  try {
    const spec = fossilVisualSpec();
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );

    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T22:40:00.000Z',
      'fossil visual descendant file road',
    );

    const path = join(base, 'fossil-visual.bundle.json');
    await writeFileBundle(path, frame);
    const delivered = await readFileBundle(path);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:lemonpress-visual-admission',
      receiver_particular: 'particular:lemonpress-visual-admission:001',
      contract_ref: 'contract:lemonpress-visual-admission/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T22:41:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const admitted = await receiver.dispose(
      crossing.crossing_id,
      'ADMIT',
      '2026-10-06T22:42:00.000Z',
      { admit_effect: 'lemonpress-visual-descendant-registration' },
    );

    assert.equal(await verifyReceipt(admitted), true);
    assert.equal(admitted.kind, 'R3_ADMIT');
    assert.equal(
      delivered.crossing.source_history_head,
      'manga-trace-child:374696b249828dd1201c5da2decf4181e75c297f2e0227cb72488760057aeb79',
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
