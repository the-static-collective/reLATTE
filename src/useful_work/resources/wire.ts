import { sealOpaqueOrganCrossing } from '../../organ.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, record } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { expectedCrossingId, instant, nonempty, signerKey } from '../audit_clock/wire.ts';

export const RESOURCE_KINDS = ['cpu', 'energy', 'storage', 'network'] as const;
export type ResourceKind = typeof RESOURCE_KINDS[number];
export type Wire = Record<string, any>;
export const RESOURCE_LAWS = ['CPU TIME ≠ ENERGY', 'PROCESS TIME ≠ EXCLUSIVE WORK',
  'METER READING ≠ CAUSATION', 'MEASUREMENT ≠ ECONOMIC VALUE'];
export const contractFor = (kind: string) => `contract:useful-work/resource-${kind}-v1`;
export const NON_AUTHORITY = { job_association_independently_verified: false, hardware_attestation_verified: false,
  objective_time_verified: false, full_computation_verified: false, exclusive_job_resource_use_verified: false,
  economic_value_asserted: false, ownership_asserted: false, authority_asserted: false, consensus_asserted: false } as const;
export const MAX_RESOURCE_MESSAGE_BYTES = 24 * 1024 * 1024;
export function uint(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 18_446_744_073_709_551_615n) throw new Error('INVALID_RESOURCE_COUNTER');
  return BigInt(value);
}
export function rawCounter(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})\n?$/.test(value)) throw new Error('INVALID_RAW_RESOURCE_COUNTER');
  return uint(value.trim());
}
export function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error('INVALID_RESOURCE_BOOT_ID');
}
export function pairTimes(start: unknown, end: unknown) {
  if (instant(end) < instant(start)) throw new Error('RESOURCE_OBSERVATION_TIME_MOVED_BACKWARDS');
}
export function resourceSpec(kind: string, payload: unknown, world: string, at: string): OpaqueOrganSpec {
  instant(at); nonempty(world);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/resource-${kind}-v1`, donor_contract_ref: contractFor(kind),
    artifact_kind: `resource-${kind}`, source_world: world, source_particular: `particular:useful-work:resource-${kind}`,
    source_history_head: null, payload_refs: [{ address: `sha256:${hashValue(payload)}`, role: `resource-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`resource_${kind}`]: payload, ownership_asserted: false, authority_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export const sealResourceMessage = (kind: string, payload: unknown, keys: P256KeyMaterial, world: string, at: string) =>
  sealOpaqueOrganCrossing(resourceSpec(kind, payload, world, at), keys);
export async function inspectResourceMessage(value: unknown, kind: string) {
  if (canonicalBytes(value).length > MAX_RESOURCE_MESSAGE_BYTES) throw new Error('RESOURCE_MESSAGE_SIZE_LIMIT');
  const crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== `organ:useful-work/resource-${kind}-v1` || d.donor_contract_ref !== contractFor(kind)) throw new Error('UNSUPPORTED_RESOURCE_MESSAGE');
  const donor = claims(crossing); exactKeys(donor, [`resource_${kind}`, 'ownership_asserted', 'authority_asserted', 'economic_value_asserted'], 'INVALID_RESOURCE_CLAIMS');
  if (donor.ownership_asserted !== false || donor.authority_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_RESOURCE_AUTHORITY');
  const payload = record(donor[`resource_${kind}`], 'INVALID_RESOURCE_PAYLOAD');
  if (crossing.crossing_id !== expectedCrossingId(resourceSpec(kind, payload, crossing.source_world, crossing.created_at), signerKey(crossing))) throw new Error('RESOURCE_ENVELOPE_RULE_MISMATCH');
  return { crossing, payload };
}
