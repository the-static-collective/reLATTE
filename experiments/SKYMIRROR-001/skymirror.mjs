// SKYMIRROR-001: offline optical line code and orbital geometry only.
// This module does not operate a camera, light emitter, RF, laser, or satellite.
const MAGIC = Buffer.from('SM01', 'ascii');
export const MAX_PAYLOAD_BYTES = 4096;

function requireBytes(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('PAYLOAD_MUST_BE_BYTES');
  if (input.length > MAX_PAYLOAD_BYTES) throw new RangeError('PAYLOAD_TOO_LARGE');
  return Buffer.from(input);
}

function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function frameBytes(input) {
  const payload = requireBytes(input);
  const header = Buffer.alloc(8);
  MAGIC.copy(header);
  header.writeUInt32BE(payload.length, 4);
  const body = Buffer.concat([header, payload]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([body, check]);
}

export function parseFrame(input) {
  const frame = Buffer.from(input);
  if (frame.length < 12) throw new Error('TRUNCATED_FRAME');
  if (!frame.subarray(0, 4).equals(MAGIC)) throw new Error('BAD_MAGIC');
  const size = frame.readUInt32BE(4);
  if (size > MAX_PAYLOAD_BYTES) throw new Error('PAYLOAD_TOO_LARGE');
  if (frame.length !== 12 + size) throw new Error('FRAME_LENGTH_MISMATCH');
  if (crc32(frame.subarray(0, -4)) !== frame.readUInt32BE(frame.length - 4)) {
    throw new Error('CRC_MISMATCH');
  }
  return frame.subarray(8, -4);
}

// Manchester line code: 0 => low,high; 1 => high,low.
export function encodeOptical(input) {
  const frame = frameBytes(input);
  const chips = new Uint8Array(frame.length * 16);
  let offset = 0;
  for (const octet of frame) {
    for (let bit = 7; bit >= 0; bit--) {
      const high = (octet >>> bit) & 1;
      chips[offset++] = high;
      chips[offset++] = high ^ 1;
    }
  }
  return chips;
}

export function decodeOptical(chips, { inverted = false } = {}) {
  if (!(chips instanceof Uint8Array) || chips.length % 16 !== 0) {
    throw new Error('INVALID_CHIP_STREAM');
  }
  const bytes = Buffer.alloc(chips.length / 16);
  for (let i = 0; i < chips.length; i += 2) {
    const a = chips[i];
    const b = chips[i + 1];
    if ((a !== 0 && a !== 1) || (b !== 0 && b !== 1) || a === b) {
      throw new Error('INVALID_MANCHESTER_PAIR');
    }
    const bit = inverted ? a ^ 1 : a;
    bytes[Math.floor(i / 16)] |= bit << (7 - ((i / 2) % 8));
  }
  return parseFrame(bytes);
}

// Deterministic fault injection; a binary-symbol model, not optical path physics.
export function propagateChips(chips, { flips = [], invert = false } = {}) {
  const propagated = Uint8Array.from(chips);
  if (invert) for (let i = 0; i < propagated.length; i++) propagated[i] ^= 1;
  for (const index of flips) {
    if (!Number.isInteger(index) || index < 0 || index >= propagated.length) {
      throw new RangeError('BAD_FLIP_INDEX');
    }
    propagated[index] ^= 1;
  }
  return propagated;
}

export function airtimeSeconds(payloadBytes, chipsPerSecond) {
  if (!Number.isSafeInteger(payloadBytes) || payloadBytes < 0 || payloadBytes > MAX_PAYLOAD_BYTES) {
    throw new RangeError('INVALID_PAYLOAD_SIZE');
  }
  if (!Number.isFinite(chipsPerSecond) || chipsPerSecond <= 0) {
    throw new RangeError('INVALID_CHIP_RATE');
  }
  return ((12 + payloadBytes) * 16) / chipsPerSecond;
}

function vector(v) {
  if (!Array.isArray(v) || v.length !== 3 || v.some((x) => !Number.isFinite(x))) {
    throw new TypeError('INVALID_VECTOR');
  }
  const magnitude = Math.hypot(...v);
  if (!(magnitude > 0)) throw new RangeError('ZERO_VECTOR');
  return v.map((x) => x / magnitude);
}
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const subtract = (a, b) => a.map((x, i) => x - b[i]);

export function angleDegrees(a, b) {
  const x = vector(a);
  const y = vector(b);
  return Math.acos(Math.max(-1, Math.min(1, dot(x, y)))) * 180 / Math.PI;
}

export function reflectSpecular(incoming, normal) {
  const d = vector(incoming);
  const n = vector(normal);
  return vector(d.map((x, i) => x - 2 * dot(d, n) * n[i]));
}

// Point coordinates in the same arbitrary Cartesian units (not an orbit predictor).
export function relayGeometry(transmitter, reflector, receiver) {
  const toTx = vector(subtract(transmitter, reflector));
  const toRx = vector(subtract(receiver, reflector));
  const anti = toTx.map((x, i) => x + toRx[i]);
  const separationDeg = angleDegrees(toTx, toRx);
  // Degenerate diametrically opposite directions have no unique mirror normal.
  const specularNormal = Math.hypot(...anti) < 1e-12 ? null : vector(anti);
  const predicted = specularNormal ? reflectSpecular(toTx.map((x) => -x), specularNormal) : null;
  return {
    retro_return_to_transmitter: true,
    retro_receiver_angular_offset_deg: separationDeg,
    specular_normal_required: specularNormal,
    specular_receiver_error_deg: predicted ? angleDegrees(predicted, toRx) : null,
    notes: 'Ideal ray directions only: no satellite orientation, visibility, diffraction, photon budget, or legal clearance.',
  };
}
