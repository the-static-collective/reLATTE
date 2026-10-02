import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  generateP256KeyPair,
  verifyCrossingEnvelope,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const CAPABILITY_GRANT_ID_DOMAIN = 'reLATTE-CapabilityGrant-v0|';
export const CAPABILITY_GRANT_SIGNATURE_DOMAIN = 'reLATTE-CapabilityGrantSignature-v0|';
export const CAPABILITY_GRANT_SIGNING_DOMAIN = 'relatte.capability-grant-signature/v0';
export const CAPABILITY_GRANT_ALGORITHM = 'ECDSA-P256-SHA256';

export type CapabilityAction = 'runtime.receive.crossing';

export interface CapabilityScope {
  target_world: string;
  declared_kind: string | null;
}

export interface CapabilityGrant {
  schema: 'relatte.capability-grant/v0';
  capability_id: string;
  issuer_ref: string;
  issuer_public_key: JsonWebKey;
  holder_public_key: JsonWebKey;
  action: CapabilityAction;
  scope: CapabilityScope;
  not_before: string;
  expires_at: string;
  created_at: string;
  signing: {
    algorithm: typeof CAPABILITY_GRANT_ALGORITHM;
    domain: typeof CAPABILITY_GRANT_SIGNING_DOMAIN;
    signature: string;
  };
  laws: string[];
}

interface CapabilityKernelConfig {
  schema: 'relatte.capability-kernel-config/v0';
  world_id: string;
  issuer_ref: string;
}

