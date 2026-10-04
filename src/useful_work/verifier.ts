import { canonicalize, sha256Hex } from '../canonical.ts';
import { verifyOpaqueOrganCrossing } from '../organ.ts';
import { canonicalBytes, exactKeys, hashValue, parseJob, record } from './job.ts';
import { parseResult } from './artifact.ts';
import { renderCounts } from './algorithm.ts';
import { CONTRACT, FAMILY, ROLES } from './worker.ts';
import type { WorkManifest } from './worker.ts';

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
}
export type ArtifactSource = (address: string) => Promise<Uint8Array>;
export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

export function parseCanonicalJson(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { throw new Error('INVALID_JSON'); }
  if (!Buffer.from(bytes).equals(canonicalBytes(value))) throw new Error('NON_CANONICAL_JSON');
  return value;
}

/** Reads only signed references and supplied bytes; never consumes a worker verification claim. */
export async function verifyWork(
  crossing: unknown, source: ArtifactSource, mode: 'hash-only' | 'recompute' = 'recompute',
): Promise<VerificationResult> {
  const envelope = record(crossing, 'INVALID_CROSSING');
  // A receipt cannot attest against an unverified crossing identity.
  if (!(await verifyOpaqueOrganCrossing(envelope))) throw new Error('INVALID_OPAQUE_CROSSING');
  if (mode !== 'hash-only' && mode !== 'recompute') throw new Error('INVALID_VERIFICATION_MODE');
  const report: VerificationResult = {
    schema: 'useful-work.verification/v1', crossing_id: envelope.crossing_id,
    manifest: null, observed_hashes: {}, mode, errors: [],
    claims: { artifact_received: false, artifact_structurally_valid: false, artifact_hash_matches: false, computation_independently_verified: false },
  };
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
    const artifacts: Record<string, Uint8Array> = {};
    for (const [i, role] of ROLES.entries()) {
      const refs = envelope.payload_refs.filter((ref: any) => ref.role === role);
      if (refs.length !== 1 || refs[0].address !== `sha256:${hashes[i]}` ||
        refs[0].media_type !== (role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json')) throw new Error('PAYLOAD_MANIFEST_MISMATCH');
      exactKeys(refs[0], ['address', 'role', 'media_type'], 'INVALID_PAYLOAD_REF_FIELDS');
      const supplied = await source(refs[0].address);
      if (!(supplied instanceof Uint8Array) || supplied.byteLength > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_LIMIT');
      const bytes = Buffer.from(supplied);
      artifacts[role] = bytes;
      report.observed_hashes[role] = sha256Hex(bytes);
    }
    report.claims.artifact_received = true; // all four referenced artifacts, not just the envelope
    report.claims.artifact_hash_matches = ROLES.every((role, i) => report.observed_hashes[role] === hashes[i]);
    const job = parseJob(parseCanonicalJson(artifacts['job-spec']));
    const result = parseResult(parseCanonicalJson(artifacts['canonical-result']), job);
    const metadata = record(parseCanonicalJson(artifacts['execution-metadata']), 'INVALID_METADATA');
    if (metadata.schema !== 'useful-work.execution/v1') throw new Error('UNSUPPORTED_METADATA_SCHEMA');
    const ppm = Buffer.from(artifacts.presentation);
    const header = Buffer.from(`P6\n${job.width} ${job.height}\n255\n`);
    if (!ppm.subarray(0, header.length).equals(header) || ppm.length !== header.length + job.width * job.height * 3) throw new Error('INVALID_PRESENTATION');
    report.claims.artifact_structurally_valid = true;
    if (!report.claims.artifact_hash_matches) throw new Error('ARTIFACT_HASH_MISMATCH');
    if (hashValue(job) !== manifest.job_spec_hash || result.job_spec_hash !== manifest.job_spec_hash) throw new Error('RESULT_JOB_MISMATCH');
    if (mode === 'recompute') {
      const recomputed = { ...result, escape_counts: renderCounts(job) };
      if (canonicalize(recomputed) !== canonicalize(result)) throw new Error('COMPUTATION_MISMATCH');
      report.claims.computation_independently_verified = true;
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : 'VERIFICATION_FAILED');
  }
  return report;
}
