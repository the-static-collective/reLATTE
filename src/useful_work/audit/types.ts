import type { ResultHeader } from '../merkle_native/result.ts';
import type { RenderJob } from '../job.ts';
import type { VerifierImplementation } from '../verification_types.ts';
import type { NativeReport } from '../merkle_native/verifier.ts';
import type { RandomnessModel } from './model.ts';

export interface AuditSubmission {
  work: Record<string, any>;
  challenge: Record<string, any>;
  response: Record<string, any>;
  receipt: Record<string, any>;
}
export interface VerifiedSubmission extends AuditSubmission {
  report: NativeReport;
  indices: number[];
  proof_verified: boolean;
  nonce: string;
  challenger_key: string;
  verifier_key: string;
}
export interface Prediction { count: number; final_real_q: string; final_imag_q: string }
export interface PixelObservations {
  index: number; x: number; y: number;
  challenge_ids: string[];
  proof_bound_challenge_ids: string[];
  observed_challenge_ids: string[];
  observation_receipt_ids: string[];
  observation_count: number;
  committed_count: number | null;
  verifier_predictions: { prediction: Prediction; receipt_ids: string[] }[];
  worker_evidence: { prediction: Prediction; receipt_ids: string[] }[];
  matching_receipt_ids: string[];
  nonmatching_receipt_ids: string[];
  worker_mismatch_receipt_ids: string[];
}
export interface ReceiptObservation {
  receipt_id: string; challenge_id: string; response_id: string; world_id: string; receiver_particular: string;
  verifier_key: string; implementation: VerifierImplementation | null; checked_count: number;
  submitted_count: number; kind: string; errors: string[];
  signed_timestamp_claims: { challenge_created_at: string; response_created_at: string; receipt_created_at: string };
}
export interface AuditChallenge {
  challenge_id: string; work_crossing_id: string; nonce: string; challenger_world: string; challenger_particular: string;
  challenger_key: string; indices: number[]; response_ids: string[]; receipt_ids: string[];
  submitted_count: number; duplicate_receipt_submissions: number; same_verifier_rechecks: number;
  nonce_reused_across_distinct_ids: boolean; has_complete_observations: boolean;
}
export interface AuditSummary {
  result_id: string; result_header: ResultHeader;
  submission_count: number; unique_receipt_count: number; replayed_receipt_submissions: number;
  unique_challenge_count: number; multiply_observed_challenge_ids: string[]; same_verifier_rechecked_challenge_ids: string[];
  requested_indices: number[]; proof_bound_indices: number[]; observed_indices: number[];
  coverage: { population: number; requested_count: number; proof_bound_count: number; observed_count: number;
    observed_fraction: { numerator: number; denominator: number }; all_indices_observed: boolean };
  overlap: { unique_challenge_sample_slots: number; repeated_slots: number;
    indices_shared_by_challenges: number[]; challenge_multiplicity_histogram: { distinct_challenges: number; index_count: number }[] };
  challenges: AuditChallenge[]; receipts: ReceiptObservation[]; per_index: PixelObservations[];
  contradictions: { index: number; x: number; y: number; verifier_disagreement: boolean; worker_evidence_conflict: boolean;
    count_mismatch_receipt_ids: string[]; worker_count_mismatch_receipt_ids: string[]; worker_mismatch_receipt_ids: string[] }[];
  diversity: { challenger_worlds: string[]; challenger_keys: string[]; verifier_worlds: string[]; verifier_keys: string[];
    worker_worlds: string[]; worker_keys: string[];
    implementations: { id: string; source_sha256: string; runtimes: string[]; receipt_ids: string[] }[] };
  reused_nonces: { nonce: string; challenge_ids: string[] }[];
  progress: { submission_index: number; challenge_id: string; receipt_id: string; receipt_replayed: boolean;
    challenge_seen_before: boolean; unique_challenges_so_far: number; observed_indices_so_far: number; newly_observed_indices: number[] }[];
  conditional_model: null | { model: RandomnessModel; assumptions: string[]; assumptions_verified: false; eligible_challenge_ids: string[];
    excluded_challenges: { challenge_id: string; reasons: string[] }[]; sample_sizes: number[];
    ex_ante_probability_no_sample_hits_fixed_bad_entry_set: { exact_zero: boolean; scientific_notation: string; log_probability: number | null; numeric_approximation: number | null };
    interpretation: 'conditional sampling-design probability; not artifact correctness, confidence, or consensus' };
  claims: { underlying_signatures_verified: true; exchange_scope_and_positive_proof_claims_verified: true;
    mathematics_recomputed_by_accumulator: false; full_artifact_available: false; full_computation_verified: false;
    authority_asserted: false; consensus_asserted: false; economic_value_asserted: false; compute_time_inferred: false };
  laws: string[];
}
export interface AuditObject {
  schema: 'useful-work.audit/v1';
  audit_id: string;
  result_id: string;
  job_spec: RenderJob;
  submissions: AuditSubmission[];
  model: RandomnessModel | null;
  summary: AuditSummary;
}
