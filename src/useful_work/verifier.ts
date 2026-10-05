import { readFile } from 'node:fs/promises';
import { sha256Hex } from '../canonical.ts';
import { canonicalBytes } from './job.ts';
import { renderCounts } from './algorithm.ts';
import { inspectWork } from './inspection.ts';
import type { ArtifactSource, VerificationResult } from './verification_types.ts';

export { MAX_ARTIFACT_BYTES, parseCanonicalJson } from './inspection.ts';
export type { ArtifactSource, VerificationResult } from './verification_types.ts';

/** TypeScript reference verifier. Its maths intentionally shares the Kernel 001 worker. */
export async function verifyWork(
  crossing: unknown, source: ArtifactSource, mode: 'hash-only' | 'recompute' = 'recompute',
): Promise<VerificationResult> {
  const { report, job, result } = await inspectWork(crossing, source, mode);
  const algorithmFile = new URL(import.meta.url.endsWith('.js') ? './algorithm.js' : './algorithm.ts', import.meta.url);
  report.implementation = {
    id: 'useful-work/typescript-q24/v1', runtime: `Node ${process.version}`,
    source_sha256: sha256Hex(await readFile(algorithmFile)),
  };
  if (mode === 'recompute' && !report.errors.length && job && result) {
    const recomputed = { ...result, escape_counts: renderCounts(job) };
    const index = result.escape_counts.findIndex((n, i) => n !== recomputed.escape_counts[i]);
    const expectedHash = sha256Hex(canonicalBytes(recomputed));
    report.computation = {
      job_spec_hash: result.job_spec_hash, artifact_result_hash: report.observed_hashes['canonical-result'],
      recomputed_result_hash: expectedHash,
      first_mismatch: index < 0 ? null : {
        index, artifact_count: result.escape_counts[index], recomputed_count: recomputed.escape_counts[index],
      },
    };
    if (expectedHash === report.computation.artifact_result_hash) report.claims.computation_independently_verified = true;
    else report.errors.push('COMPUTATION_MISMATCH');
  }
  return report;
}
