import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEnterableParticular,
  followRoomNavigationRequest,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
} from '../src/index.ts';

async function specimen() {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();

  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:demo-song',
    source_world: 'world:studio',
    source_history_head: null,
    parents: [],
    declared_kind: 'MEDIA_COMPOSITION',
    payload_refs: [
      { address: 'sha256:' + '1'.repeat(64), role: 'song', media_type: 'audio/mpeg' },
      { address: 'sha256:' + '2'.repeat(64), role: 'lyrics', media_type: 'text/plain' },
      { address: 'sha256:' + '3'.repeat(64), role: 'video', media_type: 'video/mp4' },
    ],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-01T19:10:00.000Z',
    extensions: {},
  }, sourceKeys);

  const receipt = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: 'world:room',
    receiver_particular: 'particular:listener',
    kind: 'VERIFIED',
    semantic_effect: 'none',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: null,
    created_at: '2026-10-01T19:11:00.000Z',
    extensions: {},
  }, receiverKeys);

  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
  );

  return { crossing, receipt, packet };
}

function request(sourceSubject: string, target: string) {
  return {
    format: 'roroomom.relatte-navigation-request/v0',
    version: 0,
    source_subject: sourceSubject,
    requested_subject: target,
    source_door: 'COMPOSE',
    encounter_id: 'room-encounter:test',
    authority: 'none',
    requested_action: 'recenter-if-verified-neighbor',
    boundary: [
      'ROOM REQUEST != VERIFIED ROAD',
      'REQUESTED SUBJECT != AUTHORIZED SUBJECT',
      'reLATTE MUST REVERIFY NEIGHBOR',
    ],
  };
}

test('room request can return attention to a real verified neighbor', async () => {
  const { crossing, receipt } = await specimen();
  const result = await followRoomNavigationRequest(
    request(crossing.crossing_id, 'particular:listener'),
    [crossing, receipt],
  );

  assert.equal(result.step.from_subject, crossing.crossing_id);
  assert.equal(result.step.to_subject, 'particular:listener');
  assert.equal(result.destination.subject, 'particular:listener');
  assert.equal(result.destination.authority, 'none');
  assert.equal(result.destination.encounter?.subject, 'particular:listener');
});

test('room cannot manufacture a non-neighbor road', async () => {
  const { crossing, receipt } = await specimen();

  await assert.rejects(
    () => followRoomNavigationRequest(
      request(crossing.crossing_id, 'particular:invented'),
      [crossing, receipt],
    ),
    /NON_NEIGHBOR_TRAVERSAL/,
  );
});

test('authority inflation in room request is refused before traversal', async () => {
  const { crossing, receipt } = await specimen();
  const inflated = {
    ...request(crossing.crossing_id, 'particular:listener'),
    authority: 'room-controls-relatte',
  };

  await assert.rejects(
    () => followRoomNavigationRequest(inflated, [crossing, receipt]),
    /INVALID_ROOM_NAVIGATION_REQUEST/,
  );
});

test('missing anti-collapse boundary is refused', async () => {
  const { crossing, receipt } = await specimen();
  const malformed = request(crossing.crossing_id, 'particular:listener');
  malformed.boundary = ['ROOM REQUEST != VERIFIED ROAD'];

  await assert.rejects(
    () => followRoomNavigationRequest(malformed, [crossing, receipt]),
    /INVALID_ROOM_NAVIGATION_BOUNDARY/,
  );
});
