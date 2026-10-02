import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
} from './canonical.ts';

export const ENCRYPTED_PAYLOAD_ID_DOMAIN = 'reLATTE-EncryptedPayload-v0|';
export const ENCRYPTED_PAYLOAD_KEY_INFO_DOMAIN = 'reLATTE-EncryptedPayloadKey-v0|';
export const ENCRYPTION_KEY_ID_DOMAIN = 'reLATTE-EncryptionKey-v0|';

export const ENCRYPTED_PAYLOAD_PROFILE =
  'relatte.ecdh-p256-hkdf-sha256-aes-256-gcm/v0';

interface StoredEncryptionKeys {
  schema: 'relatte.encryption-key/v0';
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey;
}

export interface EncryptedPayloadContext {
  target_world: string;
  capability_id: string;
  declared_kind: string;
  media_type: string;
}

export interface EncryptedPayloadEnvelope {
  schema: 'relatte.encrypted-payload/v0';
  envelope_id: string;
  profile: typeof ENCRYPTED_PAYLOAD_PROFILE;
  recipient_key_id: string;
  recipient_public_key: JsonWebKey;
  ephemeral_public_key: JsonWebKey;
  salt: string;
  iv: string;
  ciphertext: string;
  context: EncryptedPayloadContext;
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

function normalizeP256PublicJwk(value: unknown, code: string): JsonWebKey {
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

function normalizePrivateJwk(value: unknown): JsonWebKey {
  const jwk = asRecord(value, 'INVALID_ENCRYPTION_PRIVATE_KEY');
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    typeof jwk.d !== 'string'
  ) {
    throw new Error('INVALID_ENCRYPTION_PRIVATE_KEY');
  }
  return jwk as JsonWebKey;
}

function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

function decodeBase64Url(value: unknown, code: string): Uint8Array {
  const text = nonEmpty(value, code);
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== text) {
    throw new Error(code);
  }
  return new Uint8Array(bytes);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export function encryptionKeyId(publicKey: unknown): string {
  const jwk = normalizeP256PublicJwk(publicKey, 'INVALID_ENCRYPTION_PUBLIC_KEY');
  return `relatte-encryption-key-v0:${sha256Hex(
    canonicalizeDomainValue(ENCRYPTION_KEY_ID_DOMAIN, jwk)
  )}`;
}

function normalizeContext(value: unknown): EncryptedPayloadContext {
  const context = asRecord(value, 'INVALID_ENCRYPTED_PAYLOAD_CONTEXT');
  return {
    target_world: nonEmpty(
      context.target_world,
      'INVALID_ENCRYPTED_PAYLOAD_TARGET_WORLD',
    ),
    capability_id: nonEmpty(
      context.capability_id,
      'INVALID_ENCRYPTED_PAYLOAD_CAPABILITY',
    ),
    declared_kind: nonEmpty(
      context.declared_kind,
      'INVALID_ENCRYPTED_PAYLOAD_KIND',
    ),
    media_type: nonEmpty(
      context.media_type,
      'INVALID_ENCRYPTED_PAYLOAD_MEDIA_TYPE',
    ),
  };
}

function envelopeIdentityBody(
  value: Omit<EncryptedPayloadEnvelope, 'envelope_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    profile: value.profile,
    recipient_key_id: value.recipient_key_id,
    recipient_public_key: normalizeP256PublicJwk(
      value.recipient_public_key,
      'INVALID_ENCRYPTED_PAYLOAD_RECIPIENT_KEY',
    ),
    ephemeral_public_key: normalizeP256PublicJwk(
      value.ephemeral_public_key,
      'INVALID_ENCRYPTED_PAYLOAD_EPHEMERAL_KEY',
    ),
    salt: value.salt,
    iv: value.iv,
    ciphertext: value.ciphertext,
    context: normalizeContext(value.context),
    laws: [...value.laws],
  };
}

function envelopeId(
  body: Omit<EncryptedPayloadEnvelope, 'envelope_id'>,
): string {
  return `relatte-encrypted-payload-v0:${sha256Hex(
    canonicalizeDomainValue(
      ENCRYPTED_PAYLOAD_ID_DOMAIN,
      envelopeIdentityBody(body),
    )
  )}`;
}