interface StoredKeys {
  schema: 'relatte.capability-kernel-key/v0';
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey;
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

function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
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
    const aa = normalizePublicJwk(a, 'INVALID_PUBLIC_KEY');
    const bb = normalizePublicJwk(b, 'INVALID_PUBLIC_KEY');
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

function identityBody(value: Omit<CapabilityGrant, 'capability_id' | 'signing'>): Record<string, unknown> {
  return {
    schema: value.schema,
    issuer_ref: value.issuer_ref,
    issuer_public_key: normalizePublicJwk(value.issuer_public_key, 'INVALID_CAPABILITY_ISSUER_KEY'),
    holder_public_key: normalizePublicJwk(value.holder_public_key, 'INVALID_CAPABILITY_HOLDER_KEY'),
    action: value.action,
    scope: {
      target_world: value.scope.target_world,
      declared_kind: value.scope.declared_kind,
    },
    not_before: value.not_before,
    expires_at: value.expires_at,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

function capabilityId(body: Omit<CapabilityGrant, 'capability_id' | 'signing'>): string {
  return `relatte-capability-v0:${sha256Hex(
    canonicalizeDomainValue(CAPABILITY_GRANT_ID_DOMAIN, identityBody(body))
  )}`;
}

function signatureBytes(
  id: string,
  body: Omit<CapabilityGrant, 'capability_id' | 'signing'>,
): Buffer {
  return canonicalizeDomainValue(CAPABILITY_GRANT_SIGNATURE_DOMAIN, {
    capability_id: id,
    ...identityBody(body),
  });
}

async function sign(privateKey: CryptoKey, bytes: Uint8Array): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new Uint8Array(bytes),
  );
  return Buffer.from(signature).toString('base64url');
}

async function verifySignature(
  publicJwk: JsonWebKey,
  signature: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const decoded = Buffer.from(signature, 'base64url');
  if (decoded.length !== 64 || decoded.toString('base64url') !== signature) return false;

  const key = await crypto.subtle.importKey(
    'jwk',
    normalizePublicJwk(publicJwk, 'INVALID_CAPABILITY_ISSUER_KEY'),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new Uint8Array(decoded),
    new Uint8Array(bytes),
  );
}

function normalizeGrant(value: unknown): CapabilityGrant {
  const grant = asRecord(value, 'INVALID_CAPABILITY_GRANT');
  if (grant.schema !== 'relatte.capability-grant/v0') {
    throw new Error('INVALID_CAPABILITY_SCHEMA');
  }
  if (grant.action !== 'runtime.receive.crossing') {
    throw new Error('UNSUPPORTED_CAPABILITY_ACTION');
  }

  const scope = asRecord(grant.scope, 'INVALID_CAPABILITY_SCOPE');
  const notBefore = nonEmpty(grant.not_before, 'INVALID_CAPABILITY_NOT_BEFORE');
  const expiresAt = nonEmpty(grant.expires_at, 'INVALID_CAPABILITY_EXPIRES_AT');
  const createdAt = nonEmpty(grant.created_at, 'INVALID_CAPABILITY_CREATED_AT');
  validateTimestamp(notBefore);
  validateTimestamp(expiresAt);
  validateTimestamp(createdAt);
  if (compareTime(expiresAt, notBefore) <= 0) {
    throw new Error('INVALID_CAPABILITY_WINDOW');
  }

  const signing = asRecord(grant.signing, 'INVALID_CAPABILITY_SIGNING');
  if (
    signing.algorithm !== CAPABILITY_GRANT_ALGORITHM ||
    signing.domain !== CAPABILITY_GRANT_SIGNING_DOMAIN ||
    typeof signing.signature !== 'string'
  ) {
    throw new Error('INVALID_CAPABILITY_SIGNING');
  }

  return {
    schema: 'relatte.capability-grant/v0',
    capability_id: nonEmpty(grant.capability_id, 'INVALID_CAPABILITY_ID'),
    issuer_ref: nonEmpty(grant.issuer_ref, 'INVALID_CAPABILITY_ISSUER_REF'),
    issuer_public_key: normalizePublicJwk(
      grant.issuer_public_key,
      'INVALID_CAPABILITY_ISSUER_KEY',
    ),
    holder_public_key: normalizePublicJwk(
      grant.holder_public_key,
      'INVALID_CAPABILITY_HOLDER_KEY',
    ),
    action: 'runtime.receive.crossing',
    scope: {
      target_world: nonEmpty(scope.target_world, 'INVALID_CAPABILITY_TARGET_WORLD'),
      declared_kind:
        scope.declared_kind === null
          ? null
          : nonEmpty(scope.declared_kind, 'INVALID_CAPABILITY_DECLARED_KIND'),
    },
    not_before: notBefore,
    expires_at: expiresAt,
    created_at: createdAt,
    signing: {
      algorithm: CAPABILITY_GRANT_ALGORITHM,
      domain: CAPABILITY_GRANT_SIGNING_DOMAIN,
      signature: signing.signature,
    },
    laws: Array.isArray(grant.laws) ? [...grant.laws] : [],
  };
}

function grantFilename(id: string): string {
  return `${sha256Hex(Buffer.from(id, 'utf8'))}.json`;
}

async function exportStoredKeys(keys: P256KeyMaterial): Promise<StoredKeys> {
  return {
    schema: 'relatte.capability-kernel-key/v0',
    private_jwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
    public_jwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
  };
}

async function importStoredKeys(value: unknown): Promise<P256KeyMaterial> {
  const stored = asRecord(value, 'INVALID_CAPABILITY_KEY_FILE');
  if (stored.schema !== 'relatte.capability-kernel-key/v0') {
    throw new Error('INVALID_CAPABILITY_KEY_SCHEMA');
  }
  const privateJwk = asRecord(stored.private_jwk, 'INVALID_CAPABILITY_PRIVATE_KEY') as JsonWebKey;
  const publicJwk = normalizePublicJwk(
    stored.public_jwk,
    'INVALID_CAPABILITY_PUBLIC_KEY',
  );
  if (
    privateJwk.kty !== 'EC' ||
    privateJwk.crv !== 'P-256' ||
    typeof privateJwk.d !== 'string'
  ) {
    throw new Error('INVALID_CAPABILITY_PRIVATE_KEY');
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
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  return { privateKey, publicKey, publicKeyJwk: publicJwk };
}

export class CapabilityKernel {
  readonly root: string;
  readonly world_id: string;
  readonly issuer_ref: string;
  private readonly keys: P256KeyMaterial;

  private constructor(args: {
    root: string;
    world_id: string;
    issuer_ref: string;
    keys: P256KeyMaterial;
  }) {
    this.root = args.root;
    this.world_id = args.world_id;
    this.issuer_ref = args.issuer_ref;
    this.keys = args.keys;
  }

  static async create(args: {
    root: string;
    world_id: string;
    issuer_ref?: string;
  }): Promise<CapabilityKernel> {
    if (await fileExists(args.root)) throw new Error('CAPABILITY_KERNEL_ROOT_EXISTS');
    const worldId = nonEmpty(args.world_id, 'INVALID_CAPABILITY_WORLD_ID');
    const issuerRef =
      args.issuer_ref ??
      `${worldId}#capability-kernel`;

    await mkdir(join(args.root, 'grants'), { recursive: true });
    const keys = await generateP256KeyPair();
    const config: CapabilityKernelConfig = {
      schema: 'relatte.capability-kernel-config/v0',
      world_id: worldId,
      issuer_ref: nonEmpty(issuerRef, 'INVALID_CAPABILITY_ISSUER_REF'),
    };
    await writeFile(
      join(args.root, 'capability-kernel.json'),
      JSON.stringify(config, null, 2) + '\n',
      'utf8',
    );
    await writeFile(
      join(args.root, 'issuer-key.json'),
      JSON.stringify(await exportStoredKeys(keys), null, 2) + '\n',
      'utf8',
    );
    return new CapabilityKernel({
      root: args.root,
      world_id: worldId,
      issuer_ref: config.issuer_ref,
      keys,
    });
  }

  static async open(root: string): Promise<CapabilityKernel> {
    const config = asRecord(
      JSON.parse(await readFile(join(root, 'capability-kernel.json'), 'utf8')),
      'INVALID_CAPABILITY_KERNEL_CONFIG',
    );
    if (config.schema !== 'relatte.capability-kernel-config/v0') {
      throw new Error('INVALID_CAPABILITY_KERNEL_CONFIG_SCHEMA');
    }
    const keys = await importStoredKeys(
      JSON.parse(await readFile(join(root, 'issuer-key.json'), 'utf8')),
    );
    return new CapabilityKernel({
      root,
      world_id: nonEmpty(config.world_id, 'INVALID_CAPABILITY_WORLD_ID'),
      issuer_ref: nonEmpty(config.issuer_ref, 'INVALID_CAPABILITY_ISSUER_REF'),
      keys,
    });
  }

  get public_key_jwk(): JsonWebKey {
    return normalizePublicJwk(this.keys.publicKeyJwk, 'INVALID_CAPABILITY_PUBLIC_KEY');
  }

  async issueReceiveCapability(args: {
    holder_public_key: JsonWebKey;
    declared_kind?: string | null;
    not_before: string;
    expires_at: string;
    created_at: string;
  }): Promise<CapabilityGrant> {
    validateTimestamp(args.not_before);
    validateTimestamp(args.expires_at);
    validateTimestamp(args.created_at);
    if (compareTime(args.expires_at, args.not_before) <= 0) {
      throw new Error('INVALID_CAPABILITY_WINDOW');
    }

    const body: Omit<CapabilityGrant, 'capability_id' | 'signing'> = {
      schema: 'relatte.capability-grant/v0',
      issuer_ref: this.issuer_ref,
      issuer_public_key: this.public_key_jwk,
      holder_public_key: normalizePublicJwk(
        args.holder_public_key,
        'INVALID_CAPABILITY_HOLDER_KEY',
      ),
      action: 'runtime.receive.crossing',
      scope: {
        target_world: this.world_id,
        declared_kind:
          args.declared_kind == null
            ? null
            : nonEmpty(args.declared_kind, 'INVALID_CAPABILITY_DECLARED_KIND'),
      },
      not_before: args.not_before,
      expires_at: args.expires_at,
      created_at: args.created_at,
      laws: [
        'IDENTITY != CAPABILITY',
        'CAPABILITY != ADMISSION',
        'CAPABILITY != HUMAN IDENTITY',
        'REFERENCE != AUTHORITY',
        'POSSESSION != UNIVERSAL PERMISSION',
      ],
    };

    const id = capabilityId(body);
    const grant: CapabilityGrant = {
      ...body,
      capability_id: id,
      signing: {
        algorithm: CAPABILITY_GRANT_ALGORITHM,
        domain: CAPABILITY_GRANT_SIGNING_DOMAIN,
        signature: await sign(this.keys.privateKey, signatureBytes(id, body)),
      },
    };

    await writeFile(
      join(this.root, 'grants', grantFilename(id)),
      JSON.stringify(grant, null, 2) + '\n',
      'utf8',
    );
    return grant;
  }

  async getGrant(id: string): Promise<CapabilityGrant | null> {
    const capabilityIdValue = nonEmpty(id, 'INVALID_CAPABILITY_ID');
    const path = join(this.root, 'grants', grantFilename(capabilityIdValue));
    if (!(await fileExists(path))) return null;
    return normalizeGrant(JSON.parse(await readFile(path, 'utf8')));
  }

  async listGrantIds(): Promise<string[]> {
    const files = await readdir(join(this.root, 'grants'));
    const ids: string[] = [];
    for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
      const grant = normalizeGrant(
        JSON.parse(await readFile(join(this.root, 'grants', file), 'utf8')),
      );
      ids.push(grant.capability_id);
    }
    return ids.sort();
  }

  async verifyGrant(value: unknown): Promise<boolean> {
    try {
      const grant = normalizeGrant(value);
      if (grant.issuer_ref !== this.issuer_ref) return false;
      if (grant.scope.target_world !== this.world_id) return false;
      if (!samePublicJwk(grant.issuer_public_key, this.public_key_jwk)) return false;

      const body: Omit<CapabilityGrant, 'capability_id' | 'signing'> = {
        schema: grant.schema,
        issuer_ref: grant.issuer_ref,
        issuer_public_key: grant.issuer_public_key,
        holder_public_key: grant.holder_public_key,
        action: grant.action,
        scope: grant.scope,
        not_before: grant.not_before,
        expires_at: grant.expires_at,
        created_at: grant.created_at,
        laws: grant.laws,
      };
      if (grant.capability_id !== capabilityId(body)) return false;
      return verifySignature(
        grant.issuer_public_key,
        grant.signing.signature,
        signatureBytes(grant.capability_id, body),
      );
    } catch {
      return false;
    }
  }

  async authorizeForeignCrossing(args: {
    crossing: unknown;
    action: CapabilityAction;
    observed_at: string;
  }): Promise<CapabilityGrant> {
    validateTimestamp(args.observed_at);
    if (!(await verifyCrossingEnvelope(args.crossing))) {
      throw new Error('CAPABILITY_CROSSING_INVALID');
    }
    const crossing = asRecord(args.crossing, 'CAPABILITY_CROSSING_INVALID');
    const capabilityRef = nonEmpty(
      crossing.capability_ref,
      'CAPABILITY_REQUIRED',
    );
    const grant = await this.getGrant(capabilityRef);
    if (!grant) throw new Error('CAPABILITY_UNKNOWN');
    if (!(await this.verifyGrant(grant))) throw new Error('CAPABILITY_INVALID');
    if (grant.action !== args.action) throw new Error('CAPABILITY_ACTION_DENIED');

    if (
      compareTime(args.observed_at, grant.not_before) < 0 ||
      compareTime(args.observed_at, grant.expires_at) >= 0
    ) {
      throw new Error('CAPABILITY_OUTSIDE_TIME_WINDOW');
    }

    const signing = asRecord(crossing.signing, 'CAPABILITY_CROSSING_SIGNING_INVALID');
    if (!samePublicJwk(signing.public_key, grant.holder_public_key)) {
      throw new Error('CAPABILITY_HOLDER_MISMATCH');
    }

    if (
      grant.scope.declared_kind !== null &&
      crossing.declared_kind !== grant.scope.declared_kind
    ) {
      throw new Error('CAPABILITY_SCOPE_KIND_DENIED');
    }

    return grant;
  }
}
