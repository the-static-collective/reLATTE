import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { sha256Hex } from '../src/canonical.ts';
import { generateP256KeyPair } from '../src/protocol.ts';
import {
  FROZEN_CORE_SHA,
  assertObservationBytes,
  makePolyglotHop,
  verifyHopBinding,
} from '../experiments/polyglot-crossing-001/common.ts';
import {
  makeMinecraftPlaythrough,
  observeMinecraftPlaythrough,
  replayMinecraftPlaythrough,
  type MinecraftPlaythrough,
  type PlayEvent,
} from '../experiments/alien-minecraft-004/minecraft-playthrough-adapter.ts';

const FROZEN_SRC_TREE_SHA = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

const PAYLOAD = Buffer.from(
  'ALIEN-MINECRAFT-004: mine it, carry it, build it, replay it',
  'utf8',
);

function rehash(playthrough: MinecraftPlaythrough): MinecraftPlaythrough {
  return {
    ...playthrough,
    transcript_sha256: sha256Hex(
      Buffer.from(JSON.stringify(playthrough.events), 'utf8'),
    ),
  };
}

function firstEvent<T extends PlayEvent['kind']>(
  playthrough: MinecraftPlaythrough,
  kind: T,
): Extract<PlayEvent, { kind: T }> {
  const value = playthrough.events.find((event) => event.kind === kind);
  if (!value) throw new Error('TEST_EVENT_NOT_FOUND');
  return value as Extract<PlayEvent, { kind: T }>;
}

test('ALIEN-MINECRAFT-004: normative reLATTE src tree remains frozen', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();

  assert.equal(current, FROZEN_SRC_TREE_SHA);
  assert.equal(
    FROZEN_CORE_SHA,
    'f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858',
  );
});

test('ALIEN-MINECRAFT-004: lawful forward playthrough mines, carries, places, and reconstructs exact payload', () => {
  const playthrough = makeMinecraftPlaythrough(PAYLOAD, 'forward');
  const replayed = replayMinecraftPlaythrough(playthrough);

  assert.deepEqual(replayed.payload, PAYLOAD);
  assert.equal(replayed.inventory_empty, true);
  assert.equal(replayed.mined_count, replayed.placed_count);
  assert.equal(playthrough.events.length, playthrough.frame_nibbles * 4);
});

test('ALIEN-MINECRAFT-004: same finished wool build via another lawful route is a different playthrough particular', () => {
  const forward = makeMinecraftPlaythrough(PAYLOAD, 'forward');
  const reverse = makeMinecraftPlaythrough(PAYLOAD, 'reverse');

  const replayForward = replayMinecraftPlaythrough(forward);
  const replayReverse = replayMinecraftPlaythrough(reverse);

  assert.deepEqual(replayForward.payload, PAYLOAD);
  assert.deepEqual(replayReverse.payload, PAYLOAD);
  assert.equal(forward.final_build_sha256, reverse.final_build_sha256);
  assert.notEqual(forward.transcript_sha256, reverse.transcript_sha256);

  const observedForward = observeMinecraftPlaythrough(PAYLOAD, 'forward');
  const observedReverse = observeMinecraftPlaythrough(PAYLOAD, 'reverse');
  assert.equal(observedForward.content_sha256, observedReverse.content_sha256);
  assert.notEqual(observedForward.native_id, observedReverse.native_id);
});

test('ALIEN-MINECRAFT-004: completed playthrough terminates in unchanged crossing grammar', async () => {
  const observed = observeMinecraftPlaythrough(PAYLOAD, 'reverse');
  const hop = await makePolyglotHop({
    observation: observed,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    parent_crossing_id: null,
    disposition: 'R3_HOLD',
    hop_index: 10,
  });

  assertObservationBytes(observed, PAYLOAD);
  verifyHopBinding(hop, PAYLOAD);
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.substrate,
    'minecraft-playthrough',
  );
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.frozen_core_sha,
    FROZEN_CORE_SHA,
  );
  assert.equal(hop.receipt.kind, 'R3_HOLD');
  assert.equal(observed.native_claims.actual_mojang_runtime, 'UNOBSERVED');
});

test('ALIEN-MINECRAFT-004: hostile player cannot mine the wrong wool from a quarry coordinate', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);
  const broken = firstEvent(tampered, 'break');

  broken.block =
    broken.block === 'minecraft:black_wool'
      ? 'minecraft:white_wool'
      : 'minecraft:black_wool';

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_MINED_BLOCK_MISMATCH/,
  );
});

test('ALIEN-MINECRAFT-004: hostile player cannot place a block before acquiring inventory', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);

  const firstBreakIndex = tampered.events.findIndex((event) => event.kind === 'break');
  const firstPlaceIndex = tampered.events.findIndex((event) => event.kind === 'place');
  assert.ok(firstBreakIndex >= 0 && firstPlaceIndex >= 0);

  const place = tampered.events[firstPlaceIndex]!;
  tampered.events.splice(firstPlaceIndex, 1);
  tampered.events.splice(firstBreakIndex, 0, place);

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_PLACE_WITHOUT_INVENTORY|MINECRAFT_PLACE_OUT_OF_REACH/,
  );
});

test('ALIEN-MINECRAFT-004: hostile player cannot claim teleport-distance travel after rehashing transcript', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);
  const walk = firstEvent(tampered, 'walk');
  walk.distance += 7;

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_WALK_DISTANCE_MISMATCH/,
  );
});

test('ALIEN-MINECRAFT-004: deleting one placement cannot be hidden by a fresh transcript hash', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);

  const index = tampered.events.findIndex((event) => event.kind === 'place');
  assert.ok(index >= 0);
  tampered.events.splice(index, 1);

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_BUILD_INCOMPLETE|MINECRAFT_WALK_FROM_MISMATCH/,
  );
});

test('ALIEN-MINECRAFT-004: duplicated mining of one quarry block fails even with valid transcript hash', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);
  const breakIndex = tampered.events.findIndex((event) => event.kind === 'break');
  assert.ok(breakIndex >= 0);

  const breaking = structuredClone(tampered.events[breakIndex]!);
  tampered.events.splice(breakIndex + 1, 0, breaking);

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_BLOCK_NOT_MINEABLE/,
  );
});

test('ALIEN-MINECRAFT-004: moving a placed block to the wrong wall coordinate breaks recoverable build continuity', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);
  const place = firstEvent(tampered, 'place');

  place.at = { ...place.at, x: place.at.x + 1 };

  assert.throws(
    () => replayMinecraftPlaythrough(rehash(tampered)),
    /MINECRAFT_PLACE_OUT_OF_REACH|MINECRAFT_TARGET_OCCUPIED|MINECRAFT_WALL_HOLE/,
  );
});

test('ALIEN-MINECRAFT-004: transcript hash alone is not gameplay validity', () => {
  const original = makeMinecraftPlaythrough(PAYLOAD);
  const tampered = structuredClone(original);
  const walk = firstEvent(tampered, 'walk');

  walk.from = { ...walk.from, y: walk.from.y + 1 };
  const selfConsistent = rehash(tampered);

  assert.equal(
    selfConsistent.transcript_sha256,
    sha256Hex(Buffer.from(JSON.stringify(selfConsistent.events), 'utf8')),
  );
  assert.throws(
    () => replayMinecraftPlaythrough(selfConsistent),
    /MINECRAFT_WALK_FROM_MISMATCH/,
  );
});
