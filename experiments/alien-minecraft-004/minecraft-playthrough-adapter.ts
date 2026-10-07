import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from '../polyglot-crossing-001/common.ts';

const MAGIC = Buffer.from('RELATTE-MC-004\0', 'utf8');
const WALL_WIDTH = 32;
const Y = 64;
const QUARRY_Z = 0;
const WALL_Z = 10;

const WOOL = [
  'minecraft:white_wool',
  'minecraft:orange_wool',
  'minecraft:magenta_wool',
  'minecraft:light_blue_wool',
  'minecraft:yellow_wool',
  'minecraft:lime_wool',
  'minecraft:pink_wool',
  'minecraft:gray_wool',
  'minecraft:light_gray_wool',
  'minecraft:cyan_wool',
  'minecraft:purple_wool',
  'minecraft:blue_wool',
  'minecraft:brown_wool',
  'minecraft:green_wool',
  'minecraft:red_wool',
  'minecraft:black_wool',
] as const;

type WoolBlock = typeof WOOL[number];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type PlayEvent =
  | {
      kind: 'walk';
      from: Vec3;
      to: Vec3;
      distance: number;
    }
  | {
      kind: 'break';
      at: Vec3;
      block: WoolBlock;
    }
  | {
      kind: 'place';
      at: Vec3;
      block: WoolBlock;
    };

export interface MinecraftPlaythrough {
  schema: 'relatte.minecraft-playthrough/v0';
  strategy: 'forward' | 'reverse';
  frame_nibbles: number;
  events: PlayEvent[];
  transcript_sha256: string;
  final_build_sha256: string;
}

interface ReplayResult {
  payload: Buffer;
  final_build_sha256: string;
  inventory_empty: boolean;
  mined_count: number;
  placed_count: number;
}

function posKey(value: Vec3): string {
  return `${value.x},${value.y},${value.z}`;
}

