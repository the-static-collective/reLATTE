import { exactKeys, integer, record } from '../job.ts';
import { digest } from '../challenge/commitment.ts';
import { parseOrbitSample } from '../challenge/exchange.ts';
import type { AnswerSample, OrbitSample } from '../challenge/exchange.ts';
import type { VerifierImplementation } from '../verification_types.ts';
import { inspectNativeWork, inspectResponse } from './exchange.ts';
import type { NativeContext } from './exchange.ts';
import { verifyResultProof } from './result.ts';
import type { ResultHeader } from './result.ts';

export type NativeChecker = (context: NativeContext, samples: AnswerSample[]) => Promise<{
  samples: OrbitSample[]; implementation: VerifierImplementation;
}>;
export interface NativeReport {
  schema: 'useful-work.native-verification/v1';
  scope: { work_crossing_id: string; challenge_id: string; response_id: string; result_id: string;
    result_header: ResultHeader; indices: number[]; coordinates: { x: number; y: number }[] };
  claims: { challenge_authenticated: boolean; response_authenticated: boolean; job_spec_hash_matches: boolean;
    result_header_identity_verified: boolean; response_structurally_valid: boolean;
    sampled_entries_bound_to_result_identity: boolean; sampled_computation_verified: boolean;
    complete_artifact_received: false; full_artifact_structure_verified: false; full_computation_verified: false };
  checked_count: number;
  evidence: { index: number; committed_count: number; worker: OrbitSample; verifier: OrbitSample; matched: boolean }[];
  implementation: VerifierImplementation | null;
  errors: string[];
}
export async function verifyNativeChallenge(context: NativeContext, challengeValue: unknown, responseValue: unknown, checker: NativeChecker): Promise<NativeReport> {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  const { challenge, crossing, response } = await inspectResponse(context, challengeValue, responseValue);
  const report: NativeReport = {
    schema: 'useful-work.native-verification/v1', scope: { work_crossing_id: context.crossing.crossing_id,
      challenge_id: challenge.crossing.crossing_id, response_id: crossing.crossing_id, result_id: context.result_id,
      result_header: context.header, indices: challenge.indices,
      coordinates: challenge.indices.map(i => ({ x: i % context.job.width, y: Math.floor(i / context.job.width) })) },
    claims: { challenge_authenticated: true, response_authenticated: true, job_spec_hash_matches: true,
      result_header_identity_verified: true, response_structurally_valid: false, sampled_entries_bound_to_result_identity: false,
      sampled_computation_verified: false, complete_artifact_received: false, full_artifact_structure_verified: false, full_computation_verified: false },
    checked_count: 0, evidence: [], implementation: null, errors: [],
  };
  try {
    exactKeys(response, ['schema', 'work_crossing_id', 'challenge_id', 'result_id', 'samples'], 'INVALID_NATIVE_RESPONSE_FIELDS');
    if (response.schema !== 'useful-work.merkle-response/v1') throw new Error('UNSUPPORTED_NATIVE_RESPONSE');
    if (!Array.isArray(response.samples) || response.samples.length !== challenge.indices.length) throw new Error('SAMPLE_SET_MISMATCH');
    const samples: { raw: AnswerSample; orbit: OrbitSample }[] = response.samples.map((value: unknown, i: number) => {
      const s = record(value, 'INVALID_SAMPLE');
      exactKeys(s, ['index', 'x', 'y', 'committed_count', 'count', 'final_real_q', 'final_imag_q', 'proof'], 'INVALID_SAMPLE_FIELDS');
      const orbit = parseOrbitSample({ index: s.index, count: s.count, final_real_q: s.final_real_q, final_imag_q: s.final_imag_q }, context.job);
      if (s.index !== challenge.indices[i] || s.x !== s.index % context.job.width || s.y !== Math.floor(s.index / context.job.width)) throw new Error('SAMPLE_SET_MISMATCH');
      integer(s.committed_count, 0, context.job.iterations, 'INVALID_COMMITTED_COUNT');
      if (!Array.isArray(s.proof) || s.proof.length !== Math.ceil(Math.log2(context.job.width * context.job.height))) throw new Error('INVALID_PROOF_DEPTH');
      s.proof.forEach(digest);
      return { raw: s as AnswerSample, orbit };
    });
    report.claims.response_structurally_valid = true;
    if (samples.some(s => !verifyResultProof(context.header, context.result_id, s.orbit.index, s.raw.committed_count, s.raw.proof))) throw new Error('RESULT_PROOF_MISMATCH');
    report.claims.sampled_entries_bound_to_result_identity = true;
    const checked = await checker({ ...structuredClone(context), jobBytes: Buffer.from(context.jobBytes) }, samples.map(s => structuredClone(s.raw)));
    const implementation = record(checked.implementation, 'INVALID_CHECKER_IMPLEMENTATION');
    exactKeys(implementation, ['id', 'runtime', 'source_sha256'], 'INVALID_CHECKER_IMPLEMENTATION'); digest(implementation.source_sha256);
    if (typeof implementation.id !== 'string' || !implementation.id || typeof implementation.runtime !== 'string' || !implementation.runtime) throw new Error('INVALID_CHECKER_IMPLEMENTATION');
    report.implementation = checked.implementation;
    if (!Array.isArray(checked.samples) || checked.samples.length !== samples.length) throw new Error('CHECKER_SAMPLE_SET_MISMATCH');
    const expected = checked.samples.map((s, i) => {
      const orbit = parseOrbitSample(s, context.job);
      if (orbit.index !== challenge.indices[i]) throw new Error('CHECKER_SAMPLE_SET_MISMATCH');
      return orbit;
    });
    report.evidence = samples.map((s, i) => ({ index: s.orbit.index, committed_count: s.raw.committed_count, worker: s.orbit,
      verifier: expected[i], matched: s.raw.committed_count === expected[i].count && s.orbit.count === expected[i].count &&
        s.orbit.final_real_q === expected[i].final_real_q && s.orbit.final_imag_q === expected[i].final_imag_q }));
    report.checked_count = expected.length;
    report.claims.sampled_computation_verified = report.evidence.every(e => e.matched);
    if (!report.claims.sampled_computation_verified) report.errors.push('SAMPLED_COMPUTATION_MISMATCH');
  } catch (error) { report.errors.push(error instanceof Error ? error.message : 'NATIVE_VERIFICATION_FAILED'); }
  return report;
}
