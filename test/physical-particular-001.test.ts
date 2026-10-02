import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustodyGrant, mayExercise } from '../experiments/physical-custody-001.ts';

test('experimental grant keeps powers separate', () => {
  const grant = createCustodyGrant({
    schema: 'relatte.experimental-physical-custody-grant/001',
    object_ref: 'object:camera-0042',
    anchors: [{ kind: 'serial', value: 'CAMERA-0042', observed_at: '2026-10-03T01:00:00Z', observer_ref: 'alice' }],
    grantor_ref: 'alice',
    grantee_ref: 'bob',
    powers: ['possess', 'transport'],
    parent_grant_ref: null,
    starts_at: '2026-10-03T01:01:00Z',
    expires_at: null,
    return_duty: { required: false, destination_ref: null },
    title_claim: null,
  });
  assert.equal(mayExercise(grant, 'possess'), true);
  assert.equal(mayExercise(grant, 'use'), false);
});