function parseEnvelope(value: unknown): EncryptedPayloadEnvelope {
  const envelope = asRecord(value, 'INVALID_ENCRYPTED_PAYLOAD');
  if (envelope.schema !== 'relatte.encrypted-payload/v0') {
    throw new Error('INVALID_ENCRYPTED_PAYLOAD_SCHEMA');
  }
  if (envelope.profile !== ENCRYPTED_PAYLOAD_PROFILE) {
    throw new Error('UNSUPPORTED_ENCRYPTED_PAYLOAD_PROFILE');
  }
  const body: Omit<EncryptedPayloadEnvelope, 'envelope_id'> = {
    schema: 'relatte.encrypted-payload/v0',
    profile: ENCRYPTED_PAYLOAD_PROFILE,
    recipient_key_id: nonEmpty(
      envelope.recipient_key_id,
      'INVALID_ENCRYPTED_PAYLOAD_RECIPIENT_KEY_ID',
    ),
    recipient_public_key: normalizeP256PublicJwk(
      envelope.recipient_public_key,
      'INVALID_ENCRYPTED_PAYLOAD_RECIPIENT_KEY',
    ),
    ephemeral_public_key: normalizeP256PublicJwk(
      envelope.ephemeral_public_key,
      'INVALID_ENCRYPTED_PAYLOAD_EPHEMERAL_KEY',
    ),
    salt: nonEmpty(envelope.salt, 'INVALID_ENCRYPTED_PAYLOAD_SALT'),
    iv: nonEmpty(envelope.iv, 'INVALID_ENCRYPTED_PAYLOAD_IV'),
    ciphertext: nonEmpty(
      envelope.ciphertext,
      'INVALID_ENCRYPTED_PAYLOAD_CIPHERTEXT',
    ),
    context: normalizeContext(envelope.context),
    laws: Array.isArray(envelope.laws) ? [...envelope.laws] : [],
  };
  decodeBase64Url(body.salt, 'INVALID_ENCRYPTED_PAYLOAD_SALT');
  const iv = decodeBase64Url(body.iv, 'INVALID_ENCRYPTED_PAYLOAD_IV');
  if (iv.length !== 12) throw new Error('INVALID_ENCRYPTED_PAYLOAD_IV');
  decodeBase64Url(
    body.ciphertext,
    'INVALID_ENCRYPTED_PAYLOAD_CIPHERTEXT',
  );
  if (
    body.recipient_key_id !== encryptionKeyId(body.recipient_public_key)
  ) {
    throw new Error('ENCRYPTED_PAYLOAD_RECIPIENT_KEY_ID_MISMATCH');
  }
  const id = nonEmpty(
    envelope.envelope_id,
    'INVALID_ENCRYPTED_PAYLOAD_ID',
  );
  if (id !== envelopeId(body)) throw new Error('ENCRYPTED_PAYLOAD_ID_MISMATCH');
  return {
    ...body,
    envelope_id: id,
  };
}

async function deriveAesKey(args: {
  private_key: CryptoKey;
  peer_public_key: JsonWebKey;
  salt: Uint8Array;
  context: EncryptedPayloadContext;
  usages: KeyUsage[];
}): Promise<CryptoKey> {
  const peerKey = await crypto.subtle.importKey(
    'jwk',
    normalizeP256PublicJwk(
      args.peer_public_key,
      'INVALID_ENCRYPTION_PEER_KEY',
    ),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerKey,
    },
    args.private_key,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    shared,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: ownedArrayBuffer(args.salt),
      info: ownedArrayBuffer(new Uint8Array(canonicalizeDomainValue(
        ENCRYPTED_PAYLOAD_KEY_INFO_DOMAIN,
        args.context,
      ))),
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    args.usages,
  );
}

export async function encryptPayloadForRecipient(args: {
  plaintext: Uint8Array;
  recipient_public_key: JsonWebKey;
  context: EncryptedPayloadContext;
}): Promise<EncryptedPayloadEnvelope> {
  const context = normalizeContext(args.context);
  const recipientPublicKey = normalizeP256PublicJwk(
    args.recipient_public_key,
    'INVALID_ENCRYPTION_RECIPIENT_KEY',
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const ephemeralPublicKey = normalizeP256PublicJwk(
    await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
    'INVALID_ENCRYPTION_EPHEMERAL_KEY',
  );
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const aesKey = await deriveAesKey({
    private_key: ephemeral.privateKey,
    peer_public_key: recipientPublicKey,
    salt,
    context,
    usages: ['encrypt'],
  });
  const aad = canonicalize(context);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ownedArrayBuffer(iv),
      additionalData: ownedArrayBuffer(new TextEncoder().encode(aad)),
      tagLength: 128,
    },
    aesKey,
    ownedArrayBuffer(args.plaintext),
  );

  const body: Omit<EncryptedPayloadEnvelope, 'envelope_id'> = {
    schema: 'relatte.encrypted-payload/v0',
    profile: ENCRYPTED_PAYLOAD_PROFILE,
    recipient_key_id: encryptionKeyId(recipientPublicKey),
    recipient_public_key: recipientPublicKey,
    ephemeral_public_key: ephemeralPublicKey,
    salt: Buffer.from(salt).toString('base64url'),
    iv: Buffer.from(iv).toString('base64url'),
    ciphertext: Buffer.from(ciphertext).toString('base64url'),
    context,
    laws: [
      'CIPHERTEXT != AUTHORITY',
      'DECRYPTABLE != ADMITTED',
      'ENCRYPTION != IDENTITY',
      'PROFILE != RFC9180 HPKE',
    ],
  };
  return {
    ...body,
    envelope_id: envelopeId(body),
  };
}

