import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  createMomentAnchor,
  generateP256KeyPair,
  projectField,
  sealCrossingEnvelope,
  sealFieldLens,
  sealPerspectiveClaim,
  verifyFieldLens,
  verifyFieldProjectionShape,
  verifyPerspectiveClaim,
  verifyReceipt,
} from '../src/index.ts';

async function signedCrossing(index: number): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: `particular:r9-source-${index}`,
    source_world: 'world:r9-source',
    source_history_head: null,
    parents: [],
    declared_kind: 'R9_FIELD_EVENT',
    payload_refs: [{
      address: 'sha256:' + index.toString(16).padStart(64, '0'),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r9',
    created_at: `2026-10-01T23:${String(index).padStart(2, '0')}:00.000Z`,
    extensions: {},
  }, keys);
}

function fieldLens(worldId = 'world:r9-local'): any {
  return sealFieldLens({
    schema: 'relatte.field-lens/v0',
    world_id: worldId,
    title: 'R9 Local Susceptibility Lens',
    channels: [
      {
        name: 'continuation',
        weights: {
          admitted_receipts: 2,
          admitted_descendants: 1,
        },
      },
      {
        name: 'plurality',
        weights: {
          perspective_receipts: 1,
          distinct_observers: 1,
          plural_perspective_excess: 3,
        },
      },
      {
        name: 'ambiguity',
        weights: {
          uncertainty_items: 1,
        },
      },
    ],
    created_at: '2026-10-01T23:20:00.000Z',
    laws: [
      'LENS != HISTORY',
      'LOCAL WEIGHT != UNIVERSAL VALUE',
    ],
  });
}

async function admittedFixture(base: string): Promise<{
  receiver: LocalReceiver;
  crossing: any;
  admit: any;
}> {
  const receiver = await LocalReceiver.create(join(base, 'receiver'), {
    world_id: 'world:r9-local',
    receiver_particular: 'particular:r9-local',
    contract_ref: 'contract:r9-local/v0',
  });
  const crossing = await signedCrossing(1);
  await receiver.receive(crossing, '2026-10-01T23:21:00.000Z');
  const admit = await receiver.dispose(
    crossing.crossing_id,
    'ADMIT',
    '2026-10-01T23:22:00.000Z',
    {
      admit_effect: 'local-descendant',
      descendant_refs: ['artifact:r9-descendant-001'],
    },
  );
  return { receiver, crossing, admit };
}

async function perspectivePair(crossing: any): Promise<{
  moment: any;
  a: any;
  b: any;
}> {
  const moment = await createMomentAnchor(crossing);
  const a = await sealPerspectiveClaim(
    moment,
    {
      world_id: 'world:r9-observer-a',
      observer_particular: 'particular:r9-observer-a',
    },
    {
      summary: 'The event felt settled.',
      assertions: ['The sequence closed cleanly.'],
      uncertainties: ['Whether closure will persist.'],
    },
    await generateP256KeyPair(),
    '2026-10-01T23:23:00.000Z',
  );
  const b = await sealPerspectiveClaim(
    moment,
    {
      world_id: 'world:r9-observer-b',
      observer_particular: 'particular:r9-observer-b',
    },
    {
      summary: 'The event felt unfinished.',
      assertions: ['A new relation remained open.'],
      uncertainties: [
        'Whether the opening was intended.',
        'Whether another crossing will follow.',
      ],
    },
    await generateP256KeyPair(),
    '2026-10-01T23:24:00.000Z',
  );
  return { moment, a, b };
}

