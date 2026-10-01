import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import { verifyFieldProjectionShape } from './field.ts';
import {
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';

export const CULTURAL_UPTAKE_ID_DOMAIN = 'reLATTE-CulturalUptake-v0|';

export interface CulturalVariation {
  preserved: string[];
  varied: string[];
  introduced: string[];
  retired: string[];
}

export interface CulturalUptake {
  schema: 'relatte.cultural-uptake/v0';
  uptake_id?: string;
  world_id: string;
  local_particular: string;
  ancestor_crossing_id: string;
  admitted_receipt_id: string;
  field_projection_id: string;
  field_history_root: string;
  variation: CulturalVariation;
  note: string;
  authority: {
    inherited_from_ancestor: false;
    inherited_from_field: false;
    local_owner_required: true;
  };
  created_at: string;
  laws: string[];
}

const UPTAKE_KEYS = [
  'schema',
  'uptake_id',
  'world_id',
  'local_particular',
  'ancestor_crossing_id',
  'admitted_receipt_id',
  'field_projection_id',
  'field_history_root',
  'variation',
  'note',
  'authority',
  'created_at',
  'laws',
] as const;

const VARIATION_KEYS = [
  'preserved',
  'varied',
  'introduced',
  'retired',
] as const;

const AUTHORITY_KEYS = [
  'inherited_from_ancestor',
  'inherited_from_field',
  'local_owner_required',
] as const;

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
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

function normalizeVariation(value: unknown): CulturalVariation {
  const variation = asRecord(value, 'INVALID_CULTURAL_VARIATION');
  assertOnlyKeys(
    variation,
    VARIATION_KEYS,
    'UNEXPECTED_CULTURAL_VARIATION_FIELD',
  );

  const normalized: CulturalVariation = {
    preserved: stringArray(
      variation.preserved,
      'INVALID_CULTURAL_PRESERVED',
    ),
    varied: stringArray(
      variation.varied,
      'INVALID_CULTURAL_VARIED',
    ),
    introduced: stringArray(
      variation.introduced,
      'INVALID_CULTURAL_INTRODUCED',
    ),
    retired: stringArray(
      variation.retired,
      'INVALID_CULTURAL_RETIRED',
    ),
  };

  if (normalized.varied.length === 0) {
    throw new Error('CULTURAL_VARIATION_REQUIRED');
  }

  return normalized;
}

function uptakeIdentityBody(
  value: Omit<CulturalUptake, 'uptake_id'>,
): Omit<CulturalUptake, 'uptake_id'> {
  return {
    schema: 'relatte.cultural-uptake/v0',
    world_id: value.world_id,
    local_particular: value.local_particular,
    ancestor_crossing_id: value.ancestor_crossing_id,
    admitted_receipt_id: value.admitted_receipt_id,
    field_projection_id: value.field_projection_id,
    field_history_root: value.field_history_root,
    variation: {
      preserved: [...value.variation.preserved],
      varied: [...value.variation.varied],
      introduced: [...value.variation.introduced],
      retired: [...value.variation.retired],
    },
    note: value.note,
    authority: {
      inherited_from_ancestor: false,
      inherited_from_field: false,
      local_owner_required: true,
    },
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export async function createCulturalUptake(args: {
  ancestor_crossing: unknown;
  admitted_receipt: unknown;
  field_projection: unknown;
  world_id: string;
  local_particular: string;
  variation: CulturalVariation;
  note: string;
  created_at: string;
}): Promise<CulturalUptake> {
  if (!(await verifyCrossingEnvelope(args.ancestor_crossing))) {
    throw new Error('INVALID_UPTAKE_ANCESTOR');
  }
  if (!(await verifyReceipt(args.admitted_receipt))) {
    throw new Error('INVALID_UPTAKE_ADMISSION');
  }
  if (!verifyFieldProjectionShape(args.field_projection)) {
    throw new Error('INVALID_UPTAKE_FIELD');
  }

  validateTimestamp(args.created_at);

  const ancestor = asRecord(
    args.ancestor_crossing,
    'INVALID_UPTAKE_ANCESTOR',
  );
  const receipt = asRecord(
    args.admitted_receipt,
    'INVALID_UPTAKE_ADMISSION',
  );
  const field = asRecord(
    args.field_projection,
    'INVALID_UPTAKE_FIELD',
  );

  if (receipt.kind !== 'R3_ADMIT') {
    throw new Error('UPTAKE_REQUIRES_ADMIT');
  }
  if (receipt.crossing_id !== ancestor.crossing_id) {
    throw new Error('UPTAKE_ADMISSION_ANCESTOR_MISMATCH');
  }
  if (receipt.world_id !== args.world_id) {
    throw new Error('UPTAKE_ADMISSION_WORLD_MISMATCH');
  }
  if (field.world_id !== args.world_id) {
    throw new Error('UPTAKE_FIELD_WORLD_MISMATCH');
  }
  if (
    !Array.isArray(field.admitted_receipt_ids) ||
    !field.admitted_receipt_ids.includes(receipt.receipt_id)
  ) {
    throw new Error('UPTAKE_FIELD_MISSING_ADMISSION');
  }

  const variation = normalizeVariation(args.variation);

  const body: Omit<CulturalUptake, 'uptake_id'> = {
    schema: 'relatte.cultural-uptake/v0',
    world_id: nonEmpty(args.world_id, 'INVALID_UPTAKE_WORLD'),
    local_particular: nonEmpty(
      args.local_particular,
      'INVALID_UPTAKE_LOCAL_PARTICULAR',
    ),
    ancestor_crossing_id: nonEmpty(
      ancestor.crossing_id,
      'INVALID_UPTAKE_ANCESTOR_ID',
    ),
    admitted_receipt_id: nonEmpty(
      receipt.receipt_id,
      'INVALID_UPTAKE_ADMISSION_ID',
    ),
    field_projection_id: nonEmpty(
      field.projection_id,
      'INVALID_UPTAKE_FIELD_ID',
    ),
    field_history_root: nonEmpty(
      field.history_root,
      'INVALID_UPTAKE_HISTORY_ROOT',
    ),
    variation,
    note: nonEmpty(args.note, 'INVALID_UPTAKE_NOTE'),
    authority: {
      inherited_from_ancestor: false,
      inherited_from_field: false,
      local_owner_required: true,
    },
    created_at: args.created_at,
    laws: [
      'UPTAKE != OWNERSHIP',
      'FIELD != CAUSE',
      'FIELD != AUTHORITY',
      'ANCESTRY != AUTHORITY',
      'VARIATION != RETCON',
      'DESCENDANT != ANCESTOR',
    ],
  };

  return {
    ...body,
    uptake_id: `relatte-cultural-uptake-v0:${sha256Hex(
      canonicalizeDomainValue(
        CULTURAL_UPTAKE_ID_DOMAIN,
        uptakeIdentityBody(body),
      ),
    )}`,
  };
}

export function verifyCulturalUptakeShape(value: unknown): boolean {
  try {
    const uptake = asRecord(value, 'INVALID_CULTURAL_UPTAKE');
    assertOnlyKeys(
      uptake,
      UPTAKE_KEYS,
      'UNEXPECTED_CULTURAL_UPTAKE_FIELD',
    );
    if (uptake.schema !== 'relatte.cultural-uptake/v0') return false;
    validateTimestamp(uptake.created_at);

    const authority = asRecord(
      uptake.authority,
      'INVALID_CULTURAL_UPTAKE_AUTHORITY',
    );
    assertOnlyKeys(
      authority,
      AUTHORITY_KEYS,
      'UNEXPECTED_CULTURAL_AUTHORITY_FIELD',
    );
    if (
      authority.inherited_from_ancestor !== false ||
      authority.inherited_from_field !== false ||
      authority.local_owner_required !== true
    ) {
      return false;
    }

    const body: Omit<CulturalUptake, 'uptake_id'> = {
      schema: 'relatte.cultural-uptake/v0',
      world_id: nonEmpty(uptake.world_id, 'INVALID_UPTAKE_WORLD'),
      local_particular: nonEmpty(
        uptake.local_particular,
        'INVALID_UPTAKE_LOCAL_PARTICULAR',
      ),
      ancestor_crossing_id: nonEmpty(
        uptake.ancestor_crossing_id,
        'INVALID_UPTAKE_ANCESTOR_ID',
      ),
      admitted_receipt_id: nonEmpty(
        uptake.admitted_receipt_id,
        'INVALID_UPTAKE_ADMISSION_ID',
      ),
      field_projection_id: nonEmpty(
        uptake.field_projection_id,
        'INVALID_UPTAKE_FIELD_ID',
      ),
      field_history_root: nonEmpty(
        uptake.field_history_root,
        'INVALID_UPTAKE_HISTORY_ROOT',
      ),
      variation: normalizeVariation(uptake.variation),
      note: nonEmpty(uptake.note, 'INVALID_UPTAKE_NOTE'),
      authority: {
        inherited_from_ancestor: false,
        inherited_from_field: false,
        local_owner_required: true,
      },
      created_at: uptake.created_at,
      laws: stringArray(uptake.laws, 'INVALID_UPTAKE_LAWS'),
    };

    return (
      typeof uptake.uptake_id === 'string' &&
      uptake.uptake_id ===
        `relatte-cultural-uptake-v0:${sha256Hex(
          canonicalizeDomainValue(
            CULTURAL_UPTAKE_ID_DOMAIN,
            uptakeIdentityBody(body),
          ),
        )}`
    );
  } catch {
    return false;
  }
}

export function buildCulturalDescendantDraft(args: {
  uptake: unknown;
  descendant_payload_ref: {
    address: string;
    media_type: string;
  };
  return_address?: string | null;
  created_at: string;
}): Record<string, unknown> {
  if (!verifyCulturalUptakeShape(args.uptake)) {
    throw new Error('INVALID_DESCENDANT_UPTAKE');
  }
  validateTimestamp(args.created_at);

  const uptake = asRecord(args.uptake, 'INVALID_DESCENDANT_UPTAKE');
  const payload = asRecord(
    args.descendant_payload_ref,
    'INVALID_DESCENDANT_PAYLOAD',
  );

  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: uptake.local_particular,
    source_world: uptake.world_id,
    source_history_head: uptake.field_history_root,
    parents: [uptake.ancestor_crossing_id],
    declared_kind: 'R10_CULTURAL_DESCENDANT',
    payload_refs: [{
      address: nonEmpty(
        payload.address,
        'INVALID_DESCENDANT_PAYLOAD_ADDRESS',
      ),
      role: 'cultural-descendant',
      media_type: nonEmpty(
        payload.media_type,
        'INVALID_DESCENDANT_MEDIA_TYPE',
      ),
    }],
    requested_effect: {
      kind: 'fresh-candidate-local-uptake',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: args.return_address ?? null,
    created_at: args.created_at,
    extensions: {
      cultural_descendant: {
        uptake_id: uptake.uptake_id,
        ancestor_crossing_id: uptake.ancestor_crossing_id,
        ancestor_admitted_receipt_id: uptake.admitted_receipt_id,
        field_projection_id: uptake.field_projection_id,
        field_history_root: uptake.field_history_root,
        variation: uptake.variation,
        inherited_authority: false,
        field_authorized_action: false,
        laws: [
          'ANCESTRY != AUTHORITY',
          'DESCENDANT != ANCESTOR',
          'FIELD != AUTHORITY',
          'REPRODUCTION != ADMISSION',
        ],
      },
    },
  };
}

export async function verifyCulturalDescendant(args: {
  ancestor_crossing: unknown;
  admitted_receipt: unknown;
  field_projection: unknown;
  uptake: unknown;
  descendant_crossing: unknown;
}): Promise<boolean> {
  try {
    if (!(await verifyCrossingEnvelope(args.ancestor_crossing))) return false;
    if (!(await verifyReceipt(args.admitted_receipt))) return false;
    if (!verifyFieldProjectionShape(args.field_projection)) return false;
    if (!verifyCulturalUptakeShape(args.uptake)) return false;
    if (!(await verifyCrossingEnvelope(args.descendant_crossing))) return false;

    const ancestor = asRecord(
      args.ancestor_crossing,
      'INVALID_DESCENDANT_ANCESTOR',
    );
    const admission = asRecord(
      args.admitted_receipt,
      'INVALID_DESCENDANT_ADMISSION',
    );
    const field = asRecord(
      args.field_projection,
      'INVALID_DESCENDANT_FIELD',
    );
    const uptake = asRecord(args.uptake, 'INVALID_DESCENDANT_UPTAKE');
    const descendant = asRecord(
      args.descendant_crossing,
      'INVALID_DESCENDANT_CROSSING',
    );

    if (
      admission.kind !== 'R3_ADMIT' ||
      admission.crossing_id !== ancestor.crossing_id ||
      admission.receipt_id !== uptake.admitted_receipt_id ||
      admission.world_id !== uptake.world_id
    ) {
      return false;
    }

    if (
      field.projection_id !== uptake.field_projection_id ||
      field.history_root !== uptake.field_history_root ||
      field.world_id !== uptake.world_id ||
      !Array.isArray(field.admitted_receipt_ids) ||
      !field.admitted_receipt_ids.includes(admission.receipt_id)
    ) {
      return false;
    }

    if (
      uptake.ancestor_crossing_id !== ancestor.crossing_id ||
      descendant.source_world !== uptake.world_id ||
      descendant.source_particular !== uptake.local_particular ||
      descendant.source_history_head !== uptake.field_history_root ||
      descendant.declared_kind !== 'R10_CULTURAL_DESCENDANT' ||
      !Array.isArray(descendant.parents) ||
      descendant.parents.length !== 1 ||
      descendant.parents[0] !== ancestor.crossing_id
    ) {
      return false;
    }

    const requestedEffect = asRecord(
      descendant.requested_effect,
      'INVALID_DESCENDANT_REQUESTED_EFFECT',
    );
    if (
      requestedEffect.kind !== 'fresh-candidate-local-uptake' ||
      requestedEffect.authority !== 'receiver-local'
    ) {
      return false;
    }

    const extension = asRecord(
      asRecord(
        descendant.extensions,
        'INVALID_DESCENDANT_EXTENSIONS',
      ).cultural_descendant,
      'INVALID_DESCENDANT_EXTENSIONS',
    );

    if (
      extension.uptake_id !== uptake.uptake_id ||
      extension.ancestor_crossing_id !== ancestor.crossing_id ||
      extension.ancestor_admitted_receipt_id !== admission.receipt_id ||
      extension.field_projection_id !== field.projection_id ||
      extension.field_history_root !== field.history_root ||
      extension.inherited_authority !== false ||
      extension.field_authorized_action !== false
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
