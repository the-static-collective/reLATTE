import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { encodeOptical, decodeOptical, frameBytes, parseFrame, propagateChips, airtimeSeconds, relayGeometry, reflectSpecular } from './skymirror.mjs';

test('opaque UTF-8 signed payload crosses optical line code byte-exact', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const body = Buffer.from('{"crossing_id":"candidate:skymirror-001","effect":"none"}', 'utf8');
  const signature = sign('sha256', body, privateKey);
  const carried = encodeOptical(body);
  const recovered = decodeOptical(propagateChips(carried));
  assert.deepEqual(recovered, body);
  assert.equal(verify('sha256', recovered, publicKey, signature), true);
  assert.equal(createHash('sha256').update(recovered).digest('hex'), createHash('sha256').update(body).digest('hex'));
});

test('an inverted optical road preserves exact original bytes when inversion is declared', () => {
  const raw = Buffer.from('route changes; traveler does not');
  const coded = encodeOptical(raw);
  const inverted = propagateChips(coded, { invert: true });
  assert.deepEqual(decodeOptical(inverted, { inverted: true }), raw);
  assert.throws(() => decodeOptical(inverted), /BAD_MAGIC/);
});

test('a flipped chip is rejected as an invalid Manchester pair', () => {
  const coded = encodeOptical(Buffer.from('hello'));
  assert.throws(() => decodeOptical(propagateChips(coded, { flips: [10] })), /INVALID_MANCHESTER_PAIR/);
});

test('two data-bit flips preserve Manchester shape but fail frame CRC', () => {
  const coded = encodeOptical(Buffer.from('payload'));
  assert.throws(() => decodeOptical(propagateChips(coded, { flips: [130, 131] })), /CRC_MISMATCH/);
});

test('truncation, garbage and forgery-shaped frame cannot be delivered', () => {
  const raw = frameBytes(Buffer.from('a'));
  assert.throws(() => parseFrame(raw.subarray(0, -1)), /FRAME_LENGTH_MISMATCH/);
  const forged = Buffer.from(raw);
  forged[0] = 0;
  assert.throws(() => parseFrame(forged), /BAD_MAGIC/);
  assert.throws(() => parseFrame(Buffer.alloc(2)), /TRUNCATED_FRAME/);
  const huge = Buffer.from(raw);
  huge.writeUInt32BE(1000000, 4);
  assert.throws(() => parseFrame(huge), /PAYLOAD_TOO_LARGE/);
});

test('hard payload size and explicit slow optical airtime are visible', () => {
  assert.equal(airtimeSeconds(0, 4), 48);
  assert.equal(airtimeSeconds(2, 4), 56);
  assert.throws(() => encodeOptical(Buffer.alloc(4097)), /PAYLOAD_TOO_LARGE/);
  assert.throws(() => airtimeSeconds(1, 0), /INVALID_CHIP_RATE/);
});

test('specular reflection geometry matches receiver only for required mirror normal', () => {
  const geometry = relayGeometry([-1, 0, -1], [0, 0, 0], [1, 0, -1]);
  assert.ok(geometry.retro_receiver_angular_offset_deg > 89.9);
  assert.ok(geometry.specular_receiver_error_deg < 1e-5);
  const reflection = reflectSpecular([0, 0, -1], [0, 0, 1]);
  assert.deepEqual(reflection, [0, 0, 1]);
});

test('same station retroreflection and opposite-side degenerate normal are distinguished', () => {
  const same = relayGeometry([1, 0, 0], [0, 0, 0], [1, 0, 0]);
  assert.equal(same.retro_receiver_angular_offset_deg, 0);
  const opposite = relayGeometry([-1, 0, 0], [0, 0, 0], [1, 0, 0]);
  assert.equal(opposite.specular_normal_required, null);
  assert.equal(opposite.specular_receiver_error_deg, null);
});
