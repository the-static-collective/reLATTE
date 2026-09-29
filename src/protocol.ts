import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';

export const CROSSING_ID_DOMAIN = 'reLATTE-CrossingEnvelope-v0|';
export const CROSSING_SIGNATURE_DOMAIN = 'reLATTE-CrossingSignature-v0|';
export const RECEIPT_ID_DOMAIN = 'reLATTE-Receipt-v0|';
export const RECEIPT_SIGNATURE_DOMAIN = 'reLATTE-ReceiptSignature-v0|';
export const P256_ALGORITHM = 'ECDSA-P256-SHA256';

function asRecord(value: unknown, code = 'INVALID_TYPE'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function requiredString(object: Record<string, unknown>, key: string): string {
  if (!Object.prototype.hasOwnProperty.call(object, key) || typeof object[key] !== 'string' || object[key] === '') {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return object[key] as string;
}

function requiredArray(object: Record<string, unknown>, key: string): unknown[] {
  if (!Object.prototype.hasOwnProperty.call(object, key) || !Array.isArray(object[key])) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return object[key] as unknown[];
}

function normalizeNullable(object: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : null;
}

function normalizeArray(object: Record<string, unknown>, key: string): unknown[] {
  return Object.prototype.hasOwnProperty.call(object, key) ? requiredArray(object, key) : [];
}

function normalizeObject(object: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.prototype.hasOwnProperty.call(object, key) ? asRecord(object[key]) : {};
}

function signingIdentity(signingValue: unknown, expectedDomain: string): Record<string, unknown> {
  const signing = asRecord(signingValue);
  const algorithm = requiredString(signing, 'algorithm');
  const domain = requiredString(signing, 'domain');
  if (algorithm !== P256_ALGORITHM) throw new Error('UNSUPPORTED_SIGNING_ALGORITHM');
  if (domain !== expectedDomain) throw new Error('INVALID_SIGNING_DOMAIN');
  const publicKey = asRecord(signing.public_key);
  if (Object.prototype.hasOwnProperty.call(publicKey, 'd')) throw new Error('PRIVATE_KEY_MATERIAL');
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256') throw new Error('INVALID_PUBLIC_KEY');
  if (typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string') throw new Error('INVALID_PUBLIC_KEY');
  return {
    algorithm,
    public_key: publicKey,
    domain,
  };
}

export function constructCrossingIdentityBody(envelopeValue: unknown): Record<string, unknown> {
  const envelope = asRecord(envelopeValue);
  if (envelope.schema !== 'relatte.crossing-envelope/v0') throw new Error('INVALID_SCHEMA');
  if (envelope.protocol_version !== '0') throw new Error('INVALID_PROTOCOL_VERSION');
  const createdAt = requiredString(envelope, 'created_at');
  validateTimestamp(createdAt);
  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: requiredString(envelope, 'source_particular'),
    source_world: requiredString(envelope, 'source_world'),
    source_history_head: normalizeNullable(envelope, 'source_history_head'),
    parents: normalizeArray(envelope, 'parents'),
    declared_kind: requiredString(envelope, 'declared_kind'),
    payload_refs: requiredArray(envelope, 'payload_refs'),
    requested_effect: normalizeNullable(envelope, 'requested_effect'),
    capability_ref: normalizeNullable(envelope, 'capability_ref'),
    privacy_policy: normalizeNullable(envelope, 'privacy_policy'),
    audience_policy: normalizeNullable(envelope, 'audience_policy'),
    return_address: normalizeNullable(envelope, 'return_address'),
    created_at: createdAt,
    signing: signingIdentity(envelope.signing, 'relatte.crossing-signature/v0'),
    extensions: normalizeObject(envelope, 'extensions'),
  };
}

export function computeCrossingId(envelope: unknown): string {
  const bytes = canonicalizeDomainValue(CROSSING_ID_DOMAIN, constructCrossingIdentityBody(envelope));
  return `relatte-crossing-v0:${sha256Hex(bytes)}`;
}

export function crossingSignatureBytes(envelope: unknown): Buffer {
  const body = constructCrossingIdentityBody(envelope);
  return canonicalizeDomainValue(CROSSING_SIGNATURE_DOMAIN, {
    crossing_id: computeCrossingId(envelope),
    ...body,
  });
}

export function constructReceiptIdentityBody(receiptValue: unknown): Record<string, unknown> {
  const receipt = asRecord(receiptValue);
  if (receipt.schema !== 'relatte.receipt/v0') throw new Error('INVALID_SCHEMA');
  const createdAt = requiredString(receipt, 'created_at');
  validateTimestamp(createdAt);
  return {
    schema: 'relatte.receipt/v0',
    crossing_id: requiredString(receipt, 'crossing_id'),
    world_id: requiredString(receipt, 'world_id'),
    receiver_particular: requiredString(receipt, 'receiver_particular'),
    kind: requiredString(receipt, 'kind'),
    semantic_effect: requiredString(receipt, 'semantic_effect'),
    contract_ref: normalizeNullable(receipt, 'contract_ref'),
    pre_state_ref: normalizeNullable(receipt, 'pre_state_ref'),
    post_state_ref: normalizeNullable(receipt, 'post_state_ref'),
    descendant_refs: normalizeArray(receipt, 'descendant_refs'),
    residual_refs: normalizeArray(receipt, 'residual_refs'),
    note: normalizeNullable(receipt, 'note'),
    created_at: createdAt,
    signing: signingIdentity(receipt.signing, 'relatte.receipt-signature/v0'),
    extensions: normalizeObject(receipt, 'extensions'),
  };
}

export function computeReceiptId(receipt: unknown): string {
  const bytes = canonicalizeDomainValue(RECEIPT_ID_DOMAIN, constructReceiptIdentityBody(receipt));
  return `relatte-receipt-v0:${sha256Hex(bytes)}`;
}

export function receiptSignatureBytes(receipt: unknown): Buffer {
  const body = constructReceiptIdentityBody(receipt);
  return canonicalizeDomainValue(RECEIPT_SIGNATURE_DOMAIN, {
    receipt_id: computeReceiptId(receipt),
    ...body,
  });
}
