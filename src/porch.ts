import { canonicalizeDomainValue, sha256Hex, validateForCanonicalization, validateTimestamp } from './canonical.ts';
import { sealCom5Capsule } from './com5.ts';

export const PORCH_SCHEMA = 'relatte.porch/v0';
export const PORCH_ID_DOMAIN = 'reLATTE-Porch-v0|';

export type CustomsLane = 'WELCOME' | 'HOLD' | 'REFUSE';

export interface CreativePorch {
  schema: typeof PORCH_SCHEMA;
  porch_id?: string;
  world_id: string;
  owner_project: string;
  receiver_particular: string;
  title: string;
  welcome: {
    crossing_kinds: string[];
    grammar_ids: string[];
    required_non_authorities: string[];
  };
  hold: {
    unmatched: boolean;
    note: string;
  };
  refuse: {
    crossing_kinds: string[];
    grammar_ids: string[];
    missing_non_authority: boolean;
    note: string;
  };
  return: {
    address: string;
    requested_receipts: string[];
  };
  release: {
    offered_refs: string[];
    license_refs: string[];
    note: string;
  };
  created_at: string;
  extensions?: Record<string, unknown>;
}

const PORCH_KEYS = [
  'schema',
  'porch_id',
  'world_id',
  'owner_project',
  'receiver_particular',
  'title',
  'welcome',
  'hold',
  'refuse',
  'return',
  'release',
  'created_at',
  'extensions',
] as const;
const WELCOME_KEYS = ['crossing_kinds', 'grammar_ids', 'required_non_authorities'] as const;
const HOLD_KEYS = ['unmatched', 'note'] as const;
const REFUSE_KEYS = ['crossing_kinds', 'grammar_ids', 'missing_non_authority', 'note'] as const;
const RETURN_KEYS = ['address', 'requested_receipts'] as const;
const RELEASE_KEYS = ['offered_refs', 'license_refs', 'note'] as const;

function asRecord(value: unknown, code = 'INVALID_PORCH_TYPE'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function assertOnlyKeys(object: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
}

function nonEmptyString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function booleanValue(value: unknown, code: string): boolean {
  if (typeof value !== 'boolean') throw new Error(code);
  return value;
}

function stringArray(value: unknown, code: string, min = 0): string[] {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(code);
  }
  if (new Set(value).size !== value.length) throw new Error(code);
  return [...value] as string[];
}

export function constructPorchIdentityBody(value: unknown): Omit<CreativePorch, 'porch_id'> {
  validateForCanonicalization(value);
  const porch = asRecord(value);
  assertOnlyKeys(porch, PORCH_KEYS, 'UNEXPECTED_PORCH_FIELD');
  if (porch.schema !== PORCH_SCHEMA) throw new Error('INVALID_PORCH_SCHEMA');

  const welcome = asRecord(porch.welcome, 'INVALID_PORCH_WELCOME');
  const hold = asRecord(porch.hold, 'INVALID_PORCH_HOLD');
  const refuse = asRecord(porch.refuse, 'INVALID_PORCH_REFUSE');
  const returnPolicy = asRecord(porch.return, 'INVALID_PORCH_RETURN');
  const release = asRecord(porch.release, 'INVALID_PORCH_RELEASE');

  assertOnlyKeys(welcome, WELCOME_KEYS, 'UNEXPECTED_PORCH_WELCOME_FIELD');
  assertOnlyKeys(hold, HOLD_KEYS, 'UNEXPECTED_PORCH_HOLD_FIELD');
  assertOnlyKeys(refuse, REFUSE_KEYS, 'UNEXPECTED_PORCH_REFUSE_FIELD');
  assertOnlyKeys(returnPolicy, RETURN_KEYS, 'UNEXPECTED_PORCH_RETURN_FIELD');
  assertOnlyKeys(release, RELEASE_KEYS, 'UNEXPECTED_PORCH_RELEASE_FIELD');

  const offeredRefs = stringArray(release.offered_refs, 'INVALID_PORCH_RELEASE_REFS');
  const licenseRefs = stringArray(release.license_refs, 'INVALID_PORCH_LICENSE_REFS');
  if (offeredRefs.length > 0 && licenseRefs.length === 0) {
    throw new Error('INVALID_PORCH_RELEASE_LICENSE');
  }

  const createdAt = nonEmptyString(porch.created_at, 'INVALID_PORCH_CREATED_AT');
  validateTimestamp(createdAt);

  return {
    schema: PORCH_SCHEMA,
    world_id: nonEmptyString(porch.world_id, 'INVALID_PORCH_WORLD_ID'),
    owner_project: nonEmptyString(porch.owner_project, 'INVALID_PORCH_OWNER_PROJECT'),
    receiver_particular: nonEmptyString(porch.receiver_particular, 'INVALID_PORCH_RECEIVER'),
    title: nonEmptyString(porch.title, 'INVALID_PORCH_TITLE'),
    welcome: {
      crossing_kinds: stringArray(welcome.crossing_kinds, 'INVALID_PORCH_WELCOME_KINDS', 1),
      grammar_ids: stringArray(welcome.grammar_ids, 'INVALID_PORCH_WELCOME_GRAMMARS'),
      required_non_authorities: stringArray(
        welcome.required_non_authorities,
        'INVALID_PORCH_REQUIRED_NON_AUTHORITIES',
      ),
    },
    hold: {
      unmatched: booleanValue(hold.unmatched, 'INVALID_PORCH_HOLD_UNMATCHED'),
      note: nonEmptyString(hold.note, 'INVALID_PORCH_HOLD_NOTE'),
    },
    refuse: {
      crossing_kinds: stringArray(refuse.crossing_kinds, 'INVALID_PORCH_REFUSE_KINDS'),
      grammar_ids: stringArray(refuse.grammar_ids, 'INVALID_PORCH_REFUSE_GRAMMARS'),
      missing_non_authority: booleanValue(
        refuse.missing_non_authority,
        'INVALID_PORCH_REFUSE_MISSING_NON_AUTHORITY',
      ),
      note: nonEmptyString(refuse.note, 'INVALID_PORCH_REFUSE_NOTE'),
    },
    return: {
      address: nonEmptyString(returnPolicy.address, 'INVALID_PORCH_RETURN_ADDRESS'),
      requested_receipts: stringArray(
        returnPolicy.requested_receipts,
        'INVALID_PORCH_RETURN_RECEIPTS',
      ),
    },
    release: {
      offered_refs: offeredRefs,
      license_refs: licenseRefs,
      note: nonEmptyString(release.note, 'INVALID_PORCH_RELEASE_NOTE'),
    },
    created_at: createdAt,
    extensions: Object.prototype.hasOwnProperty.call(porch, 'extensions')
      ? asRecord(porch.extensions, 'INVALID_PORCH_EXTENSIONS')
      : {},
  };
}

