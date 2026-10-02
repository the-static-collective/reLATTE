import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  encryptPayloadForRecipient,
  type EncryptedPayloadEnvelope,
  type EncryptionOrgan,
} from './encrypted-payload.ts';
import {
  generateP256KeyPair,
  verifyCrossingEnvelope,
  type P256KeyMaterial,
} from './protocol.ts';
import type { ReLatteRuntime, RuntimePulseResult } from './runtime.ts';

export const RETURN_ENVELOPE_ID_DOMAIN = 'reLATTE-ReturnEnvelope-v0|';
export const RETURN_KEY_MEDIA_TYPE = 'application/vnd.relatte.return-key+json';
export const RETURN_KEY_DECLARED_KIND = 'RETURN_KEY';

export interface ReturnEnvelope {
  schema: 'relatte.return-envelope/v0';
  return_envelope_id: string;
  parent_crossing_id: string;
  return_world: string;
  recipient_world: string;
  reply_kind: string;
  reply_capability_id: string;
  reply_public_key: JsonWebKey;
  source_encryption_key_id: string;
  source_encryption_public_key: JsonWebKey;
  encrypted_reply_private_key: EncryptedPayloadEnvelope;
  created_at: string;
  expires_at: string;
  max_replies: 1;
  laws: string[];
}

export interface OpenedReturnEnvelope {
  envelope: ReturnEnvelope;
  reply_keys: P256KeyMaterial;
}

export interface AcceptedReturnResponse {
  schema: 'relatte.return-response-acceptance/v0';
  return_envelope_id: string;
  response_crossing_id: string;
  queue_item_id: string;
  receive_receipt_id: string | null;
  revocation_id: string;
  pulse: RuntimePulseResult;
  semantic_effect: 'none';
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

function normalizePublicJwk(value: unknown, code: string): JsonWebKey {
  const jwk = asRecord(value, code);
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    Object.prototype.hasOwnProperty.call(jwk, 'd')
  ) {
    throw new Error(code);
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
  };
}

function samePublicJwk(a: unknown, b: unknown): boolean {
  try {
    const aa = normalizePublicJwk(a, 'INVALID_RETURN_PUBLIC_KEY');
    const bb = normalizePublicJwk(b, 'INVALID_RETURN_PUBLIC_KEY');
    return aa.kty === bb.kty && aa.crv === bb.crv && aa.x === bb.x && aa.y === bb.y;
  } catch {
    return false;
  }
}

function compareTime(a: string, b: string): number {
  validateTimestamp(a);
  validateTimestamp(b);
  return Date.parse(a) - Date.parse(b);
}

function identityBody(
  value: Omit<ReturnEnvelope, 'return_envelope_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    parent_crossing_id: value.parent_crossing_id,
    return_world: value.return_world,
    recipient_world: value.recipient_world,
    reply_kind: value.reply_kind,
    reply_capability_id: value.reply_capability_id,
    reply_public_key: normalizePublicJwk(
      value.reply_public_key,
      'INVALID_RETURN_REPLY_PUBLIC_KEY',
    ),
    source_encryption_key_id: value.source_encryption_key_id,
    source_encryption_public_key: normalizePublicJwk(
      value.source_encryption_public_key,
      'INVALID_RETURN_SOURCE_ENCRYPTION_KEY',
    ),
    encrypted_reply_private_key: value.encrypted_reply_private_key,
    created_at: value.created_at,
    expires_at: value.expires_at,
    max_replies: 1,
    laws: [...value.laws],
  };
}

function returnEnvelopeId(
  body: Omit<ReturnEnvelope, 'return_envelope_id'>,
): string {
  return `relatte-return-envelope-v0:${sha256Hex(
    canonicalizeDomainValue(RETURN_ENVELOPE_ID_DOMAIN, identityBody(body))
  )}`;
}

