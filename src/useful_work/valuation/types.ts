import type { RenderJob } from '../job.ts';
import type { AuditObject } from '../audit/types.ts';
import type { AuditHistory } from '../audit_clock/types.ts';
import type { Rational } from './rational.ts';

export type Wire = Record<string, any>;
export const RESOURCE_FIELDS = ['cpu_ms', 'energy_millijoules', 'stored_bytes', 'served_bytes', 'mirrored_bytes'] as const;
export type ResourceField = typeof RESOURCE_FIELDS[number];
export const RESOURCE_METRICS = ['max_claimed_cpu_ms', 'max_claimed_energy_millijoules', 'max_claimed_stored_bytes', 'max_claimed_served_bytes', 'max_claimed_mirrored_bytes'] as const;
export const METRICS = ['result_entries', 'declared_iteration_budget', 'observed_sample_entries', 'matching_sample_entries', 'observed_sample_coverage',
  'observed_challenge_ids', 'mathematical_verifier_keys', 'mathematical_implementation_fingerprints', 'contradictory_sample_entries', 'contradictory_observed_fraction',
  'issued_scheduled_slots', 'completed_sample_observation_slots', 'observed_timely_answered_slot_fraction', 'incomplete_schedule_fraction',
  'artifact_present_at_evaluation', 'artifact_bytes_present', 'full_computation_verified_result', 'proven_cpu_ms', ...RESOURCE_METRICS] as const;
export type MetricName = typeof METRICS[number];
export const UNCERTAINTY_METRICS = ['contradictory_observed_fraction', 'incomplete_schedule_fraction'] as const;
export interface ResourceClaim {
  schema: 'useful-work.resource-claim/v1'; result_id: string; audit_id: string | null; history_id: string | null;
  basis: 'self-reported/v1'; amounts: Record<ResourceField, number | null>; claimed_at: string; note: string | null;
}
export interface ValuationInput {
  result_id: string; job_spec: RenderJob; work: Wire; audit: AuditObject | null; history: AuditHistory | null;
  resource_claims: Wire[]; canonical_artifact: string | null;
}
export interface ValuationContext extends ValuationInput { schema: 'useful-work.valuation-context/v1'; context_id: string }
export interface ValuationPolicy {
  schema: 'useful-work.valuation-policy/v1'; algorithm: 'rational-linear-discount/v1'; policy_name: string; policy_version: number; unit: string;
  allow_self_reported_resources: boolean;
  terms: { metric: MetricName; weight: Rational; cap: Rational | null; missing: 'zero' | 'reject' }[];
  uncertainty_discounts: { metric: typeof UNCERTAINTY_METRICS[number]; rate: Rational; missing: 'max-discount' | 'no-discount' | 'reject' }[];
}
export interface Metric { metric: MetricName; value: Rational | null; basis: string; source_ids: string[] }
export interface ResourceObservations {
  submitted_claim_count: number; unique_claim_count: number; replayed_claim_submissions: number;
  conflicting_amounts: { field: ResourceField; values: { amount: number; claim_ids: string[] }[] }[];
}
export interface ValuationCalculation {
  terms: { metric: MetricName; observed_value: Rational | null; effective_value: Rational; missing_applied: boolean; cap: Rational | null;
    weight: Rational; contribution: Rational }[];
  subtotal: Rational; nonnegative_subtotal: Rational;
  uncertainty_discounts: { metric: typeof UNCERTAINTY_METRICS[number]; observed_value: Rational | null; effective_uncertainty: Rational;
    missing_applied: boolean; rate: Rational; factor: Rational }[];
  combined_discount_factor: Rational; amount: Rational;
}
export interface ValuationReport {
  schema: 'useful-work.local-valuation/v1';
  scope: { context_id: string; result_id: string; job_spec_hash: string; work_crossing_id: string; audit_id: string | null; history_id: string | null;
    resource_claim_ids: string[]; policy_id: string; policy_name: string; policy_version: number; unit: string };
  metrics: Metric[]; resource_observations: ResourceObservations; calculation: ValuationCalculation;
  claims: { local_opinion: true; policy_calculation_reproducible: true; evidence_signatures_and_bindings_verified: true;
    artifact_structure_checked: boolean; full_computation_verified: false; resource_claim_signatures_verified: true; resource_measurements_proven: false;
    independent_verifier_execution_proven: false; objective_time_verified: false; observed_history_complete: false;
    global_price_asserted: false; payment_performed: false; ownership_transferred: false; economic_entitlement_asserted: false;
    authority_asserted: false; consensus_asserted: false; uncertainty_is_fraud: false };
  interpretation: string; laws: string[];
}
export interface ValuationBundle { schema: 'useful-work.valuation/v1'; context: ValuationContext; policy: ValuationPolicy; crossing: Wire; receipt: Wire }
