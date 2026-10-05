import type { RenderJob } from '../job.ts';
import type { AuditSummary } from '../audit/types.ts';
import type { Wire } from './wire.ts';

export interface AuditPolicy {
  schema: 'useful-work.audit-plan/v1'; result_id: string; work_crossing_id: string; job_spec_hash: string;
  declared_at: string; sample_count: number; expires_at: string;
  schedule: { starts_at: string; cadence_ms: number; rounds: number; issue_window_ms: number; response_window_ms: number };
  randomness_rule: { schema: 'signed-external-event/v1'; source_world: string; public_key: JsonWebKey; stream_id: string; first_sequence: number };
  challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1';
  challenger: { world_id: string; public_key: JsonWebKey };
  observer: { world_id: string; public_key: JsonWebKey };
}
export interface PlanContext { plan: Wire; policy: AuditPolicy; plan_id: string }
export interface ScheduledSlot { index: number; slot_id: string; scheduled_at: string; issue_deadline: string; response_deadline: string; expected_randomness_sequence: number }
export interface RandomnessEvent { schema: 'useful-work.randomness-event/v1'; stream_id: string; sequence: number; value_hex: string; emitted_at: string }
export type ObservationKind = 'PLAN_PUBLISHED' | 'ISSUE_SEEN' | 'RESPONSE_SEEN' | 'MISS_REPORTED' | 'UNAVAILABLE_REPORTED';
export interface ClockObservation {
  schema: 'useful-work.audit-clock-observation/v1'; plan_id: string; plan_crossing_id: string; slot_index: number | null;
  kind: ObservationKind; subject_id: string | null; observed_at: string; note: string | null;
}
export interface ScheduledIssue { issuance: Wire; challenge: Wire }
export interface HistoryInput {
  job_spec: RenderJob; work: Wire; plan: Wire; publication: Wire | null;
  events: Wire[]; issues: ScheduledIssue[]; responses: Wire[]; receipts: Wire[]; observations: Wire[]; prior_cuts: Wire[]; cut: Wire;
}
export interface SlotHistory extends ScheduledSlot {
  status: 'PLANNED' | 'ISSUED' | 'ANSWERED' | 'MISSED' | 'EXPIRED' | 'WITHHELD / UNKNOWN';
  status_basis: string; event_ids: string[]; issuance_ids: string[]; challenge_ids: string[]; response_ids: string[]; receipt_ids: string[];
  observation_ids: string[]; randomness_equivocation: boolean; has_mathematical_observation: boolean;
  response_window_observations: { response_id: string; observation_id: string; observed_at: string; within_window: boolean }[];
  issue_window_observations: { issuance_id: string; observation_id: string; observed_at: string; within_window: boolean }[];
  conflicting_absence_reports: string[];
}
export interface HistorySummary {
  plan_id: string; result_id: string; as_of_observer_claim: string; publication_observed: boolean;
  slots: SlotHistory[]; status_counts: Record<SlotHistory['status'], number>;
  schedule_accounting: { planned_slots: number; issued_slots: number; answered_slots: number; completed_observation_slots: number;
    slots_without_observed_issuance: number; issued_slots_without_observed_response: number; slots_without_complete_mathematical_observation: number;
    unique_challenges: number; schedule_denominator_known: true };
  replays: { events: number; issues: number; responses: number; receipts: number; observations: number };
  observer_cuts: { cut_id: string; observed_at: string; inventory_counts: Record<string, number> }[];
  randomness_reused_values: { value_hex: string; event_ids: string[]; slot_indices: number[] }[];
  evidence_accumulator: { audit_id: string; summary: AuditSummary } | null;
  claims: { signatures_and_policy_bindings_verified: true; signed_observer_inventory_verified: true; publication_order_is_attributed: true;
    observed_history_complete: false; objective_time_verified: false; randomness_unpredictability_verified: false; mathematics_recomputed: false;
    nonresponse_proves_computation_failure: false; guilt_asserted: false; authority_asserted: false; consensus_asserted: false;
    economic_value_asserted: false; compute_time_inferred: false };
  laws: string[];
}
export interface AuditHistory extends HistoryInput { schema: 'useful-work.audit-clock-history/v1'; history_id: string; summary: HistorySummary }
