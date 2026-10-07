/** WEBZ-003: a destination-side process inspects actual transported bytes.
 *
 * The carrier contains a signed crossing and literal base64 bytes. No sender
 * source-file path or claimed digest is trusted; payload SHA-256 is verified
 * against the signed crossing before the receiver seals its own custody receipt.
 *
 * This is local file transport, not proof of separate hardware/accounts.
 */
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { sha256Hex, validateTimestamp } from './canonical.ts';
import { verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';
import { LocalReceiver } from './receiver.ts';

export const MATERIAL_DELIVERY_SCHEMA = 'relatte.material-delivery/v0';

function record(value: unknown, code: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string,any>;
}

function keys(value: Record<string, any>, expected: string[], code: string): void {
  if (Object.keys(value).length !== expected.length ||
      !expected.every((key) => Object.hasOwn(value,key))) throw new Error(code);
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

async function readCarrier(path: string): Promise<Record<string,any>> {
  if (!isAbsolute(path)) throw new Error('CARRIER_PATH_NOT_ABSOLUTE');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 110_000) {
    throw new Error('CARRIER_NOT_REGULAR_BOUNDED_FILE');
  }
  const text = await readFile(path, 'utf8');
  if (Buffer.byteLength(text, 'utf8') > 110_000) throw new Error('CARRIER_TOO_LARGE');
  const carrier = record(JSON.parse(text), 'INVALID_MATERIAL_CARRIER');
  keys(carrier,['schema','crossing','payload_base64'],'UNEXPECTED_MATERIAL_CARRIER_FIELD');
  if (carrier.schema !== 'webz.material-carrier/v0') throw new Error('INVALID_MATERIAL_CARRIER_SCHEMA');
  return carrier;
}

export async function receiveMaterialDelivery(value: unknown): Promise<Record<string,any>> {
  const request = record(value,'INVALID_DELIVERY_REQUEST');
  keys(
    request,
    ['schema','carrier_path','receiver_root','expected_crossing_id','created_at'],
    'UNEXPECTED_DELIVERY_REQUEST_FIELD',
  );
  if (request.schema !== MATERIAL_DELIVERY_SCHEMA) throw new Error('INVALID_DELIVERY_SCHEMA');
  const carrierPath=nonEmpty(request.carrier_path,'INVALID_CARRIER_PATH');
  const receiverRoot=nonEmpty(request.receiver_root,'INVALID_RECEIVER_ROOT');
  const expectedCrossing=nonEmpty(request.expected_crossing_id,'INVALID_CROSSING_ID');
  if (!isAbsolute(receiverRoot) || !/^relatte-crossing-v0:[a-f0-9]{64}$/.test(expectedCrossing)) {
    throw new Error('INVALID_RECEIVER_PATH_OR_CROSSING');
  }
  const createdAt=nonEmpty(request.created_at,'INVALID_DELIVERY_TIME');
  validateTimestamp(createdAt);

  // A separate destination-side process obtains bytes from the carrier file.
  // It does not read Workbench's first-party fixture or source staging path.
  const carrier = await readCarrier(carrierPath);
  const crossing = record(carrier.crossing,'MISSING_SIGNED_CROSSING');
  if (crossing.crossing_id !== expectedCrossing || !(await verifyCrossingEnvelope(crossing))) {
    throw new Error('UNVERIFIED_CARRIER_CROSSING');
  }
  const encoded=nonEmpty(carrier.payload_base64,'MISSING_MATERIAL_BYTES');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('NONCANONICAL_MATERIAL_BASE64');
  }
  const bytes=Buffer.from(encoded,'base64');
  if (bytes.length === 0 || bytes.length > 65536 ||
      bytes.toString('base64') !== encoded) throw new Error('UNSUPPORTED_MATERIAL_BYTES');
  const digest=sha256Hex(bytes);
  if (!Array.isArray(crossing.payload_refs) ||
      !crossing.payload_refs.some((ref: unknown) =>
        typeof ref === 'object' && ref !== null && !Array.isArray(ref) &&
        (ref as Record<string,unknown>).address === 'sha256:'+digest)) {
    throw new Error('MATERIAL_BYTES_NOT_BOUND_TO_SIGNED_CROSSING');
  }
  const receiver = await LocalReceiver.open(receiverRoot);
  const received = receiver.getReceiveReceipt(expectedCrossing);
  const disposed = receiver.getDispositionReceipt(expectedCrossing);
  if (!received || !disposed ||
      received.crossing_id !== expectedCrossing || disposed.crossing_id !== expectedCrossing ||
      received.world_id !== receiver.config.world_id || disposed.world_id !== receiver.config.world_id ||
      !(await verifyReceipt(received)) || !(await verifyReceipt(disposed)) ||
      !['R3_HOLD','R3_REFUSE'].includes(disposed.kind)) {
    throw new Error('UNVERIFIED_RECEIVER_LOCAL_DISPOSITION');
  }
  const custody = await receiver.verifyPayloadBytes(expectedCrossing,bytes,createdAt);
  if (!(await verifyReceipt(custody)) ||
      custody.signing?.public_key?.x !== disposed.signing?.public_key?.x ||
      custody.signing?.public_key?.y !== disposed.signing?.public_key?.y) {
    throw new Error('CUSTODY_NOT_SIGNED_BY_RECEIVER');
  }
  // Cold receiver replay independently verifies retained bytes and journal.
  const replayed = await LocalReceiver.open(receiverRoot);
  if (replayed.getPayloadCustodyReceipt(expectedCrossing)?.receipt_id !== custody.receipt_id) {
    throw new Error('CUSTODY_NOT_DURABLE_ON_COLD_REPLAY');
  }
  return {
    schema:'relatte.material-delivery-result/v0',
    crossing_id:expectedCrossing,
    receiver_world_id:receiver.config.world_id,
    payload_sha256:digest,
    received_byte_length:bytes.length,
    receiver_disposition:disposed.kind,
    retained:custody.extensions.local_receiver.payload_custody.retained,
    receive_receipt:received,
    disposition_receipt:disposed,
    custody_receipt:custody,
    receiver_snapshot:replayed.snapshot(),
    witness_scope:'destination-process-observed-exact-carrier-bytes;receiver-key-signed;local-filesystem-only',
    laws:[
      'SIGNED REF != BYTE CUSTODY',
      'BYTES VERIFIED != ADMITTED',
      'REFUSE != RETAIN',
      'CARRIER != AUTHORITY',
    ],
  };
}
