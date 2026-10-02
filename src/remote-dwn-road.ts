import {
  RecordsRead,
  RecordsWrite,
  type Signer,
} from '@tbd54566975/dwn-sdk-js';

import { canonicalize, sha256Hex } from './canonical.ts';
import { verifyCrossingEnvelope } from './protocol.ts';
import { RELATTE_DWN_MEDIA_TYPE } from './dwn-road.ts';

export interface RemoteDwnWriteResult {
  schema: 'relatte.remote-dwn-write/v0';
  crossing_id: string;
  dwn_record_id: string;
  tenant_did: string;
  endpoint: string;
  canonical_body_sha256: string;
  dwn_status: number;
  semantic_effect: 'none';
  laws: string[];
}

export interface RemoteDwnReadResult {
  schema: 'relatte.remote-dwn-read/v0';
  crossing: Record<string, any>;
  crossing_id: string;
  dwn_record_id: string;
  tenant_did: string;
  endpoint: string;
  dwn_status: number;
  semantic_effect: 'none';
  laws: string[];
}

type FetchLike = typeof fetch;

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function normalizeEndpoint(value: unknown): string {
  const endpoint = nonEmpty(value, 'INVALID_REMOTE_DWN_ENDPOINT');
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_REMOTE_DWN_PROTOCOL');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('REMOTE_DWN_ENDPOINT_CREDENTIALS_FORBIDDEN');
  }
  return url.toString();
}

function rpcRequest(target: string, message: unknown): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'dwn.processMessage',
    params: {
      target,
      message,
    },
  };
}

function parseJsonRpcReply(value: unknown, code: string): Record<string, any> {
  const root = asRecord(value, code);
  if (root.error) {
    const error = asRecord(root.error, code);
    throw new Error(`${code}:${String(error.code ?? 'unknown')}:${String(error.message ?? 'unknown')}`);
  }
  const result = asRecord(root.result, code);
  return asRecord(result.reply, code);
}

export async function writeCrossingToRemoteDwn(args: {
  endpoint: string;
  tenant_did: string;
  signer: Signer;
  crossing: unknown;
  fetch_impl?: FetchLike;
}): Promise<RemoteDwnWriteResult> {
  if (!(await verifyCrossingEnvelope(args.crossing))) throw new Error('INVALID_REMOTE_DWN_CROSSING');

  const crossing = asRecord(args.crossing, 'INVALID_REMOTE_DWN_CROSSING');
  const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_REMOTE_DWN_CROSSING_ID');
  const tenantDid = nonEmpty(args.tenant_did, 'INVALID_REMOTE_DWN_TENANT_DID');
  const endpoint = normalizeEndpoint(args.endpoint);
  const body = canonicalize(crossing);
  const data = new TextEncoder().encode(body);

  const recordsWrite = await RecordsWrite.create({
    data,
    dataFormat: RELATTE_DWN_MEDIA_TYPE,
    published: false,
    signer: args.signer,
  });

  const request = rpcRequest(tenantDid, recordsWrite.message);
  const fetchImpl = args.fetch_impl ?? fetch;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'dwn-request': JSON.stringify(request),
      'content-type': 'application/octet-stream',
    },
    body: Uint8Array.from(data),
  });

  if (!response.ok) {
    throw new Error(`REMOTE_DWN_HTTP_WRITE_FAILED:${response.status}`);
  }

  const payload = await response.json();
  const reply = parseJsonRpcReply(payload, 'REMOTE_DWN_WRITE_RPC_FAILED');
  const status = asRecord(reply.status, 'REMOTE_DWN_WRITE_STATUS_MISSING');
  if (status.code !== 202) {
    throw new Error(`REMOTE_DWN_WRITE_REJECTED:${String(status.code)}:${String(status.detail ?? '')}`);
  }

  return {
    schema: 'relatte.remote-dwn-write/v0',
    crossing_id: crossingId,
    dwn_record_id: recordsWrite.message.recordId,
    tenant_did: tenantDid,
    endpoint,
    canonical_body_sha256: sha256Hex(Buffer.from(body, 'utf8')),
    dwn_status: 202,
    semantic_effect: 'none',
    laws: [
      'REMOTE STORED != RELATTE ADMITTED',
      'ROAD LOCATOR != DWN TENANT',
      'ENDPOINT != AUTHORITY',
      'DELIVERED != ADMITTED',
    ],
  };
}

export async function readCrossingFromRemoteDwn(args: {
  endpoint: string;
  tenant_did: string;
  signer: Signer;
  record_id: string;
  fetch_impl?: FetchLike;
}): Promise<RemoteDwnReadResult> {
  const tenantDid = nonEmpty(args.tenant_did, 'INVALID_REMOTE_DWN_TENANT_DID');
  const recordId = nonEmpty(args.record_id, 'INVALID_REMOTE_DWN_RECORD_ID');
  const endpoint = normalizeEndpoint(args.endpoint);

  const recordsRead = await RecordsRead.create({
    filter: { recordId },
    signer: args.signer,
  });
  const request = rpcRequest(tenantDid, recordsRead.message);
  const fetchImpl = args.fetch_impl ?? fetch;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'dwn-request': JSON.stringify(request),
    },
  });

  if (!response.ok) {
    throw new Error(`REMOTE_DWN_HTTP_READ_FAILED:${response.status}`);
  }

  const responseHeader = response.headers.get('dwn-response');
  if (!responseHeader) throw new Error('REMOTE_DWN_READ_RESPONSE_HEADER_MISSING');

  const rpc = asRecord(JSON.parse(responseHeader), 'REMOTE_DWN_READ_RPC_INVALID');
  const reply = parseJsonRpcReply(rpc, 'REMOTE_DWN_READ_RPC_FAILED');
  const status = asRecord(reply.status, 'REMOTE_DWN_READ_STATUS_MISSING');
  if (status.code !== 200) {
    throw new Error(`REMOTE_DWN_READ_REJECTED:${String(status.code)}:${String(status.detail ?? '')}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = new TextDecoder().decode(bytes);
  const parsed = asRecord(JSON.parse(body), 'INVALID_REMOTE_DWN_CROSSING_BODY');

  if (canonicalize(parsed) !== body) throw new Error('REMOTE_DWN_CROSSING_BODY_NOT_CANONICAL');
  if (!(await verifyCrossingEnvelope(parsed))) throw new Error('INVALID_REMOTE_DWN_CROSSING');

  return {
    schema: 'relatte.remote-dwn-read/v0',
    crossing: parsed,
    crossing_id: nonEmpty(parsed.crossing_id, 'INVALID_REMOTE_DWN_CROSSING_ID'),
    dwn_record_id: recordId,
    tenant_did: tenantDid,
    endpoint,
    dwn_status: 200,
    semantic_effect: 'none',
    laws: [
      'REMOTE READ != RELATTE RECEIVE',
      'REMOTE STORED != RELATTE ADMITTED',
      'ROAD LOCATOR != DWN TENANT',
      'ENDPOINT != AUTHORITY',
    ],
  };
}
