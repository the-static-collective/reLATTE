import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from '../polyglot-crossing-001/common.ts';

const HEADER = Buffer.from('MThd', 'ascii');
const TRACK = Buffer.from('MTrk', 'ascii');
const FORMAT = 0;
const TRACKS = 1;
const DEFAULT_DIVISION = 96;
const NOTE_BASE = 48;
const META_PREFIX = 'RELATTE-MIDI-002';

export interface MidiEncodingOptions {
  division?: number;
  tempo_us_per_quarter?: number;
  high_delta?: number;
  low_delta?: number;
}

export interface DecodedMidiPayload {
  bytes: Buffer;
  payload_sha256: string;
  byte_length: number;
  division: number;
  tempo_us_per_quarter: number;
  note_event_count: number;
  last_tick: number;
}

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function varLen(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new Error('MIDI_INVALID_VARLEN');
  }
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return Buffer.from(bytes);
}

function readVarLen(bytes: Buffer, offset: number): {
  value: number;
  offset: number;
} {
  let value = 0;
  let count = 0;
  while (offset < bytes.length) {
    const current = bytes[offset++]!;
    value = (value << 7) | (current & 0x7f);
    count += 1;
    if ((current & 0x80) === 0) {
      return { value, offset };
    }
    if (count >= 4) throw new Error('MIDI_VARLEN_TOO_LONG');
  }
  throw new Error('MIDI_TRUNCATED_VARLEN');
}

function boundedByte(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(code);
  return value;
}

function event(delta: number, ...bytes: number[]): Buffer {
  return Buffer.concat([
    varLen(delta),
    Buffer.from(bytes.map((value) => boundedByte(value, 'MIDI_EVENT_BYTE'))),
  ]);
}

function meta(delta: number, type: number, payload: Buffer): Buffer {
  return Buffer.concat([
    varLen(delta),
    Buffer.from([0xff, boundedByte(type, 'MIDI_META_TYPE')]),
    varLen(payload.length),
    payload,
  ]);
}

export function encodePayloadAsMidi(
  payloadValue: Uint8Array,
  options: MidiEncodingOptions = {},
): Buffer {
  const payload = Buffer.from(payloadValue);
  if (payload.length === 0) throw new Error('MIDI_EMPTY_PAYLOAD');

  const division = options.division ?? DEFAULT_DIVISION;
  const tempo = options.tempo_us_per_quarter ?? 500_000;
  const highDelta = options.high_delta ?? 3;
  const lowDelta = options.low_delta ?? 2;

  if (!Number.isInteger(division) || division < 1 || division > 0x7fff) {
    throw new Error('MIDI_INVALID_DIVISION');
  }
  if (!Number.isInteger(tempo) || tempo < 1 || tempo > 0xffffff) {
    throw new Error('MIDI_INVALID_TEMPO');
  }

  const digest = sha256Hex(payload);
  const descriptor = Buffer.from(
    `${META_PREFIX};sha256=${digest};bytes=${payload.length}`,
    'utf8',
  );
  const tempoBytes = Buffer.from([
    (tempo >>> 16) & 0xff,
    (tempo >>> 8) & 0xff,
    tempo & 0xff,
  ]);

  const trackParts: Buffer[] = [
    meta(0, 0x01, descriptor),
    meta(0, 0x51, tempoBytes),
  ];

  for (const value of payload) {
    const high = value >>> 4;
    const low = value & 0x0f;
    trackParts.push(event(highDelta, 0x90, NOTE_BASE + high, 100));
    trackParts.push(event(lowDelta, 0x91, NOTE_BASE + low, 100));
  }

  trackParts.push(meta(0, 0x2f, Buffer.alloc(0)));
  const track = Buffer.concat(trackParts);

  return Buffer.concat([
    HEADER,
    u32(6),
    u16(FORMAT),
    u16(TRACKS),
    u16(division),
    TRACK,
    u32(track.length),
    track,
  ]);
}

