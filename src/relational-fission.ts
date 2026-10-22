import { canonicalize, validateTimestamp } from './canonical.ts';
import {
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

/**
 * RELATIONAL FISSION 001 is a deliberately non-sovereign edge lifecycle.
 * It does not establish real-world consent, human identity, or local admission.
 */
export interface RelationEndpoint {
  world_id: string;
  particular: string;
  public_key: JsonWebKey;
}

export interface RelationFormationInput {
  a: RelationEndpoint;
  b: RelationEndpoint;
  purpose: string;
  created_at: string;
  previous_relation_id?: string | null;
}

export type RelationEvent = 'attest' | 'release';

export interface RelationProjection {
  relation_id: string;
  status: 'proposed' | 'dual-attested' | 'released';
  attested_endpoints: number[];
  released_endpoints: number[];
  event_receipt_ids: string[];
  authority: null;
}

function record(value: unknown): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_RELATION_OBJECT');
  }
  return value as Record<string, any>;
}

function exactKeys(value: Record<string, any>, keys: string[]): boolean {
  return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('INVALID_' + label);
  }
  return value;
}

function publicKey(value: unknown): JsonWebKey {
  const key = record(value);
  if (!exactKeys(key, ['kty', 'crv', 'x', 'y']) ||
      key.kty !== 'EC' || key.crv !== 'P-256') {
    throw new Error('INVALID_RELATION_PUBLIC_KEY');
  }
  for (const axis of ['x', 'y']) {
    if (typeof key[axis] !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(key[axis]) ||
        Buffer.from(key[axis], 'base64url').length !== 32 ||
        Buffer.from(key[axis], 'base64url').toString('base64url') !== key[axis]) {
      throw new Error('INVALID_RELATION_PUBLIC_KEY');
    }
  }
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}

function endpoint(value: unknown): RelationEndpoint {
  const ep = record(value);
  if (!exactKeys(ep, ['world_id', 'particular', 'public_key'])) {
    throw new Error('INVALID_RELATION_ENDPOINT');
  }
  return {
    world_id: required(ep.world_id, 'ENDPOINT_WORLD'),
    particular: required(ep.particular, 'ENDPOINT_PARTICULAR'),
    public_key: publicKey(ep.public_key),
  };
}

function sameKey(a: unknown, b: unknown): boolean {
  return canonicalize(publicKey(a)) === canonicalize(publicKey(b));
}

function endpointsFrom(formation: Record<string, any>): [RelationEndpoint, RelationEndpoint] {
  const ext = record(formation.extensions);
  if (!exactKeys(ext, ['relation'])) throw new Error('INVALID_RELATION_EXTENSION');
  const rel = record(ext.relation);
  if (!exactKeys(rel, ['schema', 'endpoints', 'purpose', 'previous_relation_id', 'authority']) ||
      rel.schema !== 'relatte.relational-fission/v0' ||
      rel.authority !== null || !Array.isArray(rel.endpoints) ||
      rel.endpoints.length !== 2) {
    throw new Error('INVALID_RELATION_EXTENSION');
  }
  required(rel.purpose, 'RELATION_PURPOSE');
  const a = endpoint(rel.endpoints[0]);
  const b = endpoint(rel.endpoints[1]);
  if ((a.world_id === b.world_id && a.particular === b.particular) ||
      sameKey(a.public_key, b.public_key)) {
    throw new Error('RELATION_ENDPOINTS_NOT_DISTINCT');
  }
  if (rel.previous_relation_id !== null) {
    required(rel.previous_relation_id, 'PREVIOUS_RELATION');
  }
  return [a, b];
}

export function buildRelationFormationDraft(input: RelationFormationInput): Record<string, any> {
  validateTimestamp(input.created_at);
  const a = endpoint(input.a);
  const b = endpoint(input.b);
  if ((a.world_id === b.world_id && a.particular === b.particular) ||
      sameKey(a.public_key, b.public_key)) {
    throw new Error('RELATION_ENDPOINTS_NOT_DISTINCT');
  }
  const previous = input.previous_relation_id ?? null;
  if (previous !== null) required(previous, 'PREVIOUS_RELATION');
  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: a.particular,
    source_world: a.world_id,
    source_history_head: null,
    parents: previous === null ? [] : [previous],
    declared_kind: 'RELATION_FORMATION',
    payload_refs: [],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: input.created_at,
    extensions: {
      relation: {
        schema: 'relatte.relational-fission/v0',
        endpoints: [a, b],
        purpose: required(input.purpose, 'RELATION_PURPOSE'),
        previous_relation_id: previous,
        authority: null,
      },
    },
  };
}

export async function verifyRelationFormation(value: unknown): Promise<boolean> {
  try {
    if (!(await verifyCrossingEnvelope(value))) return false;
    const crossing = record(value);
    const [a] = endpointsFrom(crossing);
    const relation = record(record(crossing.extensions).relation);
    if (crossing.declared_kind !== 'RELATION_FORMATION' ||
        crossing.source_world !== a.world_id ||
        crossing.source_particular !== a.particular ||
        !sameKey(record(crossing.signing).public_key, a.public_key) ||
        crossing.requested_effect !== null ||
        crossing.capability_ref !== null ||
        !Array.isArray(crossing.payload_refs) || crossing.payload_refs.length !== 0 ||
        !Array.isArray(crossing.parents)) return false;
    const expectedParents = relation.previous_relation_id === null
      ? [] : [relation.previous_relation_id];
    return canonicalize(crossing.parents) === canonicalize(expectedParents);
  } catch {
    return false;
  }
}

