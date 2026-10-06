import { sealOpaqueOrganCrossing } from '../../organ.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, record } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { expectedCrossingId, instant, nonempty, publicKey, signerKey } from '../audit_clock/wire.ts';

export type Wire = Record<string, any>;
export interface Identity { world_id: string; public_key: JsonWebKey }
export const SETTLEMENT_CONTRACT = 'contract:useful-work/offer-settlement-v1';
export const SETTLEMENT_LAWS = ['VALUATION ≠ OFFER', 'OFFER ≠ OBLIGATION', 'ACCEPTANCE ≠ PAYMENT',
  'PAYMENT OBSERVATION ≠ OWNERSHIP', 'SETTLEMENT RECEIPT ≠ UNIVERSAL FINALITY'];
export const LIMIT = 192 * 1024 * 1024;
export const LIMITS = { obligation_created: false, transfer_performed_by_relatte: false, transfer_guaranteed: false,
  ownership_transferred: false, economic_entitlement_asserted: false, universal_finality_asserted: false,
  objective_time_verified: false, organizational_independence_verified: false, authority_asserted: false, consensus_asserted: false } as const;
export function bounded(value: unknown, limit = LIMIT) {
  if (canonicalBytes(value).length > limit) throw new Error('SETTLEMENT_SIZE_LIMIT');
}
export function snapshot(value: unknown, limit = LIMIT) { bounded(value, limit); return structuredClone(value); }
export function identity(value: unknown): Identity {
  const i = record(value, 'INVALID_SETTLEMENT_IDENTITY'); exactKeys(i, ['world_id', 'public_key'], 'INVALID_SETTLEMENT_IDENTITY');
  nonempty(i.world_id); return { world_id: i.world_id, public_key: publicKey(i.public_key) };
}
export function signer(value: Wire): Identity { return { world_id: value.source_world ?? value.world_id, public_key: signerKey(value) }; }
export function messageSpec(kind: string, payload: unknown, world: string, at: string): OpaqueOrganSpec {
  instant(at); nonempty(world);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/settlement-${kind}-v1`, donor_contract_ref: SETTLEMENT_CONTRACT,
    artifact_kind: `settlement-${kind}`, source_world: world, source_particular: `particular:useful-work:settlement-${kind}`,
    source_history_head: null, payload_refs: [{ address: `sha256:${hashValue(payload)}`, role: `settlement-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`settlement_${kind}`]: payload, ownership_asserted: false, authority_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export async function sealMessage(kind: string, payload: unknown, keys: P256KeyMaterial, world: string, at: string) {
  const crossing = await sealOpaqueOrganCrossing(messageSpec(kind, payload, world, at), keys); bounded(crossing, 2_000_000); return crossing;
}
export async function inspectMessage(value: unknown, kind: string) {
  value = snapshot(value, 2_000_000);
  const crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== `organ:useful-work/settlement-${kind}-v1` || d.donor_contract_ref !== SETTLEMENT_CONTRACT) throw new Error('UNSUPPORTED_SETTLEMENT_MESSAGE');
  const donor = claims(crossing); exactKeys(donor, [`settlement_${kind}`, 'ownership_asserted', 'authority_asserted', 'economic_value_asserted'], 'INVALID_SETTLEMENT_CLAIMS');
  if (donor.ownership_asserted !== false || donor.authority_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_SETTLEMENT_AUTHORITY');
  const payload = record(donor[`settlement_${kind}`], 'INVALID_SETTLEMENT_PAYLOAD');
  if (crossing.crossing_id !== expectedCrossingId(messageSpec(kind, payload, crossing.source_world, crossing.created_at), signerKey(crossing))) throw new Error('SETTLEMENT_ENVELOPE_RULE_MISMATCH');
  return { crossing, payload };
}
