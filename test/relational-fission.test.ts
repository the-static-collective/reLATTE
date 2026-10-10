import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRelationFormationDraft,
  generateP256KeyPair,
  projectRelation,
  sealCrossingEnvelope,
  sealRelationEvent,
  verifyFreshReunion,
  verifyRelationEvent,
  verifyRelationFormation,
} from '../src/index.ts';

async function actors() {
  const ka = await generateP256KeyPair();
  const kb = await generateP256KeyPair();
  const a = {
    world_id: 'world:orchard', particular: 'particular:rose',
    public_key: ka.publicKeyJwk,
  };
  const b = {
    world_id: 'world:porch', particular: 'particular:rosemary',
    public_key: kb.publicKeyJwk,
  };
  return { ka, kb, a, b };
}

async function makeFormation(p: Awaited<ReturnType<typeof actors>>,
  previous_relation_id: string | null = null, created_at = '2026-10-10T14:00:00.000Z') {
  return sealCrossingEnvelope(buildRelationFormationDraft({
    a: p.a, b: p.b, purpose: 'A bounded shared project',
    previous_relation_id, created_at,
  }), p.ka);
}

async function dualAttestation(p: Awaited<ReturnType<typeof actors>>, f: any) {
  const a = await sealRelationEvent(f, 'attest', 0, p.ka, '2026-10-10T14:01:00.000Z');
  const b = await sealRelationEvent(f, 'attest', 1, p.kb, '2026-10-10T14:02:00.000Z');
  return [a, b];
}

test('forming a relation is not equivalent to claiming another endpoint agreed', async () => {
  const p = await actors();
  const f = await makeFormation(p);
  assert.equal(await verifyRelationFormation(f), true);
  assert.equal((await projectRelation(f, [])).status, 'proposed');
  const a = await sealRelationEvent(f, 'attest', 0, p.ka, '2026-10-10T14:01:00.000Z');
  const one = await projectRelation(f, [a, a]);
  assert.equal(one.status, 'proposed');
  assert.deepEqual(one.attested_endpoints, [0]);
  assert.equal(one.event_receipt_ids.length, 1);
  const b = await sealRelationEvent(f, 'attest', 1, p.kb, '2026-10-10T14:02:00.000Z');
  const together = await projectRelation(f, [a, b]);
  assert.equal(together.status, 'dual-attested');
  assert.equal(together.authority, null);
  assert.equal(f.requested_effect, null);
  assert.equal(f.capability_ref, null);
});

test('one endpoint may release without permission from the other; history remains', async () => {
  const p = await actors();
  const f = await makeFormation(p);
  const endorsements = await dualAttestation(p, f);
  const oldId = f.crossing_id;
  const release = await sealRelationEvent(
    f, 'release', 0, p.ka, '2026-10-10T14:03:00.000Z', 'Release without erasure',
  );
  assert.equal(await verifyRelationEvent(f, release), true);
  const result = await projectRelation(f, [...endorsements, release]);
  assert.equal(result.status, 'released');
  assert.deepEqual(result.released_endpoints, [0]);
  assert.deepEqual(result.attested_endpoints, [0, 1]);
  assert.equal(result.relation_id, oldId);
  assert.equal(result.authority, null);
  assert.deepEqual(
    await projectRelation(f, [release, ...endorsements, release]),
    result,
  );
  assert.equal(await verifyRelationFormation(f), true);
});

test('reunion is a new signed and dual-attested relation, not an old edge reactivated', async () => {
  const p = await actors();
  const first = await makeFormation(p);
  const previousEvents = await dualAttestation(p, first);
  previousEvents.push(await sealRelationEvent(
    first, 'release', 1, p.kb, '2026-10-10T14:03:00.000Z',
  ));
  const second = await makeFormation(
    p, first.crossing_id, '2026-10-10T15:00:00.000Z',
  );
  const newEvents = await dualAttestation(p, second);
  assert.notEqual(first.crossing_id, second.crossing_id);
  assert.deepEqual(second.parents, [first.crossing_id]);
  assert.equal(await verifyFreshReunion(first, previousEvents, second, newEvents), true);
  assert.equal((await projectRelation(first, previousEvents)).status, 'released');
  assert.equal((await projectRelation(second, newEvents)).status, 'dual-attested');
  assert.equal(await verifyRelationEvent(second, previousEvents[0]), false);
  assert.equal(await verifyFreshReunion(first, previousEvents, second, previousEvents), false);
});

test('refuse key impersonation, signature mutation, and non-parented reunion', async () => {
  const p = await actors();
  const f = await makeFormation(p);
  const both = await dualAttestation(p, f);
  await assert.rejects(
    () => sealRelationEvent(f, 'release', 1, p.ka, '2026-10-10T15:00:00.000Z'),
    /RELATION_EVENT_KEY_MISMATCH/,
  );
  const tampered = structuredClone(both[1]);
  tampered.extensions.relation_event.endpoint_index = 0;
  assert.equal(await verifyRelationEvent(f, tampered), false);
  await assert.rejects(
    () => projectRelation(f, [tampered]),
    /INVALID_RELATION_EVENT/,
  );
  const mutatedFormation = structuredClone(f);
  mutatedFormation.extensions.relation.purpose = 'rewritten history';
  assert.equal(await verifyRelationFormation(mutatedFormation), false);
  const released = [...both, await sealRelationEvent(
    f, 'release', 0, p.ka, '2026-10-10T15:00:00.000Z',
  )];
  const unrelated = await makeFormation(p, null, '2026-10-10T16:00:00.000Z');
  assert.equal(await verifyFreshReunion(
    f, released, unrelated, await dualAttestation(p, unrelated),
  ), false);
});

test('release before dual attestation cannot manufacture historic mutuality', async () => {
  const p = await actors();
  const f = await makeFormation(p);
  const one = await sealRelationEvent(f, 'attest', 0, p.ka, '2026-10-10T14:01:00.000Z');
  const release = await sealRelationEvent(f, 'release', 0, p.ka, '2026-10-10T14:02:00.000Z');
  const state = await projectRelation(f, [one, release]);
  assert.equal(state.status, 'released');
  assert.deepEqual(state.attested_endpoints, [0]);
  const next = await makeFormation(
    p, f.crossing_id, '2026-10-10T17:00:00.000Z',
  );
  assert.equal(await verifyFreshReunion(
    f, [one, release], next, await dualAttestation(p, next),
  ), false);
});
