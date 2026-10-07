import dgram from 'node:dgram';
import { randomUUID } from 'node:crypto';

import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from './common.ts';

const PACKET_SCHEMA = 'relatte.alien-udp-packet/v0';
const MAX_CHUNK = 48;

interface UdpPacket {
  schema: typeof PACKET_SCHEMA;
  session_id: string;
  index: number;
  count: number;
  payload_sha256: string;
  chunk_base64url: string;
  chunk_sha256: string;
  packet_id: string;
}

function packetIdBody(packet: Omit<UdpPacket, 'packet_id'>): string {
  return JSON.stringify({
    schema: packet.schema,
    session_id: packet.session_id,
    index: packet.index,
    count: packet.count,
    payload_sha256: packet.payload_sha256,
    chunk_base64url: packet.chunk_base64url,
    chunk_sha256: packet.chunk_sha256,
  });
}

function makePacket(args: {
  session_id: string;
  index: number;
  count: number;
  payload_sha256: string;
  chunk: Uint8Array;
}): UdpPacket {
  const chunk = Buffer.from(args.chunk);
  const body = {
    schema: PACKET_SCHEMA,
    session_id: args.session_id,
    index: args.index,
    count: args.count,
    payload_sha256: args.payload_sha256,
    chunk_base64url: chunk.toString('base64url'),
    chunk_sha256: sha256Hex(chunk),
  } as const;

  return {
    ...body,
    packet_id: sha256Hex(Buffer.from(packetIdBody(body), 'utf8')),
  };
}

export function makeUdpPackets(
  bytes: Uint8Array,
  sessionId: string,
): UdpPacket[] {
  const payload = Buffer.from(bytes);
  if (payload.length === 0) throw new Error('UDP_EMPTY_PAYLOAD');
  const count = Math.ceil(payload.length / MAX_CHUNK);
  const payloadHash = sha256Hex(payload);
  const packets: UdpPacket[] = [];

  for (let index = 0; index < count; index += 1) {
    packets.push(makePacket({
      session_id: sessionId,
      index,
      count,
      payload_sha256: payloadHash,
      chunk: payload.subarray(index * MAX_CHUNK, (index + 1) * MAX_CHUNK),
    }));
  }

  return packets;
}

function parsePacket(value: Uint8Array): UdpPacket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value).toString('utf8'));
  } catch {
    throw new Error('UDP_PACKET_NOT_JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('UDP_PACKET_NOT_OBJECT');
  }
  const packet = parsed as Record<string, unknown>;
  const expected = [
    'schema',
    'session_id',
    'index',
    'count',
    'payload_sha256',
    'chunk_base64url',
    'chunk_sha256',
    'packet_id',
  ];
  if (
    Object.keys(packet).length !== expected.length ||
    !expected.every((key) => Object.hasOwn(packet, key))
  ) throw new Error('UDP_PACKET_FIELDS');

  if (
    packet.schema !== PACKET_SCHEMA ||
    typeof packet.session_id !== 'string' ||
    typeof packet.index !== 'number' ||
    !Number.isInteger(packet.index) ||
    typeof packet.count !== 'number' ||
    !Number.isInteger(packet.count) ||
    packet.count < 1 ||
    packet.index < 0 ||
    packet.index >= packet.count ||
    typeof packet.payload_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(packet.payload_sha256) ||
    typeof packet.chunk_base64url !== 'string' ||
    typeof packet.chunk_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(packet.chunk_sha256) ||
    typeof packet.packet_id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(packet.packet_id)
  ) throw new Error('UDP_PACKET_INVALID');

  const chunk = Buffer.from(packet.chunk_base64url, 'base64url');
  if (
    chunk.length === 0 ||
    chunk.length > MAX_CHUNK ||
    chunk.toString('base64url') !== packet.chunk_base64url ||
    sha256Hex(chunk) !== packet.chunk_sha256
  ) throw new Error('UDP_CHUNK_INTEGRITY');

  const unsigned = {
    schema: PACKET_SCHEMA,
    session_id: packet.session_id as string,
    index: packet.index as number,
    count: packet.count as number,
    payload_sha256: packet.payload_sha256 as string,
    chunk_base64url: packet.chunk_base64url as string,
    chunk_sha256: packet.chunk_sha256 as string,
  };
  if (
    sha256Hex(Buffer.from(packetIdBody(unsigned), 'utf8')) !== packet.packet_id
  ) throw new Error('UDP_PACKET_ID_MISMATCH');

  return packet as unknown as UdpPacket;
}

