import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { generateP256KeyPair } from '../src/protocol.ts';
import {
  FROZEN_CORE_SHA,
  assertObservationBytes,
  makePolyglotHop,
  verifyHopBinding,
} from '../experiments/polyglot-crossing-001/common.ts';
import {
  decodePayloadFromMidi,
  encodePayloadAsMidi,
  observeMidiEventStream,
} from '../experiments/alien-midi-002/midi-event-adapter.ts';

const FROZEN_SRC_TREE_SHA = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

const PAYLOAD = Buffer.from(
  'ALIEN-MIDI-002: the crossing survives a musical event ontology',
  'utf8',
);

function firstStatusOffset(midi: Buffer, status: number): number {
  const index = midi.indexOf(Buffer.from([status]));
  if (index < 0) throw new Error('TEST_STATUS_NOT_FOUND');
  return index;
}

test('ALIEN-MIDI-002: normative reLATTE src tree remains frozen', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();

  assert.equal(current, FROZEN_SRC_TREE_SHA);
  assert.equal(
    FROZEN_CORE_SHA,
    'f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858',
  );
});

test('ALIEN-MIDI-002: actual Standard MIDI File note events reconstruct exact payload bytes', () => {
  const midi = encodePayloadAsMidi(PAYLOAD);
  assert.equal(midi.subarray(0, 4).toString('ascii'), 'MThd');
  assert.ok(midi.includes(Buffer.from('MTrk', 'ascii')));

  const decoded = decodePayloadFromMidi(midi);
  assert.deepEqual(decoded.bytes, PAYLOAD);
  assert.equal(decoded.byte_length, PAYLOAD.length);
  assert.equal(decoded.note_event_count, PAYLOAD.length * 2);
  assert.ok(decoded.last_tick > 0);
});

test('ALIEN-MIDI-002: same content at different tempos becomes different MIDI particulars', () => {
  const slow = observeMidiEventStream(PAYLOAD, {
    tempo_us_per_quarter: 750_000,
  });
  const fast = observeMidiEventStream(PAYLOAD, {
    tempo_us_per_quarter: 300_000,
  });

  assert.equal(slow.content_sha256, fast.content_sha256);
  assert.deepEqual(Buffer.from(slow.observed_bytes), PAYLOAD);
  assert.deepEqual(Buffer.from(fast.observed_bytes), PAYLOAD);
  assert.notEqual(slow.native_id, fast.native_id);
  assert.notEqual(
    slow.native_claims.midi_file_sha256,
    fast.native_claims.midi_file_sha256,
  );
});

test('ALIEN-MIDI-002: different event timing preserves payload but changes native identity', () => {
  const one = observeMidiEventStream(PAYLOAD, {
    high_delta: 3,
    low_delta: 2,
  });
  const two = observeMidiEventStream(PAYLOAD, {
    high_delta: 7,
    low_delta: 5,
  });

  assert.equal(one.content_sha256, two.content_sha256);
  assert.notEqual(one.native_id, two.native_id);
  assert.notEqual(one.native_claims.last_tick, two.native_claims.last_tick);
});

test('ALIEN-MIDI-002: MIDI observation terminates in unchanged crossing grammar', async () => {
  const observed = observeMidiEventStream(PAYLOAD, {
    tempo_us_per_quarter: 420_000,
  });
  const hop = await makePolyglotHop({
    observation: observed,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    parent_crossing_id: null,
    disposition: 'R3_HOLD',
    hop_index: 8,
  });

  verifyHopBinding(hop, PAYLOAD);
  assertObservationBytes(observed, PAYLOAD);
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.substrate,
    'midi-event-stream',
  );
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.frozen_core_sha,
    FROZEN_CORE_SHA,
  );
  assert.equal(hop.crossing.requested_effect.authority, 'receiver-local');
  assert.equal(hop.receipt.kind, 'R3_HOLD');
});

test('ALIEN-MIDI-002: changing a note changes decoded bytes and fails the declared digest', () => {
  const midi = encodePayloadAsMidi(PAYLOAD);
  const tampered = Buffer.from(midi);
  const status = firstStatusOffset(tampered, 0x90);
  const noteOffset = status + 1;
  const original = tampered[noteOffset]!;
  tampered[noteOffset] = original === 63 ? 62 : original + 1;

  assert.throws(
    () => decodePayloadFromMidi(tampered),
    /MIDI_PAYLOAD_DIGEST_MISMATCH/,
  );
});

test('ALIEN-MIDI-002: channel-order mutation is not repaired into plausible bytes', () => {
  const midi = encodePayloadAsMidi(PAYLOAD);
  const tampered = Buffer.from(midi);
  const status = firstStatusOffset(tampered, 0x90);
  tampered[status] = 0x91;

  assert.throws(
    () => decodePayloadFromMidi(tampered),
    /MIDI_NOTE_CHANNEL_ORDER/,
  );
});

test('ALIEN-MIDI-002: foreign MIDI event families are not silently interpreted as payload', () => {
  const midi = encodePayloadAsMidi(PAYLOAD);
  const tampered = Buffer.from(midi);
  const status = firstStatusOffset(tampered, 0x90);
  tampered[status] = 0xb0;

  assert.throws(
    () => decodePayloadFromMidi(tampered),
    /MIDI_UNEXPECTED_EVENT/,
  );
});

test('ALIEN-MIDI-002: truncated performance cannot become a crossing payload', () => {
  const midi = encodePayloadAsMidi(PAYLOAD);
  const truncated = midi.subarray(0, midi.length - 7);

  assert.throws(
    () => decodePayloadFromMidi(truncated),
    /MIDI_TRACK_LENGTH|MIDI_END_TRACK_MISSING|MIDI_TRUNCATED/,
  );
});
