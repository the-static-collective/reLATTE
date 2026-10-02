import {
  canonicalizeDomainValue,
  sha256Hex,
  validateForCanonicalization,
  validateTimestamp,
} from '../src/canonical.ts';

export const CUSTODY_GRANT_ID_DOMAIN = 'reLATTE-PhysicalCustodyGrant-experiment-001|';

export const CUSTODY_POWERS = [
  'possess',
  'transport',
  'store',
  'use',
  'maintain',
  'delegate',
  'return',
  'transfer-authority',
] as const;

export type CustodyPower = typeof CUSTODY_POWERS[number];

export interface PhysicalAnchor {
  kind: 'serial' | 'tag' | 'photo-digest' | 'measurement' | 'witness' | 'other';
  value: string;
  observed_at: string;
  observer_ref: string;
}

export interface CustodyGrantDraft {
  schema: 'relatte.experimental-physical-custody-grant/001';
  object_ref: string;
  anchors: PhysicalAnchor[];
  grantor_ref: string;
  grantee_ref: string;
  powers: CustodyPower[];
  parent_grant_ref: string | null;
  starts_at: string;
  expires_at: string | null;
  return_duty: {
    required: boolean;
    destination_ref: string | null;
  };
  title_claim: null | {
    claimant_ref: string;
    evidence_refs: string[];
  };
}

export interface CustodyGrant extends CustodyGrantDraft {
  grant_id: string;
  laws: readonly string[];
}

const POWER_SET = new Set<string>(CUSTODY_POWERS);

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function normalizePowers(value: unknown): CustodyPower[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('INVALID_CUSTODY_POWERS');
  const powers = value.map((power) => {
    if (typeof power !== 'string' || !POWER_SET.has(power)) throw new Error('UNKNOWN_CUSTODY_POWER');
    return power as CustodyPower;
  });
  if (new Set(powers).size !== powers.length) throw new Error('DUPLICATE_CUSTODY_POWER');
  return [...powers].sort();
}

function normalizeAnchors(value: unknown): PhysicalAnchor[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('PHYSICAL_ANCHOR_REQUIRED');
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('INVALID_PHYSICAL_ANCHOR');
    }
    const anchor = entry as Record<string, unknown>;
    if (!['serial', 'tag', 'photo-digest', 'measurement', 'witness', 'other'].includes(String(anchor.kind))) {
      throw new Error('INVALID_PHYSICAL_ANCHOR_KIND');
    }
    validateTimestamp(nonEmpty(anchor.observed_at, 'INVALID_ANCHOR_TIMESTAMP'));
    return {
      kind: anchor.kind as PhysicalAnchor['kind'],
      value: nonEmpty(anchor.value, 'INVALID_ANCHOR_VALUE'),
      observed_at: anchor.observed_at as string,
      observer_ref: nonEmpty(anchor.observer_ref, 'INVALID_ANCHOR_OBSERVER'),
    };
  });
}

function body(grant: CustodyGrantDraft): CustodyGrantDraft {
  return {
    ...grant,
    anchors: grant.anchors.map((anchor) => ({ ...anchor })),
    powers: [...grant.powers],
    return_duty: { ...grant.return_duty },
    title_claim: grant.title_claim === null
      ? null
      : {
          claimant_ref: grant.title_claim.claimant_ref,
          evidence_refs: [...grant.title_claim.evidence_refs],
        },
  };
}

export function createCustodyGrant(value: CustodyGrantDraft): CustodyGrant {
  if (value.schema !== 'relatte.experimental-physical-custody-grant/001') {
    throw new Error('INVALID_CUSTODY_SCHEMA');
  }
  const normalized: CustodyGrantDraft = {
    schema: value.schema,
    object_ref: nonEmpty(value.object_ref, 'INVALID_OBJECT_REF'),
    anchors: normalizeAnchors(value.anchors),
    grantor_ref: nonEmpty(value.grantor_ref, 'INVALID_GRANTOR_REF'),
    grantee_ref: nonEmpty(value.grantee_ref, 'INVALID_GRANTEE_REF'),
    powers: normalizePowers(value.powers),
    parent_grant_ref: value.parent_grant_ref === null ? null : nonEmpty(value.parent_grant_ref, 'INVALID_PARENT_GRANT_REF'),
    starts_at: nonEmpty(value.starts_at, 'INVALID_START_TIMESTAMP'),
    expires_at: value.expires_at === null ? null : nonEmpty(value.expires_at, 'INVALID_EXPIRY_TIMESTAMP'),
    return_duty: {
      required: value.return_duty.required === true,
      destination_ref: value.return_duty.destination_ref === null
        ? null
        : nonEmpty(value.return_duty.destination_ref, 'INVALID_RETURN_DESTINATION'),
    },
    title_claim: value.title_claim === null
      ? null
      : {
          claimant_ref: nonEmpty(value.title_claim.claimant_ref, 'INVALID_TITLE_CLAIMANT'),
          evidence_refs: value.title_claim.evidence_refs.map((ref) => nonEmpty(ref, 'INVALID_TITLE_EVIDENCE_REF')),
        },
  };
  validateTimestamp(normalized.starts_at);
  if (normalized.expires_at !== null) validateTimestamp(normalized.expires_at);
  if (normalized.return_duty.required && normalized.return_duty.destination_ref === null) {
    throw new Error('RETURN_DESTINATION_REQUIRED');
  }
  validateForCanonicalization(normalized);

  return {
    ...normalized,
    grant_id: `relatte-physical-custody-experiment-001:${sha256Hex(
      canonicalizeDomainValue(CUSTODY_GRANT_ID_DOMAIN, body(normalized)),
    )}`,
    laws: [
      'PHYSICAL POSSESSION != OWNERSHIP',
      'CUSTODY != TITLE',
      'IDENTIFIER != OBJECT',
      'TAG != PHYSICAL IDENTITY',
      'TRANSFER OF ONE POWER != TRANSFER OF ALL POWERS',
      'POSSESSION != AUTHORITY TO TRANSFER',
      'RETURN DUTY != SOURCE OWNERSHIP',
    ],
  };
}

export function mayExercise(grant: CustodyGrant, power: CustodyPower): boolean {
  return grant.powers.includes(power);
}

export function delegateCustody(
  parent: CustodyGrant,
  input: Omit<CustodyGrantDraft, 'parent_grant_ref' | 'object_ref' | 'anchors' | 'grantor_ref' | 'title_claim'>,
): CustodyGrant {
  if (!mayExercise(parent, 'delegate')) throw new Error('DELEGATION_NOT_AUTHORIZED');
  const requested = normalizePowers(input.powers);
  for (const power of requested) {
    if (!parent.powers.includes(power)) throw new Error('DELEGATION_EXCEEDS_PARENT');
  }
  if (requested.includes('transfer-authority') && !parent.powers.includes('transfer-authority')) {
    throw new Error('TRANSFER_AUTHORITY_NOT_DELEGATED');
  }
  return createCustodyGrant({
    ...input,
    object_ref: parent.object_ref,
    anchors: parent.anchors,
    grantor_ref: parent.grantee_ref,
    parent_grant_ref: parent.grant_id,
    title_claim: parent.title_claim,
    powers: requested,
  });
}