test('admitted local history changes susceptibility from baseline', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-history-'));
  try {
    const lens = fieldLens();
    assert.equal(verifyFieldLens(lens), true);

    const baseline = await projectField({
      lens,
      admitted_receipts: [],
    });

    const { admit } = await admittedFixture(base);
    const after = await projectField({
      lens,
      admitted_receipts: [admit],
    });

    assert.equal(baseline.susceptibility.continuation, 0);
    assert.equal(after.susceptibility.continuation, 3);
    assert.notEqual(after.history_root, baseline.history_root);
    assert.notEqual(after.projection_id, baseline.projection_id);
    assert.equal(after.features.admitted_receipts, 1);
    assert.equal(after.features.admitted_descendants, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('plural witness changes field pressure without rewriting admitted history', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-perspective-'));
  try {
    const lens = fieldLens();
    const { crossing, admit } = await admittedFixture(base);
    const { moment, a, b } = await perspectivePair(crossing);

    const beforeAdmit = structuredClone(admit);
    const beforeA = structuredClone(a);
    const beforeB = structuredClone(b);
    const beforeMoment = structuredClone(moment);

    const projection = await projectField({
      lens,
      admitted_receipts: [admit],
      perspectives: [
        { moment, receipt: a },
        { moment, receipt: b },
      ],
    });

    assert.equal(projection.features.perspective_receipts, 2);
    assert.equal(projection.features.distinct_observers, 2);
    assert.equal(projection.features.plural_perspective_excess, 1);
    assert.equal(projection.features.uncertainty_items, 3);
    assert.equal(projection.susceptibility.plurality, 7);
    assert.equal(projection.susceptibility.ambiguity, 3);

    assert.deepEqual(admit, beforeAdmit);
    assert.deepEqual(a, beforeA);
    assert.deepEqual(b, beforeB);
    assert.deepEqual(moment, beforeMoment);

    assert.equal(await verifyReceipt(admit), true);
    assert.equal(await verifyPerspectiveClaim(moment, a), true);
    assert.equal(await verifyPerspectiveClaim(moment, b), true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('same history under a different local lens changes weather, not history', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-lens-'));
  try {
    const { crossing, admit } = await admittedFixture(base);
    const { moment, a, b } = await perspectivePair(crossing);

    const lensA = fieldLens();
    const lensB = sealFieldLens({
      schema: 'relatte.field-lens/v0',
      world_id: 'world:r9-local',
      title: 'R9 Alternate Local Lens',
      channels: [
        {
          name: 'continuation',
          weights: {
            admitted_receipts: 10,
            admitted_descendants: -2,
          },
        },
        {
          name: 'plurality',
          weights: {
            plural_perspective_excess: 1,
          },
        },
        {
          name: 'ambiguity',
          weights: {
            uncertainty_items: 5,
          },
        },
      ],
      created_at: '2026-10-01T23:25:00.000Z',
      laws: [
        'LENS != HISTORY',
        'LOCAL WEIGHT != UNIVERSAL VALUE',
      ],
    });

    const args = {
      admitted_receipts: [admit],
      perspectives: [
        { moment, receipt: a },
        { moment, receipt: b },
      ],
    };

    const weatherA = await projectField({ lens: lensA, ...args });
    const weatherB = await projectField({ lens: lensB, ...args });

    assert.equal(weatherA.history_root, weatherB.history_root);
    assert.deepEqual(weatherA.admitted_receipt_ids, weatherB.admitted_receipt_ids);
    assert.deepEqual(weatherA.perspective_receipt_ids, weatherB.perspective_receipt_ids);
    assert.notEqual(weatherA.lens_id, weatherB.lens_id);
    assert.notEqual(weatherA.projection_id, weatherB.projection_id);
    assert.notDeepEqual(weatherA.susceptibility, weatherB.susceptibility);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('field projection is deterministic across input order', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-order-'));
  try {
    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:r9-local',
      receiver_particular: 'particular:r9-local',
      contract_ref: 'contract:r9-local/v0',
    });

    const crossingA = await signedCrossing(2);
    const crossingB = await signedCrossing(3);
    await receiver.receive(crossingA, '2026-10-01T23:26:00.000Z');
    await receiver.receive(crossingB, '2026-10-01T23:27:00.000Z');
    const admitA = await receiver.dispose(
      crossingA.crossing_id,
      'ADMIT',
      '2026-10-01T23:28:00.000Z',
    );
    const admitB = await receiver.dispose(
      crossingB.crossing_id,
      'ADMIT',
      '2026-10-01T23:29:00.000Z',
    );

    const lens = fieldLens();
    const one = await projectField({
      lens,
      admitted_receipts: [admitA, admitB],
    });
    const two = await projectField({
      lens,
      admitted_receipts: [admitB, admitA],
    });

    assert.equal(one.history_root, two.history_root);
    assert.equal(one.projection_id, two.projection_id);
    assert.deepEqual(one.susceptibility, two.susceptibility);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('field cannot authorize action or impersonate a receipt/crossing', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-authority-'));
  try {
    const lens = fieldLens();
    const { receiver, admit } = await admittedFixture(base);
    const projection = await projectField({
      lens,
      admitted_receipts: [admit],
    });

    assert.equal(verifyFieldProjectionShape(projection), true);
    assert.equal(projection.semantic_effect, 'none');
    assert.equal(projection.authorization, null);
    assert.equal(projection.recommended_action, null);
    assert.equal(Object.prototype.hasOwnProperty.call(projection, 'capability_ref'), false);
    assert.equal(await verifyReceipt(projection), false);

    await assert.rejects(
      () => receiver.receive(projection, '2026-10-01T23:30:00.000Z'),
      /INVALID_CROSSING/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('field rejects refused history and perspectives on non-admitted crossings', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-reject-'));
  try {
    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:r9-local',
      receiver_particular: 'particular:r9-local',
      contract_ref: 'contract:r9-local/v0',
    });
    const refusedCrossing = await signedCrossing(4);
    await receiver.receive(refusedCrossing, '2026-10-01T23:31:00.000Z');
    const refused = await receiver.dispose(
      refusedCrossing.crossing_id,
      'REFUSE',
      '2026-10-01T23:32:00.000Z',
    );

    await assert.rejects(
      () => projectField({
        lens: fieldLens(),
        admitted_receipts: [refused],
      }),
      /FIELD_REQUIRES_R3_ADMIT/,
    );

    const admitted = await signedCrossing(5);
    await receiver.receive(admitted, '2026-10-01T23:33:00.000Z');
    const admitReceipt = await receiver.dispose(
      admitted.crossing_id,
      'ADMIT',
      '2026-10-01T23:34:00.000Z',
    );

    const unrelated = await signedCrossing(6);
    const { moment, a } = await perspectivePair(unrelated);

    await assert.rejects(
      () => projectField({
        lens: fieldLens(),
        admitted_receipts: [admitReceipt],
        perspectives: [{ moment, receipt: a }],
      }),
      /FIELD_PERSPECTIVE_REQUIRES_ADMITTED_CROSSING/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('tampering with projected susceptibility breaks projection identity', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r9-tamper-'));
  try {
    const { admit } = await admittedFixture(base);
    const projection = await projectField({
      lens: fieldLens(),
      admitted_receipts: [admit],
    });

    const tampered = structuredClone(projection);
    tampered.susceptibility.continuation = 999999;

    assert.equal(verifyFieldProjectionShape(projection), true);
    assert.equal(verifyFieldProjectionShape(tampered), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
