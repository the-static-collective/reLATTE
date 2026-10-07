import { randomBytes } from 'node:crypto';
import { split, combine } from 'shamir-secret-sharing';

import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { generateP256KeyPair, P256_ALGORITHM, type P256KeyMaterial } from './protocol.ts';

const FATHERHAND_FP_DOMAIN = 'FatherHand-PublicIdentity-v0|';
const FOUNDERNODE_FP_DOMAIN = 'FounderNode-PublicIdentity-v0|';
const OPERATIONAL_FP_DOMAIN = 'FounderNode-OperationalKey-v0|';

const FOUNDING_ID_DOMAIN = 'FatherHand-Founding-v0|';
const FOUNDING_SIGNATURE_DOMAIN = 'FatherHand-FoundingSignature-v0|';
const FOUNDING_SIGNING_DOMAIN = 'fatherhand.founding-signature/v0';

const SUCCESSION_ID_DOMAIN = 'FatherHand-Succession-v0|';
const SUCCESSION_OLD_SIGNATURE_DOMAIN = 'FatherHand-SuccessionOldSignature-v0|';
const SUCCESSION_NEW_SIGNATURE_DOMAIN = 'FatherHand-SuccessionNewCountersignature-v0|';
const SUCCESSION_OLD_SIGNING_DOMAIN = 'fatherhand.succession-old-signature/v0';
const SUCCESSION_NEW_SIGNING_DOMAIN = 'fatherhand.succession-new-countersignature/v0';

const DELEGATION_ID_DOMAIN = 'FounderNode-Delegation-v0|';
const DELEGATION_SIGNATURE_DOMAIN = 'FounderNode-DelegationSignature-v0|';
const DELEGATION_SIGNING_DOMAIN = 'foundernode.delegation-signature/v0';

const PEER_TRUST_ID_DOMAIN = 'FatherHand-PeerTrust-v0|';
const PEER_TRUST_SIGNATURE_DOMAIN = 'FatherHand-PeerTrustSignature-v0|';
const PEER_TRUST_SIGNING_DOMAIN = 'fatherhand.peer-trust-signature/v0';
const RECOVERY_SHARE_SIGNATURE_DOMAIN = 'FatherHand-RecoveryShareSignature-v0|';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const HEX64 = /^[a-f0-9]{64}$/;
const WORLD_ID_RE = /^webz:[a-z0-9][a-z0-9_-]{0,63}(?:\/[a-z0-9][a-z0-9_-]{0,63}){1,3}$/;
const FOUNDER_SCOPE_ALLOWLIST = new Set([
  'webz-world-identity',
  'delegate-operational-peer-keys',
  'delegate-relatte-receiver-key',
]);
const PEER_SCOPE_ALLOWLIST = new Set([
  'webz-peer-auth',
  'receive-relatte-crossing',
]);

function validateWorldId(value: unknown, code = 'INVALID_WORLD_ID'): string {
  if (typeof value !== 'string' || value.length > 256 || !WORLD_ID_RE.test(value)) throw new Error(code);
  return value;
}

function validateClosedScopes(value: unknown, allowed: Set<string>, code: string): string[] {
  const scopes = assertStringArray(value, code);
  if (scopes.some((scope) => !allowed.has(scope))) throw new Error(code);
  return scopes;
}

function validateEndpointConstraints(scope: string, value: unknown): string[] {
  const constraints = assertStringList(value, 'INVALID_ENDPOINT_CONSTRAINTS');
  if (scope !== 'webz-peer-https') return constraints;
  for (const entry of constraints) {
    let url: URL;
    try { url = new URL(entry); }
    catch { throw new Error('INVALID_ENDPOINT_CONSTRAINTS'); }
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== '' ||
      url.search !== '' ||
      url.hostname === '' ||
      /[\u0000-\u001f\u007f]/.test(entry) ||
      url.toString() !== entry
    ) throw new Error('INVALID_ENDPOINT_CONSTRAINTS');
  }
  return constraints;
}

type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };

export interface FatherHand {
  generation: number;
  fingerprint: string;
  public_key: PublicJwk;
}

const fatherHandSecrets = new WeakMap<FatherHand, {
  privateKey: CryptoKey;
  fingerprint: string;
  generation: number;
  publicKey: string;
}>();

function requireFatherHandPrivateKey(father: FatherHand): CryptoKey {
  const secret = fatherHandSecrets.get(father);
  if (!secret) throw new Error('FATHERHAND_PRIVATE_KEY_UNAVAILABLE');
  if (
    father.fingerprint !== secret.fingerprint ||
    father.generation !== secret.generation ||
    JSON.stringify(father.public_key) !== secret.publicKey
  ) throw new Error('FATHERHAND_HANDLE_IDENTITY_MISMATCH');
  return secret.privateKey;
}

export function retireFatherHand(father: FatherHand): void {
  fatherHandSecrets.delete(father);
}

export interface FounderNode {
  world_id: string;
  fingerprint: string;
  public_key: PublicJwk;
  founding_statement: Record<string, any>;
}

const founderNodeSecrets = new WeakMap<FounderNode, {
  privateKey: CryptoKey;
  worldId: string;
  fingerprint: string;
  publicKey: string;
  foundingStatementId: string;
}>();

function requireFounderNodePrivateKey(founder: FounderNode): CryptoKey {
  const secret = founderNodeSecrets.get(founder);
  if (!secret) throw new Error('FOUNDERNODE_PRIVATE_KEY_UNAVAILABLE');
  if (
    founder.world_id !== secret.worldId ||
    founder.fingerprint !== secret.fingerprint ||
    JSON.stringify(founder.public_key) !== secret.publicKey ||
    founder.founding_statement?.statement_id !== secret.foundingStatementId
  ) throw new Error('FOUNDERNODE_HANDLE_IDENTITY_MISMATCH');
  return secret.privateKey;
}

export interface OperationalKey {
  fingerprint: string;
  public_key: PublicJwk;
  private_key: CryptoKey;
}

export interface FatherKid {
  schema: 'fatherhand.recovery-share/v0';
  fatherhand_fingerprint: string;
  fatherhand_generation: number;
  fatherhand_public_key: PublicJwk;
  recovery_set_id: string;
  lineage_id: string;
  share_index: number;
  threshold: number;
  total: number;
  share_bytes: string;
  share_checksum: string;
  share_signature: string;
  scope: 'RECOVERY_ONLY';
}

