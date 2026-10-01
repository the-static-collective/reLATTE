import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEnterableParticular,
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
    source_particular: 'particular:song-seed',
    source_world: 'world:studio',
    source_history_head: null,
    parents: [],
    declared_kind: 'MEDIA_COMPOSITION',
    payload_refs: [
      { address: 'sha256:' + 'a'.repeat(64), role: 'song', media_type: 'audio/mpeg' },
      { address: 'sha256:' + 'b'.repeat(64), role: 'lyrics', media_type: 'text/plain' },
      { address: 'sha256:' + 'c'.repeat(64), role: 'video', media_type: 'video/mp4' },
      { address: 'sha256:' + 'd'.repeat(64), role: 'cover', media_type: 'image/png' },
    ],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-01T18:55:00.000Z',
    extensions: {},
  }, sourceKeys);

  const receipt = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: 'world:listening-room',
    receiver_particular: 'particular:listener',
    kind: 'VERIFIED',
    semantic_effect: 'none',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: 'Verification-only specimen.',
    created_at: '2026-10-01T18:56:00.000Z',
    extensions: {},
  }, receiverKeys);

  return { crossing, receipt };
}

test('one particular exposes five doors without becoming five subjects', async () => {
  const { crossing, receipt } = await specimen();
  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
  );

  assert.equal(packet.subject, crossing.crossing_id);
  assert.equal(packet.doors.length, 5);
  assert.deepEqual(
    packet.doors.map((door) => door.role),
    ['COMPOST', 'COMPOSE', 'COMPUTE', 'COMMUTE', 'COMMUNE'],
  );
});

test('COMPOSE door receives media instruments from verified payload refs', async () => {
  const { crossing, receipt } = await specimen();
  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
  );

  const compose = packet.doors.find((door) => door.role === 'COMPOSE')!;
  assert.deepEqual(
    compose.instruments.map((instrument) => instrument.kind),
    ['relation-board', 'audio-player', 'text-sheet', 'video-player', 'image-viewer'],
  );
});

test('other doors render different projection instruments over the same subject', async () => {
  const { crossing, receipt } = await specimen();
  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
  );

  const kinds = Object.fromEntries(
    packet.doors.map((door) => [door.role, door.instruments[0]?.kind]),
  );

  assert.deepEqual(kinds, {
    COMPOST: 'residual-shelf',
    COMPOSE: 'relation-board',
    COMPUTE: 'receipt-console',
    COMMUTE: 'road-map',
    COMMUNE: 'participation-room',
  });
});

test('media refs are references, not imported content or authority', async () => {
  const { crossing, receipt } = await specimen();
  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
  );

  assert.equal(packet.authority, 'none');
  assert.equal(packet.projection_status, 'derived-non-authoritative');
  assert.equal(packet.media_refs.length, 4);
  assert.ok(packet.boundary.includes('MEDIA REF != MEDIA CONTENT'));
  assert.ok(packet.boundary.includes('ROOM RENDERING != SOURCE MUTATION'));
});

test('re-entry context may accompany the same enterable subject', async () => {
  const { crossing, receipt } = await specimen();
  const packet = await buildEnterableParticular(
    crossing.crossing_id,
    [crossing, receipt],
    [crossing.crossing_id, 'particular:listener', crossing.crossing_id],
  );

  assert.equal(packet.encounter?.subject, crossing.crossing_id);
  assert.equal(packet.encounter?.is_reentry, true);
  assert.equal(packet.encounter?.occurrence_number, 2);
});

test('encounter path must end at the packet subject', async () => {
  const { crossing, receipt } = await specimen();

  await assert.rejects(
    () => buildEnterableParticular(
      crossing.crossing_id,
      [crossing, receipt],
      [crossing.crossing_id, 'particular:listener'],
    ),
    /ENTERABLE_PATH_MUST_END_AT_SUBJECT/,
  );
});
