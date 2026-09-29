import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';

export const CROSSING_ID_DOMAIN = 'reLATTE-CrossingEnvelope-v0|';
export const CROSSING_SIGNATURE_DOMAIN = 'reLATTE-CrossingSignature-v0|';
export const RECEIPT_ID_DOMAIN = 'reLATTE-Receipt-v0|';
export const RECEIPT_SIGNATURE_DOMAIN = 'reLATTE-ReceiptSignature-v0|';
export const P256_ALGORITHM = 'ECDSA-P256-SHA256';
export const CROSSING_SIGNING_DOMAIN = 'relatte.crossing-signature/v0';
export const RECEIPT_SIGNING_DOMAIN = 'relatte.receipt-signature/v0';

const CROSSING_ENVELOPE_KEYS = [
  'schema',
  'crossing_id',
  'protocol_version',
  'source_particular',
  'source_world',
  'source_history_head',
  'parents',
  'declared_kind',
  'payload_refs',
  'requested_effect',
  'capability_ref',
  'privacy_policy',
  'audience_policy',
  'return_address',
  'created_at',
  'signing',
  'extensions',
] as const;

const RECEIPT_KEYS = [
  'schema',
  'receipt_id',
  'crossing_id',
  'world_id',
  'receiver_particular',
  'kind',
  'semantic_effect',
  'contract_ref',
  'pre_state_ref',
  'post_state_ref',
  'descendant_refs',
  'residual_refs',
  'note',
  'created_at',
  'signing',
  'extensions',
] as const;

const SIGNING_KEYS = ['algorithm', 'public_key', 'signature', 'domain'] as const;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function asRecord(value: unknown, code = 'INVALID_TYPE'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  code: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
}

function canonicalBase64urlBytes(value: unknown, expectedLength: number, code: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length === 0 || !BASE64URL_RE.test(value)) {
    throw new Error(code);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedLength || decoded.toString('base64url') !== value) {
    throw new Error(code);
  }
  return new Uint8Array(decoded);
}

function normalizeP256Coordinate(value: unknown): string {
  canonicalBase64urlBytes(value, 32, 'INVALID_PUBLIC_KEY');
  return value as string;
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
  assertOnlyKeys(signing, SIGNING_KEYS, 'UNEXPECTED_SIGNING_FIELD');
  const algorithm = requiredString(signing, 'algorithm');
  const domain = requiredString(signing, 'domain');
  if (algorithm !== P256_ALGORITHM) throw new Error('UNSUPPORTED_SIGNING_ALGORITHM');
  if (domain !== expectedDomain) throw new Error('INVALID_SIGNING_DOMAIN');
  const publicKey = asRecord(signing.public_key);
  if (Object.prototype.hasOwnProperty.call(publicKey, 'd')) throw new Error('PRIVATE_KEY_MATERIAL');
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256') throw new Error('INVALID_PUBLIC_KEY');
  const x = normalizeP256Coordinate(publicKey.x);
  const y = normalizeP256Coordinate(publicKey.y);
  return {
    algorithm,
    public_key: { kty: 'EC', crv: 'P-256', x, y },
    domain,
  };
}

export function constructCrossingIdentityBody(envelopeValue: unknown): Record<string, unknown> {
  const envelope = asRecord(envelopeValue);
  assertOnlyKeys(envelope, CROSSING_ENVELOPE_KEYS, 'UNEXPECTED_CROSSING_FIELD');
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
    signing: signingIdentity(envelope.signing, CROSSING_SIGNING_DOMAIN),
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
  assertOnlyKeys(receipt, RECEIPT_KEYS, 'UNEXPECTED_RECEIPT_FIELD');
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
    signing: signingIdentity(receipt.signing, RECEIPT_SIGNING_DOMAIN),
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

export interface P256KeyMaterial {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
}

function normalizedPublicJwk(value: JsonWebKey): JsonWebKey {
  if (value.d !== undefined) throw new Error('PRIVATE_KEY_MATERIAL');
  if (value.kty !== 'EC' || value.crv !== 'P-256') {
    throw new Error('INVALID_PUBLIC_KEY');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: normalizeP256Coordinate(value.x),
    y: normalizeP256Coordinate(value.y),
  };
}

export async function generateP256KeyPair(): Promise<P256KeyMaterial> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyJwk: normalizedPublicJwk(exported),
  };
}

