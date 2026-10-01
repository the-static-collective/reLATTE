import { mkdir, readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalize, sha256Hex, validateTimestamp } from './canonical.ts';
import {
  generateP256KeyPair,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const MIRROR_OBJECT_PREFIX = 'relatte-mirror-object-v0:';

export interface MirrorConfig {
  schema: 'relatte.mirror-config/v0';
  world_id: string;
  mirror_particular: string;
  contract_ref: string;
}

interface StoredKeyMaterial {
  schema: 'relatte.mirror-key/v0';
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey;
}

export interface MirrorRecord {
  schema: 'relatte.mirror-record/v0';
  object_id: string;
  crossing_id: string;
  canonical_body_sha256: string;
  canonical_body: string;
  published_receipt: Record<string, any>;
  stored_receipt: Record<string, any>;
}

export interface MirrorServeBundle {
  schema: 'relatte.mirror-serve-bundle/v0';
  crossing: Record<string, any>;
  published_receipt: Record<string, any>;
  stored_receipt: Record<string, any>;
  served_receipt: Record<string, any>;
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

function safeName(value: string): string {
  return sha256Hex(Buffer.from(value, 'utf8'));
}

function objectIdFromBody(body: string): string {
  return `${MIRROR_OBJECT_PREFIX}${sha256Hex(Buffer.from(body, 'utf8'))}`;
}

function publicKeyIdentity(value: unknown): string {
  const record = asRecord(value, 'INVALID_PUBLIC_KEY');
  return canonicalize({
    kty: record.kty,
    crv: record.crv,
    x: record.x,
    y: record.y,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function exportStoredKeys(keys: P256KeyMaterial): Promise<StoredKeyMaterial> {
  return {
    schema: 'relatte.mirror-key/v0',
    private_jwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
    public_jwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
  };
}

async function importStoredKeys(value: unknown): Promise<P256KeyMaterial> {
  const stored = asRecord(value, 'INVALID_MIRROR_KEY_FILE');
  if (stored.schema !== 'relatte.mirror-key/v0') throw new Error('INVALID_MIRROR_KEY_SCHEMA');

  const privateJwk = asRecord(stored.private_jwk, 'INVALID_MIRROR_PRIVATE_KEY') as JsonWebKey;
  const publicJwk = asRecord(stored.public_jwk, 'INVALID_MIRROR_PUBLIC_KEY') as JsonWebKey;
  if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || typeof privateJwk.d !== 'string') {
    throw new Error('INVALID_MIRROR_PRIVATE_KEY');
  }
  if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || Object.prototype.hasOwnProperty.call(publicJwk, 'd')) {
    throw new Error('INVALID_MIRROR_PUBLIC_KEY');
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

  return {
    privateKey,
    publicKey,
    publicKeyJwk: publicJwk,
  };
}

function parseConfig(value: unknown): MirrorConfig {
  const config = asRecord(value, 'INVALID_MIRROR_CONFIG');
  if (config.schema !== 'relatte.mirror-config/v0') throw new Error('INVALID_MIRROR_CONFIG_SCHEMA');
  return {
    schema: 'relatte.mirror-config/v0',
    world_id: nonEmpty(config.world_id, 'INVALID_MIRROR_WORLD'),
    mirror_particular: nonEmpty(config.mirror_particular, 'INVALID_MIRROR_PARTICULAR'),
    contract_ref: nonEmpty(config.contract_ref, 'INVALID_MIRROR_CONTRACT'),
  };
}

export async function sealPublishedClaim(
  crossingValue: unknown,
  keys: P256KeyMaterial,
  createdAt: string,
): Promise<Record<string, any>> {
  if (!(await verifyCrossingEnvelope(crossingValue))) throw new Error('INVALID_PUBLISHED_CROSSING');
  validateTimestamp(createdAt);
  const crossing = asRecord(crossingValue, 'INVALID_PUBLISHED_CROSSING');

  const receipt = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: nonEmpty(crossing.crossing_id, 'INVALID_PUBLISHED_CROSSING_ID'),
    world_id: nonEmpty(crossing.source_world, 'INVALID_PUBLISHED_SOURCE_WORLD'),
    receiver_particular: nonEmpty(crossing.source_particular, 'INVALID_PUBLISHED_SOURCE_PARTICULAR'),
    kind: 'R7_PUBLISHED',
    semantic_effect: 'none',
    contract_ref: 'relatte:r7-published/v0',
    pre_state_ref: crossing.source_history_head ?? null,
    post_state_ref: crossing.source_history_head ?? null,
    descendant_refs: [],
    residual_refs: [crossing.crossing_id],
    note: 'source declares this signed crossing published',
    created_at: createdAt,
    extensions: {
      sharing: {
        claim: 'PUBLISHED',
        laws: [
          'PUBLISHED != STORED',
          'PUBLISHED != SERVED',
          'PUBLISHED != RECEIVED',
        ],
      },
    },
  }, keys);

  if (
    publicKeyIdentity(receipt.signing.public_key) !==
    publicKeyIdentity(crossing.signing.public_key)
  ) {
    throw new Error('PUBLISHED_KEY_MISMATCH');
  }

  return receipt;
}

export async function verifyPublishedClaim(
  crossingValue: unknown,
  receiptValue: unknown,
): Promise<boolean> {
  try {
    if (!(await verifyCrossingEnvelope(crossingValue))) return false;
    if (!(await verifyReceipt(receiptValue))) return false;

    const crossing = asRecord(crossingValue, 'INVALID_PUBLISHED_CROSSING');
    const receipt = asRecord(receiptValue, 'INVALID_PUBLISHED_RECEIPT');

    return (
      receipt.kind === 'R7_PUBLISHED' &&
      receipt.semantic_effect === 'none' &&
      receipt.crossing_id === crossing.crossing_id &&
      receipt.world_id === crossing.source_world &&
      receipt.receiver_particular === crossing.source_particular &&
      publicKeyIdentity(receipt.signing.public_key) ===
        publicKeyIdentity(crossing.signing.public_key)
    );
  } catch {
    return false;
  }
}

export class MirrorStore {
  readonly root: string;
  readonly config: MirrorConfig;
  private readonly keys: P256KeyMaterial;

  private constructor(root: string, config: MirrorConfig, keys: P256KeyMaterial) {
    this.root = root;
    this.config = config;
    this.keys = keys;
  }

  static async create(
    root: string,
    input: Omit<MirrorConfig, 'schema'>,
  ): Promise<MirrorStore> {
    if (await pathExists(root)) throw new Error('MIRROR_ROOT_EXISTS');

    await mkdir(join(root, 'records'), { recursive: true });
    const config: MirrorConfig = {
      schema: 'relatte.mirror-config/v0',
      world_id: nonEmpty(input.world_id, 'INVALID_MIRROR_WORLD'),
      mirror_particular: nonEmpty(input.mirror_particular, 'INVALID_MIRROR_PARTICULAR'),
      contract_ref: nonEmpty(input.contract_ref, 'INVALID_MIRROR_CONTRACT'),
    };
    const keys = await generateP256KeyPair();

    await writeFile(join(root, 'mirror.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
    await writeFile(
      join(root, 'mirror-key.json'),
      JSON.stringify(await exportStoredKeys(keys), null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 },
    );
    await writeFile(join(root, 'serve-claims.jsonl'), '', 'utf8');

    return new MirrorStore(root, config, keys);
  }

  static async open(root: string): Promise<MirrorStore> {
    const config = parseConfig(JSON.parse(await readFile(join(root, 'mirror.json'), 'utf8')));
    const keys = await importStoredKeys(JSON.parse(await readFile(join(root, 'mirror-key.json'), 'utf8')));
    const mirror = new MirrorStore(root, config, keys);
    await mirror.verifyAllRecords();
    return mirror;
  }

  private recordPath(crossingId: string): string {
    return join(this.root, 'records', `${safeName(crossingId)}.json`);
  }

  private async verifyRecord(value: unknown): Promise<MirrorRecord> {
    const record = asRecord(value, 'INVALID_MIRROR_RECORD');
    if (record.schema !== 'relatte.mirror-record/v0') throw new Error('INVALID_MIRROR_RECORD_SCHEMA');

    const crossingId = nonEmpty(record.crossing_id, 'INVALID_MIRROR_CROSSING_ID');
    const canonicalBody = nonEmpty(record.canonical_body, 'INVALID_MIRROR_BODY');
    const canonicalBodySha256 = nonEmpty(record.canonical_body_sha256, 'INVALID_MIRROR_BODY_HASH');
    if (sha256Hex(Buffer.from(canonicalBody, 'utf8')) !== canonicalBodySha256) {
      throw new Error('MIRROR_BODY_HASH_MISMATCH');
    }

    const crossing = asRecord(JSON.parse(canonicalBody), 'INVALID_MIRROR_CROSSING_JSON');
    if (canonicalize(crossing) !== canonicalBody) throw new Error('MIRROR_BODY_NOT_CANONICAL');
    if (crossing.crossing_id !== crossingId) throw new Error('MIRROR_CROSSING_ID_MISMATCH');
    if (!(await verifyCrossingEnvelope(crossing))) throw new Error('INVALID_MIRROR_CROSSING');

    const objectId = nonEmpty(record.object_id, 'INVALID_MIRROR_OBJECT_ID');
    if (objectId !== objectIdFromBody(canonicalBody)) throw new Error('INVALID_MIRROR_OBJECT_ID');

    if (!(await verifyPublishedClaim(crossing, record.published_receipt))) {
      throw new Error('INVALID_MIRROR_PUBLISHED_RECEIPT');
    }
    if (!(await verifyReceipt(record.stored_receipt))) throw new Error('INVALID_MIRROR_STORED_RECEIPT');

    const stored = asRecord(record.stored_receipt, 'INVALID_MIRROR_STORED_RECEIPT');
    if (
      stored.kind !== 'R7_STORED' ||
      stored.semantic_effect !== 'none' ||
      stored.crossing_id !== crossingId ||
      stored.world_id !== this.config.world_id ||
      stored.receiver_particular !== this.config.mirror_particular
    ) {
      throw new Error('INVALID_MIRROR_STORED_RECEIPT');
    }

    const extensions = asRecord(stored.extensions, 'INVALID_MIRROR_STORED_EXTENSIONS');
    const mirror = asRecord(extensions.mirror, 'INVALID_MIRROR_STORED_EXTENSIONS');
    if (
      mirror.object_id !== objectId ||
      mirror.published_receipt_id !== record.published_receipt.receipt_id
    ) {
      throw new Error('INVALID_MIRROR_STORED_LINKAGE');
    }

    return record as MirrorRecord;
  }

  private async verifyAllRecords(): Promise<void> {
    const files = await readdir(join(this.root, 'records'));
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const value = JSON.parse(await readFile(join(this.root, 'records', file), 'utf8'));
      await this.verifyRecord(value);
    }
  }

  async store(
    crossingValue: unknown,
    publishedReceiptValue: unknown,
    createdAt: string,
  ): Promise<Record<string, any>> {
    if (!(await verifyPublishedClaim(crossingValue, publishedReceiptValue))) {
      throw new Error('INVALID_PUBLISHED_CLAIM');
    }
    validateTimestamp(createdAt);

    const crossing = asRecord(crossingValue, 'INVALID_MIRROR_CROSSING');
    const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_MIRROR_CROSSING_ID');
    const path = this.recordPath(crossingId);

    if (await pathExists(path)) {
      const existing = await this.verifyRecord(JSON.parse(await readFile(path, 'utf8')));
      return existing.stored_receipt;
    }

    const canonicalBody = canonicalize(crossing);
    const canonicalBodySha256 = sha256Hex(Buffer.from(canonicalBody, 'utf8'));
    const objectId = objectIdFromBody(canonicalBody);

    const storedReceipt = await sealReceipt({
      schema: 'relatte.receipt/v0',
      crossing_id: crossingId,
      world_id: this.config.world_id,
      receiver_particular: this.config.mirror_particular,
      kind: 'R7_STORED',
      semantic_effect: 'none',
      contract_ref: this.config.contract_ref,
      pre_state_ref: null,
      post_state_ref: objectId,
      descendant_refs: [],
      residual_refs: [objectId],
      note: 'mirror independently retained the canonical signed crossing',
      created_at: createdAt,
      extensions: {
        mirror: {
          claim: 'STORED',
          object_id: objectId,
          canonical_body_sha256: canonicalBodySha256,
          published_receipt_id: asRecord(
            publishedReceiptValue,
            'INVALID_PUBLISHED_RECEIPT',
          ).receipt_id,
          laws: [
            'STORED != PUBLISHED',
            'STORED != SERVED',
            'STORED != RECEIVED',
            'MIRROR != SOURCE',
          ],
        },
      },
    }, this.keys);

    const record: MirrorRecord = {
      schema: 'relatte.mirror-record/v0',
      object_id: objectId,
      crossing_id: crossingId,
      canonical_body_sha256: canonicalBodySha256,
      canonical_body: canonicalBody,
      published_receipt: asRecord(publishedReceiptValue, 'INVALID_PUBLISHED_RECEIPT'),
      stored_receipt: storedReceipt,
    };

    await writeFile(path, JSON.stringify(record, null, 2) + '\n', 'utf8');
    return storedReceipt;
  }

  async reconstruct(crossingId: string): Promise<{
    crossing: Record<string, any>;
    record: MirrorRecord;
  }> {
    const record = await this.verifyRecord(
      JSON.parse(await readFile(this.recordPath(crossingId), 'utf8')),
    );
    return {
      crossing: asRecord(JSON.parse(record.canonical_body), 'INVALID_MIRROR_CROSSING_JSON'),
      record,
    };
  }

  async serve(crossingId: string, createdAt: string): Promise<MirrorServeBundle> {
    validateTimestamp(createdAt);
    const { crossing, record } = await this.reconstruct(crossingId);

    const servedReceipt = await sealReceipt({
      schema: 'relatte.receipt/v0',
      crossing_id: crossingId,
      world_id: this.config.world_id,
      receiver_particular: this.config.mirror_particular,
      kind: 'R7_SERVED',
      semantic_effect: 'none',
      contract_ref: this.config.contract_ref,
      pre_state_ref: record.object_id,
      post_state_ref: record.object_id,
      descendant_refs: [],
      residual_refs: [record.object_id],
      note: 'mirror served an independently retained canonical crossing',
      created_at: createdAt,
      extensions: {
        mirror: {
          claim: 'SERVED',
          object_id: record.object_id,
          stored_receipt_id: record.stored_receipt.receipt_id,
          laws: [
            'SERVED != PUBLISHED',
            'SERVED != STORED',
            'SERVED != RECEIVED',
            'MIRROR != SOURCE',
          ],
        },
      },
    }, this.keys);

    await appendFile(
      join(this.root, 'serve-claims.jsonl'),
      JSON.stringify(servedReceipt) + '\n',
      'utf8',
    );

    return {
      schema: 'relatte.mirror-serve-bundle/v0',
      crossing,
      published_receipt: record.published_receipt,
      stored_receipt: record.stored_receipt,
      served_receipt: servedReceipt,
      laws: [
        'MIRROR != SOURCE',
        'SERVE != PUBLISH',
        'SERVE != RECEIVE',
      ],
    };
  }
}

export async function verifyMirrorServeBundle(
  value: unknown,
  expectedCrossingId?: string,
): Promise<boolean> {
  try {
    const bundle = asRecord(value, 'INVALID_MIRROR_SERVE_BUNDLE');
    if (bundle.schema !== 'relatte.mirror-serve-bundle/v0') return false;

    const crossing = asRecord(bundle.crossing, 'INVALID_MIRROR_CROSSING');
    if (!(await verifyCrossingEnvelope(crossing))) return false;
    if (expectedCrossingId && crossing.crossing_id !== expectedCrossingId) return false;

    if (!(await verifyPublishedClaim(crossing, bundle.published_receipt))) return false;
    if (!(await verifyReceipt(bundle.stored_receipt))) return false;
    if (!(await verifyReceipt(bundle.served_receipt))) return false;

    const stored = asRecord(bundle.stored_receipt, 'INVALID_MIRROR_STORED_RECEIPT');
    const served = asRecord(bundle.served_receipt, 'INVALID_MIRROR_SERVED_RECEIPT');
    if (stored.kind !== 'R7_STORED' || served.kind !== 'R7_SERVED') return false;
    if (stored.crossing_id !== crossing.crossing_id || served.crossing_id !== crossing.crossing_id) return false;
    if (
      stored.world_id !== served.world_id ||
      stored.receiver_particular !== served.receiver_particular
    ) {
      return false;
    }

    const storedMirror = asRecord(
      asRecord(stored.extensions, 'INVALID_MIRROR_STORED_EXTENSIONS').mirror,
      'INVALID_MIRROR_STORED_EXTENSIONS',
    );
    const servedMirror = asRecord(
      asRecord(served.extensions, 'INVALID_MIRROR_SERVED_EXTENSIONS').mirror,
      'INVALID_MIRROR_SERVED_EXTENSIONS',
    );

    if (storedMirror.object_id !== servedMirror.object_id) return false;
    if (servedMirror.stored_receipt_id !== stored.receipt_id) return false;

    const canonicalBody = canonicalize(crossing);
    if (storedMirror.object_id !== objectIdFromBody(canonicalBody)) return false;

    return true;
  } catch {
    return false;
  }
}
