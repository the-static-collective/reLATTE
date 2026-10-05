import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { parseResultId } from '../merkle_native/result.ts';
import { instant } from '../audit_clock/wire.ts';
import { label } from './policy.ts';
import { id, inspectInterpretation, sealInterpretation } from './wire.ts';
import { RESOURCE_FIELDS } from './types.ts';
import type { ResourceClaim } from './types.ts';

export function parseResourceClaim(value: unknown): ResourceClaim {
  canonicalBytes(value); const c = record(value, 'INVALID_RESOURCE_CLAIM');
  exactKeys(c, ['schema', 'result_id', 'audit_id', 'history_id', 'basis', 'amounts', 'claimed_at', 'note'], 'INVALID_RESOURCE_CLAIM_FIELDS');
  if (c.schema !== 'useful-work.resource-claim/v1' || c.basis !== 'self-reported/v1') throw new Error('UNSUPPORTED_RESOURCE_CLAIM_BASIS');
  parseResultId(c.result_id); instant(c.claimed_at); if (c.note !== null) label(c.note);
  if (c.audit_id !== null) id(c.audit_id, 'useful-work-audit-v1:');
  if (c.history_id !== null) id(c.history_id, 'useful-work-audit-history-v1:');
  const amounts = record(c.amounts, 'INVALID_RESOURCE_AMOUNTS'); exactKeys(amounts, [...RESOURCE_FIELDS], 'INVALID_RESOURCE_AMOUNTS');
  if (RESOURCE_FIELDS.every(f => amounts[f] === null)) throw new Error('EMPTY_RESOURCE_CLAIM');
  for (const field of RESOURCE_FIELDS) if (amounts[field] !== null) integer(amounts[field], 0, 1_000_000_000_000, 'INVALID_RESOURCE_AMOUNT');
  return structuredClone(c) as ResourceClaim;
}
export async function signResourceClaim(value: unknown, keys: P256KeyMaterial, identity: { world_id: string; particular: string }) {
  const claim = parseResourceClaim(value);
  return sealInterpretation('resource-claim', claim, keys, identity, claim.claimed_at);
}
export async function inspectResourceClaim(value: unknown) {
  const { crossing, payload } = await inspectInterpretation(value, 'resource-claim'), claim = parseResourceClaim(payload);
  if (crossing.created_at !== claim.claimed_at) throw new Error('RESOURCE_CLAIM_TIMESTAMP_MISMATCH');
  return { crossing, claim };
}