function base64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString('base64url');
}

function toWebCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  return canonicalBase64urlBytes(value, 64, 'INVALID_SIGNATURE');
}

async function signBytes(privateKey: CryptoKey, bytes: Uint8Array): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    toWebCryptoBytes(bytes),
  );
  return base64url(signature);
}

async function importVerificationKey(publicKeyValue: unknown): Promise<CryptoKey> {
  const identity = signingIdentity({
    algorithm: P256_ALGORITHM,
    public_key: publicKeyValue,
    signature: 'not-used',
    domain: CROSSING_SIGNING_DOMAIN,
  }, CROSSING_SIGNING_DOMAIN);
  return crypto.subtle.importKey(
    'jwk',
    identity.public_key as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

function withoutKeys(value: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!keys.includes(key)) copy[key] = entry;
  }
  return copy;
}

export async function sealCrossingEnvelope(
  draftValue: unknown,
  keys: P256KeyMaterial,
): Promise<Record<string, any>> {
  const draft = withoutKeys(asRecord(draftValue), ['crossing_id', 'signing']);
  const publicKey = normalizedPublicJwk(keys.publicKeyJwk);
  const envelope: Record<string, any> = {
    ...draft,
    crossing_id: 'pending',
    signing: {
      algorithm: P256_ALGORITHM,
      public_key: publicKey,
      signature: 'pending',
      domain: CROSSING_SIGNING_DOMAIN,
    },
  };
  envelope.crossing_id = computeCrossingId(envelope);
  envelope.signing.signature = await signBytes(keys.privateKey, crossingSignatureBytes(envelope));
  return envelope;
}

export async function verifyCrossingEnvelope(envelopeValue: unknown): Promise<boolean> {
  try {
    const envelope = asRecord(envelopeValue);
    if (typeof envelope.crossing_id !== 'string' || envelope.crossing_id !== computeCrossingId(envelope)) return false;
    const signing = asRecord(envelope.signing);
    if (signing.algorithm !== P256_ALGORITHM || signing.domain !== CROSSING_SIGNING_DOMAIN) return false;
    const key = await importVerificationKey(signing.public_key);
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64url(requiredString(signing, 'signature')),
      toWebCryptoBytes(crossingSignatureBytes(envelope)),
    );
  } catch {
    return false;
  }
}

export async function sealReceipt(
  draftValue: unknown,
  keys: P256KeyMaterial,
): Promise<Record<string, any>> {
  const draft = withoutKeys(asRecord(draftValue), ['receipt_id', 'signing']);
  const publicKey = normalizedPublicJwk(keys.publicKeyJwk);
  const receipt: Record<string, any> = {
    ...draft,
    receipt_id: 'pending',
    signing: {
      algorithm: P256_ALGORITHM,
      public_key: publicKey,
      signature: 'pending',
      domain: RECEIPT_SIGNING_DOMAIN,
    },
  };
  receipt.receipt_id = computeReceiptId(receipt);
  receipt.signing.signature = await signBytes(keys.privateKey, receiptSignatureBytes(receipt));
  return receipt;
}

export async function verifyReceipt(receiptValue: unknown): Promise<boolean> {
  try {
    const receipt = asRecord(receiptValue);
    if (typeof receipt.receipt_id !== 'string' || receipt.receipt_id !== computeReceiptId(receipt)) return false;
    const signing = asRecord(receipt.signing);
    if (signing.algorithm !== P256_ALGORITHM || signing.domain !== RECEIPT_SIGNING_DOMAIN) return false;
    const identity = signingIdentity({
      algorithm: P256_ALGORITHM,
      public_key: signing.public_key,
      signature: 'not-used',
      domain: RECEIPT_SIGNING_DOMAIN,
    }, RECEIPT_SIGNING_DOMAIN);
    const key = await crypto.subtle.importKey(
      'jwk',
      identity.public_key as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64url(requiredString(signing, 'signature')),
      toWebCryptoBytes(receiptSignatureBytes(receipt)),
    );
  } catch {
    return false;
  }
}
