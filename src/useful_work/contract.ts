/** Wire constants; no worker execution code belongs in this module. */
export const FAMILY = 'organ:useful-work/kernel-001';
export const CONTRACT = 'contract:useful-work/julia-q24-v1';
export const ROLES = ['job-spec', 'canonical-result', 'presentation', 'execution-metadata'] as const;
export interface WorkManifest {
  schema: 'useful-work.manifest/v1';
  job_spec_hash: string;
  result_hash: string;
  presentation_hash: string;
  metadata_hash: string;
}
