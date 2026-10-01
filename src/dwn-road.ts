import {
  DataStream,
  RecordsRead,
  RecordsWrite,
  type Dwn,
  type Signer,
} from '@tbd54566975/dwn-sdk-js';

import { canonicalize, sha256Hex } from './canonical.ts';
import { verifyCrossingEnvelope } from './protocol.ts';

export const RELATTE_DWN_MEDIA_TYPE = 'application/vnd.relatte.crossing+json';

export interface DwnRoadWriteResult {
  schema: 'relatte.dwn-road-write/v0';
  crossing_id: string;
  dwn_record_id: string;
  tenant_did: string;
  canonical_body_sha256: string;
  dwn_status: number;
  semantic_effect: 'none';
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

export async function writeCrossingToDwn(args: {
  dwn: Dwn;
  tenant_did: string;
  signer: Signer;
  crossing: unknown;
}): Promise<DwnRoadWriteResult> {
  if (!(await verifyCrossingEnvelope(args.crossing))) throw new Error('INVALID_DWN_CROSSING');

  const crossing = asRecord(args.crossing, 'INVALID_DWN_CROSSING');
  const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_DWN_CROSSING_ID');
  const tenantDid = nonEmpty(args.tenant_did, 'INVALID_DWN_TENANT_DID');
  const body = canonicalize(crossing);
  const data = new TextEncoder().encode(body);

  const recordsWrite = await RecordsWrite.create({
    data,
    dataFormat: RELATTE_DWN_MEDIA_TYPE,
    published: false,
    signer: args.signer,
  });

  const reply = await args.dwn.processMessage(
    tenantDid,
    recordsWrite.message,
    { dataStream: DataStream.fromBytes(data) },
  );

  if (reply.status.code !== 202) {
    throw new Error(`DWN_WRITE_REJECTED:${reply.status.code}:${reply.status.detail}`);
  }

  return {
    schema: 'relatte.dwn-road-write/v0',
    crossing_id: crossingId,
    dwn_record_id: recordsWrite.message.recordId,
    tenant_did: tenantDid,
    canonical_body_sha256: sha256Hex(Buffer.from(body, 'utf8')),
    dwn_status: reply.status.code,
    semantic_effect: 'none',
    laws: [
      'DWN RECORD != CROSSING',
      'DWN ACCEPTED != RELATTE ADMITTED',
      'STORAGE PERMISSION != SEMANTIC AUTHORITY',
      'ROAD CHANGE != IDENTITY CHANGE',
    ],
  };
}

export async function readCrossingFromDwn(args: {
  dwn: Dwn;
  tenant_did: string;
  signer: Signer;
  record_id: string;
}): Promise<Record<string, any>> {
  const tenantDid = nonEmpty(args.tenant_did, 'INVALID_DWN_TENANT_DID');
  const recordId = nonEmpty(args.record_id, 'INVALID_DWN_RECORD_ID');

  const recordsRead = await RecordsRead.create({
    filter: { recordId },
    signer: args.signer,
  });

  const reply = await args.dwn.processMessage(tenantDid, recordsRead.message);
  if (reply.status.code !== 200 || !reply.entry?.data) {
    throw new Error(`DWN_READ_FAILED:${reply.status.code}:${reply.status.detail}`);
  }

  const bytes = await DataStream.toBytes(reply.entry.data);
  const body = new TextDecoder().decode(bytes);
  const parsed = asRecord(JSON.parse(body), 'INVALID_DWN_CROSSING_BODY');

  if (canonicalize(parsed) !== body) throw new Error('DWN_CROSSING_BODY_NOT_CANONICAL');
  if (!(await verifyCrossingEnvelope(parsed))) throw new Error('INVALID_DWN_CROSSING');
  return parsed;
}
