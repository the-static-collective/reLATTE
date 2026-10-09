// SKYMIRROR-002: optically observable, *untrusted* short-message framing.
// No cryptographic assurance is claimed. For signed reLATTE crossings,
// feed recovered bytes to the existing crossing verifier separately.
export const MAGIC = 0xa6;
export const MAX_BYTES = 24;
export const DEFAULT_CHIP_MS = 600;
// Variable run lengths prevent a simple periodic leader from looking like data.
export const LEADER = Uint8Array.from([1,0,1,0,1,0,1,1,1,0,0,0,1,1,0,0,1,0,1,0]);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});

function assertPayload(payload) {
  if (!(payload instanceof Uint8Array)) throw Error('PAYLOAD_NOT_BYTES');
  if (payload.length === 0 || payload.length > MAX_BYTES) throw Error('PAYLOAD_LENGTH');
}
export function crc16(buffer) {
  let crc = 0xffff;
  for (const b of buffer) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc;
}
export function bytesForText(value) {
  const bytes = encoder.encode(value);
  assertPayload(bytes);
  return bytes;
}
export function frame(payload) {
  assertPayload(payload);
  const header = Uint8Array.from([MAGIC, payload.length, ...payload]);
  const crc = crc16(header);
  return Uint8Array.from([...header, crc >> 8, crc & 0xff]);
}
export function deframe(raw) {
  if (!(raw instanceof Uint8Array) || raw.length < 5) throw Error('SHORT_FRAME');
  if (raw[0] !== MAGIC) throw Error('BAD_MAGIC');
  const len = raw[1];
  if (len < 1 || len > MAX_BYTES) throw Error('BAD_LENGTH');
  if (raw.length !== 4 + len) throw Error('FRAME_LENGTH');
  const expected = crc16(raw.subarray(0, -2));
  const found = (raw[raw.length - 2] << 8) | raw[raw.length - 1];
  if (expected !== found) throw Error('CRC_MISMATCH');
  return raw.subarray(2, -2);
}
export function textForBytes(bytes) { return decoder.decode(bytes); }
export function bytesToChips(raw) {
  const out = new Uint8Array(raw.length * 16);
  let j = 0;
  for (const octet of raw) {
    for (let i = 7; i >= 0; i--) {
      const bit = (octet >>> i) & 1;
      out[j++] = bit;
      out[j++] = bit ^ 1;
    }
  }
  return out;
}
export function chipsToBytes(chips) {
  if (!(chips instanceof Uint8Array) || chips.length % 16) throw Error('CHIP_LENGTH');
  const out = new Uint8Array(chips.length / 16);
  for (let i = 0; i < chips.length; i += 2) {
    if (chips[i] === chips[i + 1] || chips[i] > 1 || chips[i + 1] > 1) throw Error('MANCHESTER_ERROR');
    out[i >>> 4] |= chips[i] << (7 - ((i >>> 1) % 8));
  }
  return out;
}
export function transmission(message, chipMs = DEFAULT_CHIP_MS) {
  if (!(chipMs >= 400 && chipMs <= 1500)) throw Error('CHIP_RATE_RANGE');
  const raw = frame(bytesForText(message));
  const chips = Uint8Array.from([...LEADER, ...bytesToChips(raw)]);
  return {chips, raw, durationMs: chips.length * chipMs, chipMs};
}

