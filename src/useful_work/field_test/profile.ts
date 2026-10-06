import { rational } from '../valuation/rational.ts';
import type { ValuationPolicy } from '../valuation/types.ts';
import type { RenderJob } from '../job.ts';
import { policyId } from '../valuation/policy.ts';
import type { OfferTerms } from '../settlement/exchange.ts';
import type { Wire } from '../settlement/wire.ts';
export const WORLD_KEYS = { A: ['primary'], B: ['primary', 'planner', 'challenger', 'observer', 'math'],
  C: ['primary', 'math', 'randomness'], D: ['primary', 'fault'], adapter: ['primary'] } as const;
export type WorldRole = keyof typeof WORLD_KEYS;
export const worldId = (role: WorldRole) => `world:field-001:${role}`;
export const roleIdentity = (role: WorldRole, name: string) => name === 'primary' ? worldId(role) : `${worldId(role)}:${name}`;
export function valuationPolicy(role: 'B' | 'D', job: RenderJob): ValuationPolicy {
  return { schema: 'useful-work.valuation-policy/v1', algorithm: 'rational-linear-discount/v1', policy_name: `field-001-${role}-local-opinion`,
    policy_version: 1, unit: 'field-credit', allow_self_reported_resources: false,
    terms: [{ metric: 'result_entries', weight: rational(role === 'B' ? 12 : 5, job.width * job.height), cap: null, missing: 'reject' }],
    uncertainty_discounts: [{ metric: 'contradictory_observed_fraction', rate: rational(0), missing: 'reject' }] };
}
export function offerTerms(packet: Wire, actors: Wire, cutoff: string): OfferTerms {
  const header = packet.native.work.extensions.organ_adapter.donor_claims.result_header;
  return { description: 'B offers 12 local field credits for the specified bounded evidence, retaining disagreements and missed service.',
    transfer: { kind: 'credit-ledger', system_ref: 'external:field-python-ledger', asset_ref: 'asset:local-field-credit', unit: 'field-credit',
      amount: rational(12), from_ref: 'field-account:B', to_ref: 'field-account:A' },
    policy: { schema: 'useful-work.acceptance-policy/v1', algorithm: 'typed-evidence-all/v1', name: 'field-B-explicit-bounded-cooperation', clauses: [
      { kind: 'audit', verifiers: [actors.B.keys.math, actors.C.keys.math], minimum_matching_entries: 6, reject_contradictions: false },
      { kind: 'audit-history', observer: actors.B.keys.observer, minimum_completed_slots: 2 },
      { kind: 'service', observer: actors.B.keys.observer, host: actors.A.keys.primary, minimum_in_window_verified_slots: 1 },
      ...(['cpu_time_observed', 'logical_file_bytes_observed', 'interface_rx_bytes_observed'] as const).map(metric => ({
        kind: 'resource' as const, collector: actors.A.keys.primary, replayer: actors.C.keys.primary, metric, minimum: rational(metric === 'logical_file_bytes_observed' ? 1 : 0),
        maximum: null, allowed_capture_modes: ['live-local/v1'], allowed_reading_origins: [] })),
      { kind: 'valuation', evaluator: actors.B.keys.primary, policy_id: policyId(valuationPolicy('B', packet.job_spec)), unit: 'field-credit', minimum_amount: rational(12) }] },
    present_before: cutoff, eligible_presenter: actors.A.keys.primary,
    target: { result_id: packet.native.work.extensions.organ_adapter.donor_claims.useful_work_native.result_id, work_crossing_id: packet.native.work.crossing_id, job_spec_hash: header.job_spec_hash },
    settlement_adapter: { identity: actors.adapter.keys.primary, allowed_record_origins: ['operator-import/v1'] } };
}
