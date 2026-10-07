import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';

export const PARTICULAR_CONSTITUTION_ID_DOMAIN =
  'reLATTE-ParticularConstitution-v0|';
export const PARTICULAR_ID_DOMAIN = 'reLATTE-Particular-v0|';
export const PARTICULAR_STATE_SURFACE_ID_DOMAIN =
  'reLATTE-ParticularStateSurface-v0|';
export const PARTICULAR_STATE_TRANSITION_ID_DOMAIN =
  'reLATTE-ParticularStateTransition-v0|';
export const PARTICULAR_EVENT_WITNESS_ID_DOMAIN =
  'reLATTE-ParticularEventWitness-v0|';
export const NAME_SURFACE_ID_DOMAIN = 'reLATTE-NameSurface-v0|';
export const NAME_SURFACE_TRANSITION_ID_DOMAIN =
  'reLATTE-NameSurfaceTransition-v0|';
export const CAPABILITY_GRANT_ID_DOMAIN =
  'reLATTE-CapabilityGrant-v0|';

export const PARTICULARITY_LAWS = [
  'STATE != PARTICULAR',
  'CONTROL != IDENTITY',
  'ACCESS != EXISTENCE',
  'SURFACE DISCONTINUITY != PARTICULAR DISCONTINUITY',
  'COPY != PARTICULAR',
  'SHARED CONTENT != SHARED IDENTITY',
  'SHARED ANCESTRY != SHARED STATE',
  'ANCESTRY != AUTHORITY',
  'SURFACE != REFERENT',
  'SAME CARRIER != SAME REFERENT',
  'DIFFERENT CARRIER != DIFFERENT REFERENT',
  'NO CONTINUITY WITHOUT A WITNESSABLE PATH',
] as const;

export type NameSurfaceKind =
  | 'ROLE'
  | 'TITLE'
  | 'ORIGINAL'
  | 'NU'
  | 'SACRED'
  | 'SPOKEN'
  | 'SIGN'
  | 'MEMORIAL'
  | 'BORNE'
  | 'REPUTE'
  | 'SELF';

export interface ParticularConstitution {
  schema: 'relatte.particular-constitution/v0';
  constitution_id: string;
  particular_id: string;
  world_id: string;
  lineage_root: string;
  inherited_content_ref: string;
  constitution_nonce: string;
  created_at: string;
  laws: string[];
}

export interface ParticularStateSurface {
  schema: 'relatte.particular-state-surface/v0';
  surface_id: string;
  particular_id: string;
  state_id: string;
  self_surface: string;
  controller_id: string;
  accessible_event_ids: string[];
  created_at: string;
}

export interface ParticularStateTransition {
  schema: 'relatte.particular-state-transition/v0';
  transition_id: string;
  particular_id: string;
  from_surface: ParticularStateSurface;
  to_surface: ParticularStateSurface;
  continuity_claim: 'SAME_PARTICULAR';
  authority_transferred: false;
  created_at: string;
  laws: string[];
}

export interface ParticularEventWitness {
  schema: 'relatte.particular-event-witness/v0';
  witness_id: string;
  particular_id: string;
  event_id: string;
  event_ref: string;
  observed_in_state_id: string;
  created_at: string;
}

export interface NameSurface {
  schema: 'relatte.name-surface/v0';
  surface_id: string;
  kind: NameSurfaceKind;
  carrier: string;
  referent_id: string;
}

export interface NameSurfaceTransition {
  schema: 'relatte.name-surface-transition/v0';
  transition_id: string;
  particular_id: string;
  from_surface: NameSurface;
  to_surface: NameSurface;
  transformation_kind: string;
  continuity_claim: 'SAME_REFERENT' | 'NO_CLAIM';
  authority_transferred: false;
  created_at: string;
  laws: string[];
}

export interface CapabilityGrant {
  schema: 'relatte.capability-grant/v0';
  grant_id: string;
  capability_id: string;
  subject: {
    kind: 'CONTROLLER' | 'PARTICULAR';
    id: string;
  };
  created_at: string;
}

export type ParticularityRecord =
  | ParticularConstitution
  | ParticularStateSurface
  | ParticularStateTransition
  | ParticularEventWitness
  | NameSurfaceTransition
  | CapabilityGrant;