export function computePorchId(value: unknown): string {
  const body = constructPorchIdentityBody(value);
  return `relatte-porch-v0:${sha256Hex(canonicalizeDomainValue(PORCH_ID_DOMAIN, body))}`;
}

export function sealPorch(value: unknown): CreativePorch {
  const body = constructPorchIdentityBody(value);
  return {
    ...body,
    porch_id: computePorchId(body),
  };
}

export function verifyPorch(value: unknown): boolean {
  try {
    const porch = asRecord(value);
    return typeof porch.porch_id === 'string' && porch.porch_id === computePorchId(value);
  } catch {
    return false;
  }
}

function classifyAtPorch(
  porch: CreativePorch,
  capsule: ReturnType<typeof sealCom5Capsule>,
  crossingKind: string,
): { lane: CustomsLane; reason: string; missing_non_authorities: string[] } {
  const missing = porch.welcome.required_non_authorities.filter(
    (law) => !capsule.origin.non_authorities.includes(law),
  );

  if (
    porch.refuse.crossing_kinds.includes(crossingKind) ||
    porch.refuse.grammar_ids.includes(capsule.grammar.grammar_id)
  ) {
    return { lane: 'REFUSE', reason: porch.refuse.note, missing_non_authorities: missing };
  }

  if (missing.length > 0 && porch.refuse.missing_non_authority) {
    return {
      lane: 'REFUSE',
      reason: 'required non-authority declaration missing',
      missing_non_authorities: missing,
    };
  }

  const kindWelcomed = porch.welcome.crossing_kinds.includes(crossingKind);
  const grammarWelcomed =
    porch.welcome.grammar_ids.length === 0 ||
    porch.welcome.grammar_ids.includes(capsule.grammar.grammar_id);

  if (kindWelcomed && grammarWelcomed && missing.length === 0) {
    return {
      lane: 'WELCOME',
      reason: 'porch declares this kind of knock welcome for customs inspection',
      missing_non_authorities: [],
    };
  }

  if (porch.hold.unmatched) {
    return { lane: 'HOLD', reason: porch.hold.note, missing_non_authorities: missing };
  }

  return { lane: 'REFUSE', reason: porch.refuse.note, missing_non_authorities: missing };
}

export function evaluateCreativeCustoms(
  porchValue: unknown,
  capsuleValue: unknown,
  crossingValue: unknown,
  createdAt: string,
): Record<string, unknown> {
  const porch = sealPorch(porchValue);
  const capsule = sealCom5Capsule(capsuleValue);
  const crossing = asRecord(crossingValue, 'INVALID_CUSTOMS_CROSSING');
  validateTimestamp(createdAt);

  const crossingId = nonEmptyString(crossing.crossing_id, 'INVALID_CUSTOMS_CROSSING_ID');
  const crossingKind = nonEmptyString(crossing.declared_kind, 'INVALID_CUSTOMS_CROSSING_KIND');
  const payloadRefs = crossing.payload_refs;
  if (!Array.isArray(payloadRefs)) throw new Error('INVALID_CUSTOMS_PAYLOAD_REFS');

  const carriesCapsule = payloadRefs.some((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const ref = entry as Record<string, unknown>;
    return ref.address === capsule.capsule_id && ref.role === 'com5-capsule';
  });
  if (!carriesCapsule) throw new Error('CUSTOMS_CROSSING_CAPSULE_MISMATCH');

  const classification = classifyAtPorch(porch, capsule, crossingKind);

  return {
    schema: 'relatte.receipt/v0',
    crossing_id: crossingId,
    world_id: porch.world_id,
    receiver_particular: porch.receiver_particular,
    kind: `CUSTOMS_${classification.lane}`,
    semantic_effect: 'none',
    contract_ref: porch.porch_id,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: classification.lane === 'WELCOME' ? [] : [capsule.capsule_id!],
    note: classification.reason,
    created_at: createdAt,
    extensions: {
      customs: {
        porch_id: porch.porch_id,
        capsule_id: capsule.capsule_id,
        grammar_id: capsule.grammar.grammar_id,
        lane: classification.lane,
        missing_non_authorities: classification.missing_non_authorities,
        return: porch.return,
        release: porch.release,
        laws: [
          'WELCOME != ADMIT',
          'CUSTOMS != LOCAL CONSEQUENCE',
          'RELEASE_SIGNAL != LICENSE',
        ],
      },
    },
  };
}
