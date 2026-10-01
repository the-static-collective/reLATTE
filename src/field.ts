import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import { verifyPerspectiveClaim } from './moment.ts';
import { verifyReceipt } from './protocol.ts';

export const FIELD_LENS_ID_DOMAIN = 'reLATTE-FieldLens-v0|';
export const FIELD_HISTORY_ROOT_DOMAIN = 'reLATTE-FieldHistoryRoot-v0|';
export const FIELD_PROJECTION_ID_DOMAIN = 'reLATTE-FieldProjection-v0|';

export const FIELD_FEATURES = [
  'admitted_receipts',
  'admitted_descendants',
  'perspective_receipts',
  'distinct_observers',
  'plural_perspective_excess',
  'uncertainty_items',
] as const;

export type FieldFeature = typeof FIELD_FEATURES[number];

export interface FieldChannel {
  name: string;
  weights: Partial<Record<FieldFeature, number>>;
}

export interface FieldLens {
  schema: 'relatte.field-lens/v0';
  lens_id?: string;
  world_id: string;
  title: string;
  channels: FieldChannel[];
  created_at: string;
  laws: string[];
}

export interface PerspectiveBinding {
  moment: unknown;
  receipt: unknown;
}

export interface FieldFeatureVector {
  admitted_receipts: number;
  admitted_descendants: number;
  perspective_receipts: number;
  distinct_observers: number;
  plural_perspective_excess: number;
  uncertainty_items: number;
}

export interface FieldProjection {
  schema: 'relatte.field-projection/v0';
  projection_id?: string;
  lens_id: string;
  world_id: string;
  history_root: string;
  admitted_receipt_ids: string[];
  perspective_receipt_ids: string[];
  moment_ids: string[];
  features: FieldFeatureVector;
  susceptibility: Record<string, number>;
  semantic_effect: 'none';
  authorization: null;
  recommended_action: null;
  laws: string[];
}

const LENS_KEYS = [
  'schema',
  'lens_id',
  'world_id',
  'title',
  'channels',
  'created_at',
  'laws',
] as const;

const CHANNEL_KEYS = ['name', 'weights'] as const;
const FIELD_FEATURE_SET = new Set<string>(FIELD_FEATURES);

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

function normalizeWeight(value: unknown, code: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < -1000 ||
    value > 1000
  ) {
    throw new Error(code);
  }
  return value;
}

function normalizeChannel(value: unknown): FieldChannel {
  const channel = asRecord(value, 'INVALID_FIELD_CHANNEL');
  assertOnlyKeys(channel, CHANNEL_KEYS, 'UNEXPECTED_FIELD_CHANNEL_FIELD');
  const name = nonEmpty(channel.name, 'INVALID_FIELD_CHANNEL_NAME');
  const weightsRecord = asRecord(channel.weights, 'INVALID_FIELD_CHANNEL_WEIGHTS');
  const weights: Partial<Record<FieldFeature, number>> = {};

  for (const [feature, weight] of Object.entries(weightsRecord)) {
    if (!FIELD_FEATURE_SET.has(feature)) throw new Error('UNKNOWN_FIELD_FEATURE');
    weights[feature as FieldFeature] = normalizeWeight(
      weight,
      'INVALID_FIELD_WEIGHT',
    );
  }

  return { name, weights };
}

