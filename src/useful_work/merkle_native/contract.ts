export const FAMILY = 'organ:useful-work/kernel-004';
export const CONTRACT = 'contract:useful-work/julia-q24-merkle-v1';
export const CHALLENGE_CONTRACT = 'contract:useful-work/merkle-challenge-v1';
export const ROLES = ['job-spec', 'merkle-result', 'presentation', 'execution-metadata'] as const;
export interface NativeManifest {
  schema: 'useful-work.merkle-manifest/v1';
  job_spec_hash: string;
  result_id: string;
  presentation_hash: string;
  metadata_hash: string;
}
