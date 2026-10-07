import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from '../polyglot-crossing-001/common.ts';

const MAGIC = Buffer.from('RELATTE-LANGTON-003\0', 'utf8');
const WIDTH = 64;
const DEFAULT_STEPS = 1024;

type Direction = 0 | 1 | 2 | 3; // N E S W

export interface AntState {
  x: number;
  y: number;
  direction: Direction;
}

export interface LangtonCarrier {
  schema: 'relatte.langton-carrier/v0';
  steps: number;
  ant: AntState;
  black_cells: string[];
  final_state_sha256: string;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(value: string): [number, number] {
  const match = value.match(/^(-?[0-9]+),(-?[0-9]+)$/);
  if (!match) throw new Error('LANGTON_CELL_KEY_INVALID');
  return [Number(match[1]), Number(match[2])];
}

function right(direction: Direction): Direction {
  return ((direction + 1) % 4) as Direction;
}

function left(direction: Direction): Direction {
  return ((direction + 3) % 4) as Direction;
}

function move(state: AntState, amount: 1 | -1): void {
  if (state.direction === 0) state.y -= amount;
  else if (state.direction === 1) state.x += amount;
  else if (state.direction === 2) state.y += amount;
  else state.x -= amount;
}

function bitCoordinate(index: number): [number, number] {
  return [index % WIDTH, Math.floor(index / WIDTH)];
}

function bytesToInitialField(payloadValue: Uint8Array): Set<string> {
  const payload = Buffer.from(payloadValue);
  if (payload.length === 0) throw new Error('LANGTON_EMPTY_PAYLOAD');

  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const digest = Buffer.from(sha256Hex(payload), 'hex');
  const frame = Buffer.concat([MAGIC, length, payload, digest]);
  const black = new Set<string>();

  for (let byteIndex = 0; byteIndex < frame.length; byteIndex += 1) {
    const value = frame[byteIndex]!;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((value & (1 << (7 - bit))) !== 0) {
        const [x, y] = bitCoordinate(byteIndex * 8 + bit);
        black.add(key(x, y));
      }
    }
  }

  return black;
}

function readBit(black: Set<string>, index: number): number {
  const [x, y] = bitCoordinate(index);
  return black.has(key(x, y)) ? 1 : 0;
}

function readByte(black: Set<string>, byteIndex: number): number {
  let value = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value << 1) | readBit(black, byteIndex * 8 + bit);
  }
  return value;
}

function decodeInitialField(black: Set<string>): Buffer {
  const headerLength = MAGIC.length + 4;
  const header = Buffer.alloc(headerLength);
  for (let index = 0; index < header.length; index += 1) {
    header[index] = readByte(black, index);
  }

  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('LANGTON_MAGIC_MISMATCH');
  }

  const payloadLength = header.readUInt32BE(MAGIC.length);
  if (payloadLength < 1 || payloadLength > 1_000_000) {
    throw new Error('LANGTON_PAYLOAD_LENGTH_INVALID');
  }

  const total = MAGIC.length + 4 + payloadLength + 32;
  const frame = Buffer.alloc(total);
  for (let index = 0; index < total; index += 1) {
    frame[index] = readByte(black, index);
  }

  const payloadStart = MAGIC.length + 4;
  const payload = frame.subarray(payloadStart, payloadStart + payloadLength);
  const declaredDigest = frame.subarray(payloadStart + payloadLength);
  const actualDigest = Buffer.from(sha256Hex(payload), 'hex');
  if (!declaredDigest.equals(actualDigest)) {
    throw new Error('LANGTON_PAYLOAD_DIGEST_MISMATCH');
  }

  return Buffer.from(payload);
}

function forwardStep(black: Set<string>, ant: AntState): void {
  const cell = key(ant.x, ant.y);
  const wasBlack = black.has(cell);

  ant.direction = wasBlack ? left(ant.direction) : right(ant.direction);
  if (wasBlack) black.delete(cell);
  else black.add(cell);
  move(ant, 1);
}