export interface FatherKidBackup {
  schema: 'fatherhand.kid-backup-share/v0';
  fatherhand_fingerprint: string;
  fatherhand_generation: number;
  fatherhand_public_key: PublicJwk;
  recovery_set_id: string;
  parent_lineage_id: string;
  parent_share_index: number;
  parent_share_checksum: string;
  parent_share_signature: string;
  parent_threshold: number;
  parent_total: number;
  backup_set_id: string;
  backup_lineage_id: string;
  fragment_index: number;
  threshold: number;
  total: number;
  fragment_bytes: string;
  fragment_checksum: string;
  scope: 'KID_BACKUP_ONLY';
}

function now(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return prefix + randomBytes(16).toString('hex');
}

function exactKeys(value: unknown, keys: readonly string[], code: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const record = value as Record<string, any>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) {
    throw new Error(code);
  }
  return record;
}

function normalizePublicJwk(value: unknown): PublicJwk {
  const key = exactKeys(value, ['kty', 'crv', 'x', 'y'], 'INVALID_PUBLIC_KEY');
  if (key.kty !== 'EC' || key.crv !== 'P-256') throw new Error('INVALID_PUBLIC_KEY');
  for (const coordinate of [key.x, key.y]) {
    if (typeof coordinate !== 'string' || !BASE64URL_RE.test(coordinate)) throw new Error('INVALID_PUBLIC_KEY');
    const bytes = Buffer.from(coordinate, 'base64url');
    if (bytes.length !== 32 || bytes.toString('base64url') !== coordinate) throw new Error('INVALID_PUBLIC_KEY');
  }
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}

async function publicJwkFromPrivateKey(privateKey: CryptoKey): Promise<PublicJwk> {
  const exported = await crypto.subtle.exportKey('jwk', privateKey);
  if (exported.kty !== 'EC' || exported.crv !== 'P-256' || !exported.x || !exported.y) {
    throw new Error('INVALID_RECOVERED_FATHERHAND_KEY');
  }
  return normalizePublicJwk({ kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y });
}

function publicFingerprint(domain: string, prefix: string, value: unknown): string {
  const key = normalizePublicJwk(value);
  return prefix + sha256Hex(canonicalizeDomainValue(domain, key));
}

export function fatherHandFingerprint(value: unknown): string {
  return publicFingerprint(FATHERHAND_FP_DOMAIN, 'fatherhand-v0:', value);
}

export function founderNodeFingerprint(value: unknown): string {
  return publicFingerprint(FOUNDERNODE_FP_DOMAIN, 'foundernode-v0:', value);
}

export function operationalKeyFingerprint(value: unknown): string {
  return publicFingerprint(OPERATIONAL_FP_DOMAIN, 'foundernode-op-v0:', value);
}

function toBytes(value: string, code: string): Uint8Array {
  if (!BASE64URL_RE.test(value)) throw new Error(code);
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== value) throw new Error(code);
  return new Uint8Array(bytes);
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');
}

async function sign(privateKey: CryptoKey, domain: string, value: unknown): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new Uint8Array(canonicalizeDomainValue(domain, value)),
  );
  return base64url(signature);
}

async function verify(publicKeyValue: unknown, domain: string, value: unknown, signature: unknown): Promise<boolean> {
  try {
    if (typeof signature !== 'string' || !BASE64URL_RE.test(signature)) return false;
    const bytes = Buffer.from(signature, 'base64url');
    if (bytes.length !== 64 || bytes.toString('base64url') !== signature) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      normalizePublicJwk(publicKeyValue),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new Uint8Array(bytes),
      new Uint8Array(canonicalizeDomainValue(domain, value)),
    );
  } catch {
    return false;
  }
}

function signingIdentity(publicKey: PublicJwk, domain: string): Record<string, any> {
  return {
    algorithm: P256_ALGORITHM,
    public_key: publicKey,
    domain,
  };
}

function verifySigningObject(value: unknown, domain: string): { public_key: PublicJwk; signature: string } | null {
  try {
    const signing = exactKeys(value, ['algorithm', 'public_key', 'signature', 'domain'], 'INVALID_SIGNING');
    if (signing.algorithm !== P256_ALGORITHM || signing.domain !== domain || typeof signing.signature !== 'string') return null;
    return { public_key: normalizePublicJwk(signing.public_key), signature: signing.signature };
  } catch {
    return null;
  }
}

function assertStringArray(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((x) => typeof x !== 'string' || x.length === 0)) {
    throw new Error(code);
  }
  if (new Set(value).size !== value.length) throw new Error(code);
  return [...value];
}

function assertStringList(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.some((x) => typeof x !== 'string' || x.length === 0)) throw new Error(code);
  if (new Set(value).size !== value.length) throw new Error(code);
  return [...value];
}

export function assertPublicArtifactSafe(value: unknown): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (lower === 'd' || lower === 'private_key' || lower === 'privatekey') {
        throw new Error('PRIVATE_KEY_MATERIAL');
      }
      if (
        lower === 'share_bytes' ||
        lower === 'fragment_bytes' ||
        lower === 'seed_material' ||
        lower === 'recovery_payload' ||
        lower === 'secret_share'
      ) {
        throw new Error('PRIVATE_RECOVERY_MATERIAL');
      }
      visit(child);
    }
  };
  visit(value);
}

async function createFatherHand(generation: number): Promise<FatherHand> {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('INVALID_FATHERHAND_GENERATION');
  const keys = await generateP256KeyPair();
  const father: FatherHand = {
    generation,
    fingerprint: fatherHandFingerprint(keys.publicKeyJwk),
    public_key: normalizePublicJwk(keys.publicKeyJwk),
  };
  fatherHandSecrets.set(father, {
    privateKey: keys.privateKey,
    fingerprint: father.fingerprint,
    generation: father.generation,
    publicKey: JSON.stringify(father.public_key),
  });
  return father;
}

export async function createFatherHandGenesis(): Promise<FatherHand> {
  return createFatherHand(0);
}

function foundingBody(statement: Record<string, any>): Record<string, any> {
  return {
    schema: statement.schema,
    fatherhand_fingerprint: statement.fatherhand_fingerprint,
    fatherhand_generation: statement.fatherhand_generation,
    founder_world_id: statement.founder_world_id,
    founder_public_key: statement.founder_public_key,
    founder_fingerprint: statement.founder_fingerprint,
    scopes: statement.scopes,
    constraints: statement.constraints,
    created_at: statement.created_at,
    signing: {
      algorithm: statement.signing.algorithm,
      public_key: statement.signing.public_key,
      domain: statement.signing.domain,
    },
  };
}

