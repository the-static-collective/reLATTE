import { sha256Hex } from '../canonical.ts';
import { verifyOpaqueOrganCrossing } from '../organ.ts';
import { canonicalBytes, exactKeys, hashValue, parseJob, record } from './job.ts';
import type { RenderJob } from './job.ts';
import { parseResult } from './artifact.ts';
import type { MathematicalResult } from './artifact.ts';
import { CONTRACT, FAMILY, ROLES } from './contract.ts';
import type { WorkManifest } from './contract.ts';
import type { ArtifactSource, VerificationResult } from './verification_types.ts';

export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
export function parseCanonicalJson(bytes: Uint8Array): unknown {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('INVALID_JSON'); }
  if (!Buffer.from(bytes).equals(canonicalBytes(value))) throw new Error('NON_CANONICAL_JSON');
  return value;
}

/** Shared authenticated byte/structure boundary; contains no orbit calculation. */
export async function inspectWork(crossing: unknown, source: ArtifactSource, mode: 'hash-only' | 'recompute') {
  const envelope = record(crossing, 'INVALID_CROSSING');
  if (!(await verifyOpaqueOrganCrossing(envelope))) throw new Error('INVALID_OPAQUE_CROSSING');
  if (mode !== 'hash-only' && mode !== 'recompute') throw new Error('INVALID_VERIFICATION_MODE');
  const report: VerificationResult = {
    schema: 'useful-work.verification/v1', crossing_id: envelope.crossing_id,
    manifest: null, observed_hashes: {}, mode, errors: [],
    claims: { artifact_received: false, artifact_structurally_valid: false, artifact_hash_matches: false, computation_independently_verified: false },
  };
  const artifacts: Record<string, Buffer> = {};
  let job: RenderJob | null = null;
  let result: MathematicalResult | null = null;
  try {
    const adapter = envelope.extensions.organ_adapter;
    if (adapter.family_ref !== FAMILY || adapter.donor_contract_ref !== CONTRACT) throw new Error('UNSUPPORTED_WORK_FAMILY');
    const manifest = record(adapter.donor_claims.useful_work, 'INVALID_MANIFEST');
    exactKeys(manifest, ['schema', 'job_spec_hash', 'result_hash', 'presentation_hash', 'metadata_hash'], 'INVALID_MANIFEST_FIELDS');
    if (manifest.schema !== 'useful-work.manifest/v1') throw new Error('UNSUPPORTED_MANIFEST_SCHEMA');
    const hashes = [manifest.job_spec_hash, manifest.result_hash, manifest.presentation_hash, manifest.metadata_hash];
    for (const hash of hashes) if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_MANIFEST_HASH');
    report.manifest = structuredClone(manifest) as WorkManifest;
    if (!Array.isArray(envelope.payload_refs) || envelope.payload_refs.length !== ROLES.length) throw new Error('INVALID_PAYLOAD_REFS');
    for (const [i, role] of ROLES.entries()) {
      const refs = envelope.payload_refs.filter((ref: any) => ref.role === role);
      if (refs.length !== 1 || refs[0].address !== `sha256:${hashes[i]}` ||
        refs[0].media_type !== (role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json')) throw new Error('PAYLOAD_MANIFEST_MISMATCH');
      exactKeys(refs[0], ['address', 'role', 'media_type'], 'INVALID_PAYLOAD_REF_FIELDS');
      const supplied = await source(refs[0].address);
      if (!(supplied instanceof Uint8Array) || supplied.byteLength > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_LIMIT');
      artifacts[role] = Buffer.from(supplied);
      report.observed_hashes[role] = sha256Hex(artifacts[role]);
    }
    report.claims.artifact_received = true;
    report.claims.artifact_hash_matches = ROLES.every((role, i) => report.observed_hashes[role] === hashes[i]);
    job = parseJob(parseCanonicalJson(artifacts['job-spec']));
    result = parseResult(parseCanonicalJson(artifacts['canonical-result']), job);
    const metadata = record(parseCanonicalJson(artifacts['execution-metadata']), 'INVALID_METADATA');
    if (metadata.schema !== 'useful-work.execution/v1') throw new Error('UNSUPPORTED_METADATA_SCHEMA');
    const header = Buffer.from(`P6\n${job.width} ${job.height}\n255\n`);
    const ppm = artifacts.presentation;
    if (!ppm.subarray(0, header.length).equals(header) || ppm.length !== header.length + job.width * job.height * 3) throw new Error('INVALID_PRESENTATION');
    report.claims.artifact_structurally_valid = true;
    if (!report.claims.artifact_hash_matches) throw new Error('ARTIFACT_HASH_MISMATCH');
    if (hashValue(job) !== manifest.job_spec_hash || result.job_spec_hash !== manifest.job_spec_hash) throw new Error('RESULT_JOB_MISMATCH');
  } catch (error) { report.errors.push(error instanceof Error ? error.message : 'VERIFICATION_FAILED'); }
  return { report, artifacts, job, result };
}
