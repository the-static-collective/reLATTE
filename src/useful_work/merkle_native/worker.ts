import { performance } from 'node:perf_hooks';
import { sha256Hex } from '../../canonical.ts';
import type { OpaqueOrganSpec } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, hashValue, parseJob } from '../job.ts';
import { renderCounts, sampleOrbit } from '../algorithm.ts';
import { renderPpm } from '../artifact.ts';
import type { ExecutionMetadata } from '../artifact.ts';
import { buildResult, inspectArtifact } from './result.ts';
import type { ResultHeader } from './result.ts';
import { FAMILY, CONTRACT, ROLES } from './contract.ts';
import type { NativeManifest } from './contract.ts';
import { inspectChallenge, inspectNativeWork, sealNativeMessage } from './exchange.ts';
import type { NativeContext, NativeResponse } from './exchange.ts';

export function executeNativeJob(value: unknown) {
  const job = parseJob(value), start = performance.now(), started = new Date().toISOString();
  const tree = buildResult(job, renderCounts(job));
  const metadata: ExecutionMetadata = {
    schema: 'useful-work.execution/v1', algorithm: job.algorithm, started_at: started,
    finished_at: new Date().toISOString(), elapsed_ms: Math.max(0, Math.round(performance.now() - start)),
    runtime: process.version, samples: job.width * job.height,
    orbit_steps: tree.artifact.escape_counts.reduce((a, b) => a + b, 0), authority: 'worker-reported; not independently attested',
  };
  const artifacts = { 'job-spec': canonicalBytes(job), 'merkle-result': tree.bytes,
    presentation: renderPpm({ schema: 'useful-work.result/v1', job_spec_hash: hashValue(job), width: job.width,
      height: job.height, escape_counts: tree.artifact.escape_counts }, job.iterations), 'execution-metadata': canonicalBytes(metadata) };
  const manifest: NativeManifest = { schema: 'useful-work.merkle-manifest/v1', job_spec_hash: hashValue(job),
    result_id: tree.result_id, presentation_hash: sha256Hex(artifacts.presentation), metadata_hash: sha256Hex(artifacts['execution-metadata']) };
  return { job, tree, metadata, artifacts, manifest };
}
export function nativeOrganSpec(manifest: NativeManifest, header: ResultHeader, createdAt: string): OpaqueOrganSpec {
  const addresses = [`sha256:${manifest.job_spec_hash}`, manifest.result_id, `sha256:${manifest.presentation_hash}`, `sha256:${manifest.metadata_hash}`];
  return { schema: 'relatte.opaque-organ-spec/v0', family_ref: FAMILY, donor_contract_ref: CONTRACT,
    artifact_kind: 'merkle-native-mathematical-render', source_world: 'world:useful-work-native-worker',
    source_particular: `particular:useful-work:${manifest.result_id}`, source_history_head: null,
    payload_refs: ROLES.map((role, i) => ({ address: addresses[i], role, media_type: role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json' })),
    donor_claims: { useful_work_native: structuredClone(manifest), result_header: structuredClone(header), ownership_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: createdAt };
}
export async function answerNativeChallenge(context: NativeContext, challengeValue: unknown, artifactBytes: Buffer, keys: P256KeyMaterial, createdAt: string) {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  if (!canonicalBytes(keys.publicKeyJwk).equals(canonicalBytes(context.crossing.signing.public_key))) throw new Error('WORKER_KEY_MISMATCH');
  const challenge = await inspectChallenge(context, challengeValue);
  const tree = inspectArtifact(artifactBytes, context.job, context.result_id);
  const response: NativeResponse = { schema: 'useful-work.merkle-response/v1', work_crossing_id: context.crossing.crossing_id,
    challenge_id: challenge.crossing.crossing_id, result_id: context.result_id,
    samples: challenge.indices.map(index => ({ ...sampleOrbit(context.job, index), x: index % context.job.width,
      y: Math.floor(index / context.job.width), committed_count: tree.artifact.escape_counts[index], proof: tree.proof(index) })) };
  return sealNativeMessage('response', response, keys, createdAt, context.crossing.source_world);
}
