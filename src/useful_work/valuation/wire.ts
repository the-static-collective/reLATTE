import type { P256KeyMaterial } from '../../protocol.ts';
import { sealOpaqueOrganCrossing } from '../../organ.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { canonicalBytes, exactKeys, hashValue, record } from '../job.ts';
import { expectedCrossingId, instant, signerKey } from '../audit_clock/wire.ts';
import { label } from './policy.ts';
import type { Wire } from './types.ts';

export const VALUATION_CONTRACT = 'contract:useful-work/local-valuation-v1';
export const VALUATION_LAWS = ['VALUE ≠ TRUTH', 'PRICE ≠ AUTHORITY', 'PAYMENT ≠ OWNERSHIP', 'WORK CLAIM ≠ RESOURCE PROOF',
  'AUDIT SUCCESS ≠ ECONOMIC ENTITLEMENT', 'ONE MARKET ≠ UNIVERSAL VALUE'];
export const equal = (a: unknown, b: unknown) => canonicalBytes(a).equals(canonicalBytes(b));
export function id(value: unknown, prefix: string): asserts value is string {
  if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(value.slice(prefix.length))) throw new Error('INVALID_VALUATION_REFERENCE');
}
export function interpretationSpec(kind: 'resource-claim' | 'valuation', payload: unknown, identity: { world_id: string; particular: string }, at: string): OpaqueOrganSpec {
  label(identity.world_id); label(identity.particular); instant(at);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/${kind}-v1`, donor_contract_ref: VALUATION_CONTRACT,
    artifact_kind: kind === 'valuation' ? 'local-replaceable-valuation-opinion' : 'attributed-resource-claim', source_world: identity.world_id,
    source_particular: identity.particular, source_history_head: null,
    payload_refs: [{ address: `sha256:${hashValue(payload)}`, role: kind, media_type: 'application/json' }],
    donor_claims: { [kind.replace('-', '_')]: payload, ownership_asserted: false, authority_asserted: false, universal_value_asserted: false, economic_entitlement_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export const sealInterpretation = (kind: 'resource-claim' | 'valuation', payload: unknown, keys: P256KeyMaterial, identity: { world_id: string; particular: string }, at: string) => sealOpaqueOrganCrossing(interpretationSpec(kind, payload, identity, at), keys);
export async function inspectInterpretation(value: unknown, kind: 'resource-claim' | 'valuation') {
  if (canonicalBytes(value).length > 1_000_000) throw new Error('INTERPRETATION_SIZE_LIMIT');
  const crossing = await authenticated(value), descriptor = crossing.extensions.organ_adapter;
  if (descriptor.family_ref !== `organ:useful-work/${kind}-v1` || descriptor.donor_contract_ref !== VALUATION_CONTRACT) throw new Error('UNSUPPORTED_INTERPRETATION');
  const donor = claims(crossing), key = kind.replace('-', '_');
  exactKeys(donor, [key, 'ownership_asserted', 'authority_asserted', 'universal_value_asserted', 'economic_entitlement_asserted'], 'INVALID_INTERPRETATION_CLAIMS');
  if (donor.ownership_asserted !== false || donor.authority_asserted !== false || donor.universal_value_asserted !== false || donor.economic_entitlement_asserted !== false) throw new Error('UNSUPPORTED_VALUATION_AUTHORITY');
  const payload = record(donor[key], 'INVALID_INTERPRETATION_PAYLOAD');
  const spec = interpretationSpec(kind, payload, { world_id: crossing.source_world, particular: crossing.source_particular }, crossing.created_at);
  if (crossing.crossing_id !== expectedCrossingId(spec, signerKey(crossing))) throw new Error('INTERPRETATION_ENVELOPE_MISMATCH');
  return { crossing, payload };
}