// Luminance samples: [{t: monotonic millisecond timestamp, y: 0..255}].
// Timing comes from received samples, NOT presumed wall clock synchronization.
function lowerBound(samples, t) {
  let lo = 0, hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function sampleNear(samples, t, tolerance) {
  const i = lowerBound(samples, t);
  const next = i < samples.length ? samples[i] : null;
  const prev = i > 0 ? samples[i - 1] : null;
  let nearest = null;
  if (next && Math.abs(next.t - t) <= tolerance) nearest = next;
  if (prev && Math.abs(prev.t - t) < (nearest ? Math.abs(nearest.t - t) : tolerance)) nearest = prev;
  return nearest?.y ?? null;
}
function percentile(values, quantile) {
  if (!values.length) return 0;
  const arr = [...values].sort((a, b) => a-b);
  return arr[Math.floor((arr.length - 1) * quantile)];
}
// Decode an entire capture, or an ongoing capture with enough symbols yet.
// Uses a preamble to resolve symbol phase, supports reversed camera polarity.
// A CRC is solely accidental-error detection, not proof of authenticity.
export function decodeCapture(samples, {chipMs = DEFAULT_CHIP_MS, minContrast = 18} = {}) {
  if (!(chipMs >= 400 && chipMs <= 1500)) throw Error('CHIP_RATE_RANGE');
  if (!Array.isArray(samples) || samples.length < 16) return {status:'NO_SIGNAL'};
  for (let i=1; i<samples.length; i++) {
    if (!(samples[i].t > samples[i-1].t)) throw Error('UNSORTED_SAMPLES');
  }
  const span = samples[samples.length-1].t - samples[0].t;
  // Minimum legal frame: leader + (magic + length + 1 payload + CRC16)*16.
  const minRequired = (LEADER.length + 5*16) * chipMs;
  if (span < minRequired * .93) return {status:'CAPTURING', availableMs:span, minimumMs:minRequired};
  const lo = percentile(samples.map(s=>s.y), .12);
  const hi = percentile(samples.map(s=>s.y), .88);
  if (hi-lo < minContrast) return {status:'LOW_CONTRAST', contrast:hi-lo};
  const threshold=(lo+hi)/2;
  const tolerance=chipMs*.23;
  const tFirst=samples[0].t;
  const tLimit=samples.at(-1).t - minRequired*.985;
  const step=chipMs/5;
  let best={status:'NO_VALID_PACKET', contrast:hi-lo, scanned:0, matchedPreambles:0};
  const read = (t, inversion) => {
    const y = sampleNear(samples,t,tolerance);
    return y === null ? null : Number((y >= threshold) !== inversion);
  };
  const samplesAt = (t0, n, inverted) => {
    const result = new Uint8Array(n);
    for (let i=0; i<n; i++) {
      const chip = read(t0 + (i+.5)*chipMs, inverted);
      if (chip === null) return null;
      result[i] = chip;
    }
    return result;
  };
  // Quantization of t0 yields <= 0.1 chip nominal phase error.
  for (let t0=tFirst; t0<=tLimit; t0+=step) {
    const leader = samplesAt(t0, LEADER.length, false);
    if (!leader) continue;
    best.scanned++;
    let errors=0, invErrors=0;
    for(let j=0;j<LEADER.length;j++) {
      errors += Number(leader[j] !== LEADER[j]);
      invErrors += Number(leader[j] === LEADER[j]);
    }
    let inverted;
    if (errors <= 1) inverted=false;
    else if (invErrors <= 1) inverted=true;
    else continue;
    best.matchedPreambles++;
    const base=t0+LEADER.length*chipMs;
    const header = samplesAt(base, 32, inverted);
    if (!header) continue;
    let partial;
    try {partial = chipsToBytes(header);} catch {continue;}
    if (partial[0]!==MAGIC || partial[1]<1 || partial[1]>MAX_BYTES) continue;
    const totalChips=(4+partial[1])*16;
    if (base + totalChips*chipMs > samples.at(-1).t + chipMs*.1) continue;
    const bits = samplesAt(base,totalChips,inverted);
    if (!bits) continue;
    try {
      const bytes=deframe(chipsToBytes(bits));
      return {status:'VALID',payload:Uint8Array.from(bytes),text:textForBytes(bytes),chipMs,
        contrast:hi-lo, threshold, inverted, leaderErrors:Math.min(errors,invErrors),
        startMs:t0, endMs:base+totalChips*chipMs,
        framing:'SKYMIRROR-002/v0', authentication:'NONE_CRC_ONLY'};
    } catch { /* keep scanning for a valid candidate */ }
  }
  return best;
}

// Deterministic synthetic camera capture: variable sample cadence and deterministic noise.
export function syntheticCapture(message, {chipMs=DEFAULT_CHIP_MS, frameMs=37,
  noise=0, low=45, high=205, inverted=false, leadingMs=1200, trailingMs=800}={}) {
  const {chips}=transmission(message,chipMs);
  const duration=leadingMs+chips.length*chipMs+trailingMs;
  const samples=[];
  for (let t=0, i=0;t<=duration;i++) {
    const jitter=(i%5-2)*1.8;
    const tm=Math.max(t,t+jitter);
    const index=Math.floor((tm-leadingMs)/chipMs);
    const bit = index<0||index>=chips.length ? 0 : chips[index];
    const brightness=(inverted ? !bit : bit) ? high : low;
    samples.push({t:tm,y:Math.max(0,Math.min(255,brightness+noise*((i*17%19)-9)/9))});
    t+=frameMs;
  }
  return samples;
}
