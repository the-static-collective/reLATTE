import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { LocalReceiver } from './receiver.ts';
import type { LocalDisposition } from './receiver.ts';
import {
  generateP256KeyPair,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import {
  sealOpaqueOrganCrossing,
  verifyOpaqueOrganCrossing,
} from './organ.ts';
import {
  makeTransportFrame,
  readFileBundle,
  writeFileBundle,
} from './transport.ts';

export const OPAQUE_ROUNDTRIP_REQUEST_DOMAIN =
  'reLATTE-OpaqueRoundTripRequest-v0|';

export interface OpaqueRoundTripReceiver {
  world_id: string;
  receiver_particular: string;
  contract_ref: string;
}

export interface OpaqueRoundTripRequest {
  schema: 'relatte.opaque-roundtrip-request/v0';
  spec: unknown;
  receiver_root: string;
  receiver: OpaqueRoundTripReceiver;
  bundle_path: string;
  result_path: string;
  disposition: LocalDisposition;
  transport_created_at: string;
  received_at: string;
  disposed_at: string;
  route_note: string;
}

export interface OpaqueRoundTripResult {
  schema: 'relatte.opaque-roundtrip-result/v0';
  request_id: string;
  crossing: Record<string, any>;
  transport_frame: Record<string, any>;
  receive_receipt: Record<string, any>;
  disposition_receipt: Record<string, any>;
  receiver_snapshot: Record<string, any>;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function normalizeReceiver(value: unknown): OpaqueRoundTripReceiver {
  const receiver = asRecord(value, 'INVALID_ROUNDTRIP_RECEIVER');
  return {
    world_id: nonEmpty(receiver.world_id, 'INVALID_ROUNDTRIP_WORLD'),
    receiver_particular: nonEmpty(
      receiver.receiver_particular,
      'INVALID_ROUNDTRIP_RECEIVER_PARTICULAR',
    ),
    contract_ref: nonEmpty(
      receiver.contract_ref,
      'INVALID_ROUNDTRIP_CONTRACT',
    ),
  };
}

function normalizeDisposition(value: unknown): LocalDisposition {
  if (
    value !== 'HOLD' &&
    value !== 'ADMIT' &&
    value !== 'REFUSE' &&
    value !== 'RETURN'
  ) {
    throw new Error('INVALID_ROUNDTRIP_DISPOSITION');
  }
  return value;
}

function normalizeRequest(value: unknown): OpaqueRoundTripRequest {
  const request = asRecord(value, 'INVALID_ROUNDTRIP_REQUEST');
  if (request.schema !== 'relatte.opaque-roundtrip-request/v0') {
    throw new Error('INVALID_ROUNDTRIP_REQUEST_SCHEMA');
  }
  return {
    schema: 'relatte.opaque-roundtrip-request/v0',
    spec: structuredClone(request.spec),
    receiver_root: nonEmpty(
      request.receiver_root,
      'INVALID_ROUNDTRIP_RECEIVER_ROOT',
    ),
    receiver: normalizeReceiver(request.receiver),
    bundle_path: nonEmpty(
      request.bundle_path,
      'INVALID_ROUNDTRIP_BUNDLE_PATH',
    ),
    result_path: nonEmpty(
      request.result_path,
      'INVALID_ROUNDTRIP_RESULT_PATH',
    ),
    disposition: normalizeDisposition(request.disposition),
    transport_created_at: nonEmpty(
      request.transport_created_at,
      'INVALID_ROUNDTRIP_TRANSPORT_TIME',
    ),
    received_at: nonEmpty(
      request.received_at,
      'INVALID_ROUNDTRIP_RECEIVED_TIME',
    ),
    disposed_at: nonEmpty(
      request.disposed_at,
      'INVALID_ROUNDTRIP_DISPOSED_TIME',
    ),
    route_note: nonEmpty(
      request.route_note,
      'INVALID_ROUNDTRIP_ROUTE_NOTE',
    ),
  };
}

function requestIdentity(request: OpaqueRoundTripRequest): Record<string, unknown> {
  return {
    schema: request.schema,
    spec: request.spec,
    receiver: request.receiver,
    disposition: request.disposition,
    transport_created_at: request.transport_created_at,
    received_at: request.received_at,
    disposed_at: request.disposed_at,
    route_note: request.route_note,
  };
}

export function computeOpaqueRoundTripRequestId(value: unknown): string {
  const request = normalizeRequest(value);
  return `relatte-opaque-roundtrip-v0:${sha256Hex(
    canonicalizeDomainValue(
      OPAQUE_ROUNDTRIP_REQUEST_DOMAIN,
      requestIdentity(request),
    ),
  )}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function verifyStoredResult(
  value: unknown,
  expectedRequestId: string,
): Promise<OpaqueRoundTripResult> {
  const result = asRecord(value, 'INVALID_STORED_ROUNDTRIP_RESULT');
  if (result.schema !== 'relatte.opaque-roundtrip-result/v0') {
    throw new Error('INVALID_STORED_ROUNDTRIP_SCHEMA');
  }
  if (result.request_id !== expectedRequestId) {
    throw new Error('ROUNDTRIP_RESULT_REQUEST_MISMATCH');
  }
  if (!(await verifyOpaqueOrganCrossing(result.crossing))) {
    throw new Error('INVALID_STORED_ROUNDTRIP_CROSSING');
  }
  if (!(await verifyReceipt(result.receive_receipt))) {
    throw new Error('INVALID_STORED_ROUNDTRIP_RECEIVE_RECEIPT');
  }
  if (!(await verifyReceipt(result.disposition_receipt))) {
    throw new Error('INVALID_STORED_ROUNDTRIP_DISPOSITION_RECEIPT');
  }
  return result as OpaqueRoundTripResult;
}

async function receiverFor(
  root: string,
  expected: OpaqueRoundTripReceiver,
): Promise<LocalReceiver> {
  const receiver = await exists(root)
    ? await LocalReceiver.open(root)
    : await LocalReceiver.create(root, expected);

  if (
    receiver.config.world_id !== expected.world_id ||
    receiver.config.receiver_particular !== expected.receiver_particular ||
    receiver.config.contract_ref !== expected.contract_ref
  ) {
    throw new Error('ROUNDTRIP_RECEIVER_CONFIG_MISMATCH');
  }
  return receiver;
}

async function durableResult(
  path: string,
  result: OpaqueRoundTripResult,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8');
  await rename(temporary, path);
}

export async function runOpaqueOrganRoundTrip(
  value: unknown,
): Promise<OpaqueRoundTripResult> {
  const request = normalizeRequest(value);
  const requestId = computeOpaqueRoundTripRequestId(request);

  if (await exists(request.result_path)) {
    return verifyStoredResult(
      JSON.parse(await readFile(request.result_path, 'utf8')),
      requestId,
    );
  }

  const crossing = await sealOpaqueOrganCrossing(
    request.spec,
    await generateP256KeyPair(),
  );
  if (!(await verifyCrossingEnvelope(crossing))) {
    throw new Error('ROUNDTRIP_CROSSING_DID_NOT_VERIFY');
  }

  const frame = await makeTransportFrame(
    crossing,
    'file-bundle',
    request.transport_created_at,
    request.route_note,
  );
  await mkdir(dirname(request.bundle_path), { recursive: true });
  await writeFileBundle(request.bundle_path, frame);
  const delivered = await readFileBundle(request.bundle_path);

  const receiver = await receiverFor(request.receiver_root, request.receiver);
  const receiveReceipt = await receiver.receive(
    delivered.crossing,
    request.received_at,
  );
  const dispositionReceipt = await receiver.dispose(
    crossing.crossing_id,
    request.disposition,
    request.disposed_at,
  );

  const result: OpaqueRoundTripResult = {
    schema: 'relatte.opaque-roundtrip-result/v0',
    request_id: requestId,
    crossing,
    transport_frame: frame,
    receive_receipt: receiveReceipt,
    disposition_receipt: dispositionReceipt,
    receiver_snapshot: receiver.snapshot(),
    laws: [
      'DONOR SEMANTICS != SUBSTRATE SEMANTICS',
      'TRANSPORT != CROSSING',
      'DELIVERY != ADMISSION',
      'RECEIVED != ADMITTED',
      'DISPOSITION IS RECEIVER-LOCAL',
    ],
  };

  await durableResult(request.result_path, result);
  return result;
}