export interface ParticularityProjection {
  particulars: Record<string, ParticularConstitution>;
  states: Record<string, ParticularStateSurface>;
  state_transitions: Record<string, ParticularStateTransition>;
  witnesses: Record<string, ParticularEventWitness>;
  transitions: Record<string, NameSurfaceTransition>;
  grants: Record<string, CapabilityGrant>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function canonicalId(domain: string, value: unknown, prefix: string): string {
  return `${prefix}:${sha256Hex(canonicalizeDomainValue(domain, value))}`;
}

function uniqueSortedStrings(value: readonly string[], code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(code);
  }
  return [...new Set(value)].sort();
}

export function createParticularConstitution(args: {
  world_id: string;
  lineage_root: string;
  inherited_content_ref: string;
  constitution_nonce: string;
  created_at: string;
}): ParticularConstitution {
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.particular-constitution/v0' as const,
    world_id: nonEmpty(args.world_id, 'INVALID_PARTICULAR_WORLD'),
    lineage_root: nonEmpty(args.lineage_root, 'INVALID_LINEAGE_ROOT'),
    inherited_content_ref: nonEmpty(
      args.inherited_content_ref,
      'INVALID_INHERITED_CONTENT_REF',
    ),
    constitution_nonce: nonEmpty(
      args.constitution_nonce,
      'INVALID_CONSTITUTION_NONCE',
    ),
    created_at: args.created_at,
    laws: [
      'COPY != PARTICULAR',
      'SHARED CONTENT != SHARED IDENTITY',
      'SHARED ANCESTRY != SHARED STATE',
    ],
  };

  const constitution_id = canonicalId(
    PARTICULAR_CONSTITUTION_ID_DOMAIN,
    body,
    'relatte-particular-constitution-v0',
  );
  const particular_id = canonicalId(
    PARTICULAR_ID_DOMAIN,
    { constitution_id },
    'relatte-particular-v0',
  );

  return {
    ...body,
    constitution_id,
    particular_id,
  };
}

export function createParticularStateSurface(args: {
  particular_id: string;
  state_id: string;
  self_surface: string;
  controller_id: string;
  accessible_event_ids: string[];
  created_at: string;
}): ParticularStateSurface {
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.particular-state-surface/v0' as const,
    particular_id: nonEmpty(args.particular_id, 'INVALID_STATE_PARTICULAR'),
    state_id: nonEmpty(args.state_id, 'INVALID_STATE_ID'),
    self_surface: nonEmpty(args.self_surface, 'INVALID_SELF_SURFACE'),
    controller_id: nonEmpty(args.controller_id, 'INVALID_CONTROLLER_ID'),
    accessible_event_ids: uniqueSortedStrings(
      args.accessible_event_ids,
      'INVALID_ACCESSIBLE_EVENT_IDS',
    ),
    created_at: args.created_at,
  };

  return {
    ...body,
    surface_id: canonicalId(
      PARTICULAR_STATE_SURFACE_ID_DOMAIN,
      body,
      'relatte-particular-state-surface-v0',
    ),
  };
}

export function createParticularStateTransition(args: {
  from_surface: ParticularStateSurface;
  to_surface: ParticularStateSurface;
  created_at: string;
}): ParticularStateTransition {
  validateTimestamp(args.created_at);

  if (args.from_surface.particular_id !== args.to_surface.particular_id) {
    throw new Error('PARTICULAR_CONTINUITY_MISMATCH');
  }

  const body = {
    schema: 'relatte.particular-state-transition/v0' as const,
    particular_id: args.from_surface.particular_id,
    from_surface: args.from_surface,
    to_surface: args.to_surface,
    continuity_claim: 'SAME_PARTICULAR' as const,
    authority_transferred: false as const,
    created_at: args.created_at,
    laws: [
      'STATE != PARTICULAR',
      'CONTROL != IDENTITY',
      'PARTICULAR POINTER != CONTINUITY PROOF',
      'NO PARTICULAR CONTINUITY WITHOUT A WITNESSABLE PATH',
      'PARTICULAR CONTINUITY != AUTHORITY CONTINUITY',
    ],
  };

  return {
    ...body,
    transition_id: canonicalId(
      PARTICULAR_STATE_TRANSITION_ID_DOMAIN,
      body,
      'relatte-particular-state-transition-v0',
    ),
  };
}

