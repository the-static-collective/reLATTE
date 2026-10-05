import { createOrganAdapterDescriptor, sealOpaqueOrganCrossing } from '../../organ.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import { computeCrossingId, CROSSING_SIGNING_DOMAIN, P256_ALGORITHM } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, record } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';

export type Wire = Record<string, any>;
export const CLOCK_CONTRACT = 'contract:useful-work/audit-clock-v1';
export const CLOCK_LAWS = ['SCHEDULE ≠ AUTHORITY', 'RANDOMNESS ≠ TRUTH', 'NONRESPONSE ≠ FAILURE OF COMPUTATION',
  'MISSING EVIDENCE ≠ NEGATIVE EVIDENCE', 'OBSERVED HISTORY ≠ COMPLETE HISTORY', 'RESPONSE TIME ≠ COMPUTE TIME'];
export const equal = (a: unknown, b: unknown) => canonicalBytes(a).equals(canonicalBytes(b));
export function publicKey(value: unknown): JsonWebKey {
  const k = record(value, 'INVALID_CLOCK_PUBLIC_KEY'); exactKeys(k, ['kty', 'crv', 'x', 'y'], 'INVALID_CLOCK_PUBLIC_KEY');
  if (k.kty !== 'EC' || k.crv !== 'P-256') throw new Error('INVALID_CLOCK_PUBLIC_KEY');
  for (const coordinate of [k.x, k.y]) {
    if (typeof coordinate !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(coordinate) || Buffer.from(coordinate, 'base64url').toString('base64url') !== coordinate) throw new Error('INVALID_CLOCK_PUBLIC_KEY');
  }
  return structuredClone(k);
}
export function signerKey(value: Wire) { const { kty, crv, x, y } = value.signing.public_key; return publicKey({ kty, crv, x, y }); }
export function assertSigner(value: Wire, key: JsonWebKey, world: string) {
  if (!equal(signerKey(value), key) || value.source_world !== world) throw new Error('CLOCK_SIGNER_MISMATCH');
}
export function instant(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) throw new Error('INVALID_CLOCK_INSTANT');
  return Date.parse(value);
}
export const iso = (ms: number) => { const value = new Date(ms).toISOString(); instant(value); return value; };
export function nonempty(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error('INVALID_CLOCK_LABEL');
}
export function crossingId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^relatte-crossing-v0:[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_CLOCK_CROSSING_ID');
}
export function clockSpec(kind: string, payload: unknown, world: string, createdAt: string): OpaqueOrganSpec {
  instant(createdAt); nonempty(world);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/audit-clock-${kind}-v1`, donor_contract_ref: CLOCK_CONTRACT,
    artifact_kind: `audit-clock-${kind}`, source_world: world, source_particular: `particular:useful-work:audit-clock-${kind}`,
    source_history_head: null, payload_refs: [{ address: `sha256:${hashValue(payload)}`, role: `audit-clock-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`audit_clock_${kind}`]: payload, ownership_asserted: false, authority_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: createdAt };
}
/** Freeze all envelope fields, not just the nonce, so extra metadata cannot grind coordinates. */
export function expectedCrossingId(spec: OpaqueOrganSpec, key: JsonWebKey) {
  return computeCrossingId({ schema: 'relatte.crossing-envelope/v0', protocol_version: '0', source_world: spec.source_world,
    source_particular: spec.source_particular, source_history_head: spec.source_history_head, parents: [], declared_kind: 'OPAQUE_ORGAN_ARTIFACT',
    payload_refs: spec.payload_refs, requested_effect: spec.requested_effect, capability_ref: null, privacy_policy: null, audience_policy: null,
    return_address: spec.return_address, created_at: spec.created_at, extensions: { organ_adapter: createOrganAdapterDescriptor(spec) },
    signing: { algorithm: P256_ALGORITHM, domain: CROSSING_SIGNING_DOMAIN, public_key: key, signature: 'not-used' } });
}
export const sealClockMessage = (kind: string, payload: unknown, keys: P256KeyMaterial, world: string, at: string) => sealOpaqueOrganCrossing(clockSpec(kind, payload, world, at), keys);
export async function inspectClockMessage(value: unknown, kind: string) {
  if (canonicalBytes(value).length > 1_000_000) throw new Error('CLOCK_MESSAGE_SIZE_LIMIT');
  const crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== `organ:useful-work/audit-clock-${kind}-v1` || d.donor_contract_ref !== CLOCK_CONTRACT) throw new Error('UNSUPPORTED_CLOCK_MESSAGE');
  const donor = claims(crossing); exactKeys(donor, [`audit_clock_${kind}`, 'ownership_asserted', 'authority_asserted', 'economic_value_asserted'], 'INVALID_CLOCK_CLAIMS');
  if (donor.ownership_asserted !== false || donor.authority_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_CLOCK_AUTHORITY');
  const payload = record(donor[`audit_clock_${kind}`], 'INVALID_CLOCK_PAYLOAD');
  if (crossing.crossing_id !== expectedCrossingId(clockSpec(kind, payload, crossing.source_world, crossing.created_at), signerKey(crossing))) throw new Error('CLOCK_ENVELOPE_RULE_MISMATCH');
  return { crossing, payload };
}
