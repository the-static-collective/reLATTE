import type { P256KeyMaterial } from '../../protocol.ts';
import { constructReceiptIdentityBody, sealReceipt, verifyReceipt } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { signerKey } from '../audit_clock/wire.ts';
import { MAX_VALUATION_BUNDLE_BYTES, verifyContext } from './context.ts';
import type { VerifiedContext } from './context.ts';
import { parsePolicy, policyId } from './policy.ts';
import { projectMetrics } from './metrics.ts';
import { calculate } from './calculation.ts';
import { equal, inspectInterpretation, sealInterpretation, VALUATION_CONTRACT, VALUATION_LAWS } from './wire.ts';
import type { ValuationBundle, ValuationPolicy, ValuationReport, Wire } from './types.ts';

export const VALUATION_NOTE = 'I value this identified evidence at the stated amount under my local policy. Verification replays that policy; it establishes no universal price, correctness, payment, ownership, or economic entitlement.';
function report(v: VerifiedContext, policy: ValuationPolicy): ValuationReport {
  const projection = projectMetrics(v);
  return { schema: 'useful-work.local-valuation/v1', scope: { context_id: v.context.context_id, result_id: v.context.result_id,
    job_spec_hash: v.native.header.job_spec_hash, work_crossing_id: v.native.crossing.crossing_id, audit_id: v.audit?.audit_id ?? null,
    history_id: v.history?.history_id ?? null, resource_claim_ids: [...new Set(v.resources.map(r => r.crossing.crossing_id))].sort(),
    policy_id: policyId(policy), policy_name: policy.policy_name, policy_version: policy.policy_version, unit: policy.unit },
    ...projection, calculation: calculate(policy, projection.metrics), claims: { local_opinion: true, policy_calculation_reproducible: true,
      evidence_signatures_and_bindings_verified: true, artifact_structure_checked: v.artifactBytes !== null, full_computation_verified: false,
      resource_claim_signatures_verified: true, resource_measurements_proven: false, independent_verifier_execution_proven: false,
      objective_time_verified: false, observed_history_complete: false, global_price_asserted: false, payment_performed: false,
      ownership_transferred: false, economic_entitlement_asserted: false, authority_asserted: false, consensus_asserted: false, uncertainty_is_fraud: false },
    interpretation: VALUATION_NOTE, laws: [...VALUATION_LAWS] };
}
function receiptDraft(crossing: Wire, r: ValuationReport) {
  return { schema: 'relatte.receipt/v0', crossing_id: crossing.crossing_id, world_id: crossing.source_world, receiver_particular: crossing.source_particular,
    kind: 'VALUED', semantic_effect: 'none', contract_ref: VALUATION_CONTRACT, pre_state_ref: null, post_state_ref: null,
    descendant_refs: [], residual_refs: [], note: VALUATION_NOTE, created_at: crossing.created_at, extensions: { useful_work_valuation: r, laws: [...VALUATION_LAWS] } };
}
export async function evaluate(contextValue: unknown, policyValue: unknown, keys: P256KeyMaterial, at: string, identity: { world_id: string; particular: string }): Promise<ValuationBundle> {
  const v = await verifyContext(contextValue), policy = parsePolicy(policyValue), r = report(v, policy);
  const crossing = await sealInterpretation('valuation', r, keys, identity, at), receipt = await sealReceipt(receiptDraft(crossing, r), keys);
  return { schema: 'useful-work.valuation/v1', context: v.context, policy, crossing, receipt };
}
export async function verifyValuation(value: unknown) {
  if (canonicalBytes(value).length > MAX_VALUATION_BUNDLE_BYTES) throw new Error('VALUATION_BUNDLE_SIZE_LIMIT');
  const b = record(value, 'INVALID_VALUATION_BUNDLE'); exactKeys(b, ['schema', 'context', 'policy', 'crossing', 'receipt'], 'INVALID_VALUATION_BUNDLE_FIELDS');
  if (b.schema !== 'useful-work.valuation/v1') throw new Error('UNSUPPORTED_VALUATION_BUNDLE');
  if (!await verifyReceipt(b.receipt)) throw new Error('INVALID_VALUATION_RECEIPT_SIGNATURE');
  const { crossing, payload } = await inspectInterpretation(b.crossing, 'valuation');
  if (!equal(signerKey(b.receipt), signerKey(crossing))) throw new Error('VALUATION_EVALUATOR_KEY_MISMATCH');
  const v = await verifyContext(b.context), policy = parsePolicy(b.policy), expected = report(v, policy);
  if (!equal(payload, expected)) throw new Error('VALUATION_POLICY_CALCULATION_OR_SCOPE_MISMATCH');
  const actual = constructReceiptIdentityBody(b.receipt), draft = receiptDraft(crossing, expected);
  const expectedIdentity = constructReceiptIdentityBody({ ...draft, signing: b.receipt.signing });
  if (!equal(actual, expectedIdentity)) throw new Error('INVALID_VALUATION_RECEIPT_SCOPE_OR_EFFECT');
  return { bundle: { schema: 'useful-work.valuation/v1', context: v.context, policy, crossing, receipt: structuredClone(b.receipt) } as ValuationBundle, report: expected };
}
/** Plural local opinions. No average, conversion, ranking, winning market or global replacement. */
export async function compareValuations(values: unknown[]) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 16) throw new Error('INVALID_VALUATION_COMPARISON_COUNT');
  const checked = [];
  for (const value of values) checked.push(await verifyValuation(value));
  checked.sort((a, b) => a.bundle.receipt.receipt_id < b.bundle.receipt.receipt_id ? -1 : 1);
  const sameContext = new Set(checked.map(v => v.report.scope.context_id)).size === 1;
  const sameUnit = new Set(checked.map(v => v.report.scope.unit)).size === 1;
  const sameAmount = new Set(checked.map(v => canonicalBytes(v.report.calculation.amount).toString())).size === 1;
  return { schema: 'useful-work.valuation-comparison/v1', relation: !sameContext ? 'different-evidence-contexts' : !sameUnit ? 'different-local-units' : sameAmount ? 'same-local-amounts' : 'different-local-amounts',
    observations: checked.map(v => ({ receipt_id: v.bundle.receipt.receipt_id, world_id: v.bundle.receipt.world_id, evaluator_key: signerKey(v.bundle.receipt),
      context_id: v.report.scope.context_id, result_id: v.report.scope.result_id, policy_id: v.report.scope.policy_id, policy_version: v.report.scope.policy_version,
      unit: v.report.scope.unit, amount: v.report.calculation.amount })), semantic_effect: 'none', winner_selected: false, universal_value_asserted: false,
    replacement_scope: 'a world may replace its own interpretation; no receipt invalidates another opinion', laws: [...VALUATION_LAWS] };
}
