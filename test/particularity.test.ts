import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCapabilityGrant,
  createNameSurface,
  createNameSurfaceTransition,
  createParticularConstitution,
  createParticularEventWitness,
  createParticularStateSurface,
  hasCapability,
  hasWitnessableNamePath,
  replayParticularity,
  stateCanAccessEvent,
  statesShareParticular,
  witnessedEventExists,
  type ParticularityRecord,
} from '../src/index.ts';

test('PARTICULARITY-CRUCIBLE-001: false split does not fracture one particular', () => {
  const p = createParticularConstitution({
    world_id: 'world:crucible-p',
    lineage_root: 'lineage:crucible-root',
    inherited_content_ref: 'sha256:' + 'a'.repeat(64),
    constitution_nonce: 'constitution:p',
    created_at: '2026-10-07T14:00:00.000Z',
  });

  const stateA = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:a',
    self_surface: 'A',
    controller_id: 'controller:a',
    accessible_event_ids: ['event:e', 'memory:m1'],
    created_at: '2026-10-07T14:01:00.000Z',
  });

  const eventE = createParticularEventWitness({
    particular_id: p.particular_id,
    event_id: 'event:e',
    event_ref: 'sha256:' + 'e'.repeat(64),
    observed_in_state_id: stateA.state_id,
    created_at: '2026-10-07T14:02:00.000Z',
  });

  const stateB = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:b',
    self_surface: 'B',
    controller_id: 'controller:b',
    accessible_event_ids: ['memory:m2'],
    created_at: '2026-10-07T14:03:00.000Z',
  });

  const projection = replayParticularity([p, stateA, eventE, stateB]);

  assert.notEqual(stateA.state_id, stateB.state_id);
  assert.notEqual(stateA.self_surface, stateB.self_surface);
  assert.notEqual(stateA.controller_id, stateB.controller_id);

  assert.equal(
    statesShareParticular(projection, stateA.surface_id, stateB.surface_id),
    true,
  );
  assert.equal(stateCanAccessEvent(projection, stateB.surface_id, 'event:e'), false);
  assert.equal(witnessedEventExists(projection, p.particular_id, 'event:e'), true);
});

test('PARTICULARITY-CRUCIBLE-001: false collapse does not merge distinct constitutions', () => {
  const seed = {
    lineage_root: 'lineage:shared-seed',
    inherited_content_ref: 'sha256:' + 'b'.repeat(64),
  };

  const q = createParticularConstitution({
    world_id: 'world:q',
    ...seed,
    constitution_nonce: 'constitution:q',
    created_at: '2026-10-07T14:10:00.000Z',
  });

  const r = createParticularConstitution({
    world_id: 'world:r',
    ...seed,
    constitution_nonce: 'constitution:r',
    created_at: '2026-10-07T14:10:00.000Z',
  });

  assert.equal(q.inherited_content_ref, r.inherited_content_ref);
  assert.equal(q.lineage_root, r.lineage_root);
  assert.notEqual(q.constitution_id, r.constitution_id);
  assert.notEqual(q.particular_id, r.particular_id);

  const projection = replayParticularity([q, r]);
  assert.equal(Object.keys(projection.particulars).length, 2);
});

test('PARTICULARITY-CRUCIBLE-001: authority follows an explicit grant, not sameness of particular', () => {
  const p = createParticularConstitution({
    world_id: 'world:authority',
    lineage_root: 'lineage:authority',
    inherited_content_ref: 'sha256:' + 'c'.repeat(64),
    constitution_nonce: 'constitution:authority',
    created_at: '2026-10-07T14:20:00.000Z',
  });

  const stateA = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:authority-a',
    self_surface: 'A',
    controller_id: 'controller:authorized',
    accessible_event_ids: [],
    created_at: '2026-10-07T14:21:00.000Z',
  });

  const stateB = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:authority-b',
    self_surface: 'B',
    controller_id: 'controller:not-authorized',
    accessible_event_ids: [],
    created_at: '2026-10-07T14:22:00.000Z',
  });

  const grant = createCapabilityGrant({
    capability_id: 'capability:open-door',
    subject: {
      kind: 'CONTROLLER',
      id: stateA.controller_id,
    },
    created_at: '2026-10-07T14:23:00.000Z',
  });

  const projection = replayParticularity([p, stateA, stateB, grant]);

  assert.equal(
    statesShareParticular(projection, stateA.surface_id, stateB.surface_id),
    true,
  );
  assert.equal(
    hasCapability(projection, {
      particular_id: p.particular_id,
      controller_id: stateA.controller_id,
      capability_id: 'capability:open-door',
    }),
    true,
  );
  assert.equal(
    hasCapability(projection, {
      particular_id: p.particular_id,
      controller_id: stateB.controller_id,
      capability_id: 'capability:open-door',
    }),
    false,
  );
});