export class EncryptionOrgan {
  readonly root: string;
  readonly world_id: string;
  private readonly privateKey: CryptoKey;
  readonly public_key_jwk: JsonWebKey;
  readonly key_id: string;

  private constructor(args: {
    root: string;
    world_id: string;
    private_key: CryptoKey;
    public_key_jwk: JsonWebKey;
  }) {
    this.root = args.root;
    this.world_id = args.world_id;
    this.privateKey = args.private_key;
    this.public_key_jwk = normalizeP256PublicJwk(
      args.public_key_jwk,
      'INVALID_ENCRYPTION_PUBLIC_KEY',
    );
    this.key_id = encryptionKeyId(this.public_key_jwk);
  }

  static async create(args: {
    root: string;
    world_id: string;
  }): Promise<EncryptionOrgan> {
    if (await fileExists(args.root)) throw new Error('ENCRYPTION_ORGAN_ROOT_EXISTS');
    const worldId = nonEmpty(args.world_id, 'INVALID_ENCRYPTION_WORLD_ID');
    await mkdir(args.root, { recursive: true });
    const keys = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    const stored: StoredEncryptionKeys = {
      schema: 'relatte.encryption-key/v0',
      private_jwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
      public_jwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
    };
    await writeFile(
      join(args.root, 'encryption-key.json'),
      JSON.stringify(stored, null, 2) + '\n',
      'utf8',
    );
    await writeFile(
      join(args.root, 'encryption-organ.json'),
      JSON.stringify({
        schema: 'relatte.encryption-organ-config/v0',
        world_id: worldId,
      }, null, 2) + '\n',
      'utf8',
    );
    return new EncryptionOrgan({
      root: args.root,
      world_id: worldId,
      private_key: keys.privateKey,
      public_key_jwk: stored.public_jwk,
    });
  }

  static async open(root: string): Promise<EncryptionOrgan> {
    const config = asRecord(
      JSON.parse(await readFile(join(root, 'encryption-organ.json'), 'utf8')),
      'INVALID_ENCRYPTION_ORGAN_CONFIG',
    );
    if (config.schema !== 'relatte.encryption-organ-config/v0') {
      throw new Error('INVALID_ENCRYPTION_ORGAN_CONFIG_SCHEMA');
    }
    const stored = asRecord(
      JSON.parse(await readFile(join(root, 'encryption-key.json'), 'utf8')),
      'INVALID_ENCRYPTION_KEY_FILE',
    );
    if (stored.schema !== 'relatte.encryption-key/v0') {
      throw new Error('INVALID_ENCRYPTION_KEY_SCHEMA');
    }
    const privateJwk = normalizePrivateJwk(stored.private_jwk);
    const publicJwk = normalizeP256PublicJwk(
      stored.public_jwk,
      'INVALID_ENCRYPTION_PUBLIC_KEY',
    );
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    return new EncryptionOrgan({
      root,
      world_id: nonEmpty(config.world_id, 'INVALID_ENCRYPTION_WORLD_ID'),
      private_key: privateKey,
      public_key_jwk: publicJwk,
    });
  }

  async decrypt(
    value: unknown,
  ): Promise<{ plaintext: Uint8Array; envelope: EncryptedPayloadEnvelope }> {
    const envelope = parseEnvelope(value);
    if (envelope.recipient_key_id !== this.key_id) {
      throw new Error('ENCRYPTED_PAYLOAD_WRONG_RECIPIENT');
    }
    const salt = decodeBase64Url(
      envelope.salt,
      'INVALID_ENCRYPTED_PAYLOAD_SALT',
    );
    const iv = decodeBase64Url(
      envelope.iv,
      'INVALID_ENCRYPTED_PAYLOAD_IV',
    );
    const ciphertext = decodeBase64Url(
      envelope.ciphertext,
      'INVALID_ENCRYPTED_PAYLOAD_CIPHERTEXT',
    );
    const aesKey = await deriveAesKey({
      private_key: this.privateKey,
      peer_public_key: envelope.ephemeral_public_key,
      salt,
      context: envelope.context,
      usages: ['decrypt'],
    });
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ownedArrayBuffer(iv),
        additionalData: ownedArrayBuffer(new TextEncoder().encode(
          canonicalize(envelope.context),
        )),
        tagLength: 128,
      },
      aesKey,
      ownedArrayBuffer(ciphertext),
    );
    return {
      plaintext: new Uint8Array(plaintext),
      envelope,
    };
  }
}