function normalizeReturnEnvelope(value: unknown): ReturnEnvelope {
  const envelope = asRecord(value, 'INVALID_RETURN_ENVELOPE');
  if (envelope.schema !== 'relatte.return-envelope/v0') {
    throw new Error('INVALID_RETURN_ENVELOPE_SCHEMA');
  }
  if (envelope.max_replies !== 1) {
    throw new Error('RETURN_ENVELOPE_MAX_REPLIES_MUST_BE_ONE');
  }
  const createdAt = nonEmpty(
    envelope.created_at,
    'INVALID_RETURN_ENVELOPE_CREATED_AT',
  );
  const expiresAt = nonEmpty(
    envelope.expires_at,
    'INVALID_RETURN_ENVELOPE_EXPIRES_AT',
  );
  validateTimestamp(createdAt);
  validateTimestamp(expiresAt);
  if (compareTime(expiresAt, createdAt) <= 0) {
    throw new Error('INVALID_RETURN_ENVELOPE_WINDOW');
  }

  const body: Omit<ReturnEnvelope, 'return_envelope_id'> = {
    schema: 'relatte.return-envelope/v0',
    parent_crossing_id: nonEmpty(
      envelope.parent_crossing_id,
      'INVALID_RETURN_PARENT_CROSSING',
    ),
    return_world: nonEmpty(
      envelope.return_world,
      'INVALID_RETURN_WORLD',
    ),
    recipient_world: nonEmpty(
      envelope.recipient_world,
      'INVALID_RETURN_RECIPIENT_WORLD',
    ),
    reply_kind: nonEmpty(
      envelope.reply_kind,
      'INVALID_RETURN_REPLY_KIND',
    ),
    reply_capability_id: nonEmpty(
      envelope.reply_capability_id,
      'INVALID_RETURN_CAPABILITY',
    ),
    reply_public_key: normalizePublicJwk(
      envelope.reply_public_key,
      'INVALID_RETURN_REPLY_PUBLIC_KEY',
    ),
    source_encryption_key_id: nonEmpty(
      envelope.source_encryption_key_id,
      'INVALID_RETURN_SOURCE_ENCRYPTION_KEY_ID',
    ),
    source_encryption_public_key: normalizePublicJwk(
      envelope.source_encryption_public_key,
      'INVALID_RETURN_SOURCE_ENCRYPTION_KEY',
    ),
    encrypted_reply_private_key: envelope.encrypted_reply_private_key,
    created_at: createdAt,
    expires_at: expiresAt,
    max_replies: 1,
    laws: Array.isArray(envelope.laws) ? [...envelope.laws] : [],
  };

  const expected = returnEnvelopeId(body);
  if (envelope.return_envelope_id !== expected) {
    throw new Error('RETURN_ENVELOPE_ID_MISMATCH');
  }
  return {
    ...body,
    return_envelope_id: expected,
  };
}

export async function createReturnEnvelope(args: {
  source_runtime: ReLatteRuntime;
  parent_crossing_id: string;
  recipient_world: string;
  recipient_encryption_public_key: JsonWebKey;
  reply_kind: string;
  created_at: string;
  expires_at: string;
}): Promise<ReturnEnvelope> {
  validateTimestamp(args.created_at);
  validateTimestamp(args.expires_at);
  if (compareTime(args.expires_at, args.created_at) <= 0) {
    throw new Error('INVALID_RETURN_ENVELOPE_WINDOW');
  }

  const replyKeys = await generateP256KeyPair();
  const grant =
    await args.source_runtime.capabilityKernel.issueReceiveCapability({
      holder_public_key: replyKeys.publicKeyJwk,
      declared_kind: nonEmpty(args.reply_kind, 'INVALID_RETURN_REPLY_KIND'),
      not_before: args.created_at,
      expires_at: args.expires_at,
      created_at: args.created_at,
    });

  const privateJwk = await crypto.subtle.exportKey(
    'jwk',
    replyKeys.privateKey,
  );
  const keyPayload = new TextEncoder().encode(JSON.stringify({
    schema: 'relatte.delegated-return-key/v0',
    capability_id: grant.capability_id,
    reply_public_key: replyKeys.publicKeyJwk,
    reply_private_key: privateJwk,
  }));

  const encryptedReplyKey = await encryptPayloadForRecipient({
    plaintext: keyPayload,
    recipient_public_key: args.recipient_encryption_public_key,
    context: {
      target_world: nonEmpty(
        args.recipient_world,
        'INVALID_RETURN_RECIPIENT_WORLD',
      ),
      capability_id: grant.capability_id,
      declared_kind: RETURN_KEY_DECLARED_KIND,
      media_type: RETURN_KEY_MEDIA_TYPE,
    },
  });

  const body: Omit<ReturnEnvelope, 'return_envelope_id'> = {
    schema: 'relatte.return-envelope/v0',
    parent_crossing_id: nonEmpty(
      args.parent_crossing_id,
      'INVALID_RETURN_PARENT_CROSSING',
    ),
    return_world: args.source_runtime.manifest.world_id,
    recipient_world: args.recipient_world,
    reply_kind: args.reply_kind,
    reply_capability_id: grant.capability_id,
    reply_public_key: normalizePublicJwk(
      replyKeys.publicKeyJwk,
      'INVALID_RETURN_REPLY_PUBLIC_KEY',
    ),
    source_encryption_key_id: args.source_runtime.encryption.key_id,
    source_encryption_public_key:
      args.source_runtime.encryption.public_key_jwk,
    encrypted_reply_private_key: encryptedReplyKey,
    created_at: args.created_at,
    expires_at: args.expires_at,
    max_replies: 1,
    laws: [
      'RETURN INVITATION != ADMISSION',
      'RETURN KEY != DESTINATION IDENTITY',
      'DELEGATED REPLY KEY != HUMAN IDENTITY',
      'ONE REPLY DOOR != SHARED SESSION',
      'RETURN CAPABILITY != UNIVERSAL PERMISSION',
    ],
  };
  return {
    ...body,
    return_envelope_id: returnEnvelopeId(body),
  };
}