function reverseStep(black: Set<string>, ant: AntState): void {
  move(ant, -1);
  const cell = key(ant.x, ant.y);
  const afterFlipBlack = black.has(cell);
  const beforeBlack = !afterFlipBlack;

  if (afterFlipBlack) black.delete(cell);
  else black.add(cell);

  ant.direction = beforeBlack ? right(ant.direction) : left(ant.direction);
}

function stateHash(steps: number, ant: AntState, black: Set<string>): string {
  const cells = [...black].sort((a, b) => {
    const [ax, ay] = parseKey(a);
    const [bx, by] = parseKey(b);
    return ay - by || ax - bx;
  });

  return sha256Hex(Buffer.from(JSON.stringify({
    steps,
    ant,
    black_cells: cells,
  }), 'utf8'));
}

export function encodePayloadAsLangton(
  payload: Uint8Array,
  steps = DEFAULT_STEPS,
): LangtonCarrier {
  if (!Number.isInteger(steps) || steps < 1 || steps > 1_000_000) {
    throw new Error('LANGTON_STEPS_INVALID');
  }

  const black = bytesToInitialField(payload);
  const ant: AntState = { x: 0, y: 0, direction: 0 };

  for (let index = 0; index < steps; index += 1) {
    forwardStep(black, ant);
  }

  const blackCells = [...black].sort((a, b) => {
    const [ax, ay] = parseKey(a);
    const [bx, by] = parseKey(b);
    return ay - by || ax - bx;
  });

  return {
    schema: 'relatte.langton-carrier/v0',
    steps,
    ant: { ...ant },
    black_cells: blackCells,
    final_state_sha256: stateHash(steps, ant, black),
  };
}

export function decodePayloadFromLangton(value: LangtonCarrier): Buffer {
  if (
    value.schema !== 'relatte.langton-carrier/v0' ||
    !Number.isInteger(value.steps) ||
    value.steps < 1 ||
    value.steps > 1_000_000 ||
    !value.ant ||
    !Number.isInteger(value.ant.x) ||
    !Number.isInteger(value.ant.y) ||
    ![0, 1, 2, 3].includes(value.ant.direction) ||
    !Array.isArray(value.black_cells) ||
    typeof value.final_state_sha256 !== 'string'
  ) throw new Error('LANGTON_CARRIER_INVALID');

  const black = new Set<string>();
  for (const cell of value.black_cells) {
    parseKey(cell);
    if (black.has(cell)) throw new Error('LANGTON_DUPLICATE_CELL');
    black.add(cell);
  }

  const ant: AntState = {
    x: value.ant.x,
    y: value.ant.y,
    direction: value.ant.direction,
  };

  if (stateHash(value.steps, ant, black) !== value.final_state_sha256) {
    throw new Error('LANGTON_FINAL_STATE_MISMATCH');
  }

  for (let index = 0; index < value.steps; index += 1) {
    reverseStep(black, ant);
  }

  if (ant.x !== 0 || ant.y !== 0 || ant.direction !== 0) {
    throw new Error('LANGTON_ORIGIN_NOT_RECOVERED');
  }

  return decodeInitialField(black);
}

export function observeLangtonField(
  payload: Uint8Array,
  steps = DEFAULT_STEPS,
): AdapterObservation {
  const carrier = encodePayloadAsLangton(payload, steps);
  const recovered = decodePayloadFromLangton(carrier);

  return makeObservation(
    'langton-ant-field',
    `langton:steps:${steps}:state:${carrier.final_state_sha256}`,
    recovered,
    'application/x-langton-ant-field',
    {
      identity_model: 'reversible evolving sparse cellular field plus ant pose',
      steps,
      final_state_sha256: carrier.final_state_sha256,
      black_cell_count: carrier.black_cells.length,
      final_ant: carrier.ant,
      payload_present_as_original_bytes_in_final_state: false,
      reconstruction: 'reverse lawful state transitions',
    },
  );
}
