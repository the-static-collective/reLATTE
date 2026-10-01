import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateForCanonicalization,
  validateTimestamp,
} from './canonical.ts';
import {
  sealCrossingEnvelope,
  verifyCrossingEnvelope,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const ORGAN_ADAPTER_ID_DOMAIN = 'reLATTE-OrganAdapter-v0|';

const SPEC_KEYS = [
  'schema',
  'family_ref',
  'donor_contract_ref',
  'artifact_kind',
  'source_world',
  'source_particular',
  'source_history_head',
  'payload_refs',
  'donor_claims',
  'requested_effect',
  'return_address',
  'created_at',
] as const;

const DESCRIPTOR_KEYS = [
  'schema',
  'adapter_id',
  'family_ref',
  'donor_contract_ref',
  'artifact_kind',
  'donor_claims',
  'laws',
] as const;

export interface OrganPayloadRef {
  address: string;
  role: string;
  media_type: string;
}

export interface OpaqueOrganSpec {
  schema: 'relatte.opaque-organ-spec/v0';
  family_ref: string;
  donor_contract_ref: string;
  artifact_kind: string;
  source_world: string;
  source_particular: string;
  source_history_head: string | null;
  payload_refs: OrganPayloadRef[];
  donor_claims: Record<string, unknown>;
  requested_effect: unknown;
  return_address: string | null;
  created_at: string;
}

export interface OrganAdapterDescriptor {
  schema: 'relatte.organ-adapter-descriptor/v0';
  adapter_id?: string;
  family_ref: string;
  donor_contract_ref: string;
  artifact_kind: string;
  donor_claims: Record<string, unknown>;
  laws: string[];
}

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

function normalizePayloadRefs(value: unknown): OrganPayloadRef[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('INVALID_ORGAN_PAYLOAD_REFS');
  }
  return value.map((entry) => {
    const ref = asRecord(entry, 'INVALID_ORGAN_PAYLOAD_REF');
    const keys = Object.keys(ref).sort();
    if (keys.join('|') !== ['address', 'media_type', 'role'].sort().join('|')) {
      throw new Error('UNEXPECTED_ORGAN_PAYLOAD_REF_FIELD');
    }
    return {
      address: nonEmpty(ref.address, 'INVALID_ORGAN_PAYLOAD_ADDRESS'),
      role: nonEmpty(ref.role, 'INVALID_ORGAN_PAYLOAD_ROLE'),
      media_type: nonEmpty(ref.media_type, 'INVALID_ORGAN_PAYLOAD_MEDIA_TYPE'),
    };
  });
}

function normalizeClaims(value: unknown): Record<string, unknown> {
  const claims = asRecord(value, 'INVALID_ORGAN_DONOR_CLAIMS');
  validateForCanonicalization(claims);
  return structuredClone(claims);
}

function descriptorIdentityBody(
  value: Omit<OrganAdapterDescriptor, 'adapter_id'>,
): Omit<OrganAdapterDescriptor, 'adapter_id'> {
  return {
    schema: 'relatte.organ-adapter-descriptor/v0',
    family_ref: value.family_ref,
    donor_contract_ref: value.donor_contract_ref,
    artifact_kind: value.artifact_kind,
    donor_claims: structuredClone(value.donor_claims),
    laws: [...value.laws],
  };
}

export function createOrganAdapterDescriptor(
  specValue: unknown,
): OrganAdapterDescriptor {
  const spec = asRecord(specValue, 'INVALID_ORGAN_SPEC');
  assertOnlyKeys(spec, SPEC_KEYS, 'UNEXPECTED_ORGAN_SPEC_FIELD');
  if (spec.schema !== 'relatte.opaque-organ-spec/v0') {
    throw new Error('INVALID_ORGAN_SPEC_SCHEMA');
  }
  const familyRef = nonEmpty(spec.family_ref, 'INVALID_ORGAN_FAMILY_REF');
  const donorContractRef = nonEmpty(
    spec.donor_contract_ref,
    'INVALID_ORGAN_DONOR_CONTRACT_REF',
  );
  const artifactKind = nonEmpty(
    spec.artifact_kind,
    'INVALID_ORGAN_ARTIFACT_KIND',
  );
  const claims = normalizeClaims(spec.donor_claims);

  const body: Omit<OrganAdapterDescriptor, 'adapter_id'> = {
    schema: 'relatte.organ-adapter-descriptor/v0',
    family_ref: familyRef,
    donor_contract_ref: donorContractRef,
    artifact_kind: artifactKind,
    donor_claims: claims,
    laws: [
      'DONOR SEMANTICS != SUBSTRATE SEMANTICS',
      'ADAPTER != DONOR AUTHORITY',
      'CROSSING != DONOR INTERPRETATION',
      'PAYLOAD TYPE != ADMISSION LAW',
    ],
  };

  return {
    ...body,
    adapter_id: `relatte-organ-adapter-v0:${sha256Hex(
      canonicalizeDomainValue(
        ORGAN_ADAPTER_ID_DOMAIN,
        descriptorIdentityBody(body),
      ),
    )}`,
  };
}

