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
  makeUdpPackets,
  observeUdpDatagramSwarm,
  reassembleUdpPackets,
} from '../experiments/alien-adapter-001/udp-datagram-adapter.ts';

const FROZEN_SRC_TREE_SHA = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

const PAYLOAD = Buffer.from(
  'ALIEN-ADAPTER-001: ephemeral UDP datagrams have no durable native object',
  'utf8',
);

function encode(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function resignPacketLike(original: Record<string, any>, replacementChunk: Buffer) {
  const body = {
    schema: original.schema,
    session_id: original.session_id,
    index: original.index,
    count: original.count,
    payload_sha256: original.payload_sha256,
    chunk_base64url: replacementChunk.toString('base64url'),
    chunk_sha256: sha256Hex(replacementChunk),
  };
  return {
    ...body,
    packet_id: sha256Hex(Buffer.from(JSON.stringify(body), 'utf8')),
  };
}

test('ALIEN-ADAPTER-001: normative reLATTE src tree remains frozen', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();

  assert.equal(current, FROZEN_SRC_TREE_SHA);
  assert.equal(
    FROZEN_CORE_SHA,
    'f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858',
  );
});

test('ALIEN-ADAPTER-001: live UDP swarm survives reordering and duplicate delivery', async () => {
  const observed = await observeUdpDatagramSwarm(PAYLOAD);

  assert.equal(observed.substrate, 'udp-datagram-swarm');
  assertObservationBytes(observed, PAYLOAD);
  assert.equal(observed.native_claims.durable_native_object, false);
  assert.equal(observed.native_claims.delivery_guarantee, 'none');
  assert.ok(Number(observed.native_claims.duplicate_count) >= 1);
});

test('ALIEN-ADAPTER-001: same bytes in two ephemeral sessions are different native particulars', async () => {
  const first = await observeUdpDatagramSwarm(PAYLOAD);
  const second = await observeUdpDatagramSwarm(PAYLOAD);

  assert.equal(first.content_sha256, second.content_sha256);
  assert.notEqual(first.native_id, second.native_id);
  assert.notEqual(first.native_claims.session_id, second.native_claims.session_id);
});

test('ALIEN-ADAPTER-001: UDP observation enters the unchanged reLATTE crossing grammar', async () => {
  const observed = await observeUdpDatagramSwarm(PAYLOAD);
  const hop = await makePolyglotHop({
    observation: observed,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    parent_crossing_id: null,
    disposition: 'R3_HOLD',
    hop_index: 7,
  });

  verifyHopBinding(hop, PAYLOAD);
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.substrate,
    'udp-datagram-swarm',
  );
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.frozen_core_sha,
    FROZEN_CORE_SHA,
  );
  assert.equal(hop.crossing.requested_effect.authority, 'receiver-local');
  assert.equal(hop.receipt.kind, 'R3_HOLD');
});

test('ALIEN-ADAPTER-001: missing datagram never reconstructs a payload', () => {
  const packets = makeUdpPackets(PAYLOAD, 'session:missing');
  assert.ok(packets.length > 1);

  const missing = packets.slice(0, -1).map(encode);
  assert.throws(
    () => reassembleUdpPackets(missing),
    /UDP_MISSING_PACKET/,
  );
});

test('ALIEN-ADAPTER-001: datagrams from two sessions cannot be silently combined', () => {
  const one = makeUdpPackets(PAYLOAD, 'session:one');
  const two = makeUdpPackets(PAYLOAD, 'session:two');

  const mixed = [one[0]!, ...two.slice(1)].map(encode);
  assert.throws(
    () => reassembleUdpPackets(mixed),
    /UDP_MIXED_SESSION/,
  );
});

test('ALIEN-ADAPTER-001: conflicting duplicate index is HOLD-worthy evidence failure', () => {
  const packets = makeUdpPackets(PAYLOAD, 'session:conflict');
  const first = packets[0] as unknown as Record<string, any>;
  const originalChunk = Buffer.from(first.chunk_base64url, 'base64url');
  const replacement = Buffer.from(originalChunk);
  replacement[0] = replacement[0]! ^ 0x01;

  const conflicting = resignPacketLike(first, replacement);

  assert.throws(
    () => reassembleUdpPackets([
      encode(first),
      encode(conflicting),
      ...packets.slice(1).map(encode),
    ]),
    /UDP_CONFLICTING_DUPLICATE/,
  );
});

test('ALIEN-ADAPTER-001: corrupted datagram fails before reconstruction', () => {
  const packets = makeUdpPackets(PAYLOAD, 'session:corrupt');
  const corrupted = JSON.parse(JSON.stringify(packets[0]));
  corrupted.chunk_base64url =
    (corrupted.chunk_base64url as string).slice(0, -1) + 'A';

  assert.throws(
    () => reassembleUdpPackets([
      encode(corrupted),
      ...packets.slice(1).map(encode),
    ]),
    /UDP_CHUNK_INTEGRITY|UDP_PACKET_ID_MISMATCH/,
  );
});