export function createParticularEventWitness(args: {
  particular_id: string;
  event_id: string;
  event_ref: string;
  observed_in_state_id: string;
  created_at: string;
}): ParticularEventWitness {
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.particular-event-witness/v0' as const,
    particular_id: nonEmpty(args.particular_id, 'INVALID_WITNESS_PARTICULAR'),
    event_id: nonEmpty(args.event_id, 'INVALID_EVENT_ID'),
    event_ref: nonEmpty(args.event_ref, 'INVALID_EVENT_REF'),
    observed_in_state_id: nonEmpty(
      args.observed_in_state_id,
      'INVALID_OBSERVED_STATE',
    ),
    created_at: args.created_at,
  };

  return {
    ...body,
    witness_id: canonicalId(
      PARTICULAR_EVENT_WITNESS_ID_DOMAIN,
      body,
      'relatte-particular-event-witness-v0',
    ),
  };
}

export function createNameSurface(args: {
  kind: NameSurfaceKind;
  carrier: string;
  referent_id: string;
}): NameSurface {
  const body = {
    schema: 'relatte.name-surface/v0' as const,
    kind: args.kind,
    carrier: nonEmpty(args.carrier, 'INVALID_NAME_CARRIER'),
    referent_id: nonEmpty(args.referent_id, 'INVALID_NAME_REFERENT'),
  };

  return {
    ...body,
    surface_id: canonicalId(
      NAME_SURFACE_ID_DOMAIN,
      body,
      'relatte-name-surface-v0',
    ),
  };
}

export function createNameSurfaceTransition(args: {
  particular_id: string;
  from_surface: NameSurface;
  to_surface: NameSurface;
  transformation_kind: string;
  continuity_claim: 'SAME_REFERENT' | 'NO_CLAIM';
  created_at: string;
}): NameSurfaceTransition {
  validateTimestamp(args.created_at);

  if (
    args.continuity_claim === 'SAME_REFERENT' &&
    args.from_surface.referent_id !== args.to_surface.referent_id
  ) {
    throw new Error('REFERENT_CONTINUITY_MISMATCH');
  }

  const body = {
    schema: 'relatte.name-surface-transition/v0' as const,
    particular_id: nonEmpty(
      args.particular_id,
      'INVALID_NAME_TRANSITION_PARTICULAR',
    ),
    from_surface: args.from_surface,
    to_surface: args.to_surface,
    transformation_kind: nonEmpty(
      args.transformation_kind,
      'INVALID_TRANSFORMATION_KIND',
    ),
    continuity_claim: args.continuity_claim,
    authority_transferred: false as const,
    created_at: args.created_at,
    laws: [
      'SURFACE != REFERENT',
      'SAME CARRIER != SAME REFERENT',
      'DIFFERENT CARRIER != DIFFERENT REFERENT',
      'REFERENTIAL CONTINUITY != AUTHORITY CONTINUITY',
    ],
  };

  return {
    ...body,
    transition_id: canonicalId(
      NAME_SURFACE_TRANSITION_ID_DOMAIN,
      body,
      'relatte-name-surface-transition-v0',
    ),
  };
}

export function createCapabilityGrant(args: {
  capability_id: string;
  subject: {
    kind: 'CONTROLLER' | 'PARTICULAR';
    id: string;
  };
  created_at: string;
}): CapabilityGrant {
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.capability-grant/v0' as const,
    capability_id: nonEmpty(args.capability_id, 'INVALID_CAPABILITY_ID'),
    subject: {
      kind: args.subject.kind,
      id: nonEmpty(args.subject.id, 'INVALID_CAPABILITY_SUBJECT'),
    },
    created_at: args.created_at,
  };

  return {
    ...body,
    grant_id: canonicalId(
      CAPABILITY_GRANT_ID_DOMAIN,
      body,
      'relatte-capability-grant-v0',
    ),
  };
}

function verifyConstitution(value: ParticularConstitution): boolean {
  const rebuilt = createParticularConstitution({
    world_id: value.world_id,
    lineage_root: value.lineage_root,
    inherited_content_ref: value.inherited_content_ref,
    constitution_nonce: value.constitution_nonce,
    created_at: value.created_at,
  });
  return (
    rebuilt.constitution_id === value.constitution_id &&
    rebuilt.particular_id === value.particular_id
  );
}

function verifyStateSurface(value: ParticularStateSurface): boolean {
  const rebuilt = createParticularStateSurface({
    particular_id: value.particular_id,
    state_id: value.state_id,
    self_surface: value.self_surface,
    controller_id: value.controller_id,
    accessible_event_ids: value.accessible_event_ids,
    created_at: value.created_at,
  });
  return rebuilt.surface_id === value.surface_id;
}