function lensIdentityBody(value: Omit<FieldLens, 'lens_id'>): Omit<FieldLens, 'lens_id'> {
  return {
    schema: 'relatte.field-lens/v0',
    world_id: value.world_id,
    title: value.title,
    channels: value.channels.map((channel) => ({
      name: channel.name,
      weights: { ...channel.weights },
    })),
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export function sealFieldLens(value: unknown): FieldLens {
  const lens = asRecord(value, 'INVALID_FIELD_LENS');
  assertOnlyKeys(lens, LENS_KEYS, 'UNEXPECTED_FIELD_LENS_FIELD');
  if (lens.schema !== 'relatte.field-lens/v0') {
    throw new Error('INVALID_FIELD_LENS_SCHEMA');
  }

  const channelsRaw = lens.channels;
  if (!Array.isArray(channelsRaw) || channelsRaw.length === 0) {
    throw new Error('INVALID_FIELD_CHANNELS');
  }
  const channels = channelsRaw.map(normalizeChannel);
  const names = channels.map((channel) => channel.name);
  if (new Set(names).size !== names.length) throw new Error('DUPLICATE_FIELD_CHANNEL');

  const createdAt = nonEmpty(lens.created_at, 'INVALID_FIELD_LENS_CREATED_AT');
  validateTimestamp(createdAt);

  const body: Omit<FieldLens, 'lens_id'> = {
    schema: 'relatte.field-lens/v0',
    world_id: nonEmpty(lens.world_id, 'INVALID_FIELD_LENS_WORLD'),
    title: nonEmpty(lens.title, 'INVALID_FIELD_LENS_TITLE'),
    channels,
    created_at: createdAt,
    laws: Object.prototype.hasOwnProperty.call(lens, 'laws')
      ? stringArray(lens.laws, 'INVALID_FIELD_LENS_LAWS')
      : [
          'LENS != HISTORY',
          'LOCAL WEIGHT != UNIVERSAL VALUE',
        ],
  };

  return {
    ...body,
    lens_id: `relatte-field-lens-v0:${sha256Hex(
      canonicalizeDomainValue(FIELD_LENS_ID_DOMAIN, lensIdentityBody(body)),
    )}`,
  };
}

export function verifyFieldLens(value: unknown): boolean {
  try {
    const lens = asRecord(value, 'INVALID_FIELD_LENS');
    if (typeof lens.lens_id !== 'string') return false;
    return sealFieldLens(lens).lens_id === lens.lens_id;
  } catch {
    return false;
  }
}

function emptyFeatureVector(): FieldFeatureVector {
  return {
    admitted_receipts: 0,
    admitted_descendants: 0,
    perspective_receipts: 0,
    distinct_observers: 0,
    plural_perspective_excess: 0,
    uncertainty_items: 0,
  };
}

function historyRoot(
  worldId: string,
  admittedReceiptIds: string[],
  perspectiveReceiptIds: string[],
  momentIds: string[],
): string {
  return `relatte-field-history-v0:${sha256Hex(
    canonicalizeDomainValue(FIELD_HISTORY_ROOT_DOMAIN, {
      world_id: worldId,
      admitted_receipt_ids: admittedReceiptIds,
      perspective_receipt_ids: perspectiveReceiptIds,
      moment_ids: momentIds,
    }),
  )}`;
}

function projectionIdentityBody(
  projection: Omit<FieldProjection, 'projection_id'>,
): Omit<FieldProjection, 'projection_id'> {
  return {
    schema: 'relatte.field-projection/v0',
    lens_id: projection.lens_id,
    world_id: projection.world_id,
    history_root: projection.history_root,
    admitted_receipt_ids: [...projection.admitted_receipt_ids],
    perspective_receipt_ids: [...projection.perspective_receipt_ids],
    moment_ids: [...projection.moment_ids],
    features: { ...projection.features },
    susceptibility: { ...projection.susceptibility },
    semantic_effect: 'none',
    authorization: null,
    recommended_action: null,
    laws: [...projection.laws],
  };
}

export async function projectField(args: {
  lens: unknown;
  admitted_receipts: unknown[];
  perspectives?: PerspectiveBinding[];
}): Promise<FieldProjection> {
  const lens = sealFieldLens(args.lens);
  const features = emptyFeatureVector();
  const admittedReceiptIds: string[] = [];
  const admittedCrossingIds = new Set<string>();

  for (const value of args.admitted_receipts) {
    if (!(await verifyReceipt(value))) throw new Error('INVALID_FIELD_RECEIPT');
    const receipt = asRecord(value, 'INVALID_FIELD_RECEIPT');
    if (receipt.kind !== 'R3_ADMIT') throw new Error('FIELD_REQUIRES_R3_ADMIT');
    if (receipt.world_id !== lens.world_id) {
      throw new Error('FIELD_RECEIPT_WORLD_MISMATCH');
    }

    admittedReceiptIds.push(
      nonEmpty(receipt.receipt_id, 'INVALID_FIELD_RECEIPT_ID'),
    );
    admittedCrossingIds.add(
      nonEmpty(receipt.crossing_id, 'INVALID_FIELD_CROSSING_ID'),
    );
    features.admitted_receipts += 1;

    if (!Array.isArray(receipt.descendant_refs)) {
      throw new Error('INVALID_FIELD_DESCENDANTS');
    }
    features.admitted_descendants += receipt.descendant_refs.length;
  }

  const perspectiveReceiptIds: string[] = [];
  const momentIds: string[] = [];
  const observerIds = new Set<string>();
  const perspectiveCountsByMoment = new Map<string, number>();

  for (const binding of args.perspectives ?? []) {
    if (!(await verifyPerspectiveClaim(binding.moment, binding.receipt))) {
      throw new Error('INVALID_FIELD_PERSPECTIVE');
    }

    const moment = asRecord(binding.moment, 'INVALID_FIELD_MOMENT');
    const receipt = asRecord(binding.receipt, 'INVALID_FIELD_PERSPECTIVE');
    if (!admittedCrossingIds.has(moment.crossing_id)) {
      throw new Error('FIELD_PERSPECTIVE_REQUIRES_ADMITTED_CROSSING');
    }

    const receiptId = nonEmpty(
      receipt.receipt_id,
      'INVALID_FIELD_PERSPECTIVE_ID',
    );
    const momentId = nonEmpty(moment.moment_id, 'INVALID_FIELD_MOMENT_ID');

    perspectiveReceiptIds.push(receiptId);
    momentIds.push(momentId);
    observerIds.add(
      `${nonEmpty(receipt.world_id, 'INVALID_FIELD_OBSERVER_WORLD')}|${nonEmpty(
        receipt.receiver_particular,
        'INVALID_FIELD_OBSERVER_PARTICULAR',
      )}`,
    );
    perspectiveCountsByMoment.set(
      momentId,
      (perspectiveCountsByMoment.get(momentId) ?? 0) + 1,
    );
    features.perspective_receipts += 1;

    const perspective = asRecord(
      asRecord(receipt.extensions, 'INVALID_FIELD_PERSPECTIVE_EXTENSIONS')
        .perspective,
      'INVALID_FIELD_PERSPECTIVE_EXTENSIONS',
    );
    const account = asRecord(
      perspective.account,
      'INVALID_FIELD_PERSPECTIVE_ACCOUNT',
    );
    if (!Array.isArray(account.uncertainties)) {
      throw new Error('INVALID_FIELD_PERSPECTIVE_UNCERTAINTIES');
    }
    features.uncertainty_items += account.uncertainties.length;
  }

  features.distinct_observers = observerIds.size;
  features.plural_perspective_excess = [...perspectiveCountsByMoment.values()]
    .reduce((total, count) => total + Math.max(0, count - 1), 0);

  admittedReceiptIds.sort();
  perspectiveReceiptIds.sort();
  const uniqueMomentIds = [...new Set(momentIds)].sort();

  const susceptibility: Record<string, number> = {};
  for (const channel of lens.channels) {
    let score = 0;
    for (const feature of FIELD_FEATURES) {
      score += features[feature] * (channel.weights[feature] ?? 0);
    }
    susceptibility[channel.name] = score;
  }

  const body: Omit<FieldProjection, 'projection_id'> = {
    schema: 'relatte.field-projection/v0',
    lens_id: lens.lens_id!,
    world_id: lens.world_id,
    history_root: historyRoot(
      lens.world_id,
      admittedReceiptIds,
      perspectiveReceiptIds,
      uniqueMomentIds,
    ),
    admitted_receipt_ids: admittedReceiptIds,
    perspective_receipt_ids: perspectiveReceiptIds,
    moment_ids: uniqueMomentIds,
    features,
    susceptibility,
    semantic_effect: 'none',
    authorization: null,
    recommended_action: null,
    laws: [
      'HISTORY != WEATHER',
      'WEATHER != HISTORY',
      'WEATHER != TRUTH',
      'WEATHER != AUTHORITY',
      'WEATHER != RECOMMENDATION',
      'SUSCEPTIBILITY != INSTRUCTION',
      'FIELD PROJECTION != LOCAL DISPOSITION',
    ],
  };

  return {
    ...body,
    projection_id: `relatte-field-projection-v0:${sha256Hex(
      canonicalizeDomainValue(
        FIELD_PROJECTION_ID_DOMAIN,
        projectionIdentityBody(body),
      ),
    )}`,
  };
}

export function verifyFieldProjectionShape(value: unknown): boolean {
  try {
    const projection = asRecord(value, 'INVALID_FIELD_PROJECTION');
    if (
      projection.schema !== 'relatte.field-projection/v0' ||
      projection.semantic_effect !== 'none' ||
      projection.authorization !== null ||
      projection.recommended_action !== null
    ) {
      return false;
    }
    if (typeof projection.projection_id !== 'string') return false;

    const body: Omit<FieldProjection, 'projection_id'> = {
      schema: 'relatte.field-projection/v0',
      lens_id: nonEmpty(projection.lens_id, 'INVALID_FIELD_LENS_ID'),
      world_id: nonEmpty(projection.world_id, 'INVALID_FIELD_WORLD'),
      history_root: nonEmpty(projection.history_root, 'INVALID_FIELD_HISTORY_ROOT'),
      admitted_receipt_ids: stringArray(
        projection.admitted_receipt_ids,
        'INVALID_FIELD_RECEIPT_IDS',
      ),
      perspective_receipt_ids: stringArray(
        projection.perspective_receipt_ids,
        'INVALID_FIELD_PERSPECTIVE_IDS',
      ),
      moment_ids: stringArray(projection.moment_ids, 'INVALID_FIELD_MOMENT_IDS'),
      features: asRecord(projection.features, 'INVALID_FIELD_FEATURES') as FieldFeatureVector,
      susceptibility: asRecord(
        projection.susceptibility,
        'INVALID_FIELD_SUSCEPTIBILITY',
      ),
      semantic_effect: 'none',
      authorization: null,
      recommended_action: null,
      laws: stringArray(projection.laws, 'INVALID_FIELD_LAWS'),
    };

    return (
      projection.projection_id ===
      `relatte-field-projection-v0:${sha256Hex(
        canonicalizeDomainValue(
          FIELD_PROJECTION_ID_DOMAIN,
          projectionIdentityBody(body),
        ),
      )}`
    );
  } catch {
    return false;
  }
}
