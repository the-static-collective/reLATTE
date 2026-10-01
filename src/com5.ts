import { canonicalizeDomainValue, sha256Hex, validateForCanonicalization, validateTimestamp } from './canonical.ts';

export const COM5_CAPSULE_ID_DOMAIN = 'reLATTE-COM5Capsule-v0|';
export const COM5_SCHEMA = 'relatte.com5-capsule/v0';
export const COM5_CROSSING_KIND = 'COM5_GRAMMAR_CAPSULE';
export const COM5_STAGES = ['COMPOST', 'COMPOSE', 'COMPUTE', 'COMMUTE', 'COMMUNE'] as const;

export type Com5StageName = typeof COM5_STAGES[number];
export type Com5Disposition = 'HOLD' | 'ADMIT' | 'REFUSE' | 'RETURN';

export interface Com5Stage {
  stage: Com5StageName;
  input: string;
  output: string;
  receipt: string;
}

export interface Com5Capsule {
  schema: typeof COM5_SCHEMA;
  capsule_id?: string;
  title: string;
  origin: {
    source_kind: string;
    source_refs: string[];
    attribution: string[];
    non_authorities: string[];
  };
  grammar: {
    grammar_id: string;
    name: string;
    proposition: string;
    portable_operators: string[];
  };
  stages: Com5Stage[];
  requested_relation: string;
  return_address: string;
  created_at: string;
  extensions?: Record<string, unknown>;
}

const CAPSULE_KEYS = [
  'schema',
  'capsule_id',
  'title',
  'origin',
  'grammar',
  'stages',
  'requested_relation',
  'return_address',
  'created_at',
  'extensions',
] as const;
const ORIGIN_KEYS = ['source_kind', 'source_refs', 'attribution', 'non_authorities'] as const;
const GRAMMAR_KEYS = ['grammar_id', 'name', 'proposition', 'portable_operators'] as const;
const STAGE_KEYS = ['stage', 'input', 'output', 'receipt'] as const;

export interface Com5ReceiverPolicy {
  contract_ref: string;
  world_id: string;
  receiver_particular: string;
  accepted_grammar_ids: string[];
  required_non_authorities: string[];
  admit_effect: string;
  miss_disposition: 'HOLD' | 'REFUSE';
  miss_reason: string;
}