export async function createFounderNode(
  father: FatherHand,
  worldId: string,
  scopes: string[],
): Promise<FounderNode> {
  const canonicalWorldId = validateWorldId(worldId);
  const allowedScopes = validateClosedScopes(scopes, FOUNDER_SCOPE_ALLOWLIST, 'INVALID_FOUNDER_SCOPES');
  const keys = await generateP256KeyPair();
  const founderPublic = normalizePublicJwk(keys.publicKeyJwk);
  const statement: Record<string, any> = {
    schema: 'fatherhand.founding/v0',
    statement_id: 'pending',
    fatherhand_fingerprint: father.fingerprint,
    fatherhand_generation: father.generation,
    founder_world_id: canonicalWorldId,
    founder_public_key: founderPublic,
    founder_fingerprint: founderNodeFingerprint(founderPublic),
    scopes: allowedScopes,
    constraints: { delegation_must_be_scoped: true },
    created_at: now(),
    signing: {
      ...signingIdentity(father.public_key, FOUNDING_SIGNING_DOMAIN),
      signature: 'pending',
    },
  };
  statement.statement_id = 'fatherhand-founding-v0:' + sha256Hex(
    canonicalizeDomainValue(FOUNDING_ID_DOMAIN, foundingBody(statement)),
  );
  statement.signing.signature = await sign(
    requireFatherHandPrivateKey(father),
    FOUNDING_SIGNATURE_DOMAIN,
    { statement_id: statement.statement_id, ...foundingBody(statement) },
  );
  assertPublicArtifactSafe(statement);
  const founder: FounderNode = {
    world_id: canonicalWorldId,
    fingerprint: statement.founder_fingerprint,
    public_key: founderPublic,
    founding_statement: statement,
  };
  founderNodeSecrets.set(founder, {
    privateKey: keys.privateKey,
    worldId: founder.world_id,
    fingerprint: founder.fingerprint,
    publicKey: JSON.stringify(founder.public_key),
    foundingStatementId: founder.founding_statement.statement_id,
  });
  return founder;
}

export async function verifyFatherHandFounding(value: unknown): Promise<boolean> {
  try {
    const statement = exactKeys(value, [
      'schema', 'statement_id', 'fatherhand_fingerprint', 'fatherhand_generation',
      'founder_world_id', 'founder_public_key', 'founder_fingerprint', 'scopes',
      'constraints', 'created_at', 'signing',
    ], 'INVALID_FOUNDING_STATEMENT');
    if (statement.schema !== 'fatherhand.founding/v0') return false;
    if (!Number.isSafeInteger(statement.fatherhand_generation) || statement.fatherhand_generation < 0) return false;
    validateWorldId(statement.founder_world_id);
    validateTimestamp(statement.created_at);
    validateClosedScopes(statement.scopes, FOUNDER_SCOPE_ALLOWLIST, 'INVALID_FOUNDER_SCOPES');
    exactKeys(statement.constraints, ['delegation_must_be_scoped'], 'INVALID_FOUNDING_CONSTRAINTS');
    if (statement.constraints.delegation_must_be_scoped !== true) return false;
    const signer = verifySigningObject(statement.signing, FOUNDING_SIGNING_DOMAIN);
    if (!signer) return false;
    const founderKey = normalizePublicJwk(statement.founder_public_key);
    if (statement.fatherhand_fingerprint !== fatherHandFingerprint(signer.public_key)) return false;
    if (statement.founder_fingerprint !== founderNodeFingerprint(founderKey)) return false;
    const expected = 'fatherhand-founding-v0:' + sha256Hex(
      canonicalizeDomainValue(FOUNDING_ID_DOMAIN, foundingBody(statement)),
    );
    if (statement.statement_id !== expected) return false;
    return verify(
      signer.public_key,
      FOUNDING_SIGNATURE_DOMAIN,
      { statement_id: expected, ...foundingBody(statement) },
      signer.signature,
    );
  } catch {
    return false;
  }
}

function recoveryShareIdentity(share: FatherKid): Record<string, any> {
  return {
    schema: share.schema,
    fatherhand_fingerprint: share.fatherhand_fingerprint,
    fatherhand_generation: share.fatherhand_generation,
    fatherhand_public_key: share.fatherhand_public_key,
    recovery_set_id: share.recovery_set_id,
    lineage_id: share.lineage_id,
    share_index: share.share_index,
    threshold: share.threshold,
    total: share.total,
    share_checksum: share.share_checksum,
    scope: share.scope,
  };
}

function recoveryShareRecord(value: unknown): FatherKid {
  const share = exactKeys(value, [
    'schema', 'fatherhand_fingerprint', 'fatherhand_generation', 'fatherhand_public_key',
    'recovery_set_id', 'lineage_id', 'share_index', 'threshold', 'total', 'share_bytes',
    'share_checksum', 'share_signature', 'scope',
  ], 'INVALID_RECOVERY_SHARE') as unknown as FatherKid;
  if (
    share.schema !== 'fatherhand.recovery-share/v0' ||
    !share.fatherhand_fingerprint.startsWith('fatherhand-v0:') ||
    !Number.isSafeInteger(share.fatherhand_generation) || share.fatherhand_generation < 0 ||
    !/^fatherhand-recovery-v0:[a-f0-9]{32}$/.test(share.recovery_set_id) ||
    !/^fatherkid-v0:[a-f0-9]{32}$/.test(share.lineage_id) ||
    !Number.isSafeInteger(share.share_index) || share.share_index < 1 || share.share_index > 255 ||
    !Number.isSafeInteger(share.threshold) || share.threshold < 2 ||
    !Number.isSafeInteger(share.total) || share.total < share.threshold || share.total > 255 ||
    typeof share.share_bytes !== 'string' ||
    !HEX64.test(share.share_checksum) ||
    typeof share.share_signature !== 'string' ||
    share.scope !== 'RECOVERY_ONLY'
  ) throw new Error('INVALID_RECOVERY_SHARE');
  share.fatherhand_public_key = normalizePublicJwk(share.fatherhand_public_key);
  if (fatherHandFingerprint(share.fatherhand_public_key) !== share.fatherhand_fingerprint) {
    throw new Error('RECOVERY_SHARE_FATHERHAND_KEY_MISMATCH');
  }
  const bytes = toBytes(share.share_bytes, 'INVALID_RECOVERY_SHARE_BYTES');
  if (sha256Hex(bytes) !== share.share_checksum) throw new Error('RECOVERY_SHARE_CHECKSUM_MISMATCH');
  if (bytes[bytes.length - 1] !== share.share_index) throw new Error('RECOVERY_SHARE_COORDINATE_MISMATCH');
  return { ...share };
}