export function decodePayloadFromMidi(fileValue: Uint8Array): DecodedMidiPayload {
  const file = Buffer.from(fileValue);
  if (file.length < 22) throw new Error('MIDI_TOO_SHORT');
  if (!file.subarray(0, 4).equals(HEADER)) throw new Error('MIDI_HEADER_MAGIC');

  const headerLength = file.readUInt32BE(4);
  if (headerLength !== 6) throw new Error('MIDI_HEADER_LENGTH');
  const format = file.readUInt16BE(8);
  const tracks = file.readUInt16BE(10);
  const division = file.readUInt16BE(12);
  if (format !== FORMAT || tracks !== TRACKS || division < 1 || division > 0x7fff) {
    throw new Error('MIDI_HEADER_UNSUPPORTED');
  }

  const trackOffset = 14;
  if (!file.subarray(trackOffset, trackOffset + 4).equals(TRACK)) {
    throw new Error('MIDI_TRACK_MAGIC');
  }
  const trackLength = file.readUInt32BE(trackOffset + 4);
  const trackStart = trackOffset + 8;
  const trackEnd = trackStart + trackLength;
  if (trackEnd !== file.length) throw new Error('MIDI_TRACK_LENGTH');

  const track = file.subarray(trackStart, trackEnd);
  let offset = 0;
  let tick = 0;
  let descriptor: string | null = null;
  let tempo: number | null = null;
  let ended = false;
  const nibbles: number[] = [];
  let expectedChannel = 0;
  let noteEvents = 0;

  while (offset < track.length) {
    const delta = readVarLen(track, offset);
    tick += delta.value;
    offset = delta.offset;
    if (offset >= track.length) throw new Error('MIDI_TRUNCATED_EVENT');

    const status = track[offset++]!;

    if (status === 0xff) {
      if (offset >= track.length) throw new Error('MIDI_TRUNCATED_META');
      const type = track[offset++]!;
      const length = readVarLen(track, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > track.length) throw new Error('MIDI_TRUNCATED_META');
      const payload = track.subarray(offset, end);
      offset = end;

      if (type === 0x01) {
        const text = payload.toString('utf8');
        if (descriptor !== null) throw new Error('MIDI_DUPLICATE_DESCRIPTOR');
        descriptor = text;
      } else if (type === 0x51) {
        if (payload.length !== 3 || tempo !== null) throw new Error('MIDI_TEMPO_INVALID');
        tempo = (payload[0]! << 16) | (payload[1]! << 8) | payload[2]!;
      } else if (type === 0x2f) {
        if (payload.length !== 0 || offset !== track.length) {
          throw new Error('MIDI_END_TRACK_INVALID');
        }
        ended = true;
      }
      continue;
    }

    const family = status & 0xf0;
    const channel = status & 0x0f;
    if (family !== 0x90 || (channel !== 0 && channel !== 1)) {
      throw new Error('MIDI_UNEXPECTED_EVENT');
    }
    if (offset + 2 > track.length) throw new Error('MIDI_TRUNCATED_NOTE');
    const note = track[offset++]!;
    const velocity = track[offset++]!;
    if (velocity === 0 || note < NOTE_BASE || note > NOTE_BASE + 15) {
      throw new Error('MIDI_NOTE_INVALID');
    }
    if (channel !== expectedChannel) throw new Error('MIDI_NOTE_CHANNEL_ORDER');
    expectedChannel = expectedChannel === 0 ? 1 : 0;
    nibbles.push(note - NOTE_BASE);
    noteEvents += 1;
  }

  if (!ended) throw new Error('MIDI_END_TRACK_MISSING');
  if (descriptor === null || tempo === null) throw new Error('MIDI_REQUIRED_META_MISSING');
  if (nibbles.length % 2 !== 0 || expectedChannel !== 0) {
    throw new Error('MIDI_NIBBLE_PAIR_INCOMPLETE');
  }

  const match = descriptor.match(
    /^RELATTE-MIDI-002;sha256=([a-f0-9]{64});bytes=([1-9][0-9]*)$/,
  );
  if (!match) throw new Error('MIDI_DESCRIPTOR_INVALID');
  const declaredHash = match[1]!;
  const declaredLength = Number(match[2]);

  const payload = Buffer.alloc(nibbles.length / 2);
  for (let index = 0; index < payload.length; index += 1) {
    payload[index] = (nibbles[index * 2]! << 4) | nibbles[index * 2 + 1]!;
  }

  if (payload.length !== declaredLength) throw new Error('MIDI_PAYLOAD_LENGTH_MISMATCH');
  if (sha256Hex(payload) !== declaredHash) throw new Error('MIDI_PAYLOAD_DIGEST_MISMATCH');

  return {
    bytes: payload,
    payload_sha256: declaredHash,
    byte_length: payload.length,
    division,
    tempo_us_per_quarter: tempo,
    note_event_count: noteEvents,
    last_tick: tick,
  };
}

export function observeMidiEventStream(
  payload: Uint8Array,
  options: MidiEncodingOptions = {},
): AdapterObservation {
  const midi = encodePayloadAsMidi(payload, options);
  const decoded = decodePayloadFromMidi(midi);

  return makeObservation(
    'midi-event-stream',
    `smf0:sha256:${sha256Hex(midi)}:division:${decoded.division}:tempo:${decoded.tempo_us_per_quarter}`,
    decoded.bytes,
    'audio/midi',
    {
      identity_model: 'time-ordered Standard MIDI File note event stream',
      midi_file_sha256: sha256Hex(midi),
      format: 0,
      tracks: 1,
      division: decoded.division,
      tempo_us_per_quarter: decoded.tempo_us_per_quarter,
      note_event_count: decoded.note_event_count,
      last_tick: decoded.last_tick,
      payload_encoding: 'channel-0 high nibble / channel-1 low nibble',
      semantic_music_identity: 'UNOBSERVED',
    },
  );
}
