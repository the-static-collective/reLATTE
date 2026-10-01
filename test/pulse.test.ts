import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  assembleCompositionPulse,
  buildCulturalDescendantDraft,
  buildPulseDescendantDraft,
  buildPulseLocalActDraft,
  buildPulseReturnDraft,
  createCompositionalQuestion,
  createCulturalUptake,
  generateP256KeyPair,
  projectField,
  sealCrossingEnvelope,
  sealFieldLens,
  sealOwnerLocalAdaptation,
  sealSlowDevelopmentalWitness,
  verifyCompositionPulseTrace,
  verifyCompositionalQuestion,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

async function originCrossing(): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r13-source',
    source_world: 'world:r13-source',
    source_history_head: null,
    parents: [],
    declared_kind: 'R13_ORIGIN',
    payload_refs: [{
      address: 'sha256:' + '1'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r13-origin',
    created_at: '2026-10-02T00:10:00.000Z',
    extensions: {
      specimen: 'COMPOSITION-PULSE-001',
    },
  }, keys);
}

function fieldLens(): any {
  return sealFieldLens({
    schema: 'relatte.field-lens/v0',
    world_id: 'world:r13-local',
    title: 'R13 Pulse Lens',
    channels: [
      {
        name: 'continuation',
        weights: {
          admitted_receipts: 2,
          admitted_descendants: 1,
        },
      },
    ],
    created_at: '2026-10-02T00:13:00.000Z',
    laws: [
      'LENS != HISTORY',
      'LOCAL WEIGHT != UNIVERSAL VALUE',
    ],
  });
}

