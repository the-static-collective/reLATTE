import { canonicalize, canonicalizeDomainValue, sha256Hex } from '../canonical.ts';
import { verifyReceipt } from '../protocol.ts';
import { record } from './job.ts';
import type { VerificationResult } from './verification_types.ts';

/** Domain evidence comparison. Signature verification does not adjudicate either computation. */
export async function compareWorkReceipts(values: unknown[]) {
  if (values.length < 2) throw new Error('COMPARISON_REQUIRES_TWO_RECEIPTS');
  const receipts: Record<string, any>[] = [];
  const observations: { world_id: string; receipt_id: string; conclusion: 'matched' | 'mismatched' | 'not-checked'; recomputed_result_hash: string | null }[] = [];
  const worlds = new Set<string>();
  const signers = new Set<string>();
  let subject: { crossing_id: string; job_spec_hash: string; result_hash: string } | undefined;
  for (const value of values) {
    if (!(await verifyReceipt(value))) throw new Error('INVALID_COMPARISON_RECEIPT');
    const receipt = record(value, 'INVALID_COMPARISON_RECEIPT');
    const report = record(receipt.extensions?.useful_work, 'MISSING_VERIFICATION_SCOPE') as VerificationResult;
    const manifest = report.manifest;
    const claims = record(report.claims, 'INVALID_VERIFICATION_SCOPE');
    if (['artifact_received', 'artifact_structurally_valid', 'artifact_hash_matches', 'computation_independently_verified']
      .some(key => typeof claims[key] !== 'boolean')) throw new Error('INVALID_VERIFICATION_SCOPE');
    if (receipt.semantic_effect !== 'none' || !['VERIFIED', 'FAILED'].includes(receipt.kind) || report.schema !== 'useful-work.verification/v1' ||
      report.crossing_id !== receipt.crossing_id || !manifest ||
      manifest.schema !== 'useful-work.manifest/v1' ||
      !/^[a-f0-9]{64}$/.test(manifest.job_spec_hash) || !/^[a-f0-9]{64}$/.test(manifest.result_hash) ||
      !Array.isArray(report.errors) || report.errors.some(error => typeof error !== 'string') ||
      !['hash-only', 'recompute'].includes(report.mode)) throw new Error('INVALID_VERIFICATION_SCOPE');
    const current = { crossing_id: receipt.crossing_id as string, job_spec_hash: manifest.job_spec_hash, result_hash: manifest.result_hash };
    if (subject && canonicalize(subject) !== canonicalize(current)) throw new Error('INCOMPARABLE_SUBJECTS');
    subject = current;
    const signer = canonicalize(receipt.signing.public_key);
    if (worlds.has(receipt.world_id) || signers.has(signer)) throw new Error('COMPARISON_REQUIRES_DISTINCT_WORLDS_AND_KEYS');
    worlds.add(receipt.world_id); signers.add(signer);
    let conclusion: 'matched' | 'mismatched' | 'not-checked' = 'not-checked';
    const evidence = report.computation;
    if (evidence) {
      const implementation = report.implementation;
      if (!implementation || typeof implementation.id !== 'string' || !implementation.id ||
        typeof implementation.runtime !== 'string' || !implementation.runtime ||
        typeof implementation.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(implementation.source_sha256)) throw new Error('MISSING_IMPLEMENTATION_SCOPE');
      if (report.mode !== 'recompute' || evidence.job_spec_hash !== manifest.job_spec_hash ||
        evidence.artifact_result_hash !== manifest.result_hash ||
        report.observed_hashes['canonical-result'] !== manifest.result_hash ||
        report.observed_hashes['job-spec'] !== manifest.job_spec_hash ||
        !/^[a-f0-9]{64}$/.test(evidence.recomputed_result_hash) ||
        !report.claims.artifact_received || !report.claims.artifact_structurally_valid || !report.claims.artifact_hash_matches) throw new Error('INVALID_COMPUTATION_SCOPE');
      const matches = evidence.recomputed_result_hash === evidence.artifact_result_hash;
      const mismatch = evidence.first_mismatch;
      if (!matches && (!mismatch || !Number.isSafeInteger(mismatch.index) || mismatch.index < 0 ||
        !Number.isSafeInteger(mismatch.artifact_count) || !Number.isSafeInteger(mismatch.recomputed_count) ||
        mismatch.artifact_count < 0 || mismatch.recomputed_count < 0 || mismatch.artifact_count > 4096 ||
        mismatch.recomputed_count > 4096 || mismatch.artifact_count === mismatch.recomputed_count)) throw new Error('INVALID_MISMATCH_EVIDENCE');
      if (matches ? !report.claims.computation_independently_verified || report.errors.length !== 0 ||
        evidence.first_mismatch !== null || receipt.kind !== 'VERIFIED' :
        report.claims.computation_independently_verified || report.errors.length !== 1 ||
        report.errors[0] !== 'COMPUTATION_MISMATCH' || !evidence.first_mismatch || receipt.kind !== 'FAILED') throw new Error('INCONSISTENT_COMPUTATIONAL_CLAIM');
      conclusion = matches ? 'matched' : 'mismatched';
    } else if (report.claims.computation_independently_verified || report.errors.includes('COMPUTATION_MISMATCH')) {
      throw new Error('MISSING_COMPUTATION_EVIDENCE');
    }
    observations.push({ world_id: receipt.world_id, receipt_id: receipt.receipt_id,
      conclusion, recomputed_result_hash: evidence?.recomputed_result_hash ?? null });
    receipts.push(structuredClone(receipt));
  }
  const attempted = observations.filter(o => o.conclusion !== 'not-checked');
  const hashes = new Set(attempted.map(o => o.recomputed_result_hash));
  const body = {
    schema: 'useful-work.receipt-comparison/v1', subject,
    relation: hashes.size > 1 ? 'contradictory' : attempted.length === observations.length ? 'compatible' : 'incomparable',
    semantic_effect: 'none',
    observations: observations.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id)),
    receipts: receipts.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id)),
    laws: ['RECEIPT ≠ TRUTH', 'COMPARISON ≠ ARBITRATION', 'DISAGREEMENT DOES NOT TRANSFER AUTHORITY'],
  };
  return { ...body, comparison_id: `useful-work-comparison-v1:${sha256Hex(canonicalizeDomainValue('UsefulWork-ReceiptComparison-v1|', body))}` };
}