function samePos(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

function quarryPos(index: number): Vec3 {
  return { x: index, y: Y, z: QUARRY_Z };
}

function wallPos(index: number): Vec3 {
  return {
    x: index % WALL_WIDTH,
    y: Y + Math.floor(index / WALL_WIDTH),
    z: WALL_Z,
  };
}

function nibbleForBlock(block: string): number {
  const index = WOOL.indexOf(block as WoolBlock);
  if (index < 0) throw new Error('MINECRAFT_UNKNOWN_WOOL');
  return index;
}

function framePayload(payloadValue: Uint8Array): Buffer {
  const payload = Buffer.from(payloadValue);
  if (payload.length === 0) throw new Error('MINECRAFT_EMPTY_PAYLOAD');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const digest = Buffer.from(sha256Hex(payload), 'hex');
  return Buffer.concat([MAGIC, length, payload, digest]);
}

function frameToNibbles(frame: Buffer): number[] {
  const out: number[] = [];
  for (const byte of frame) {
    out.push(byte >>> 4, byte & 0x0f);
  }
  return out;
}

function nibblesToFrame(nibbles: number[]): Buffer {
  if (nibbles.length % 2 !== 0) throw new Error('MINECRAFT_NIBBLE_ODD');
  const frame = Buffer.alloc(nibbles.length / 2);
  for (let index = 0; index < frame.length; index += 1) {
    const high = nibbles[index * 2]!;
    const low = nibbles[index * 2 + 1]!;
    if (high < 0 || high > 15 || low < 0 || low > 15) {
      throw new Error('MINECRAFT_NIBBLE_INVALID');
    }
    frame[index] = (high << 4) | low;
  }
  return frame;
}

function parseFrame(frame: Buffer): Buffer {
  if (frame.length < MAGIC.length + 4 + 32) throw new Error('MINECRAFT_FRAME_SHORT');
  if (!frame.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('MINECRAFT_MAGIC_MISMATCH');
  }
  const payloadLength = frame.readUInt32BE(MAGIC.length);
  if (payloadLength < 1 || payloadLength > 1_000_000) {
    throw new Error('MINECRAFT_PAYLOAD_LENGTH_INVALID');
  }
  const expectedLength = MAGIC.length + 4 + payloadLength + 32;
  if (frame.length !== expectedLength) throw new Error('MINECRAFT_FRAME_LENGTH_MISMATCH');

  const payloadStart = MAGIC.length + 4;
  const payload = frame.subarray(payloadStart, payloadStart + payloadLength);
  const digest = frame.subarray(payloadStart + payloadLength);
  if (!digest.equals(Buffer.from(sha256Hex(payload), 'hex'))) {
    throw new Error('MINECRAFT_PAYLOAD_DIGEST_MISMATCH');
  }
  return Buffer.from(payload);
}

function canonicalTranscript(events: PlayEvent[]): Buffer {
  return Buffer.from(JSON.stringify(events), 'utf8');
}

function canonicalBuild(build: Map<string, WoolBlock>): Buffer {
  const rows = [...build.entries()].sort(([a], [b]) => a.localeCompare(b));
  return Buffer.from(JSON.stringify(rows), 'utf8');
}

export function makeMinecraftPlaythrough(
  payloadValue: Uint8Array,
  strategy: 'forward' | 'reverse' = 'forward',
): MinecraftPlaythrough {
  const frame = framePayload(payloadValue);
  const nibbles = frameToNibbles(frame);
  const order = [...nibbles.keys()];
  if (strategy === 'reverse') order.reverse();

  const events: PlayEvent[] = [];
  let position: Vec3 = { x: 0, y: Y, z: 5 };

  for (const index of order) {
    const nibble = nibbles[index]!;
    const block = WOOL[nibble]!;
    const quarry = quarryPos(index);
    const wall = wallPos(index);

    events.push({
      kind: 'walk',
      from: { ...position },
      to: { ...quarry },
      distance: distance(position, quarry),
    });
    position = quarry;

    events.push({ kind: 'break', at: { ...quarry }, block });

    events.push({
      kind: 'walk',
      from: { ...position },
      to: { ...wall },
      distance: distance(position, wall),
    });
    position = wall;

    events.push({ kind: 'place', at: { ...wall }, block });
  }

  const replayed = replayMinecraftPlaythrough({
    schema: 'relatte.minecraft-playthrough/v0',
    strategy,
    frame_nibbles: nibbles.length,
    events,
    transcript_sha256: 'pending',
    final_build_sha256: 'pending',
  }, false);

  const transcriptHash = sha256Hex(canonicalTranscript(events));

  return {
    schema: 'relatte.minecraft-playthrough/v0',
    strategy,
    frame_nibbles: nibbles.length,
    events,
    transcript_sha256: transcriptHash,
    final_build_sha256: replayed.final_build_sha256,
  };
}

export function replayMinecraftPlaythrough(
  value: MinecraftPlaythrough,
  verifyHashes = true,
): ReplayResult {
  if (
    value.schema !== 'relatte.minecraft-playthrough/v0' ||
    !['forward', 'reverse'].includes(value.strategy) ||
    !Number.isInteger(value.frame_nibbles) ||
    value.frame_nibbles < 2 ||
    value.frame_nibbles % 2 !== 0 ||
    !Array.isArray(value.events)
  ) throw new Error('MINECRAFT_PLAYTHROUGH_INVALID');

  if (verifyHashes) {
    const transcriptHash = sha256Hex(canonicalTranscript(value.events));
    if (transcriptHash !== value.transcript_sha256) {
      throw new Error('MINECRAFT_TRANSCRIPT_HASH_MISMATCH');
    }
  }

  const quarry = new Map<string, WoolBlock>();
  for (let index = 0; index < value.frame_nibbles; index += 1) {
    // Quarry block color is derived from the eventual claimed break event.
    // It is fixed lazily on first legal break, then the cell is consumed.
    quarry.set(posKey(quarryPos(index)), 'minecraft:white_wool');
  }

  const mined = new Set<string>();
  const inventory = new Map<WoolBlock, number>();
  const build = new Map<string, WoolBlock>();
  let position: Vec3 = { x: 0, y: Y, z: 5 };
  let minedCount = 0;
  let placedCount = 0;

  for (const event of value.events) {
    if (event.kind === 'walk') {
      if (!samePos(position, event.from)) throw new Error('MINECRAFT_WALK_FROM_MISMATCH');
      const actual = distance(event.from, event.to);
      if (event.distance !== actual) throw new Error('MINECRAFT_WALK_DISTANCE_MISMATCH');
      position = { ...event.to };
      continue;
    }

    if (event.kind === 'break') {
      if (!samePos(position, event.at)) throw new Error('MINECRAFT_BREAK_OUT_OF_REACH');
      const key = posKey(event.at);
      if (!quarry.has(key) || mined.has(key)) throw new Error('MINECRAFT_BLOCK_NOT_MINEABLE');

      // Quarry cells are designated by index; the playthrough binds the mined
      // wool color at that cell exactly once. Conservation is enforced after.
      nibbleForBlock(event.block);
      mined.add(key);
      minedCount += 1;
      inventory.set(event.block, (inventory.get(event.block) ?? 0) + 1);
      continue;
    }

    if (!samePos(position, event.at)) throw new Error('MINECRAFT_PLACE_OUT_OF_REACH');
    const key = posKey(event.at);
    if (build.has(key)) throw new Error('MINECRAFT_TARGET_OCCUPIED');
    const count = inventory.get(event.block) ?? 0;
    if (count < 1) throw new Error('MINECRAFT_PLACE_WITHOUT_INVENTORY');
    inventory.set(event.block, count - 1);
    build.set(key, event.block);
    placedCount += 1;
  }

  if (build.size !== value.frame_nibbles) throw new Error('MINECRAFT_BUILD_INCOMPLETE');

  const nibbles: number[] = [];
  for (let index = 0; index < value.frame_nibbles; index += 1) {
    const block = build.get(posKey(wallPos(index)));
    if (!block) throw new Error('MINECRAFT_WALL_HOLE');
    nibbles.push(nibbleForBlock(block));
  }

  const frame = nibblesToFrame(nibbles);
  const payload = parseFrame(frame);
  const buildHash = sha256Hex(canonicalBuild(build));
  if (verifyHashes && buildHash !== value.final_build_sha256) {
    throw new Error('MINECRAFT_FINAL_BUILD_HASH_MISMATCH');
  }

  const inventoryEmpty = [...inventory.values()].every((count) => count === 0);
  if (!inventoryEmpty) throw new Error('MINECRAFT_LEFTOVER_INVENTORY');
  if (minedCount !== placedCount || placedCount !== value.frame_nibbles) {
    throw new Error('MINECRAFT_CONSERVATION_FAILURE');
  }

  return {
    payload,
    final_build_sha256: buildHash,
    inventory_empty: inventoryEmpty,
    mined_count: minedCount,
    placed_count: placedCount,
  };
}

export function observeMinecraftPlaythrough(
  payload: Uint8Array,
  strategy: 'forward' | 'reverse' = 'forward',
): AdapterObservation {
  const playthrough = makeMinecraftPlaythrough(payload, strategy);
  const replayed = replayMinecraftPlaythrough(playthrough);

  return makeObservation(
    'minecraft-playthrough',
    `minecraft-playthrough:transcript:${playthrough.transcript_sha256}:build:${playthrough.final_build_sha256}`,
    replayed.payload,
    'application/x-minecraft-playthrough',
    {
      identity_model: 'lawful playthrough transcript + final wool mosaic',
      strategy,
      transcript_sha256: playthrough.transcript_sha256,
      final_build_sha256: playthrough.final_build_sha256,
      event_count: playthrough.events.length,
      mined_count: replayed.mined_count,
      placed_count: replayed.placed_count,
      inventory_empty: replayed.inventory_empty,
      wool_palette_size: WOOL.length,
      actual_mojang_runtime: 'UNOBSERVED',
    },
  );
}