async function fullPulse(base: string): Promise<Record<string, any>> {
  const origin = await originCrossing();
  const local = await LocalReceiver.create(join(base, 'local'), {
    world_id: 'world:r13-local',
    receiver_particular: 'particular:r13-local',
    contract_ref: 'contract:r13-local/v0',
  });

  await local.receive(origin, '2026-10-02T00:11:00.000Z');
  const originAdmit = await local.dispose(
    origin.crossing_id,
    'ADMIT',
    '2026-10-02T00:12:00.000Z',
    {
      admit_effect: 'origin-local-consequence',
      descendant_refs: ['artifact:r13-origin-local-consequence'],
    },
  );

  const field = await projectField({
    lens: fieldLens(),
    admitted_receipts: [originAdmit],
  });

  const localActorKeys = await generateP256KeyPair();
  const localActDraft = await buildPulseLocalActDraft({
    origin_crossing: origin,
    origin_admit_receipt: originAdmit,
    field_projection: field,
    local_particular: 'particular:r13-local-maker',
    payload_ref: {
      address: 'sha256:' + '2'.repeat(64),
      media_type: 'application/json',
    },
    created_at: '2026-10-02T00:14:00.000Z',
  });
  const localAct = await sealCrossingEnvelope(
    localActDraft,
    localActorKeys,
  );

  await local.receive(localAct, '2026-10-02T00:15:00.000Z');
  const localActAdmit = await local.dispose(
    localAct.crossing_id,
    'ADMIT',
    '2026-10-02T00:16:00.000Z',
    {
      admit_effect: 'fresh-local-act-realized',
    },
  );

  const slowWitness = await sealSlowDevelopmentalWitness({
    origin_crossing: origin,
    local_act_crossing: localAct,
    local_act_admit_receipt: localActAdmit,
    field_projection: field,
    witness_world_id: 'world:r13-slow-witness',
    witness_particular: 'particular:r13-daily-slice',
    posture: 'OBSERVATION',
    observation:
      'From here, then: admitting the origin altered the local field, and a fresh act followed without the field authorizing it.',
    keys: await generateP256KeyPair(),
    created_at: '2026-10-02T00:17:00.000Z',
  });

  const question = await createCompositionalQuestion({
    slow_witness_receipt: slowWitness,
    question:
      'What can be preserved from the origin while varying the return into an invitation for another sovereign world?',
    constraints: [
      'preserve attributable ancestry',
      'do not inherit admission',
      'do not treat field pressure as authority',
      'return must remain a fresh candidate',
    ],
    created_at: '2026-10-02T00:18:00.000Z',
  });

  const uptake = await createCulturalUptake({
    ancestor_crossing: origin,
    admitted_receipt: originAdmit,
    field_projection: field,
    world_id: 'world:r13-local',
    local_particular: 'particular:r13-local-maker',
    variation: {
      preserved: [
        'attributable ancestry',
        'return-after-transformation',
      ],
      varied: [
        'return becomes a voluntary invitation rather than closure',
      ],
      introduced: [
        'a cross-world response path',
      ],
      retired: [
        'assumption that one local admission settles later worlds',
      ],
    },
    note: 'Owner-local adaptation downstream of the R13 compositional question.',
    created_at: '2026-10-02T00:19:00.000Z',
  });

  const adaptation = await sealOwnerLocalAdaptation({
    question,
    uptake,
    slow_witness_receipt: slowWitness,
    local_world_id: 'world:r13-local',
    local_particular: 'particular:r13-local-maker',
    response:
      'Preserve ancestry and return structure; vary the return into a fresh cross-world invitation with no inherited authority.',
    keys: localActorKeys,
    created_at: '2026-10-02T00:20:00.000Z',
  });

  const baseDescendantDraft = buildCulturalDescendantDraft({
    uptake,
    descendant_payload_ref: {
      address: 'sha256:' + '3'.repeat(64),
      media_type: 'application/json',
    },
    return_address: origin.return_address,
    created_at: '2026-10-02T00:21:00.000Z',
  });
  const pulseDescendantDraft = await buildPulseDescendantDraft({
    descendant_draft: baseDescendantDraft,
    slow_witness_receipt: slowWitness,
    question,
    adaptation_receipt: adaptation,
  });
  const descendant = await sealCrossingEnvelope(
    pulseDescendantDraft,
    localActorKeys,
  );

  const destination = await LocalReceiver.create(join(base, 'destination'), {
    world_id: 'world:r13-destination',
    receiver_particular: 'particular:r13-destination',
    contract_ref: 'contract:r13-destination/v0',
  });
  const descendantReceive = await destination.receive(
    descendant,
    '2026-10-02T00:22:00.000Z',
  );

  const returnDraft = await buildPulseReturnDraft({
    origin_crossing: origin,
    descendant_crossing: descendant,
    destination_world_id: 'world:r13-destination',
    destination_particular: 'particular:r13-destination-returner',
    created_at: '2026-10-02T00:23:00.000Z',
  });
  const returned = await sealCrossingEnvelope(
    returnDraft,
    await generateP256KeyPair(),
  );

  const returnReceive = await local.receive(
    returned,
    '2026-10-02T00:24:00.000Z',
  );

  return {
    origin,
    local,
    originAdmit,
    field,
    localActorKeys,
    localAct,
    localActAdmit,
    slowWitness,
    question,
    uptake,
    adaptation,
    descendant,
    destination,
    descendantReceive,
    returned,
    returnReceive,
  };
}

