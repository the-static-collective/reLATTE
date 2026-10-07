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
  computeLangtonCarrierStateHash,
  decodePayloadFromLangton,
  encodePayloadAsLangton,
  observeLangtonField,
} from '../experiments/alien-langton-003/langton-adapter.ts';

const FROZEN_SRC_TREE_SHA = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

const PAYLOAD = Buffer.from(
  'ALIEN-LANGTON-003: recover me by reversing the world, not by reading a file',
  'utf8',
);

test('ALIEN-LANGTON-003: normative reLATTE src tree remains frozen', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();

  assert.equal(current, FROZEN_SRC_TREE_SHA);
  assert.equal(
    FROZEN_CORE_SHA,
    'f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858',
  );
});

test('ALIEN-LANGTON-003: payload survives 1024 lawful world transitions and exact reversal', () => {
  const carrier = encodePayloadAsLangton(PAYLOAD, 1024);
  const recovered = decodePayloadFromLangton(carrier);

  assert.deepEqual(recovered, PAYLOAD);
  assert.equal(carrier.steps, 1024);
  assert.ok(carrier.black_cells.length > 0);
});

test('ALIEN-LANGTON-003: same content after different evolution durations is different native particular', () => {
  const short = observeLangtonField(PAYLOAD, 512);
  const long = observeLangtonField(PAYLOAD, 2048);

  assert.equal(short.content_sha256, long.content_sha256);
  assert.deepEqual(Buffer.from(short.observed_bytes), PAYLOAD);
  assert.deepEqual(Buffer.from(long.observed_bytes), PAYLOAD);
  assert.notEqual(short.native_id, long.native_id);
  assert.notEqual(
    short.native_claims.final_state_sha256,
    long.native_claims.final_state_sha256,
  );
});

test('ALIEN-LANGTON-003: evolved field terminates in unchanged reLATTE crossing grammar', async () => {
  const observed = observeLangtonField(PAYLOAD, 1536);
  const hop = await makePolyglotHop({
    observation: observed,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    parent_crossing_id: null,
    disposition: 'R3_HOLD',
    hop_index: 9,
  });

  assertObservationBytes(observed, PAYLOAD);
  verifyHopBinding(hop, PAYLOAD);
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.substrate,
    'langton-ant-field',
  );
  assert.equal(
    hop.crossing.extensions.polyglot_crossing_001.frozen_core_sha,
    FROZEN_CORE_SHA,
  );
  assert.equal(hop.receipt.kind, 'R3_HOLD');
});

test('ALIEN-LANGTON-003: one flipped final cell destroys the claimed world-state', () => {
  const carrier = encodePayloadAsLangton(PAYLOAD, 1024);
  const tampered = structuredClone(carrier);
  const target = tampered.black_cells[0]!;
  tampered.black_cells = tampered.black_cells.slice(1);

  assert.ok(target);
  assert.throws(
    () => decodePayloadFromLangton(tampered),
    /LANGTON_FINAL_STATE_MISMATCH/,
  );
});

test('ALIEN-LANGTON-003: lying about elapsed evolution time is rejected', () => {
  const carrier = encodePayloadAsLangton(PAYLOAD, 1024);
  const tampered = structuredClone(carrier);
  tampered.steps = 1023;

  assert.throws(
    () => decodePayloadFromLangton(tampered),
    /LANGTON_FINAL_STATE_MISMATCH/,
  );
});

test('ALIEN-LANGTON-003: changing ant direction is not repaired into a plausible history', () => {
  const carrier = encodePayloadAsLangton(PAYLOAD, 1024);
  const tampered = structuredClone(carrier);
  tampered.ant.direction = ((tampered.ant.direction + 1) % 4) as 0 | 1 | 2 | 3;

  assert.throws(
    () => decodePayloadFromLangton(tampered),
    /LANGTON_FINAL_STATE_MISMATCH/,
  );
});

test('ALIEN-LANGTON-003: transplanting a final field into another duration cannot create continuity', () => {
  const one = encodePayloadAsLangton(PAYLOAD, 512);
  const two = encodePayloadAsLangton(PAYLOAD, 2048);

  const splice = structuredClone(one);
  splice.black_cells = two.black_cells;
  splice.ant = two.ant;

  assert.throws(
    () => decodePayloadFromLangton(splice),
    /LANGTON_FINAL_STATE_MISMATCH/,
  );
});

test('ALIEN-LANGTON-003: a hostile adapter can forge local state consistency but not the recovered origin', () => {
  const carrier = encodePayloadAsLangton(PAYLOAD, 1024);
  const tampered = structuredClone(carrier);

  const target = tampered.black_cells[0]!;
  tampered.black_cells = tampered.black_cells.slice(1);
  assert.ok(target);

  // Hostile adapter recomputes the final-state digest after changing its own
  // world. Local self-consistency therefore passes. Reversal still has to
  // recover the framed origin and its payload digest.
  tampered.final_state_sha256 = computeLangtonCarrierStateHash(tampered);

  assert.throws(
    () => decodePayloadFromLangton(tampered),
    /LANGTON_MAGIC_MISMATCH|LANGTON_PAYLOAD_DIGEST_MISMATCH|LANGTON_ORIGIN_NOT_RECOVERED/,
  );
});