export async function sealRelationEvent(
  formationValue: unknown,
  event: RelationEvent,
  endpointIndex: 0 | 1,
  keys: P256KeyMaterial,
  createdAt: string,
  note = '',
): Promise<Record<string, any>> {
  if (!(await verifyRelationFormation(formationValue))) {
    throw new Error('INVALID_RELATION_FORMATION');
  }
  if (event !== 'attest' && event !== 'release') throw new Error('INVALID_RELATION_EVENT');
  if (endpointIndex !== 0 && endpointIndex !== 1) throw new Error('INVALID_ENDPOINT_INDEX');
  validateTimestamp(createdAt);
  const formation = record(formationValue);
  const actor = endpointsFrom(formation)[endpointIndex];
  if (!sameKey(keys.publicKeyJwk, actor.public_key)) {
    throw new Error('RELATION_EVENT_KEY_MISMATCH');
  }
  if (typeof note !== 'string') throw new Error('INVALID_EVENT_NOTE');
  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: formation.crossing_id,
    world_id: actor.world_id,
    receiver_particular: actor.particular,
    kind: event === 'attest' ? 'RELATION_ATTEST' : 'RELATION_RELEASE',
    semantic_effect: 'none',
    contract_ref: formation.crossing_id,
    pre_state_ref: formation.crossing_id,
    post_state_ref: formation.crossing_id,
    descendant_refs: [],
    residual_refs: [formation.crossing_id],
    note,
    created_at: createdAt,
    extensions: {
      relation_event: {
        schema: 'relatte.relation-event/v0',
        relation_id: formation.crossing_id,
        event,
        endpoint_index: endpointIndex,
        authority: null,
      },
    },
  }, keys);
}

export async function verifyRelationEvent(
  formationValue: unknown,
  receiptValue: unknown,
): Promise<boolean> {
  try {
    if (!(await verifyRelationFormation(formationValue)) ||
        !(await verifyReceipt(receiptValue))) return false;
    const formation = record(formationValue);
    const receipt = record(receiptValue);
    const ext = record(receipt.extensions);
    if (!exactKeys(ext, ['relation_event'])) return false;
    const e = record(ext.relation_event);
    if (!exactKeys(e, ['schema', 'relation_id', 'event', 'endpoint_index', 'authority']) ||
        e.schema !== 'relatte.relation-event/v0' ||
        e.relation_id !== formation.crossing_id ||
        e.authority !== null ||
        (e.event !== 'attest' && e.event !== 'release') ||
        (e.endpoint_index !== 0 && e.endpoint_index !== 1)) return false;
    const actor = endpointsFrom(formation)[e.endpoint_index];
    return receipt.crossing_id === formation.crossing_id &&
      receipt.kind === (e.event === 'attest' ? 'RELATION_ATTEST' : 'RELATION_RELEASE') &&
      receipt.world_id === actor.world_id &&
      receipt.receiver_particular === actor.particular &&
      sameKey(record(receipt.signing).public_key, actor.public_key) &&
      receipt.semantic_effect === 'none' &&
      receipt.contract_ref === formation.crossing_id &&
      receipt.pre_state_ref === formation.crossing_id &&
      receipt.post_state_ref === formation.crossing_id &&
      Array.isArray(receipt.descendant_refs) && receipt.descendant_refs.length === 0 &&
      canonicalize(receipt.residual_refs) === canonicalize([formation.crossing_id]);
  } catch {
    return false;
  }
}

/** Read-only, signature-verified projection; it never changes another world's state. */
export async function projectRelation(
  formationValue: unknown,
  receipts: unknown[],
): Promise<RelationProjection> {
  if (!(await verifyRelationFormation(formationValue))) {
    throw new Error('INVALID_RELATION_FORMATION');
  }
  if (!Array.isArray(receipts)) throw new Error('INVALID_RELATION_EVENTS');
  const formation = record(formationValue);
  const attested = new Set<number>();
  const released = new Set<number>();
  const receiptIds = new Set<string>();
  for (const value of receipts) {
    if (!(await verifyRelationEvent(formation, value))) {
      throw new Error('INVALID_RELATION_EVENT');
    }
    const r = record(value);
    const e = record(record(r.extensions).relation_event);
    receiptIds.add(r.receipt_id);
    (e.event === 'attest' ? attested : released).add(e.endpoint_index);
  }
  return {
    relation_id: formation.crossing_id,
    status: released.size > 0 ? 'released' :
      attested.size === 2 ? 'dual-attested' : 'proposed',
    attested_endpoints: [...attested].sort(),
    released_endpoints: [...released].sort(),
    event_receipt_ids: [...receiptIds].sort(),
    authority: null,
  };
}

/** Reunion is a fresh signed formation, never reactivation of the earlier ID. */
export async function verifyFreshReunion(
  previousValue: unknown,
  previousEvents: unknown[],
  nextValue: unknown,
  nextEvents: unknown[],
): Promise<boolean> {
  try {
    if (!(await verifyRelationFormation(previousValue)) ||
        !(await verifyRelationFormation(nextValue))) return false;
    const previous = record(previousValue);
    const next = record(nextValue);
    const oldState = await projectRelation(previous, previousEvents);
    const newState = await projectRelation(next, nextEvents);
    const oldEnds = endpointsFrom(previous);
    const newEnds = endpointsFrom(next);
    return oldState.status === 'released' &&
      oldState.attested_endpoints.length === 2 &&
      newState.status === 'dual-attested' &&
      previous.crossing_id !== next.crossing_id &&
      record(record(next.extensions).relation).previous_relation_id === previous.crossing_id &&
      oldEnds.every((old, i) => old.world_id === newEnds[i].world_id &&
        old.particular === newEnds[i].particular &&
        sameKey(old.public_key, newEnds[i].public_key));
  } catch {
    return false;
  }
}
