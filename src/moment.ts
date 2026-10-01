import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const MOMENT_ID_DOMAIN = 'reLATTE-Moment-v0|';

export interface MomentAnchor {
  schema: 'relatte.moment/v0';
  moment_id?: string;
  crossing_id: string;
  canonical_body_sha256: string;
  canonical_body: string;
  source_world: string;
  source_particular: string;
  created_at: string;
  laws: string[];
}

export interface PerspectiveAccount {
  summary: string;
  assertions: string[];
  uncertainties: string[];
}

export interface PerspectiveReplicaConfig {
  schema: 'relatte.perspective-replica-config/v0';
  world_id: string;
  replica_particular: string;
}

export interface PerspectiveReplicaSnapshot {
  schema: 'relatte.perspective-replica-snapshot/v0';
  moment_id: string;
  crossing_id: string;
  perspective_ids: string[];
  observer_worlds: string[];
  observer_particulars: string[];
  perspective_count: number;
  laws: string[];
}

const MOMENT_KEYS = [
  'schema',
  'moment_id',
  'crossing_id',
  'canonical_body_sha256',
  'canonical_body',
  'source_world',
  'source_particular',
  'created_at',
  'laws',
] as const;

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function assertOnlyKeys(
  object: Record<string, any>,
  allowed: readonly string[],
  code: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function stringArray(value: unknown, code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(code);
  }
  return [...value];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function safeName(value: string): string {
  return sha256Hex(Buffer.from(value, 'utf8'));
}

function momentIdentityBody(
  value: Omit<MomentAnchor, 'moment_id'>,
): Omit<MomentAnchor, 'moment_id'> {
  return {
    schema: 'relatte.moment/v0',
    crossing_id: value.crossing_id,
    canonical_body_sha256: value.canonical_body_sha256,
    canonical_body: value.canonical_body,
    source_world: value.source_world,
    source_particular: value.source_particular,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export function computeMomentId(
  value: Omit<MomentAnchor, 'moment_id'>,
): string {
  return `relatte-moment-v0:${sha256Hex(
    canonicalizeDomainValue(MOMENT_ID_DOMAIN, momentIdentityBody(value)),
  )}`;
}

export async function createMomentAnchor(
  crossingValue: unknown,
): Promise<MomentAnchor> {
  if (!(await verifyCrossingEnvelope(crossingValue))) {
    throw new Error('INVALID_MOMENT_CROSSING');
  }

  const crossing = asRecord(crossingValue, 'INVALID_MOMENT_CROSSING');
  const canonicalBody = canonicalize(crossing);
  const body: Omit<MomentAnchor, 'moment_id'> = {
    schema: 'relatte.moment/v0',
    crossing_id: nonEmpty(crossing.crossing_id, 'INVALID_MOMENT_CROSSING_ID'),
    canonical_body_sha256: sha256Hex(Buffer.from(canonicalBody, 'utf8')),
    canonical_body: canonicalBody,
    source_world: nonEmpty(crossing.source_world, 'INVALID_MOMENT_SOURCE_WORLD'),
    source_particular: nonEmpty(
      crossing.source_particular,
      'INVALID_MOMENT_SOURCE_PARTICULAR',
    ),
    created_at: nonEmpty(crossing.created_at, 'INVALID_MOMENT_CREATED_AT'),
    laws: [
      'MOMENT != PERSPECTIVE',
      'PERSPECTIVE != CARRIER MUTATION',
      'OBSERVATION != AUTHORITY',
    ],
  };
  validateTimestamp(body.created_at);

  return {
    ...body,
    moment_id: computeMomentId(body),
  };
}

export async function verifyMomentAnchor(value: unknown): Promise<boolean> {
  try {
    const moment = asRecord(value, 'INVALID_MOMENT');
    assertOnlyKeys(moment, MOMENT_KEYS, 'UNEXPECTED_MOMENT_FIELD');
    if (moment.schema !== 'relatte.moment/v0') return false;
    validateTimestamp(moment.created_at);

    const canonicalBody = nonEmpty(moment.canonical_body, 'INVALID_MOMENT_BODY');
    if (
      sha256Hex(Buffer.from(canonicalBody, 'utf8')) !==
      nonEmpty(moment.canonical_body_sha256, 'INVALID_MOMENT_BODY_HASH')
    ) {
      return false;
    }

    const crossing = asRecord(JSON.parse(canonicalBody), 'INVALID_MOMENT_CROSSING_JSON');
    if (canonicalize(crossing) !== canonicalBody) return false;
    if (!(await verifyCrossingEnvelope(crossing))) return false;
    if (crossing.crossing_id !== moment.crossing_id) return false;
    if (crossing.source_world !== moment.source_world) return false;
    if (crossing.source_particular !== moment.source_particular) return false;
    if (crossing.created_at !== moment.created_at) return false;

    const body: Omit<MomentAnchor, 'moment_id'> = {
      schema: 'relatte.moment/v0',
      crossing_id: nonEmpty(moment.crossing_id, 'INVALID_MOMENT_CROSSING_ID'),
      canonical_body_sha256: nonEmpty(
        moment.canonical_body_sha256,
        'INVALID_MOMENT_BODY_HASH',
      ),
      canonical_body: canonicalBody,
      source_world: nonEmpty(moment.source_world, 'INVALID_MOMENT_SOURCE_WORLD'),
      source_particular: nonEmpty(
        moment.source_particular,
        'INVALID_MOMENT_SOURCE_PARTICULAR',
      ),
      created_at: moment.created_at,
      laws: stringArray(moment.laws, 'INVALID_MOMENT_LAWS'),
    };

    return (
      typeof moment.moment_id === 'string' &&
      moment.moment_id === computeMomentId(body)
    );
  } catch {
    return false;
  }
}

function parseAccount(value: unknown): PerspectiveAccount {
  const account = asRecord(value, 'INVALID_PERSPECTIVE_ACCOUNT');
  assertOnlyKeys(
    account,
    ['summary', 'assertions', 'uncertainties'],
    'UNEXPECTED_PERSPECTIVE_ACCOUNT_FIELD',
  );
  return {
    summary: nonEmpty(account.summary, 'INVALID_PERSPECTIVE_SUMMARY'),
    assertions: stringArray(
      account.assertions,
      'INVALID_PERSPECTIVE_ASSERTIONS',
    ),
    uncertainties: stringArray(
      account.uncertainties,
      'INVALID_PERSPECTIVE_UNCERTAINTIES',
    ),
  };
}

export async function sealPerspectiveClaim(
  momentValue: unknown,
  observer: {
    world_id: string;
    observer_particular: string;
  },
  accountValue: unknown,
  keys: P256KeyMaterial,
  createdAt: string,
): Promise<Record<string, any>> {
  if (!(await verifyMomentAnchor(momentValue))) {
    throw new Error('INVALID_PERSPECTIVE_MOMENT');
  }
  validateTimestamp(createdAt);

  const moment = asRecord(momentValue, 'INVALID_PERSPECTIVE_MOMENT');
  const account = parseAccount(accountValue);

  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: moment.crossing_id,
    world_id: nonEmpty(observer.world_id, 'INVALID_PERSPECTIVE_WORLD'),
    receiver_particular: nonEmpty(
      observer.observer_particular,
      'INVALID_PERSPECTIVE_OBSERVER',
    ),
    kind: 'R8_PERSPECTIVE',
    semantic_effect: 'none',
    contract_ref: moment.moment_id,
    pre_state_ref: moment.moment_id,
    post_state_ref: moment.moment_id,
    descendant_refs: [],
    residual_refs: [moment.moment_id],
    note: account.summary,
    created_at: createdAt,
    extensions: {
      perspective: {
        moment_id: moment.moment_id,
        anchor_crossing_id: moment.crossing_id,
        anchor_canonical_body_sha256: moment.canonical_body_sha256,
        account,
        laws: [
          'PERSPECTIVE != MOMENT',
          'ACCOUNT != SOURCE MUTATION',
          'SIGNED ACCOUNT != OBJECTIVE TRUTH',
          'DIVERGENCE != OVERWRITE',
        ],
      },
    },
  }, keys);
}

export async function verifyPerspectiveClaim(
  momentValue: unknown,
  receiptValue: unknown,
): Promise<boolean> {
  try {
    if (!(await verifyMomentAnchor(momentValue))) return false;
    if (!(await verifyReceipt(receiptValue))) return false;

    const moment = asRecord(momentValue, 'INVALID_PERSPECTIVE_MOMENT');
    const receipt = asRecord(receiptValue, 'INVALID_PERSPECTIVE_RECEIPT');

    if (
      receipt.kind !== 'R8_PERSPECTIVE' ||
      receipt.semantic_effect !== 'none' ||
      receipt.crossing_id !== moment.crossing_id ||
      receipt.contract_ref !== moment.moment_id ||
      receipt.pre_state_ref !== moment.moment_id ||
      receipt.post_state_ref !== moment.moment_id
    ) {
      return false;
    }

    const extensions = asRecord(
      receipt.extensions,
      'INVALID_PERSPECTIVE_EXTENSIONS',
    );
    const perspective = asRecord(
      extensions.perspective,
      'INVALID_PERSPECTIVE_EXTENSIONS',
    );

    if (
      perspective.moment_id !== moment.moment_id ||
      perspective.anchor_crossing_id !== moment.crossing_id ||
      perspective.anchor_canonical_body_sha256 !== moment.canonical_body_sha256
    ) {
      return false;
    }

    parseAccount(perspective.account);
    return true;
  } catch {
    return false;
  }
}

function parseReplicaConfig(value: unknown): PerspectiveReplicaConfig {
  const config = asRecord(value, 'INVALID_PERSPECTIVE_REPLICA_CONFIG');
  if (config.schema !== 'relatte.perspective-replica-config/v0') {
    throw new Error('INVALID_PERSPECTIVE_REPLICA_CONFIG_SCHEMA');
  }
  return {
    schema: 'relatte.perspective-replica-config/v0',
    world_id: nonEmpty(config.world_id, 'INVALID_PERSPECTIVE_REPLICA_WORLD'),
    replica_particular: nonEmpty(
      config.replica_particular,
      'INVALID_PERSPECTIVE_REPLICA_PARTICULAR',
    ),
  };
}

export class PerspectiveReplica {
  readonly root: string;
  readonly config: PerspectiveReplicaConfig;
  readonly moment: MomentAnchor;
  private readonly perspectives = new Map<string, Record<string, any>>();

  private constructor(
    root: string,
    config: PerspectiveReplicaConfig,
    moment: MomentAnchor,
  ) {
    this.root = root;
    this.config = config;
    this.moment = moment;
  }

  static async create(
    root: string,
    input: Omit<PerspectiveReplicaConfig, 'schema'>,
    momentValue: unknown,
  ): Promise<PerspectiveReplica> {
    if (await pathExists(root)) throw new Error('PERSPECTIVE_REPLICA_ROOT_EXISTS');
    if (!(await verifyMomentAnchor(momentValue))) {
      throw new Error('INVALID_PERSPECTIVE_REPLICA_MOMENT');
    }

    const moment = momentValue as MomentAnchor;
    const config: PerspectiveReplicaConfig = {
      schema: 'relatte.perspective-replica-config/v0',
      world_id: nonEmpty(
        input.world_id,
        'INVALID_PERSPECTIVE_REPLICA_WORLD',
      ),
      replica_particular: nonEmpty(
        input.replica_particular,
        'INVALID_PERSPECTIVE_REPLICA_PARTICULAR',
      ),
    };

    await mkdir(join(root, 'perspectives'), { recursive: true });
    await writeFile(
      join(root, 'replica.json'),
      JSON.stringify(config, null, 2) + '\n',
      'utf8',
    );
    await writeFile(
      join(root, 'moment.json'),
      JSON.stringify(moment, null, 2) + '\n',
      'utf8',
    );

    return new PerspectiveReplica(root, config, moment);
  }

  static async open(root: string): Promise<PerspectiveReplica> {
    const config = parseReplicaConfig(
      JSON.parse(await readFile(join(root, 'replica.json'), 'utf8')),
    );
    const moment = JSON.parse(
      await readFile(join(root, 'moment.json'), 'utf8'),
    ) as MomentAnchor;
    if (!(await verifyMomentAnchor(moment))) {
      throw new Error('INVALID_PERSPECTIVE_REPLICA_MOMENT');
    }

    const replica = new PerspectiveReplica(root, config, moment);
    const files = await readdir(join(root, 'perspectives'));
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const receipt = JSON.parse(
        await readFile(join(root, 'perspectives', file), 'utf8'),
      );
      if (!(await verifyPerspectiveClaim(moment, receipt))) {
        throw new Error('INVALID_REPLAYED_PERSPECTIVE');
      }
      const receiptId = nonEmpty(
        receipt.receipt_id,
        'INVALID_PERSPECTIVE_RECEIPT_ID',
      );
      if (replica.perspectives.has(receiptId)) {
        throw new Error('DUPLICATE_REPLAYED_PERSPECTIVE');
      }
      replica.perspectives.set(receiptId, receipt);
    }
    return replica;
  }

  async attach(receiptValue: unknown): Promise<Record<string, any>> {
    if (!(await verifyPerspectiveClaim(this.moment, receiptValue))) {
      throw new Error('INVALID_PERSPECTIVE_CLAIM');
    }

    const receipt = asRecord(receiptValue, 'INVALID_PERSPECTIVE_CLAIM');
    const receiptId = nonEmpty(
      receipt.receipt_id,
      'INVALID_PERSPECTIVE_RECEIPT_ID',
    );
    const existing = this.perspectives.get(receiptId);
    if (existing) return existing;

    await writeFile(
      join(this.root, 'perspectives', `${safeName(receiptId)}.json`),
      JSON.stringify(receipt, null, 2) + '\n',
      'utf8',
    );
    this.perspectives.set(receiptId, receipt);
    return receipt;
  }

  exportPerspectives(): Record<string, any>[] {
    return [...this.perspectives.values()]
      .sort((a, b) => String(a.receipt_id).localeCompare(String(b.receipt_id)))
      .map((receipt) => structuredClone(receipt));
  }

  async syncFrom(values: unknown[]): Promise<void> {
    for (const value of values) {
      await this.attach(value);
    }
  }

  snapshot(): PerspectiveReplicaSnapshot {
    const receipts = this.exportPerspectives();
    return {
      schema: 'relatte.perspective-replica-snapshot/v0',
      moment_id: this.moment.moment_id!,
      crossing_id: this.moment.crossing_id,
      perspective_ids: receipts.map((receipt) => receipt.receipt_id),
      observer_worlds: receipts.map((receipt) => receipt.world_id),
      observer_particulars: receipts.map(
        (receipt) => receipt.receiver_particular,
      ),
      perspective_count: receipts.length,
      laws: [
        'SYNC != OVERWRITE',
        'PERSPECTIVE SET != CONSENSUS',
        'REPLAY != LAST WRITE WINS',
      ],
    };
  }
}
