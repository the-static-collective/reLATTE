import { sealReceipt, verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, integer, record } from '../job.ts';
import type { NativeReport } from './verifier.ts';
import { CHALLENGE_CONTRACT } from './contract.ts';
import { parseHeader, resultId } from './result.ts';
import { deriveSampleIndices, digest } from '../challenge/commitment.ts';

/** Authenticate claims' structure/consistency, never elevate a signer's mathematics to truth. */
function validateReport(value: unknown): NativeReport {
  const r = record(value, 'INVALID_CHALLENGE_REPORT');
  exactKeys(r, ['schema', 'scope', 'claims', 'checked_count', 'evidence', 'implementation', 'errors'], 'INVALID_CHALLENGE_REPORT');
  if (r.schema !== 'useful-work.native-verification/v1') throw new Error('INVALID_CHALLENGE_REPORT');
  const scope = record(r.scope, 'INVALID_CHALLENGE_SCOPE');
  exactKeys(scope, ['work_crossing_id', 'challenge_id', 'response_id', 'result_id', 'result_header', 'indices', 'coordinates'], 'INVALID_CHALLENGE_SCOPE');
  if (!/^relatte-crossing-v0:[a-f0-9]{64}$/.test(scope.response_id)) throw new Error('INVALID_CHALLENGE_SCOPE');
  const header = parseHeader(scope.result_header);
  if (resultId(header) !== scope.result_id) throw new Error('RESULT_IDENTITY_MISMATCH');
  if (!Array.isArray(scope.indices) || !Array.isArray(scope.coordinates) || scope.coordinates.length !== scope.indices.length ||
      !canonicalBytes(scope.indices).equals(canonicalBytes(deriveSampleIndices(scope.work_crossing_id, scope.challenge_id, (header.width * header.height), scope.indices.length)))) throw new Error('INVALID_CHALLENGE_SCOPE');
  for (const [i, point] of scope.coordinates.entries()) {
    exactKeys(record(point, 'INVALID_CHALLENGE_COORDINATE'), ['x', 'y'], 'INVALID_CHALLENGE_COORDINATE');
    const index = scope.indices[i];
    if (point.x !== index % header.width || point.y !== Math.floor(index / header.width)) throw new Error('INVALID_CHALLENGE_COORDINATE');
  }
  const claims = record(r.claims, 'INVALID_CHALLENGE_CLAIM');
  exactKeys(claims, ['challenge_authenticated', 'response_authenticated', 'job_spec_hash_matches', 'result_header_identity_verified', 'response_structurally_valid', 'sampled_entries_bound_to_result_identity', 'sampled_computation_verified', 'complete_artifact_received', 'full_artifact_structure_verified', 'full_computation_verified'], 'INVALID_CHALLENGE_CLAIM');
  if (Object.values(claims).some(v => typeof v !== 'boolean') || !claims.challenge_authenticated || !claims.response_authenticated || !claims.job_spec_hash_matches ||
      claims.complete_artifact_received || claims.full_artifact_structure_verified || claims.full_computation_verified || !claims.result_header_identity_verified || (claims.sampled_entries_bound_to_result_identity && !claims.response_structurally_valid)) throw new Error('INVALID_CHALLENGE_CLAIM');
  if (!Array.isArray(r.errors) || r.errors.some((e: unknown) => typeof e !== 'string' || !e) ||
      !Array.isArray(r.evidence) || ![0, scope.indices.length].includes(r.checked_count) || r.checked_count !== r.evidence.length) throw new Error('INVALID_CHALLENGE_EVIDENCE');
  if (r.implementation !== null) {
    const implementation = record(r.implementation, 'INVALID_CHECKER_IMPLEMENTATION');
    exactKeys(implementation, ['id', 'runtime', 'source_sha256'], 'INVALID_CHECKER_IMPLEMENTATION'); digest(implementation.source_sha256);
    if (typeof implementation.id !== 'string' || !implementation.id || typeof implementation.runtime !== 'string' || !implementation.runtime) throw new Error('INVALID_CHECKER_IMPLEMENTATION');
  }
  for (const [i, entry] of r.evidence.entries()) {
    exactKeys(record(entry, 'INVALID_CHALLENGE_EVIDENCE'), ['index', 'committed_count', 'worker', 'verifier', 'matched'], 'INVALID_CHALLENGE_EVIDENCE');
    integer(entry.committed_count, 0, 4096, 'INVALID_CHALLENGE_EVIDENCE');
    for (const orbit of [entry.worker, entry.verifier]) {
      exactKeys(record(orbit, 'INVALID_CHALLENGE_EVIDENCE'), ['index', 'count', 'final_real_q', 'final_imag_q'], 'INVALID_CHALLENGE_EVIDENCE');
      if (orbit.index !== scope.indices[i]) throw new Error('INVALID_CHALLENGE_EVIDENCE');
      integer(orbit.count, 0, 4096, 'INVALID_CHALLENGE_EVIDENCE');
      for (const field of ['final_real_q', 'final_imag_q']) if (typeof orbit[field] !== 'string' || !/^(0|-[1-9][0-9]{0,19}|[1-9][0-9]{0,19})$/.test(orbit[field])) throw new Error('INVALID_CHALLENGE_EVIDENCE');
    }
    const v = entry.verifier, w = entry.worker;
    if (entry.index !== scope.indices[i] || entry.matched !== (v.count === entry.committed_count && v.count === w.count && v.final_real_q === w.final_real_q && v.final_imag_q === w.final_imag_q)) throw new Error('INVALID_CHALLENGE_EVIDENCE');
  }
  const complete = r.checked_count === scope.indices.length;
  if ((complete && (!claims.sampled_entries_bound_to_result_identity || !r.implementation)) ||
      claims.sampled_computation_verified !== (complete && r.evidence.every((e: any) => e.matched)) ||
      (r.errors.length === 0) !== claims.sampled_computation_verified) throw new Error('INVALID_CHALLENGE_CLAIM');
  return r as NativeReport;
}

