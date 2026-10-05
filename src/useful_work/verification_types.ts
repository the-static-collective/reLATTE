import type { WorkManifest } from './contract.ts';

export interface VerifierImplementation { id: string; runtime: string; source_sha256: string }
export interface ComputationEvidence {
  job_spec_hash: string;
  artifact_result_hash: string;
  recomputed_result_hash: string;
  first_mismatch: { index: number; artifact_count: number; recomputed_count: number } | null;
}
export interface VerificationResult {
  schema: 'useful-work.verification/v1';
  crossing_id: string;
  manifest: WorkManifest | null;
  observed_hashes: Record<string, string>;
  claims: {
    artifact_received: boolean;
    artifact_structurally_valid: boolean;
    artifact_hash_matches: boolean;
    computation_independently_verified: boolean;
  };
  mode: 'hash-only' | 'recompute';
  errors: string[];
  implementation?: VerifierImplementation;
  computation?: ComputationEvidence;
}
export type ArtifactSource = (address: string) => Promise<Uint8Array>;
