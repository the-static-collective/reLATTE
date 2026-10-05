import type { OpaqueOrganSpec } from '../../organ.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { digest } from '../challenge/commitment.ts';
import { parseResultId } from '../merkle_native/result.ts';
import { canonicalBytes, exactKeys } from '../job.ts';
import { AUDIT_LAWS, verifyAudit } from './accumulator.ts';
import type { AuditObject } from './types.ts';

export const AUDIT_FAMILY = 'organ:useful-work/kernel-005';
export const AUDIT_CONTRACT = 'contract:useful-work/audit-accumulator-v1';
export function auditOrganSpec(auditId: string, resultId: string, createdAt: string): OpaqueOrganSpec {
  if (!auditId.startsWith('useful-work-audit-v1:')) throw new Error('INVALID_AUDIT_ID');
  digest(auditId.slice('useful-work-audit-v1:'.length)); parseResultId(resultId);
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: AUDIT_FAMILY, donor_contract_ref: AUDIT_CONTRACT,
    artifact_kind: 'scoped-audit-evidence-index', source_world: 'world:useful-work-audit-collector',
    source_particular: `particular:${auditId}`, source_history_head: null,
    payload_refs: [{ address: auditId, role: 'audit-object', media_type: 'application/json' }],
    donor_claims: { audit_ref: auditId, audited_result_ref: resultId, laws: [...AUDIT_LAWS],
      ownership_asserted: false, authority_asserted: false, consensus_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: createdAt };
}
/** Reconstruct the audit before checking its signed transport reference. Transport conveys no verdict. */
export async function verifyAuditCrossing(value: unknown, object: unknown): Promise<AuditObject> {
  const audit = await verifyAudit(object), crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== AUDIT_FAMILY || d.donor_contract_ref !== AUDIT_CONTRACT) throw new Error('UNSUPPORTED_AUDIT_CROSSING');
  const expected = auditOrganSpec(audit.audit_id, audit.result_id, crossing.created_at);
  exactKeys(claims(crossing), Object.keys(expected.donor_claims), 'INVALID_AUDIT_CROSSING_CLAIMS');
  if (!canonicalBytes(crossing.payload_refs).equals(canonicalBytes(expected.payload_refs)) ||
      !canonicalBytes(claims(crossing)).equals(canonicalBytes(expected.donor_claims))) throw new Error('AUDIT_CROSSING_REFERENCE_MISMATCH');
  return audit;
}