test('PARTICULARITY-CRUCIBLE-001: carrier mutation can preserve referent without transferring authority', () => {
  const p = createParticularConstitution({
    world_id: 'world:name',
    lineage_root: 'lineage:name',
    inherited_content_ref: 'sha256:' + 'd'.repeat(64),
    constitution_nonce: 'constitution:name',
    created_at: '2026-10-07T14:30:00.000Z',
  });

  const original = createNameSurface({
    kind: 'ORIGINAL',
    carrier: 'ALPHA',
    referent_id: p.particular_id,
  });

  const crossed = createNameSurface({
    kind: 'SIGN',
    carrier: 'ΑΛΦΑ',
    referent_id: p.particular_id,
  });

  const unconnected = createNameSurface({
    kind: 'SPOKEN',
    carrier: 'alpha',
    referent_id: p.particular_id,
  });

  const transition = createNameSurfaceTransition({
    particular_id: p.particular_id,
    from_surface: original,
    to_surface: crossed,
    transformation_kind: 'PROVISIONAL_NU',
    continuity_claim: 'SAME_REFERENT',
    created_at: '2026-10-07T14:31:00.000Z',
  });

  const projection = replayParticularity([p, transition]);

  assert.notEqual(original.surface_id, crossed.surface_id);
  assert.equal(original.referent_id, crossed.referent_id);
  assert.equal(transition.authority_transferred, false);
  assert.equal(
    hasWitnessableNamePath(projection, {
      particular_id: p.particular_id,
      from_surface_id: original.surface_id,
      to_surface_id: crossed.surface_id,
      referent_id: p.particular_id,
    }),
    true,
  );

  // Same referent is not enough. Without a recorded transition there is no
  // witnessable continuity path to this surface.
  assert.equal(
    hasWitnessableNamePath(projection, {
      particular_id: p.particular_id,
      from_surface_id: original.surface_id,
      to_surface_id: unconnected.surface_id,
      referent_id: p.particular_id,
    }),
    false,
  );
});

test('PARTICULARITY-CRUCIBLE-001: same carrier does not establish same referent', () => {
  const p = createParticularConstitution({
    world_id: 'world:carrier-p',
    lineage_root: 'lineage:carrier',
    inherited_content_ref: 'sha256:' + 'f'.repeat(64),
    constitution_nonce: 'constitution:carrier-p',
    created_at: '2026-10-07T14:40:00.000Z',
  });

  const q = createParticularConstitution({
    world_id: 'world:carrier-q',
    lineage_root: 'lineage:carrier',
    inherited_content_ref: 'sha256:' + 'f'.repeat(64),
    constitution_nonce: 'constitution:carrier-q',
    created_at: '2026-10-07T14:40:00.000Z',
  });

  const pName = createNameSurface({
    kind: 'SIGN',
    carrier: 'SAME-NAME',
    referent_id: p.particular_id,
  });
  const qName = createNameSurface({
    kind: 'SIGN',
    carrier: 'SAME-NAME',
    referent_id: q.particular_id,
  });

  assert.equal(pName.carrier, qName.carrier);
  assert.notEqual(pName.referent_id, qName.referent_id);
  assert.notEqual(pName.surface_id, qName.surface_id);
});

test('PARTICULARITY-CRUCIBLE-001: claimed continuity across different referents is rejected', () => {
  const p = createParticularConstitution({
    world_id: 'world:continuity-p',
    lineage_root: 'lineage:continuity',
    inherited_content_ref: 'sha256:' + '1'.repeat(64),
    constitution_nonce: 'constitution:continuity-p',
    created_at: '2026-10-07T14:50:00.000Z',
  });
  const q = createParticularConstitution({
    world_id: 'world:continuity-q',
    lineage_root: 'lineage:continuity',
    inherited_content_ref: 'sha256:' + '1'.repeat(64),
    constitution_nonce: 'constitution:continuity-q',
    created_at: '2026-10-07T14:50:00.000Z',
  });

  const from = createNameSurface({
    kind: 'ORIGINAL',
    carrier: 'ONE',
    referent_id: p.particular_id,
  });
  const to = createNameSurface({
    kind: 'SIGN',
    carrier: 'TWO',
    referent_id: q.particular_id,
  });

  assert.throws(
    () =>
      createNameSurfaceTransition({
        particular_id: p.particular_id,
        from_surface: from,
        to_surface: to,
        transformation_kind: 'HOSTILE_FALSE_CONTINUITY',
        continuity_claim: 'SAME_REFERENT',
        created_at: '2026-10-07T14:51:00.000Z',
      }),
    /REFERENT_CONTINUITY_MISMATCH/,
  );
});

