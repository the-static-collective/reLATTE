import { sealOpaqueOrganCrossing } from '../../organ.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, record } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { expectedCrossingId, instant, nonempty, signerKey } from '../audit_clock/wire.ts';

export const SERVICE_CONTRACT = 'contract:useful-work/service-v1';
export const SERVICE_LAWS = ['SERVING OBSERVATION ≠ CONTINUOUS STORAGE', 'RETURNED BYTES ≠ PHYSICAL BANDWIDTH',
  'OBSERVER WINDOW ≠ OBJECTIVE TIME', 'ENDPOINT ATTRIBUTION ≠ NETWORK PATH', 'MISSING EVIDENCE ≠ PROVEN UNAVAILABILITY'];
export type Wire = Record<string, any>;
export const UNPROVEN = { continuous_storage_verified: false, physical_bandwidth_verified: false,
  network_path_verified: false, host_uptime_verified: false, objective_time_verified: false,
  randomness_unpredictability_verified: false, full_computation_verified: false,
  ownership_asserted: false, authority_asserted: false, consensus_asserted: false, economic_value_asserted: false } as const;
export function endpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_SERVICE_ENDPOINT');
  let u: URL; try { u = new URL(value); } catch { throw new Error('INVALID_SERVICE_ENDPOINT'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.hash || u.href !== value) throw new Error('INVALID_SERVICE_ENDPOINT');
  return value;
}
export function serviceSpec(kind: string, payload: unknown, world: string, at: string): OpaqueOrganSpec {
  instant(at); nonempty(world);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/service-${kind}-v1`,
    donor_contract_ref: SERVICE_CONTRACT, artifact_kind: `service-${kind}`, source_world: world,
    source_particular: `particular:useful-work:service-${kind}`, source_history_head: null,
    payload_refs: [{ address: `sha256:${hashValue(payload)}`, role: `service-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`service_${kind}`]: payload, ownership_asserted: false, authority_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export const sealServiceMessage = (kind: string, payload: unknown, keys: P256KeyMaterial, world: string, at: string) =>
  sealOpaqueOrganCrossing(serviceSpec(kind, payload, world, at), keys);
export async function inspectServiceMessage(value: unknown, kind: string) {
  if (canonicalBytes(value).length > 1_000_000) throw new Error('SERVICE_MESSAGE_SIZE_LIMIT');
  const crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== `organ:useful-work/service-${kind}-v1` || d.donor_contract_ref !== SERVICE_CONTRACT) throw new Error('UNSUPPORTED_SERVICE_MESSAGE');
  const donor = claims(crossing);
  exactKeys(donor, [`service_${kind}`, 'ownership_asserted', 'authority_asserted', 'economic_value_asserted'], 'INVALID_SERVICE_CLAIMS');
  if (donor.ownership_asserted !== false || donor.authority_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_SERVICE_AUTHORITY');
  const payload = record(donor[`service_${kind}`], 'INVALID_SERVICE_PAYLOAD');
  if (crossing.crossing_id !== expectedCrossingId(serviceSpec(kind, payload, crossing.source_world, crossing.created_at), signerKey(crossing))) throw new Error('SERVICE_ENVELOPE_RULE_MISMATCH');
  return { crossing, payload };
}