async function verifiedRecoveryShare(value: unknown): Promise<FatherKid> {
  const share = recoveryShareRecord(value);
  const valid = await verify(
    share.fatherhand_public_key,
    RECOVERY_SHARE_SIGNATURE_DOMAIN,
    recoveryShareIdentity(share),
    share.share_signature,
  );
  if (!valid) throw new Error('INVALID_RECOVERY_SHARE_SIGNATURE');
  return share;
}

export async function issueRecoverySet(
  father: FatherHand,
  total = 5,
  threshold = 3,
): Promise<{ schema: 'fatherhand.recovery-set/v0'; recovery_set_id: string; threshold: number; total: number; shares: FatherKid[] }> {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(threshold) || threshold < 2 || total < threshold || total > 255) {
    throw new Error('INVALID_RECOVERY_THRESHOLD');
  }
  const exported = new Uint8Array(await crypto.subtle.exportKey('pkcs8', requireFatherHandPrivateKey(father)));
  let pieces: Uint8Array[];
  try {
    pieces = await split(exported, total, threshold);
  } finally {
    exported.fill(0);
  }
  const recoverySetId = randomId('fatherhand-recovery-v0:');
  const shares: FatherKid[] = [];
  for (const bytes of pieces) {
    const copy = new Uint8Array(bytes);
    const share: FatherKid = {
      schema: 'fatherhand.recovery-share/v0',
      fatherhand_fingerprint: father.fingerprint,
      fatherhand_generation: father.generation,
      fatherhand_public_key: father.public_key,
      recovery_set_id: recoverySetId,
      lineage_id: randomId('fatherkid-v0:'),
      share_index: copy[copy.length - 1]!,
      threshold,
      total,
      share_bytes: base64url(copy),
      share_checksum: sha256Hex(copy),
      share_signature: 'pending',
      scope: 'RECOVERY_ONLY',
    };
    share.share_signature = await sign(
      requireFatherHandPrivateKey(father),
      RECOVERY_SHARE_SIGNATURE_DOMAIN,
      recoveryShareIdentity(share),
    );
    shares.push(share);
    copy.fill(0);
    bytes.fill(0);
  }
  return { schema: 'fatherhand.recovery-set/v0', recovery_set_id: recoverySetId, threshold, total, shares };
}

class RecoveredFatherHand {
  readonly fingerprint: string;
  readonly generation: number;
  readonly public_key: PublicJwk;
  #privateKey: CryptoKey | null;

  constructor(fingerprint: string, generation: number, publicKey: PublicJwk, privateKey: CryptoKey) {
    this.fingerprint = fingerprint;
    this.generation = generation;
    this.public_key = publicKey;
    this.#privateKey = privateKey;
  }

  useKey(): CryptoKey {
    if (!this.#privateKey) throw new Error('RECOVERED_FATHERHAND_CLOSED');
    return this.#privateKey;
  }

  close(): void {
    this.#privateKey = null;
  }
}

export async function reconstructFatherHand(
  candidates: FatherKid[],
  expectedFingerprint: string,
): Promise<RecoveredFatherHand> {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('RECOVERY_QUORUM_NOT_MET');
  const shares = await Promise.all(candidates.map((candidate) => verifiedRecoveryShare(candidate)));
  const first = shares[0];
  if (shares.length < first.threshold) throw new Error('RECOVERY_QUORUM_NOT_MET');
  if (new Set(shares.map((x) => x.lineage_id)).size !== shares.length) throw new Error('DUPLICATE_RECOVERY_LINEAGE');
  if (new Set(shares.map((x) => x.share_index)).size !== shares.length) throw new Error('DUPLICATE_RECOVERY_SHARE_INDEX');
  for (const share of shares) {
    if (share.fatherhand_fingerprint !== first.fatherhand_fingerprint) throw new Error('MIXED_FATHERHAND_IDENTITY');
    if (share.fatherhand_generation !== first.fatherhand_generation) throw new Error('MIXED_FATHERHAND_GENERATION');
    if (share.recovery_set_id !== first.recovery_set_id || share.threshold !== first.threshold || share.total !== first.total) {
      throw new Error('MIXED_RECOVERY_SET');
    }
  }
  if (first.fatherhand_fingerprint !== expectedFingerprint) throw new Error('UNEXPECTED_FATHERHAND_IDENTITY');
  const buffers = shares.slice(0, first.threshold).map((x) => toBytes(x.share_bytes, 'INVALID_RECOVERY_SHARE_BYTES'));
  let recovered: Uint8Array;
  try {
    recovered = await combine(buffers);
  } finally {
    for (const item of buffers) item.fill(0);
  }
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      new Uint8Array(recovered),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign'],
    );
    const publicKey = await publicJwkFromPrivateKey(key);
    const fingerprint = fatherHandFingerprint(publicKey);
    if (fingerprint !== expectedFingerprint) throw new Error('RECOVERED_FATHERHAND_FINGERPRINT_MISMATCH');
    return new RecoveredFatherHand(fingerprint, first.fatherhand_generation, publicKey, key);
  } finally {
    recovered.fill(0);
  }
}

