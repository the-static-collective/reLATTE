import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

import { canonicalize, canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { verifyCrossingEnvelope } from './protocol.ts';

export const TRANSPORT_FRAME_ID_DOMAIN = 'reLATTE-TransportFrame-v0|';
export type TransportKind = 'file-bundle' | 'http-relay';

export interface TransportFrame {
  schema: 'relatte.transport-frame/v0';
  transport_id?: string;
  transport: TransportKind;
  crossing_id: string;
  canonical_body_sha256: string;
  media_type: 'application/vnd.relatte.crossing+json';
  body: string;
  route_note: string;
  created_at: string;
  laws: string[];
}

const TRANSPORT_FRAME_KEYS = [
  'schema',
  'transport_id',
  'transport',
  'crossing_id',
  'canonical_body_sha256',
  'media_type',
  'body',
  'route_note',
  'created_at',
  'laws',
] as const;

export interface TransportAck {
  schema: 'relatte.transport-ack/v0';
  transport_id: string;
  crossing_id: string;
  accepted_for_delivery: true;
  semantic_effect: 'none';
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function assertOnlyKeys(object: Record<string, any>, allowed: readonly string[], code: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
}

function stringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error(code);
  }
  return [...value];
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function frameBody(value: Omit<TransportFrame, 'transport_id'>): Omit<TransportFrame, 'transport_id'> {
  return {
    schema: 'relatte.transport-frame/v0',
    transport: value.transport,
    crossing_id: value.crossing_id,
    canonical_body_sha256: value.canonical_body_sha256,
    media_type: 'application/vnd.relatte.crossing+json',
    body: value.body,
    route_note: value.route_note,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export function computeTransportFrameId(value: Omit<TransportFrame, 'transport_id'>): string {
  return `relatte-transport-v0:${sha256Hex(
    canonicalizeDomainValue(TRANSPORT_FRAME_ID_DOMAIN, frameBody(value)),
  )}`;
}

export async function makeTransportFrame(
  crossingValue: unknown,
  transport: TransportKind,
  createdAt: string,
  routeNote: string,
): Promise<TransportFrame> {
  if (!(await verifyCrossingEnvelope(crossingValue))) throw new Error('INVALID_TRANSPORT_CROSSING');
  validateTimestamp(createdAt);

  const crossing = asRecord(crossingValue, 'INVALID_TRANSPORT_CROSSING');
  const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_TRANSPORT_CROSSING_ID');
  const body = canonicalize(crossing);
  const canonicalBodySha256 = sha256Hex(Buffer.from(body, 'utf8'));

  const framed: Omit<TransportFrame, 'transport_id'> = {
    schema: 'relatte.transport-frame/v0',
    transport,
    crossing_id: crossingId,
    canonical_body_sha256: canonicalBodySha256,
    media_type: 'application/vnd.relatte.crossing+json',
    body,
    route_note: nonEmpty(routeNote, 'INVALID_TRANSPORT_ROUTE_NOTE'),
    created_at: createdAt,
    laws: [
      'TRANSPORT != CROSSING',
      'DELIVERY != ADMISSION',
      'ROAD CHANGE != IDENTITY CHANGE',
    ],
  };

  return {
    ...framed,
    transport_id: computeTransportFrameId(framed),
  };
}

export async function verifyAndExtractTransportFrame(
  value: unknown,
): Promise<Record<string, any>> {
  const frame = asRecord(value, 'INVALID_TRANSPORT_FRAME');
  assertOnlyKeys(frame, TRANSPORT_FRAME_KEYS, 'UNEXPECTED_TRANSPORT_FRAME_FIELD');
  if (frame.schema !== 'relatte.transport-frame/v0') throw new Error('INVALID_TRANSPORT_FRAME_SCHEMA');
  if (frame.transport !== 'file-bundle' && frame.transport !== 'http-relay') {
    throw new Error('INVALID_TRANSPORT_KIND');
  }
  validateTimestamp(frame.created_at);
  if (frame.media_type !== 'application/vnd.relatte.crossing+json') {
    throw new Error('INVALID_TRANSPORT_MEDIA_TYPE');
  }

  const crossingId = nonEmpty(frame.crossing_id, 'INVALID_TRANSPORT_CROSSING_ID');
  const body = nonEmpty(frame.body, 'INVALID_TRANSPORT_BODY');
  const hash = nonEmpty(frame.canonical_body_sha256, 'INVALID_TRANSPORT_BODY_HASH');
  if (hash !== sha256Hex(Buffer.from(body, 'utf8'))) throw new Error('TRANSPORT_BODY_HASH_MISMATCH');

  const parsed = asRecord(JSON.parse(body), 'INVALID_TRANSPORT_BODY_JSON');
  if (canonicalize(parsed) !== body) throw new Error('TRANSPORT_BODY_NOT_CANONICAL');
  if (parsed.crossing_id !== crossingId) throw new Error('TRANSPORT_CROSSING_ID_MISMATCH');
  if (!(await verifyCrossingEnvelope(parsed))) throw new Error('INVALID_TRANSPORT_CROSSING');

  const bodyForId: Omit<TransportFrame, 'transport_id'> = {
    schema: 'relatte.transport-frame/v0',
    transport: frame.transport,
    crossing_id: crossingId,
    canonical_body_sha256: hash,
    media_type: 'application/vnd.relatte.crossing+json',
    body,
    route_note: nonEmpty(frame.route_note, 'INVALID_TRANSPORT_ROUTE_NOTE'),
    created_at: frame.created_at,
    laws: stringArray(frame.laws, 'INVALID_TRANSPORT_LAWS'),
  };
  if (
    typeof frame.transport_id !== 'string' ||
    frame.transport_id !== computeTransportFrameId(bodyForId)
  ) {
    throw new Error('INVALID_TRANSPORT_FRAME_ID');
  }

  return parsed;
}

export async function writeFileBundle(path: string, frameValue: unknown): Promise<void> {
  const crossing = await verifyAndExtractTransportFrame(frameValue);
  const frame = asRecord(frameValue, 'INVALID_TRANSPORT_FRAME');
  if (frame.transport !== 'file-bundle') throw new Error('FILE_BUNDLE_REQUIRES_FILE_TRANSPORT');
  if (crossing.crossing_id !== frame.crossing_id) throw new Error('FILE_BUNDLE_CROSSING_MISMATCH');
  await writeFile(path, JSON.stringify(frame, null, 2) + '\n', 'utf8');
}

export async function readFileBundle(path: string): Promise<{
  frame: TransportFrame;
  crossing: Record<string, any>;
}> {
  const frame = JSON.parse(await readFile(path, 'utf8')) as TransportFrame;
  if (frame.transport !== 'file-bundle') throw new Error('FILE_BUNDLE_REQUIRES_FILE_TRANSPORT');
  const crossing = await verifyAndExtractTransportFrame(frame);
  return { frame, crossing };
}

async function readJsonBody(request: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw new Error('HTTP_TRANSPORT_BODY_TOO_LARGE');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

export function createHttpRelayServer(
  onCrossing: (crossing: Record<string, any>, frame: TransportFrame) => Promise<void> | void,
): Server {
  return createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/relatte/v0/crossings') {
        json(response, 404, { error: 'not_found' });
        return;
      }

      const frameValue = await readJsonBody(request);
      const frame = asRecord(frameValue, 'INVALID_TRANSPORT_FRAME') as unknown as TransportFrame;
      if (frame.transport !== 'http-relay') throw new Error('HTTP_RELAY_REQUIRES_HTTP_TRANSPORT');

      const crossing = await verifyAndExtractTransportFrame(frame);
      await onCrossing(crossing, frame);

      const ack: TransportAck = {
        schema: 'relatte.transport-ack/v0',
        transport_id: nonEmpty(frame.transport_id, 'INVALID_TRANSPORT_FRAME_ID'),
        crossing_id: crossing.crossing_id,
        accepted_for_delivery: true,
        semantic_effect: 'none',
        laws: [
          'ACK != RECEIVE RECEIPT',
          'DELIVERED != ADMITTED',
        ],
      };
      json(response, 202, ack);
    } catch (error) {
      json(response, 400, {
        error: error instanceof Error ? error.message : 'invalid_transport',
      });
    }
  });
}

export async function postHttpTransport(
  url: string,
  frameValue: unknown,
): Promise<TransportAck> {
  const frame = asRecord(frameValue, 'INVALID_TRANSPORT_FRAME');
  if (frame.transport !== 'http-relay') throw new Error('HTTP_RELAY_REQUIRES_HTTP_TRANSPORT');
  await verifyAndExtractTransportFrame(frame);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(frame),
  });
  const parsed = await response.json() as any;
  if (!response.ok) {
    throw new Error(typeof parsed?.error === 'string' ? parsed.error : 'HTTP_TRANSPORT_FAILED');
  }
  return parsed as TransportAck;
}