export async function nativeReceipt(report: NativeReport, keys: P256KeyMaterial, createdAt: string,
  identity: { world_id: string; receiver_particular: string }) {
  validateReport(report);
  return sealReceipt({
    schema: 'relatte.receipt/v0', crossing_id: report.scope.response_id, ...identity,
    kind: report.errors.length ? 'FAILED' : 'VERIFIED', semantic_effect: 'none', contract_ref: CHALLENGE_CONTRACT,
    pre_state_ref: null, post_state_ref: null, descendant_refs: [], residual_refs: [],
    note: 'The listed entries are cryptographically bound to the named Merkle-native artifact identity. Only their orbits were recomputed; full artifact availability, structure, computation, ownership and value are unclaimed.',
    created_at: createdAt, extensions: { useful_work_native: report,
      laws: ['POSSESSION ≠ OWNERSHIP', 'RECEIPT ≠ TRUTH', 'SAMPLED VERIFICATION ≠ FULL COMPUTATIONAL VERIFICATION', 'COMPUTATIONAL VERIFICATION ≠ ECONOMIC VALUE'] },
  }, keys);
}

/** Compare attributed observations, with no winner and no receiver state change. */
export async function compareNativeReceipts(values: unknown[]) {
  if (values.length < 2 || values.length > 16) throw new Error('INVALID_RECEIPT_COUNT');
  const receipts: Record<string, any>[] = [];
  for (const value of values) {
    if (!await verifyReceipt(value)) throw new Error('INVALID_RECEIPT_SIGNATURE');
    const r = value as Record<string, any>, report = validateReport(r.extensions?.useful_work_native);
    if (r.contract_ref !== CHALLENGE_CONTRACT || r.semantic_effect !== 'none' ||
        report?.schema !== 'useful-work.native-verification/v1' || r.crossing_id !== report.scope?.response_id ||
        report.claims?.complete_artifact_received !== false || report.claims?.full_artifact_structure_verified !== false || report.claims?.full_computation_verified !== false ||
        !Array.isArray(report.evidence) || !Array.isArray(report.scope.indices) || !Array.isArray(report.errors) ||
        report.checked_count !== report.evidence.length || (r.kind !== (report.errors.length ? 'FAILED' : 'VERIFIED'))) throw new Error('INVALID_CHALLENGE_RECEIPT');
    receipts.push(r);
  }
  if (new Set(receipts.map(r => r.world_id)).size !== receipts.length || new Set(receipts.map(r => canonicalBytes(r.signing.public_key).toString())).size !== receipts.length) throw new Error('DISTINCT_WORLDS_REQUIRED');
  receipts.sort((a, b) => a.receipt_id < b.receipt_id ? -1 : a.receipt_id > b.receipt_id ? 1 : 0);
  const subject = receipts[0].extensions.useful_work_native.scope;
  if (receipts.some(r => !canonicalBytes(r.extensions.useful_work_native.scope).equals(canonicalBytes(subject)))) throw new Error('RECEIPT_SCOPE_MISMATCH');
  const reports = receipts.map(r => r.extensions.useful_work_native as NativeReport);
  const complete = reports.every(r => r.checked_count === subject.indices.length && r.claims.sampled_entries_bound_to_result_identity && r.implementation);
  if (complete) {
    if (reports.some(r => !canonicalBytes(r.evidence.map(e => ({ worker: e.worker, committed_count: e.committed_count }))).equals(canonicalBytes(reports[0].evidence.map(e => ({ worker: e.worker, committed_count: e.committed_count })))))) throw new Error('RECEIPT_RESPONSE_EVIDENCE_MISMATCH');
  }
  const predictions = reports.map(r => canonicalBytes(r.evidence.map(e => e.verifier)).toString());
  const relation = !complete ? 'incomparable' : new Set(predictions).size > 1 ? 'contradictory' : 'compatible';
  const comparison = { schema: 'useful-work.native-comparison/v1', subject, relation, semantic_effect: 'none',
    observations: receipts.map((r, i) => ({ world_id: r.world_id, receipt_id: r.receipt_id,
      sampled_computation_verified: reports[i].claims.sampled_computation_verified, checked_count: reports[i].checked_count,
      implementation: reports[i].implementation, errors: reports[i].errors })),
    note: 'Scoped attributed observations only. No winner, truth, ownership, admission, or economic value is selected.' };
  return { ...comparison, comparison_id: `useful-work-native-comparison-v1:${hashValue(comparison)}` };
}