function kidBackupRecord(value: unknown): FatherKidBackup {
  const child = exactKeys(value, [
    'schema', 'fatherhand_fingerprint', 'fatherhand_generation', 'fatherhand_public_key',
    'recovery_set_id', 'parent_lineage_id', 'parent_share_index', 'parent_share_checksum',
    'parent_share_signature', 'parent_threshold', 'parent_total', 'backup_set_id',
    'backup_lineage_id', 'fragment_index', 'threshold', 'total', 'fragment_bytes',
    'fragment_checksum', 'scope',
  ], 'INVALID_KID_BACKUP_SHARE') as unknown as FatherKidBackup;
  if (
    child.schema !== 'fatherhand.kid-backup-share/v0' ||
    !/^fatherkid-backup-v0:[a-f0-9]{32}$/.test(child.backup_set_id) ||
    !/^fatherkid-descendant-v0:[a-f0-9]{32}$/.test(child.backup_lineage_id) ||
    !Number.isSafeInteger(child.fragment_index) || child.fragment_index < 1 || child.fragment_index > 255 ||
    !Number.isSafeInteger(child.threshold) || child.threshold < 2 ||
    !Number.isSafeInteger(child.total) || child.total < child.threshold || child.total > 255 ||
    !HEX64.test(child.parent_share_checksum) || !HEX64.test(child.fragment_checksum) ||
    typeof child.parent_share_signature !== 'string' ||
    child.scope !== 'KID_BACKUP_ONLY'
  ) throw new Error('INVALID_KID_BACKUP_SHARE');
  child.fatherhand_public_key = normalizePublicJwk(child.fatherhand_public_key);
  if (fatherHandFingerprint(child.fatherhand_public_key) !== child.fatherhand_fingerprint) {
    throw new Error('KID_BACKUP_FATHERHAND_KEY_MISMATCH');
  }
  const bytes = toBytes(child.fragment_bytes, 'INVALID_KID_BACKUP_BYTES');
  if (sha256Hex(bytes) !== child.fragment_checksum) throw new Error('KID_BACKUP_CHECKSUM_MISMATCH');
  if (bytes[bytes.length - 1] !== child.fragment_index) throw new Error('KID_BACKUP_COORDINATE_MISMATCH');
  return { ...child };
}

export async function createKidBackupSet(
  parentValue: FatherKid,
  total = 3,
  threshold = 2,
): Promise<FatherKidBackup[]> {
  const parent = await verifiedRecoveryShare(parentValue);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(threshold) || threshold < 2 || total < threshold || total > 255) {
    throw new Error('INVALID_KID_BACKUP_THRESHOLD');
  }
  const secret = toBytes(parent.share_bytes, 'INVALID_RECOVERY_SHARE_BYTES');
  let pieces: Uint8Array[];
  try {
    pieces = await split(secret, total, threshold);
  } finally {
    secret.fill(0);
  }
  const backupSetId = randomId('fatherkid-backup-v0:');
  return pieces.map((piece) => {
    const copy = new Uint8Array(piece);
    const result: FatherKidBackup = {
      schema: 'fatherhand.kid-backup-share/v0',
      fatherhand_fingerprint: parent.fatherhand_fingerprint,
      fatherhand_generation: parent.fatherhand_generation,
      fatherhand_public_key: parent.fatherhand_public_key,
      recovery_set_id: parent.recovery_set_id,
      parent_lineage_id: parent.lineage_id,
      parent_share_index: parent.share_index,
      parent_share_checksum: parent.share_checksum,
      parent_share_signature: parent.share_signature,
      parent_threshold: parent.threshold,
      parent_total: parent.total,
      backup_set_id: backupSetId,
      backup_lineage_id: randomId('fatherkid-descendant-v0:'),
      fragment_index: copy[copy.length - 1]!,
      threshold,
      total,
      fragment_bytes: base64url(copy),
      fragment_checksum: sha256Hex(copy),
      scope: 'KID_BACKUP_ONLY',
    };
    copy.fill(0);
    piece.fill(0);
    return result;
  });
}

export async function recoverKidShare(candidates: FatherKidBackup[]): Promise<FatherKid> {
  if (!Array.isArray(candidates) || candidates.length === 0) throw new Error('KID_BACKUP_QUORUM_NOT_MET');
  const shares = candidates.map(kidBackupRecord);
  const first = shares[0]!;
  if (shares.length < first.threshold) throw new Error('KID_BACKUP_QUORUM_NOT_MET');
  if (new Set(shares.map((x) => x.backup_lineage_id)).size !== shares.length) throw new Error('DUPLICATE_KID_BACKUP_LINEAGE');
  if (new Set(shares.map((x) => x.fragment_index)).size !== shares.length) throw new Error('DUPLICATE_KID_BACKUP_INDEX');
  for (const item of shares) {
    if (item.parent_lineage_id !== first.parent_lineage_id) throw new Error('MIXED_PARENT_LINEAGE');
    if (
      item.backup_set_id !== first.backup_set_id ||
      item.fatherhand_fingerprint !== first.fatherhand_fingerprint ||
      JSON.stringify(item.fatherhand_public_key) !== JSON.stringify(first.fatherhand_public_key) ||
      item.fatherhand_generation !== first.fatherhand_generation ||
      item.recovery_set_id !== first.recovery_set_id ||
      item.parent_share_index !== first.parent_share_index ||
      item.parent_share_checksum !== first.parent_share_checksum ||
      item.parent_share_signature !== first.parent_share_signature ||
      item.parent_threshold !== first.parent_threshold ||
      item.parent_total !== first.parent_total ||
      item.threshold !== first.threshold ||
      item.total !== first.total
    ) throw new Error('MIXED_KID_BACKUP_SET');
  }
  const fragments = shares.slice(0, first.threshold).map((x) => toBytes(x.fragment_bytes, 'INVALID_KID_BACKUP_BYTES'));
  let recovered: Uint8Array;
  try {
    recovered = await combine(fragments);
  } finally {
    for (const item of fragments) item.fill(0);
  }
  try {
    if (sha256Hex(recovered) !== first.parent_share_checksum) throw new Error('RECOVERED_KID_SHARE_CHECKSUM_MISMATCH');
    return await verifiedRecoveryShare({
      schema: 'fatherhand.recovery-share/v0',
      fatherhand_fingerprint: first.fatherhand_fingerprint,
      fatherhand_generation: first.fatherhand_generation,
      fatherhand_public_key: first.fatherhand_public_key,
      recovery_set_id: first.recovery_set_id,
      lineage_id: first.parent_lineage_id,
      share_index: first.parent_share_index,
      threshold: first.parent_threshold,
      total: first.parent_total,
      share_bytes: base64url(recovered),
      share_checksum: first.parent_share_checksum,
      share_signature: first.parent_share_signature,
      scope: 'RECOVERY_ONLY',
    });
  } finally {
    recovered.fill(0);
  }
}

function successionBody(statement: Record<string, any>): Record<string, any> {
  return {
    schema: statement.schema,
    old_fatherhand_fingerprint: statement.old_fatherhand_fingerprint,
    old_generation: statement.old_generation,
    new_fatherhand_public_key: statement.new_fatherhand_public_key,
    new_fatherhand_fingerprint: statement.new_fatherhand_fingerprint,
    new_generation: statement.new_generation,
    reason: statement.reason,
    previous_lineage_head: statement.previous_lineage_head,
    retained_founder_fingerprints: statement.retained_founder_fingerprints,
    revoked_founder_fingerprints: statement.revoked_founder_fingerprints,
    created_at: statement.created_at,
    old_signing: {
      algorithm: statement.old_signing.algorithm,
      public_key: statement.old_signing.public_key,
      domain: statement.old_signing.domain,
    },
    new_countersigning: {
      algorithm: statement.new_countersigning.algorithm,
      public_key: statement.new_countersigning.public_key,
      domain: statement.new_countersigning.domain,
    },
  };
}

