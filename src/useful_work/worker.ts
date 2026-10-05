import { performance } from 'node:perf_hooks';
import { sha256Hex } from '../canonical.ts';
import type { OpaqueOrganSpec } from '../organ.ts';
import { canonicalBytes, hashValue, parseJob } from './job.ts';
import { renderCounts } from './algorithm.ts';
import { renderPpm } from './artifact.ts';
import type { MathematicalResult } from './artifact.ts';

export { FAMILY, CONTRACT, ROLES } from './contract.ts';
export type { WorkManifest } from './contract.ts';
import { FAMILY, CONTRACT, ROLES } from './contract.ts';
import type { WorkManifest } from './contract.ts';
export function executeJob(value: unknown) {
  const job = parseJob(value);
  const jobSpecHash = hashValue(job);
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const result: MathematicalResult = {
    schema: 'useful-work.result/v1', job_spec_hash: jobSpecHash,
    width: job.width, height: job.height, escape_counts: renderCounts(job),
  };
  const metadata = {
    schema: 'useful-work.execution/v1', algorithm: job.algorithm,
    started_at: startedAt, finished_at: new Date().toISOString(),
    elapsed_ms: Math.max(0, Math.round(performance.now() - start)),
    runtime: process.version, samples: job.width * job.height,
    orbit_steps: result.escape_counts.reduce((a, b) => a + b, 0),
    authority: 'worker-reported; not independently attested',
  };
  const artifacts = {
    'job-spec': canonicalBytes(job), 'canonical-result': canonicalBytes(result),
    presentation: renderPpm(result, job.iterations), 'execution-metadata': canonicalBytes(metadata),
  };
  const manifest: WorkManifest = {
    schema: 'useful-work.manifest/v1', job_spec_hash: jobSpecHash,
    result_hash: sha256Hex(artifacts['canonical-result']),
    presentation_hash: sha256Hex(artifacts.presentation),
    metadata_hash: sha256Hex(artifacts['execution-metadata']),
  };
  return { job, result, metadata, artifacts, manifest };
}

export function organSpec(manifest: WorkManifest, createdAt: string): OpaqueOrganSpec {
  const hashes = [manifest.job_spec_hash, manifest.result_hash, manifest.presentation_hash, manifest.metadata_hash];
  return {
    schema: 'relatte.opaque-organ-spec/v0', family_ref: FAMILY, donor_contract_ref: CONTRACT,
    artifact_kind: 'deterministic-mathematical-render', source_world: 'world:useful-work-worker',
    source_particular: `particular:useful-work:${manifest.job_spec_hash}`, source_history_head: null,
    payload_refs: ROLES.map((role, i) => ({
      address: `sha256:${hashes[i]}`, role,
      media_type: role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json',
    })),
    donor_claims: { useful_work: manifest, ownership_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' },
    return_address: null, created_at: createdAt,
  };
}