test('PARTICULARITY-CRUCIBLE-001: cold replay reconstructs the same answers from durable records only', () => {
  const p = createParticularConstitution({
    world_id: 'world:cold',
    lineage_root: 'lineage:cold',
    inherited_content_ref: 'sha256:' + '9'.repeat(64),
    constitution_nonce: 'constitution:cold',
    created_at: '2026-10-07T15:00:00.000Z',
  });

  const stateA = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:cold-a',
    self_surface: 'A',
    controller_id: 'controller:cold-a',
    accessible_event_ids: ['event:cold'],
    created_at: '2026-10-07T15:01:00.000Z',
  });
  const event = createParticularEventWitness({
    particular_id: p.particular_id,
    event_id: 'event:cold',
    event_ref: 'sha256:' + '8'.repeat(64),
    observed_in_state_id: stateA.state_id,
    created_at: '2026-10-07T15:02:00.000Z',
  });
  const stateB = createParticularStateSurface({
    particular_id: p.particular_id,
    state_id: 'state:cold-b',
    self_surface: 'B',
    controller_id: 'controller:cold-b',
    accessible_event_ids: [],
    created_at: '2026-10-07T15:03:00.000Z',
  });
  const grant = createCapabilityGrant({
    capability_id: 'capability:cold',
    subject: {
      kind: 'CONTROLLER',
      id: stateA.controller_id,
    },
    created_at: '2026-10-07T15:04:00.000Z',
  });

  const original = createNameSurface({
    kind: 'ORIGINAL',
    carrier: 'ROOT',
    referent_id: p.particular_id,
  });
  const sign = createNameSurface({
    kind: 'SIGN',
    carrier: 'BRANCH',
    referent_id: p.particular_id,
  });
  const transition = createNameSurfaceTransition({
    particular_id: p.particular_id,
    from_surface: original,
    to_surface: sign,
    transformation_kind: 'PROVISIONAL_NU',
    continuity_claim: 'SAME_REFERENT',
    created_at: '2026-10-07T15:05:00.000Z',
  });

  const durable: ParticularityRecord[] = [
    p,
    stateA,
    event,
    stateB,
    grant,
    transition,
  ];

  // Simulate complete process-memory loss. Only serialized durable records cross
  // the boundary into the fresh replay.
  const coldRecords = JSON.parse(
    JSON.stringify(durable),
  ) as ParticularityRecord[];
  const replayed = replayParticularity(coldRecords);

  assert.deepEqual(
    {
      A_and_B_same_particular: statesShareParticular(
        replayed,
        stateA.surface_id,
        stateB.surface_id,
      ),
      A_and_B_same_state: stateA.state_id === stateB.state_id,
      B_can_access_event: stateCanAccessEvent(
        replayed,
        stateB.surface_id,
        'event:cold',
      ),
      event_existed: witnessedEventExists(
        replayed,
        p.particular_id,
        'event:cold',
      ),
      A_has_controller_capability: hasCapability(replayed, {
        particular_id: p.particular_id,
        controller_id: stateA.controller_id,
        capability_id: 'capability:cold',
      }),
      B_has_controller_capability: hasCapability(replayed, {
        particular_id: p.particular_id,
        controller_id: stateB.controller_id,
        capability_id: 'capability:cold',
      }),
      surface_mutated: original.surface_id !== sign.surface_id,
      referent_continued: hasWitnessableNamePath(replayed, {
        particular_id: p.particular_id,
        from_surface_id: original.surface_id,
        to_surface_id: sign.surface_id,
        referent_id: p.particular_id,
      }),
      authority_transferred_by_name_transition:
        transition.authority_transferred,
    },
    {
      A_and_B_same_particular: true,
      A_and_B_same_state: false,
      B_can_access_event: false,
      event_existed: true,
      A_has_controller_capability: true,
      B_has_controller_capability: false,
      surface_mutated: true,
      referent_continued: true,
      authority_transferred_by_name_transition: false,
    },
  );
});

test('PARTICULARITY-CRUCIBLE-001: tampering with durable identity material fails replay', () => {
  const p = createParticularConstitution({
    world_id: 'world:tamper',
    lineage_root: 'lineage:tamper',
    inherited_content_ref: 'sha256:' + '7'.repeat(64),
    constitution_nonce: 'constitution:tamper',
    created_at: '2026-10-07T15:10:00.000Z',
  });

  const tampered = structuredClone(p);
  tampered.inherited_content_ref = 'sha256:' + '0'.repeat(64);

  assert.throws(
    () => replayParticularity([tampered]),
    /INVALID_PARTICULAR_CONSTITUTION/,
  );
});