function verifyStateTransition(value: ParticularStateTransition): boolean {
  const from = createParticularStateSurface({
    particular_id: value.from_surface.particular_id,
    state_id: value.from_surface.state_id,
    self_surface: value.from_surface.self_surface,
    controller_id: value.from_surface.controller_id,
    accessible_event_ids: value.from_surface.accessible_event_ids,
    created_at: value.from_surface.created_at,
  });
  const to = createParticularStateSurface({
    particular_id: value.to_surface.particular_id,
    state_id: value.to_surface.state_id,
    self_surface: value.to_surface.self_surface,
    controller_id: value.to_surface.controller_id,
    accessible_event_ids: value.to_surface.accessible_event_ids,
    created_at: value.to_surface.created_at,
  });
  if (
    from.surface_id !== value.from_surface.surface_id ||
    to.surface_id !== value.to_surface.surface_id
  ) {
    return false;
  }

  const rebuilt = createParticularStateTransition({
    from_surface: value.from_surface,
    to_surface: value.to_surface,
    created_at: value.created_at,
  });
  return (
    rebuilt.transition_id === value.transition_id &&
    value.continuity_claim === 'SAME_PARTICULAR' &&
    value.authority_transferred === false
  );
}

function verifyWitness(value: ParticularEventWitness): boolean {
  const rebuilt = createParticularEventWitness({
    particular_id: value.particular_id,
    event_id: value.event_id,
    event_ref: value.event_ref,
    observed_in_state_id: value.observed_in_state_id,
    created_at: value.created_at,
  });
  return rebuilt.witness_id === value.witness_id;
}

function verifyTransition(value: NameSurfaceTransition): boolean {
  const from = createNameSurface({
    kind: value.from_surface.kind,
    carrier: value.from_surface.carrier,
    referent_id: value.from_surface.referent_id,
  });
  const to = createNameSurface({
    kind: value.to_surface.kind,
    carrier: value.to_surface.carrier,
    referent_id: value.to_surface.referent_id,
  });
  if (
    from.surface_id !== value.from_surface.surface_id ||
    to.surface_id !== value.to_surface.surface_id
  ) {
    return false;
  }

  const rebuilt = createNameSurfaceTransition({
    particular_id: value.particular_id,
    from_surface: value.from_surface,
    to_surface: value.to_surface,
    transformation_kind: value.transformation_kind,
    continuity_claim: value.continuity_claim,
    created_at: value.created_at,
  });
  return (
    rebuilt.transition_id === value.transition_id &&
    value.authority_transferred === false
  );
}

function verifyGrant(value: CapabilityGrant): boolean {
  const rebuilt = createCapabilityGrant({
    capability_id: value.capability_id,
    subject: value.subject,
    created_at: value.created_at,
  });
  return rebuilt.grant_id === value.grant_id;
}

export function replayParticularity(
  records: ParticularityRecord[],
): ParticularityProjection {
  const projection: ParticularityProjection = {
    particulars: {},
    states: {},
    state_transitions: {},
    witnesses: {},
    transitions: {},
    grants: {},
  };

  for (const record of records) {
    if (record.schema === 'relatte.particular-constitution/v0') {
      if (!verifyConstitution(record)) {
        throw new Error('INVALID_PARTICULAR_CONSTITUTION');
      }
      projection.particulars[record.particular_id] = structuredClone(record);
      continue;
    }

    if (record.schema === 'relatte.particular-state-surface/v0') {
      if (!verifyStateSurface(record)) {
        throw new Error('INVALID_PARTICULAR_STATE_SURFACE');
      }
      if (!projection.particulars[record.particular_id]) {
        throw new Error('UNKNOWN_STATE_PARTICULAR');
      }
      projection.states[record.surface_id] = structuredClone(record);
      continue;
    }

    if (record.schema === 'relatte.particular-state-transition/v0') {
      if (!verifyStateTransition(record)) {
        throw new Error('INVALID_PARTICULAR_STATE_TRANSITION');
      }
      if (!projection.particulars[record.particular_id]) {
        throw new Error('UNKNOWN_STATE_TRANSITION_PARTICULAR');
      }
      if (
        !projection.states[record.from_surface.surface_id] ||
        !projection.states[record.to_surface.surface_id]
      ) {
        throw new Error('UNKNOWN_STATE_TRANSITION_SURFACE');
      }
      projection.state_transitions[record.transition_id] =
        structuredClone(record);
      continue;
    }

    if (record.schema === 'relatte.particular-event-witness/v0') {
      if (!verifyWitness(record)) {
        throw new Error('INVALID_PARTICULAR_EVENT_WITNESS');
      }
      if (!projection.particulars[record.particular_id]) {
        throw new Error('UNKNOWN_WITNESS_PARTICULAR');
      }
      projection.witnesses[record.witness_id] = structuredClone(record);
      continue;
    }

    if (record.schema === 'relatte.name-surface-transition/v0') {
      if (!verifyTransition(record)) {
        throw new Error('INVALID_NAME_SURFACE_TRANSITION');
      }
      if (!projection.particulars[record.particular_id]) {
        throw new Error('UNKNOWN_TRANSITION_PARTICULAR');
      }
      projection.transitions[record.transition_id] = structuredClone(record);
      continue;
    }

    if (record.schema === 'relatte.capability-grant/v0') {
      if (!verifyGrant(record)) {
        throw new Error('INVALID_CAPABILITY_GRANT');
      }
      if (
        record.subject.kind === 'PARTICULAR' &&
        !projection.particulars[record.subject.id]
      ) {
        throw new Error('UNKNOWN_GRANT_PARTICULAR');
      }
      projection.grants[record.grant_id] = structuredClone(record);
      continue;
    }

    const exhaustive: never = record;
    throw new Error(`UNKNOWN_PARTICULARITY_RECORD:${String(exhaustive)}`);
  }

  return projection;
}