export function reassembleUdpPackets(values: Uint8Array[]): {
  bytes: Buffer;
  session_id: string;
  payload_sha256: string;
  duplicate_count: number;
  packet_ids: string[];
} {
  if (values.length === 0) throw new Error('UDP_NO_PACKETS');
  const packets = values.map(parsePacket);
  const first = packets[0]!;
  const byIndex = new Map<number, UdpPacket>();
  let duplicateCount = 0;

  for (const packet of packets) {
    if (
      packet.session_id !== first.session_id ||
      packet.count !== first.count ||
      packet.payload_sha256 !== first.payload_sha256
    ) throw new Error('UDP_MIXED_SESSION');

    const prior = byIndex.get(packet.index);
    if (prior) {
      if (prior.packet_id !== packet.packet_id) {
        throw new Error('UDP_CONFLICTING_DUPLICATE');
      }
      duplicateCount += 1;
      continue;
    }
    byIndex.set(packet.index, packet);
  }

  if (byIndex.size !== first.count) throw new Error('UDP_MISSING_PACKET');

  const chunks: Buffer[] = [];
  for (let index = 0; index < first.count; index += 1) {
    const packet = byIndex.get(index);
    if (!packet) throw new Error('UDP_MISSING_PACKET');
    chunks.push(Buffer.from(packet.chunk_base64url, 'base64url'));
  }

  const bytes = Buffer.concat(chunks);
  if (sha256Hex(bytes) !== first.payload_sha256) {
    throw new Error('UDP_PAYLOAD_INTEGRITY');
  }

  return {
    bytes,
    session_id: first.session_id,
    payload_sha256: first.payload_sha256,
    duplicate_count: duplicateCount,
    packet_ids: packets.map((packet) => packet.packet_id).sort(),
  };
}

export async function observeUdpDatagramSwarm(
  bytes: Uint8Array,
): Promise<AdapterObservation> {
  const payload = Buffer.from(bytes);
  const sessionId = randomUUID();
  const packets = makeUdpPackets(payload, sessionId);
  const receiver = dgram.createSocket('udp4');
  const sender = dgram.createSocket('udp4');

  try {
    await new Promise<void>((resolvePromise, reject) => {
      receiver.once('error', reject);
      receiver.bind(0, '127.0.0.1', () => resolvePromise());
    });
    await new Promise<void>((resolvePromise, reject) => {
      sender.once('error', reject);
      sender.bind(0, '127.0.0.1', () => resolvePromise());
    });

    const receiverAddress = receiver.address();
    const senderAddress = sender.address();
    if (
      typeof receiverAddress === 'string' ||
      typeof senderAddress === 'string'
    ) throw new Error('UDP_SOCKET_ADDRESS');

    const wire: Uint8Array[] = [];
    const unique = new Set<number>();
    let duplicateSeen = false;

    const received = new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('UDP_RECEIVE_TIMEOUT')), 2000);
      receiver.on('message', (message) => {
        try {
          const packet = parsePacket(message);
          wire.push(Buffer.from(message));
          if (unique.has(packet.index)) duplicateSeen = true;
          unique.add(packet.index);
          if (unique.size === packets.length && duplicateSeen) {
            clearTimeout(timer);
            resolvePromise();
          }
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });

    const order = packets.length > 1
      ? [packets.at(-1)!, packets[0]!, packets[0]!, ...packets.slice(1, -1)]
      : [packets[0]!, packets[0]!];

    for (const packet of order) {
      const encoded = Buffer.from(JSON.stringify(packet), 'utf8');
      await new Promise<void>((resolvePromise, reject) => {
        sender.send(
          encoded,
          receiverAddress.port,
          '127.0.0.1',
          (error) => error ? reject(error) : resolvePromise(),
        );
      });
    }

    await received;
    const reconstructed = reassembleUdpPackets(wire);
    const transcript = sha256Hex(
      Buffer.from(reconstructed.packet_ids.join('\n'), 'utf8'),
    );

    return makeObservation(
      'udp-datagram-swarm' as never,
      `udp-session:${sessionId}:sender-port:${senderAddress.port}:transcript:${transcript}`,
      reconstructed.bytes,
      'application/octet-stream',
      {
        identity_model: 'ephemeral unordered datagram session',
        session_id: sessionId,
        sender_port: senderAddress.port,
        receiver_port: receiverAddress.port,
        packet_count: packets.length,
        duplicate_count: reconstructed.duplicate_count,
        transcript_sha256: transcript,
        durable_native_object: false,
        delivery_guarantee: 'none',
      },
    );
  } finally {
    receiver.close();
    sender.close();
  }
}