test('one full composition pulse closes from crossing to return without hidden authority transfer', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-full-'));
  try {
    const p = await fullPulse(base);

    const trace = await assembleCompositionPulse({
      origin_crossing: p.origin,
      origin_admit_receipt: p.originAdmit,
      field_projection: p.field,
      local_act_crossing: p.localAct,
      local_act_admit_receipt: p.localActAdmit,
      slow_witness_receipt: p.slowWitness,
      question: p.question,
      uptake: p.uptake,
      adaptation_receipt: p.adaptation,
      descendant_crossing: p.descendant,
      descendant_receive_receipt: p.descendantReceive,
      return_crossing: p.returned,
      return_receive_receipt: p.returnReceive,
    });

    assert.equal(verifyCompositionPulseTrace(trace), true);
    assert.match(trace.pulse_id!, /^relatte-composition-pulse-v0:[0-9a-f]{64}$/);

    assert.equal(p.originAdmit.kind, 'R3_ADMIT');
    assert.equal(p.field.semantic_effect, 'none');
    assert.equal(p.field.authorization, null);
    assert.equal(p.localAct.declared_kind, 'R13_LOCAL_ACT');
    assert.equal(
      p.localAct.extensions.composition_pulse.field_authorized_action,
      false,
    );
    assert.equal(p.localActAdmit.kind, 'R3_ADMIT');
    assert.equal(p.slowWitness.kind, 'R13_SLOW_WITNESS');
    assert.equal(p.slowWitness.semantic_effect, 'none');
    assert.equal(p.question.authority, null);
    assert.equal(p.adaptation.kind, 'R13_ADAPTATION');
    assert.equal(
      p.adaptation.extensions.adaptation.authority,
      'fresh-local',
    );
    assert.equal(
      p.descendant.extensions.cultural_descendant.inherited_authority,
      false,
    );
    assert.equal(p.descendantReceive.kind, 'RECEIVED');
    assert.equal(p.descendantReceive.semantic_effect, 'none');
    assert.equal(p.returned.declared_kind, 'R13_RETURN');
    assert.equal(
      p.returned.extensions.composition_return.inherited_authority,
      false,
    );
    assert.equal(p.returnReceive.kind, 'RECEIVED');
    assert.equal(p.returnReceive.semantic_effect, 'none');

    assert.deepEqual(
      p.destination.snapshot().admitted,
      [],
    );
    assert.equal(
      p.local.getDispositionReceipt(p.returned.crossing_id),
      null,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('slow witness records from-here-then without becoming source or canon', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-witness-'));
  try {
    const p = await fullPulse(base);

    assert.equal(await verifyReceipt(p.slowWitness), true);
    assert.equal(
      p.slowWitness.extensions.slow_witness.visible_from_here_then,
      true,
    );
    assert.equal(
      p.slowWitness.extensions.slow_witness.source_authority,
      false,
    );
    assert.equal(
      p.slowWitness.extensions.slow_witness.canonical_now,
      false,
    );

    const tampered = structuredClone(p.slowWitness);
    tampered.note = 'rewritten later to make the outcome inevitable';
    assert.equal(await verifyReceipt(tampered), false);

    assert.equal(p.question.semantic_effect, 'none');
    assert.equal(p.question.authority, null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('field pressure and compositional question cannot authorize the local act or adaptation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-authority-'));
  try {
    const p = await fullPulse(base);

    assert.equal(p.field.authorization, null);
    assert.equal(p.field.recommended_action, null);
    assert.equal(
      p.localAct.extensions.composition_pulse.field_authorized_action,
      false,
    );

    assert.equal(
      p.adaptation.extensions.adaptation.field_authorized_action,
      false,
    );
    assert.equal(
      p.adaptation.extensions.adaptation.witness_authorized_action,
      false,
    );
    assert.equal(
      p.adaptation.extensions.adaptation.question_authorized_action,
      false,
    );

    const tamperedAct = structuredClone(p.localAct);
    tamperedAct.extensions.composition_pulse.field_authorized_action = true;
    assert.equal(await verifyCrossingEnvelope(tamperedAct), false);

    const tamperedAdaptation = structuredClone(p.adaptation);
    tamperedAdaptation.extensions.adaptation.question_authorized_action = true;
    assert.equal(await verifyReceipt(tamperedAdaptation), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('descendant must be signed by the same fresh local actor that signed adaptation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-key-continuity-'));
  try {
    const p = await fullPulse(base);

    const wrongDescendant = await sealCrossingEnvelope(
      {
        ...p.descendant,
        crossing_id: undefined,
        signing: undefined,
      },
      await generateP256KeyPair(),
    );

    await assert.rejects(
      () => assembleCompositionPulse({
        origin_crossing: p.origin,
        origin_admit_receipt: p.originAdmit,
        field_projection: p.field,
        local_act_crossing: p.localAct,
        local_act_admit_receipt: p.localActAdmit,
        slow_witness_receipt: p.slowWitness,
        question: p.question,
        uptake: p.uptake,
        adaptation_receipt: p.adaptation,
        descendant_crossing: wrongDescendant,
        descendant_receive_receipt: p.descendantReceive,
        return_crossing: p.returned,
        return_receive_receipt: p.returnReceive,
      }),
      /PULSE_DESCENDANT_ADAPTATION_MISMATCH|PULSE_DESCENDANT_RECEIVE_MISMATCH/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('global agreement is not required for one lawful pulse to return', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-divergence-'));
  try {
    const p = await fullPulse(base);

    const dissentingWorld = await LocalReceiver.create(join(base, 'dissent'), {
      world_id: 'world:r13-dissent',
      receiver_particular: 'particular:r13-dissent',
      contract_ref: 'contract:r13-dissent/v0',
    });
    await dissentingWorld.receive(
      p.descendant,
      '2026-10-02T00:25:00.000Z',
    );
    const refusal = await dissentingWorld.dispose(
      p.descendant.crossing_id,
      'REFUSE',
      '2026-10-02T00:26:00.000Z',
    );

    assert.equal(refusal.kind, 'R3_REFUSE');
    assert.equal(refusal.semantic_effect, 'none');

    const trace = await assembleCompositionPulse({
      origin_crossing: p.origin,
      origin_admit_receipt: p.originAdmit,
      field_projection: p.field,
      local_act_crossing: p.localAct,
      local_act_admit_receipt: p.localActAdmit,
      slow_witness_receipt: p.slowWitness,
      question: p.question,
      uptake: p.uptake,
      adaptation_receipt: p.adaptation,
      descendant_crossing: p.descendant,
      descendant_receive_receipt: p.descendantReceive,
      return_crossing: p.returned,
      return_receive_receipt: p.returnReceive,
    });

    assert.equal(verifyCompositionPulseTrace(trace), true);
    assert.deepEqual(
      dissentingWorld.snapshot().refused,
      [p.descendant.crossing_id],
    );
    assert.deepEqual(
      p.destination.snapshot().admitted,
      [],
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('return crossing targets the original return address but arrives only as a fresh candidate', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-return-'));
  try {
    const p = await fullPulse(base);

    assert.equal(
      p.returned.extensions.composition_return.to_return_address,
      p.origin.return_address,
    );
    assert.deepEqual(p.returned.parents, [p.descendant.crossing_id]);
    assert.equal(
      p.returned.requested_effect.authority,
      'receiver-local',
    );
    assert.equal(
      p.returned.extensions.composition_return.inherited_admission,
      false,
    );
    assert.equal(
      p.returnReceive.world_id,
      'world:r13-local',
    );
    assert.equal(
      p.local.getDispositionReceipt(p.returned.crossing_id),
      null,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('pulse trace is content-addressed and tamper evident', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r13-trace-'));
  try {
    const p = await fullPulse(base);
    const trace = await assembleCompositionPulse({
      origin_crossing: p.origin,
      origin_admit_receipt: p.originAdmit,
      field_projection: p.field,
      local_act_crossing: p.localAct,
      local_act_admit_receipt: p.localActAdmit,
      slow_witness_receipt: p.slowWitness,
      question: p.question,
      uptake: p.uptake,
      adaptation_receipt: p.adaptation,
      descendant_crossing: p.descendant,
      descendant_receive_receipt: p.descendantReceive,
      return_crossing: p.returned,
      return_receive_receipt: p.returnReceive,
    });

    const tampered = structuredClone(trace);
    tampered.question_id =
      'relatte-compositional-question-v0:' + '0'.repeat(64);

    assert.equal(verifyCompositionPulseTrace(trace), true);
    assert.equal(verifyCompositionPulseTrace(tampered), false);

    const sidecar = {
      ...trace,
      unsigned_interpretation: 'smuggled meaning',
    };
    assert.equal(verifyCompositionPulseTrace(sidecar), false);

    const questionSidecar = {
      ...p.question,
      unsigned_interpretation: 'question sidecar',
    };
    assert.equal(
      verifyCompositionalQuestion(questionSidecar),
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