export function statesShareParticular(
  projection: ParticularityProjection,
  leftSurfaceId: string,
  rightSurfaceId: string,
): boolean {
  const left = projection.states[leftSurfaceId];
  const right = projection.states[rightSurfaceId];
  if (!left || !right || left.particular_id !== right.particular_id) {
    return false;
  }
  if (leftSurfaceId === rightSurfaceId) return true;

  const adjacency = new Map<string, string[]>();
  for (const transition of Object.values(projection.state_transitions)) {
    if (
      transition.particular_id !== left.particular_id ||
      transition.continuity_claim !== 'SAME_PARTICULAR'
    ) {
      continue;
    }
    const forward = adjacency.get(transition.from_surface.surface_id) ?? [];
    forward.push(transition.to_surface.surface_id);
    adjacency.set(transition.from_surface.surface_id, forward);

    const backward = adjacency.get(transition.to_surface.surface_id) ?? [];
    backward.push(transition.from_surface.surface_id);
    adjacency.set(transition.to_surface.surface_id, backward);
  }

  const seen = new Set<string>([leftSurfaceId]);
  const queue = [leftSurfaceId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (next === rightSurfaceId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

export function stateCanAccessEvent(
  projection: ParticularityProjection,
  stateSurfaceId: string,
  eventId: string,
): boolean {
  const state = projection.states[stateSurfaceId];
  return Boolean(state?.accessible_event_ids.includes(eventId));
}

export function witnessedEventExists(
  projection: ParticularityProjection,
  particularId: string,
  eventId: string,
): boolean {
  return Object.values(projection.witnesses).some(
    (witness) =>
      witness.particular_id === particularId &&
      witness.event_id === eventId,
  );
}

export function hasCapability(
  projection: ParticularityProjection,
  args: {
    particular_id: string;
    controller_id: string;
    capability_id: string;
  },
): boolean {
  return Object.values(projection.grants).some((grant) => {
    if (grant.capability_id !== args.capability_id) return false;
    if (grant.subject.kind === 'PARTICULAR') {
      return grant.subject.id === args.particular_id;
    }
    return grant.subject.id === args.controller_id;
  });
}

export function hasWitnessableNamePath(
  projection: ParticularityProjection,
  args: {
    particular_id: string;
    from_surface_id: string;
    to_surface_id: string;
    referent_id: string;
  },
): boolean {
  if (args.from_surface_id === args.to_surface_id) return true;

  const adjacency = new Map<string, string[]>();
  for (const transition of Object.values(projection.transitions)) {
    if (
      transition.particular_id !== args.particular_id ||
      transition.continuity_claim !== 'SAME_REFERENT' ||
      transition.from_surface.referent_id !== args.referent_id ||
      transition.to_surface.referent_id !== args.referent_id
    ) {
      continue;
    }
    const next = adjacency.get(transition.from_surface.surface_id) ?? [];
    next.push(transition.to_surface.surface_id);
    adjacency.set(transition.from_surface.surface_id, next);
  }

  const seen = new Set<string>([args.from_surface_id]);
  const queue = [args.from_surface_id];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (next === args.to_surface_id) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}