class RecoveryCeremony {
  #recovered: RecoveredFatherHand | null;

  constructor(recovered: RecoveredFatherHand) {
    this.#recovered = recovered;
  }

  async createSuccessor(args: {
    reason: string;
    retained_founder_fingerprints: string[];
    revoked_founder_fingerprints: string[];
    previous_lineage_head: string | null;
  }): Promise<{ successor: FatherHand; statement: Record<string, any> }> {
    if (!this.#recovered) throw new Error('RECOVERY_CEREMONY_CLOSED');
    if (typeof args.reason !== 'string' || args.reason.length === 0 || args.reason.length > 160) throw new Error('INVALID_SUCCESSION_REASON');
    const retained = assertStringList(args.retained_founder_fingerprints, 'INVALID_RETAINED_FOUNDERS');
    const revoked = assertStringList(args.revoked_founder_fingerprints, 'INVALID_REVOKED_FOUNDERS');
    if (retained.some((x) => revoked.includes(x))) throw new Error('CONFLICTING_FOUNDER_STATUS');
    if (args.previous_lineage_head !== null && (typeof args.previous_lineage_head !== 'string' || args.previous_lineage_head.length === 0)) {
      throw new Error('INVALID_PREVIOUS_LINEAGE_HEAD');
    }
    const old = this.#recovered;
    const successor = await createFatherHand(old.generation + 1);
    const statement: Record<string, any> = {
      schema: 'fatherhand.succession/v0',
      statement_id: 'pending',
      old_fatherhand_fingerprint: old.fingerprint,
      old_generation: old.generation,
      new_fatherhand_public_key: successor.public_key,
      new_fatherhand_fingerprint: successor.fingerprint,
      new_generation: successor.generation,
      reason: args.reason,
      previous_lineage_head: args.previous_lineage_head,
      retained_founder_fingerprints: retained,
      revoked_founder_fingerprints: revoked,
      created_at: now(),
      old_signing: {
        ...signingIdentity(old.public_key, SUCCESSION_OLD_SIGNING_DOMAIN),
        signature: 'pending',
      },
      new_countersigning: {
        ...signingIdentity(successor.public_key, SUCCESSION_NEW_SIGNING_DOMAIN),
        signature: 'pending',
      },
    };
    statement.statement_id = 'fatherhand-succession-v0:' + sha256Hex(
      canonicalizeDomainValue(SUCCESSION_ID_DOMAIN, successionBody(statement)),
    );
    statement.old_signing.signature = await sign(
      old.useKey(),
      SUCCESSION_OLD_SIGNATURE_DOMAIN,
      { statement_id: statement.statement_id, ...successionBody(statement) },
    );
    statement.new_countersigning.signature = await sign(
      requireFatherHandPrivateKey(successor),
      SUCCESSION_NEW_SIGNATURE_DOMAIN,
      {
        statement_id: statement.statement_id,
        old_signature: statement.old_signing.signature,
        ...successionBody(statement),
      },
    );
    assertPublicArtifactSafe(statement);
    // Recovery is a one-shot bridge, not a resurrected daily root.
    old.close();
    this.#recovered = null;
    return { successor, statement };
  }

  close(): void {
    if (this.#recovered) this.#recovered.close();
    this.#recovered = null;
  }
}

export async function beginRecoveryCeremony(
  expected: { fingerprint: string; generation: number; public_key: PublicJwk },
  candidates: FatherKid[],
): Promise<RecoveryCeremony> {
  if (
    typeof expected.fingerprint !== 'string' ||
    !Number.isSafeInteger(expected.generation) ||
    expected.generation < 0 ||
    fatherHandFingerprint(expected.public_key) !== expected.fingerprint
  ) throw new Error('INVALID_EXPECTED_FATHERHAND_IDENTITY');
  const recovered = await reconstructFatherHand(candidates, expected.fingerprint);
  if (recovered.generation !== expected.generation) {
    recovered.close();
    throw new Error('RECOVERED_FATHERHAND_GENERATION_MISMATCH');
  }
  return new RecoveryCeremony(recovered);
}

export async function verifyFatherHandSuccession(value: unknown): Promise<boolean> {
  try {
    const statement = exactKeys(value, [
      'schema', 'statement_id', 'old_fatherhand_fingerprint', 'old_generation',
      'new_fatherhand_public_key', 'new_fatherhand_fingerprint', 'new_generation',
      'reason', 'previous_lineage_head', 'retained_founder_fingerprints',
      'revoked_founder_fingerprints', 'created_at', 'old_signing', 'new_countersigning',
    ], 'INVALID_SUCCESSION_STATEMENT');
    if (statement.schema !== 'fatherhand.succession/v0') return false;
    if (!Number.isSafeInteger(statement.old_generation) || statement.old_generation < 0 || statement.new_generation !== statement.old_generation + 1) return false;
    if (typeof statement.reason !== 'string' || statement.reason.length === 0 || statement.reason.length > 160) return false;
    if (statement.previous_lineage_head !== null && (typeof statement.previous_lineage_head !== 'string' || statement.previous_lineage_head.length === 0)) return false;
    const retained = assertStringList(statement.retained_founder_fingerprints, 'INVALID_RETAINED_FOUNDERS');
    const revoked = assertStringList(statement.revoked_founder_fingerprints, 'INVALID_REVOKED_FOUNDERS');
    if (retained.some((x) => revoked.includes(x))) return false;
    validateTimestamp(statement.created_at);
    const oldSigning = verifySigningObject(statement.old_signing, SUCCESSION_OLD_SIGNING_DOMAIN);
    const newSigning = verifySigningObject(statement.new_countersigning, SUCCESSION_NEW_SIGNING_DOMAIN);
    if (!oldSigning || !newSigning) return false;
    if (statement.old_fatherhand_fingerprint !== fatherHandFingerprint(oldSigning.public_key)) return false;
    const newKey = normalizePublicJwk(statement.new_fatherhand_public_key);
    if (statement.new_fatherhand_fingerprint !== fatherHandFingerprint(newKey)) return false;
    if (JSON.stringify(newSigning.public_key) !== JSON.stringify(newKey)) return false;
    const expected = 'fatherhand-succession-v0:' + sha256Hex(
      canonicalizeDomainValue(SUCCESSION_ID_DOMAIN, successionBody(statement)),
    );
    if (statement.statement_id !== expected) return false;
    const oldOk = await verify(
      oldSigning.public_key,
      SUCCESSION_OLD_SIGNATURE_DOMAIN,
      { statement_id: expected, ...successionBody(statement) },
      oldSigning.signature,
    );
    if (!oldOk) return false;
    return verify(
      newSigning.public_key,
      SUCCESSION_NEW_SIGNATURE_DOMAIN,
      { statement_id: expected, old_signature: oldSigning.signature, ...successionBody(statement) },
      newSigning.signature,
    );
  } catch {
    return false;
  }
}

export async function createOperationalKey(): Promise<OperationalKey> {
  const keys = await generateP256KeyPair();
  const publicKey = normalizePublicJwk(keys.publicKeyJwk);
  return {
    fingerprint: operationalKeyFingerprint(publicKey),
    public_key: publicKey,
    private_key: keys.privateKey,
  };
}

function authorityScopeForOperationalScope(scope: string): string {
  if (scope === 'webz-peer-https') return 'delegate-operational-peer-keys';
  if (scope === 'relatte-receiver') return 'delegate-relatte-receiver-key';
  throw new Error('INVALID_DELEGATION_SCOPE');
}

function delegationBody(statement: Record<string, any>): Record<string, any> {
  return {
    schema: statement.schema,
    founder_fingerprint: statement.founder_fingerprint,
    founding_statement_id: statement.founding_statement_id,
    authority_scope: statement.authority_scope,
    operational_public_key: statement.operational_public_key,
    operational_fingerprint: statement.operational_fingerprint,
    scope: statement.scope,
    serial: statement.serial,
    not_before: statement.not_before,
    not_after: statement.not_after,
    endpoint_constraints: statement.endpoint_constraints,
    replaces_fingerprint: statement.replaces_fingerprint,
    created_at: statement.created_at,
    signing: {
      algorithm: statement.signing.algorithm,
      public_key: statement.signing.public_key,
      domain: statement.signing.domain,
    },
  };
}

export async function delegateOperationalKey(
  founder: FounderNode,
  publicKeyValue: unknown,
  scope: string,
  details: {
    serial: number;
    not_before: string;
    not_after: string;
    endpoint_constraints: string[];
    replaces_fingerprint: string | null;
  },
): Promise<Record<string, any>> {
  const founderPrivateKey = requireFounderNodePrivateKey(founder);
  if (typeof scope !== 'string' || scope.length === 0) throw new Error('INVALID_DELEGATION_SCOPE');
  const authorityScope = authorityScopeForOperationalScope(scope);
  if (!(await verifyFatherHandFounding(founder.founding_statement)) ||
      founder.founding_statement.founder_fingerprint !== founder.fingerprint ||
      JSON.stringify(founder.founding_statement.founder_public_key) !== JSON.stringify(founder.public_key) ||
      !Array.isArray(founder.founding_statement.scopes) ||
      !founder.founding_statement.scopes.includes(authorityScope)) {
    throw new Error('FOUNDER_SCOPE_NOT_AUTHORIZED');
  }
  if (!Number.isSafeInteger(details.serial) || details.serial < 1) throw new Error('INVALID_DELEGATION_SERIAL');
  validateTimestamp(details.not_before);
  validateTimestamp(details.not_after);
  if (Date.parse(details.not_after) <= Date.parse(details.not_before)) throw new Error('INVALID_DELEGATION_WINDOW');
  const constraints = validateEndpointConstraints(scope, details.endpoint_constraints);
  if (details.replaces_fingerprint !== null && (typeof details.replaces_fingerprint !== 'string' || details.replaces_fingerprint.length === 0)) {
    throw new Error('INVALID_REPLACED_FINGERPRINT');
  }
  const publicKey = normalizePublicJwk(publicKeyValue);
  const statement: Record<string, any> = {
    schema: 'foundernode.delegation/v0',
    statement_id: 'pending',
    founder_fingerprint: founder.fingerprint,
    founding_statement_id: founder.founding_statement.statement_id,
    authority_scope: authorityScope,
    operational_public_key: publicKey,
    operational_fingerprint: operationalKeyFingerprint(publicKey),
    scope,
    serial: details.serial,
    not_before: details.not_before,
    not_after: details.not_after,
    endpoint_constraints: constraints,
    replaces_fingerprint: details.replaces_fingerprint,
    created_at: now(),
    signing: {
      ...signingIdentity(founder.public_key, DELEGATION_SIGNING_DOMAIN),
      signature: 'pending',
    },
  };
  statement.statement_id = 'foundernode-delegation-v0:' + sha256Hex(
    canonicalizeDomainValue(DELEGATION_ID_DOMAIN, delegationBody(statement)),
  );
  statement.signing.signature = await sign(
    founderPrivateKey,
    DELEGATION_SIGNATURE_DOMAIN,
    { statement_id: statement.statement_id, ...delegationBody(statement) },
  );
  assertPublicArtifactSafe(statement);
  return statement;
}

export async function verifyOperationalDelegation(
  value: unknown,
  expectedFounderFingerprint: string,
  requiredScope: string,
  at: string,
  foundingStatementValue: unknown,
): Promise<boolean> {
  try {
    const statement = exactKeys(value, [
      'schema', 'statement_id', 'founder_fingerprint', 'founding_statement_id',
      'authority_scope', 'operational_public_key', 'operational_fingerprint',
      'scope', 'serial', 'not_before', 'not_after',
      'endpoint_constraints', 'replaces_fingerprint', 'created_at', 'signing',
    ], 'INVALID_DELEGATION_STATEMENT');
    if (statement.schema !== 'foundernode.delegation/v0' || statement.founder_fingerprint !== expectedFounderFingerprint || statement.scope !== requiredScope) return false;
    const authorityScope = authorityScopeForOperationalScope(requiredScope);
    if (statement.authority_scope !== authorityScope) return false;
    if (!(await verifyFatherHandFounding(foundingStatementValue))) return false;
    const founding = foundingStatementValue as Record<string, any>;
    if (founding.statement_id !== statement.founding_statement_id ||
        founding.founder_fingerprint !== expectedFounderFingerprint ||
        JSON.stringify(founding.founder_public_key) !== JSON.stringify(statement.signing.public_key) ||
        !Array.isArray(founding.scopes) ||
        !founding.scopes.includes(authorityScope)) return false;
    if (!Number.isSafeInteger(statement.serial) || statement.serial < 1) return false;
    validateTimestamp(statement.not_before);
    validateTimestamp(statement.not_after);
    validateTimestamp(statement.created_at);
    validateTimestamp(at);
    if (Date.parse(at) < Date.parse(statement.not_before) || Date.parse(at) > Date.parse(statement.not_after)) return false;
    validateEndpointConstraints(requiredScope, statement.endpoint_constraints);
    if (statement.replaces_fingerprint !== null && (typeof statement.replaces_fingerprint !== 'string' || statement.replaces_fingerprint.length === 0)) return false;
    const signer = verifySigningObject(statement.signing, DELEGATION_SIGNING_DOMAIN);
    if (!signer || founderNodeFingerprint(signer.public_key) !== expectedFounderFingerprint) return false;
    const op = normalizePublicJwk(statement.operational_public_key);
    if (statement.operational_fingerprint !== operationalKeyFingerprint(op)) return false;
    const expected = 'foundernode-delegation-v0:' + sha256Hex(
      canonicalizeDomainValue(DELEGATION_ID_DOMAIN, delegationBody(statement)),
    );
    if (statement.statement_id !== expected) return false;
    return verify(
      signer.public_key,
      DELEGATION_SIGNATURE_DOMAIN,
      { statement_id: expected, ...delegationBody(statement) },
      signer.signature,
    );
  } catch {
    return false;
  }
}

function peerTrustBody(statement: Record<string, any>): Record<string, any> {
  return {
    schema: statement.schema,
    local_fatherhand_fingerprint: statement.local_fatherhand_fingerprint,
    remote_world_id: statement.remote_world_id,
    remote_founder_public_key: statement.remote_founder_public_key,
    remote_founder_fingerprint: statement.remote_founder_fingerprint,
    scopes: statement.scopes,
    expires_at: statement.expires_at,
    invitation_id: statement.invitation_id,
    decision: statement.decision,
    created_at: statement.created_at,
    signing: {
      algorithm: statement.signing.algorithm,
      public_key: statement.signing.public_key,
      domain: statement.signing.domain,
    },
  };
}

export async function trustPeerFounder(
  father: FatherHand,
  remoteWorldId: string,
  remoteFounderPublicKeyValue: unknown,
  scopes: string[],
  constraints: { expires_at: string; invitation_id: string | null },
): Promise<Record<string, any>> {
  if (typeof remoteWorldId !== 'string' || remoteWorldId.length === 0 || remoteWorldId.length > 256) throw new Error('INVALID_REMOTE_WORLD');
  const allowedScopes = assertStringArray(scopes, 'INVALID_PEER_SCOPES');
  validateTimestamp(constraints.expires_at);
  if (constraints.invitation_id !== null && (typeof constraints.invitation_id !== 'string' || constraints.invitation_id.length === 0)) {
    throw new Error('INVALID_INVITATION_ID');
  }
  const remoteKey = normalizePublicJwk(remoteFounderPublicKeyValue);
  const statement: Record<string, any> = {
    schema: 'fatherhand.peer-trust/v0',
    statement_id: 'pending',
    local_fatherhand_fingerprint: father.fingerprint,
    remote_world_id: remoteWorldId,
    remote_founder_public_key: remoteKey,
    remote_founder_fingerprint: founderNodeFingerprint(remoteKey),
    scopes: allowedScopes,
    expires_at: constraints.expires_at,
    invitation_id: constraints.invitation_id,
    decision: 'TRUST',
    created_at: now(),
    signing: {
      ...signingIdentity(father.public_key, PEER_TRUST_SIGNING_DOMAIN),
      signature: 'pending',
    },
  };
  statement.statement_id = 'fatherhand-peer-trust-v0:' + sha256Hex(
    canonicalizeDomainValue(PEER_TRUST_ID_DOMAIN, peerTrustBody(statement)),
  );
  statement.signing.signature = await sign(
    requireFatherHandPrivateKey(father),
    PEER_TRUST_SIGNATURE_DOMAIN,
    { statement_id: statement.statement_id, ...peerTrustBody(statement) },
  );
  assertPublicArtifactSafe(statement);
  return statement;
}

export async function verifyPeerTrust(
  value: unknown,
  localFatherHandPublicKeyValue: unknown,
  remoteFounderPublicKeyValue: unknown,
  requiredScope: string,
  at: string,
): Promise<boolean> {
  try {
    const statement = exactKeys(value, [
      'schema', 'statement_id', 'local_fatherhand_fingerprint', 'remote_world_id',
      'remote_founder_public_key', 'remote_founder_fingerprint', 'scopes',
      'expires_at', 'invitation_id', 'decision', 'created_at', 'signing',
    ], 'INVALID_PEER_TRUST');
    if (statement.schema !== 'fatherhand.peer-trust/v0' || statement.decision !== 'TRUST') return false;
    const scopes = assertStringArray(statement.scopes, 'INVALID_PEER_SCOPES');
    if (!scopes.includes(requiredScope)) return false;
    validateTimestamp(statement.expires_at);
    validateTimestamp(statement.created_at);
    validateTimestamp(at);
    if (Date.parse(at) > Date.parse(statement.expires_at)) return false;
    const localKey = normalizePublicJwk(localFatherHandPublicKeyValue);
    const remoteKey = normalizePublicJwk(remoteFounderPublicKeyValue);
    if (statement.local_fatherhand_fingerprint !== fatherHandFingerprint(localKey)) return false;
    if (statement.remote_founder_fingerprint !== founderNodeFingerprint(remoteKey)) return false;
    if (JSON.stringify(statement.remote_founder_public_key) !== JSON.stringify(remoteKey)) return false;
    const signer = verifySigningObject(statement.signing, PEER_TRUST_SIGNING_DOMAIN);
    if (!signer || JSON.stringify(signer.public_key) !== JSON.stringify(localKey)) return false;
    const expected = 'fatherhand-peer-trust-v0:' + sha256Hex(
      canonicalizeDomainValue(PEER_TRUST_ID_DOMAIN, peerTrustBody(statement)),
    );
    if (statement.statement_id !== expected) return false;
    return verify(
      signer.public_key,
      PEER_TRUST_SIGNATURE_DOMAIN,
      { statement_id: expected, ...peerTrustBody(statement) },
      signer.signature,
    );
  } catch {
    return false;
  }
}