export async function sealOpaqueOrganCrossing(
  specValue: unknown,
  keys: P256KeyMaterial,
): Promise<Record<string, any>> {
  const spec = asRecord(specValue, 'INVALID_ORGAN_SPEC');
  assertOnlyKeys(spec, SPEC_KEYS, 'UNEXPECTED_ORGAN_SPEC_FIELD');
  if (spec.schema !== 'relatte.opaque-organ-spec/v0') {
    throw new Error('INVALID_ORGAN_SPEC_SCHEMA');
  }
  validateTimestamp(nonEmpty(spec.created_at, 'INVALID_ORGAN_CREATED_AT'));
  validateForCanonicalization(spec.requested_effect);

  const descriptor = createOrganAdapterDescriptor(spec);
  const payloadRefs = normalizePayloadRefs(spec.payload_refs);

  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: nonEmpty(
      spec.source_particular,
      'INVALID_ORGAN_SOURCE_PARTICULAR',
    ),
    source_world: nonEmpty(spec.source_world, 'INVALID_ORGAN_SOURCE_WORLD'),
    source_history_head:
      spec.source_history_head === null
        ? null
        : nonEmpty(
            spec.source_history_head,
            'INVALID_ORGAN_SOURCE_HISTORY_HEAD',
          ),
    parents: [],
    declared_kind: 'OPAQUE_ORGAN_ARTIFACT',
    payload_refs: payloadRefs,
    requested_effect: structuredClone(spec.requested_effect),
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address:
      spec.return_address === null
        ? null
        : nonEmpty(spec.return_address, 'INVALID_ORGAN_RETURN_ADDRESS'),
    created_at: spec.created_at,
    extensions: {
      organ_adapter: descriptor,
    },
  }, keys);
}

export async function verifyOpaqueOrganCrossing(
  crossingValue: unknown,
): Promise<boolean> {
  try {
    if (!(await verifyCrossingEnvelope(crossingValue))) return false;
    const crossing = asRecord(crossingValue, 'INVALID_ORGAN_CROSSING');
    if (crossing.declared_kind !== 'OPAQUE_ORGAN_ARTIFACT') return false;

    const extension = asRecord(
      asRecord(crossing.extensions, 'INVALID_ORGAN_EXTENSIONS').organ_adapter,
      'INVALID_ORGAN_ADAPTER_DESCRIPTOR',
    );
    assertOnlyKeys(
      extension,
      DESCRIPTOR_KEYS,
      'UNEXPECTED_ORGAN_ADAPTER_DESCRIPTOR_FIELD',
    );
    const descriptor = createOrganAdapterDescriptor({
      schema: 'relatte.opaque-organ-spec/v0',
      family_ref: extension.family_ref,
      donor_contract_ref: extension.donor_contract_ref,
      artifact_kind: extension.artifact_kind,
      source_world: crossing.source_world,
      source_particular: crossing.source_particular,
      source_history_head: crossing.source_history_head,
      payload_refs: crossing.payload_refs,
      donor_claims: extension.donor_claims,
      requested_effect: crossing.requested_effect,
      return_address: crossing.return_address,
      created_at: crossing.created_at,
    });

    return (
      typeof extension.adapter_id === 'string' &&
      extension.adapter_id === descriptor.adapter_id &&
      canonicalize(extension) === canonicalize(descriptor)
    );
  } catch {
    return false;
  }
}