export async function openReturnEnvelope(args: {
  envelope: unknown;
  encryption: EncryptionOrgan;
  observed_at: string;
}): Promise<OpenedReturnEnvelope> {
  const envelope = normalizeReturnEnvelope(args.envelope);
  validateTimestamp(args.observed_at);

  if (compareTime(args.observed_at, envelope.expires_at) >= 0) {
    throw new Error('RETURN_ENVELOPE_EXPIRED');
  }
  if (envelope.recipient_world !== args.encryption.world_id) {
    throw new Error('RETURN_ENVELOPE_WRONG_RECIPIENT_WORLD');
  }

  const opened = await args.encryption.decrypt(
    envelope.encrypted_reply_private_key,
  );
  const payload = asRecord(
    JSON.parse(new TextDecoder().decode(opened.plaintext)),
    'INVALID_RETURN_KEY_PAYLOAD',
  );
  if (payload.schema !== 'relatte.delegated-return-key/v0') {
    throw new Error('INVALID_RETURN_KEY_SCHEMA');
  }
  if (payload.capability_id !== envelope.reply_capability_id) {
    throw new Error('RETURN_KEY_CAPABILITY_MISMATCH');
  }
  if (!samePublicJwk(payload.reply_public_key, envelope.reply_public_key)) {
    throw new Error('RETURN_KEY_PUBLIC_KEY_MISMATCH');
  }

  const privateJwk = asRecord(
    payload.reply_private_key,
    'INVALID_RETURN_PRIVATE_KEY',
  ) as JsonWebKey;
  if (
    privateJwk.kty !== 'EC' ||
    privateJwk.crv !== 'P-256' ||
    typeof privateJwk.d !== 'string'
  ) {
    throw new Error('INVALID_RETURN_PRIVATE_KEY');
  }
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    envelope.reply_public_key,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );

  return {
    envelope,
    reply_keys: {
      privateKey,
      publicKey,
      publicKeyJwk: envelope.reply_public_key,
    },
  };
}

export async function acceptReturnResponse(args: {
  source_runtime: ReLatteRuntime;
  envelope: unknown;
  response_crossing: unknown;
  observed_at: string;
  committed_at: string;
}): Promise<AcceptedReturnResponse> {
  const envelope = normalizeReturnEnvelope(args.envelope);
  validateTimestamp(args.observed_at);
  validateTimestamp(args.committed_at);

  if (envelope.return_world !== args.source_runtime.manifest.world_id) {
    throw new Error('RETURN_ENVELOPE_WRONG_RETURN_WORLD');
  }
  if (compareTime(args.observed_at, envelope.expires_at) >= 0) {
    throw new Error('RETURN_ENVELOPE_EXPIRED');
  }
  if (!(await verifyCrossingEnvelope(args.response_crossing))) {
    throw new Error('INVALID_RETURN_RESPONSE_CROSSING');
  }
  const crossing = asRecord(
    args.response_crossing,
    'INVALID_RETURN_RESPONSE_CROSSING',
  );
  if (crossing.capability_ref !== envelope.reply_capability_id) {
    throw new Error('RETURN_RESPONSE_CAPABILITY_MISMATCH');
  }
  if (crossing.declared_kind !== envelope.reply_kind) {
    throw new Error('RETURN_RESPONSE_KIND_MISMATCH');
  }
  if (
    !Array.isArray(crossing.parents) ||
    !crossing.parents.includes(envelope.parent_crossing_id)
  ) {
    throw new Error('RETURN_RESPONSE_PARENT_MISMATCH');
  }

  await args.source_runtime.capabilityKernel.authorizeForeignCrossing({
    crossing,
    action: 'runtime.receive.crossing',
    observed_at: args.observed_at,
  });

  const queueItem = await args.source_runtime.enqueueCrossing({
    crossing,
    enqueued_at: args.observed_at,
    source: `return-envelope:${envelope.return_envelope_id}`,
  });

  const revocation =
    await args.source_runtime.capabilityKernel.revokeCapability({
      capability_id: envelope.reply_capability_id,
      revoked_at: args.observed_at,
      reason: `single return consumed by ${crossing.crossing_id}`,
    });

  const pulse = await args.source_runtime.pulseOne({
    claimed_at: args.observed_at,
    received_at: args.observed_at,
    committed_at: args.committed_at,
  });

  return {
    schema: 'relatte.return-response-acceptance/v0',
    return_envelope_id: envelope.return_envelope_id,
    response_crossing_id: crossing.crossing_id,
    queue_item_id: queueItem.queue_item_id,
    receive_receipt_id: pulse.receive_receipt_id,
    revocation_id: revocation.revocation_id,
    pulse,
    semantic_effect: 'none',
    laws: [
      'ONE REPLY DOOR != SHARED SESSION',
      'RETURN INVITATION != ADMISSION',
      'CONSUMED RETURN != HISTORY ERASURE',
      'REPLY RECEIVED != REPLY ADMITTED',
    ],
  };
}