function asRecord(value: unknown, code = 'INVALID_COM5_TYPE'): Record<string, unknown> {
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

function stringArray(value: unknown, code: string, min = 0): string[] {
  if (!Array.isArray(value) || value.length < min || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(code);
  }
  return [...value];
}

function normalizeStage(value: unknown, expected: Com5StageName): Com5Stage {
  const stage = asRecord(value, 'INVALID_COM5_STAGE');
  assertOnlyKeys(stage, STAGE_KEYS, 'UNEXPECTED_COM5_STAGE_FIELD');
  if (stage.stage !== expected) throw new Error('INVALID_COM5_STAGE_ORDER');
  return {
    stage: expected,
    input: nonEmptyString(stage.input, 'INVALID_COM5_STAGE_INPUT'),
    output: nonEmptyString(stage.output, 'INVALID_COM5_STAGE_OUTPUT'),
    receipt: nonEmptyString(stage.receipt, 'INVALID_COM5_STAGE_RECEIPT'),
  };
}

export function constructCom5CapsuleIdentityBody(value: unknown): Omit<Com5Capsule, 'capsule_id'> {
  validateForCanonicalization(value);
  const capsule = asRecord(value);
  assertOnlyKeys(capsule, CAPSULE_KEYS, 'UNEXPECTED_COM5_FIELD');
  if (capsule.schema !== COM5_SCHEMA) throw new Error('INVALID_COM5_SCHEMA');

  const origin = asRecord(capsule.origin, 'INVALID_COM5_ORIGIN');
  const grammar = asRecord(capsule.grammar, 'INVALID_COM5_GRAMMAR');
  assertOnlyKeys(origin, ORIGIN_KEYS, 'UNEXPECTED_COM5_ORIGIN_FIELD');
  assertOnlyKeys(grammar, GRAMMAR_KEYS, 'UNEXPECTED_COM5_GRAMMAR_FIELD');
  if (!Array.isArray(capsule.stages) || capsule.stages.length !== COM5_STAGES.length) {
    throw new Error('INVALID_COM5_STAGE_COUNT');
  }

  const createdAt = nonEmptyString(capsule.created_at, 'INVALID_COM5_CREATED_AT');
  validateTimestamp(createdAt);

  const normalized: Omit<Com5Capsule, 'capsule_id'> = {
    schema: COM5_SCHEMA,
    title: nonEmptyString(capsule.title, 'INVALID_COM5_TITLE'),
    origin: {
      source_kind: nonEmptyString(origin.source_kind, 'INVALID_COM5_SOURCE_KIND'),
      source_refs: stringArray(origin.source_refs, 'INVALID_COM5_SOURCE_REFS', 1),
      attribution: stringArray(origin.attribution, 'INVALID_COM5_ATTRIBUTION', 1),
      non_authorities: stringArray(origin.non_authorities, 'INVALID_COM5_NON_AUTHORITIES', 1),
    },
    grammar: {
      grammar_id: nonEmptyString(grammar.grammar_id, 'INVALID_COM5_GRAMMAR_ID'),
      name: nonEmptyString(grammar.name, 'INVALID_COM5_GRAMMAR_NAME'),
      proposition: nonEmptyString(grammar.proposition, 'INVALID_COM5_PROPOSITION'),
      portable_operators: stringArray(grammar.portable_operators, 'INVALID_COM5_OPERATORS', 1),
    },
    stages: COM5_STAGES.map((stage, index) => normalizeStage(capsule.stages![index], stage)),
    requested_relation: nonEmptyString(capsule.requested_relation, 'INVALID_COM5_REQUESTED_RELATION'),
    return_address: nonEmptyString(capsule.return_address, 'INVALID_COM5_RETURN_ADDRESS'),
    created_at: createdAt,
    extensions: Object.prototype.hasOwnProperty.call(capsule, 'extensions')
      ? asRecord(capsule.extensions, 'INVALID_COM5_EXTENSIONS')
      : {},
  };

  return normalized;
}

export function computeCom5CapsuleId(value: unknown): string {
  const body = constructCom5CapsuleIdentityBody(value);
  return `relatte-com5-v0:${sha256Hex(canonicalizeDomainValue(COM5_CAPSULE_ID_DOMAIN, body))}`;
}

export function verifyCom5Capsule(value: unknown): boolean {
  try {
    const capsule = asRecord(value);
    const computed = computeCom5CapsuleId(value);
    return typeof capsule.capsule_id === 'string' && capsule.capsule_id === computed;
  } catch {
    return false;
  }
}

export function sealCom5Capsule(value: unknown): Com5Capsule {
  const body = constructCom5CapsuleIdentityBody(value);
  return {
    ...body,
    capsule_id: computeCom5CapsuleId(body),
  };
}

export function buildCom5CrossingDraft(
  capsuleValue: unknown,
  options: {
    source_particular: string;
    source_world: string;
    source_history_head?: string | null;
    created_at: string;
  },
): Record<string, unknown> {
  const capsule = sealCom5Capsule(capsuleValue);
  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: options.source_particular,
    source_world: options.source_world,
    source_history_head: options.source_history_head ?? null,
    parents: [],
    declared_kind: COM5_CROSSING_KIND,
    payload_refs: [{
      address: capsule.capsule_id,
      role: 'com5-capsule',
      media_type: 'application/vnd.relatte.com5+json',
    }],
    requested_effect: {
      kind: 'candidate-local-adaptation',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: capsule.return_address,
    created_at: options.created_at,
    extensions: {
      com5: {
        capsule_id: capsule.capsule_id,
        grammar_id: capsule.grammar.grammar_id,
      },
    },
  };
}

export function evaluateCom5Capsule(
  capsuleValue: unknown,
  crossingId: string,
  policy: Com5ReceiverPolicy,
  createdAt: string,
): Record<string, unknown> {
  const capsule = sealCom5Capsule(capsuleValue);
  validateTimestamp(createdAt);

  const grammarAccepted = policy.accepted_grammar_ids.includes(capsule.grammar.grammar_id);
  const authoritiesPresent = policy.required_non_authorities.every((required) =>
    capsule.origin.non_authorities.includes(required),
  );
  const admit = grammarAccepted && authoritiesPresent;

  const disposition: Com5Disposition = admit ? 'ADMIT' : policy.miss_disposition;
  const reason = admit
    ? 'receiver-local policy admits this grammar capsule'
    : (!grammarAccepted ? policy.miss_reason : 'required non-authority declaration missing');

  return {
    schema: 'relatte.receipt/v0',
    crossing_id: crossingId,
    world_id: policy.world_id,
    receiver_particular: policy.receiver_particular,
    kind: `COM5_${disposition}`,
    semantic_effect: disposition === 'ADMIT' ? policy.admit_effect : 'none',
    contract_ref: policy.contract_ref,
    pre_state_ref: null,
    post_state_ref: disposition === 'ADMIT' ? `local:${policy.world_id}:${capsule.capsule_id}` : null,
    descendant_refs: [],
    residual_refs: disposition === 'ADMIT' ? [] : [capsule.capsule_id!],
    note: reason,
    created_at: createdAt,
    extensions: {
      com5: {
        capsule_id: capsule.capsule_id,
        grammar_id: capsule.grammar.grammar_id,
        disposition,
        commune: {
          agreement_required: false,
          shared_address: capsule.capsule_id,
          return_address: capsule.return_address,
        },
      },
    },
  };
}
