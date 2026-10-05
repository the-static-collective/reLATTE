import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { parseResultId } from '../merkle_native/result.ts';
import { inspectNativeReceipt } from '../merkle_native/receipt.ts';
import { verifyNativeChallenge } from '../merkle_native/verifier.ts';
import { claims } from '../challenge/exchange.ts';
import { conditionalMissProbability, MODEL_ASSUMPTIONS, parseModel } from './model.ts';
import type { RandomnessModel } from './model.ts';
import type { AuditChallenge, AuditObject, AuditSubmission, AuditSummary, PixelObservations, Prediction, ReceiptObservation, VerifiedSubmission } from './types.ts';

export const MAX_AUDIT_SUBMISSIONS = 1024;
export const MAX_AUDIT_BYTES = 64 * 1024 * 1024;
export const AUDIT_LAWS = ['AUDIT COUNT ≠ TRUTH', 'COVERAGE ≠ AUTHORITY', 'REPEATED CHALLENGE ≠ INDEPENDENT RANDOMNESS',
  'CONFIDENCE ≠ CONSENSUS', 'RESPONSE TIME ≠ COMPUTE TIME', 'POSSESSION ≠ OWNERSHIP', 'RECEIPT ≠ TRUTH'];
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const indices = (values: Iterable<number>) => [...new Set(values)].sort((a, b) => a - b);
const keyId = (key: Record<string, any>) => `p256:${hashValue({ kty: key.kty, crv: key.crv, x: key.x, y: key.y })}`;
const equal = (a: unknown, b: unknown) => canonicalBytes(a).equals(canonicalBytes(b));
function countLimit(values: unknown): asserts values is unknown[] {
  if (!Array.isArray(values)) throw new Error('INVALID_AUDIT_SUBMISSIONS');
  integer(values.length, 1, MAX_AUDIT_SUBMISSIONS, 'AUDIT_SUBMISSION_COUNT_LIMIT');
}

/** Every receipt is authenticated BEFORE deduplication. Signature validity is never mathematical truth. */
async function inspectSubmissions(job: RenderJob, resultId: string, values: unknown[]): Promise<VerifiedSubmission[]> {
  countLimit(values);
  const bytes = canonicalBytes(job), verified: VerifiedSubmission[] = [];
  for (const value of values) {
    if (canonicalBytes(value).length > 1_000_000) throw new Error('AUDIT_SUBMISSION_SIZE_LIMIT');
    const s = record(value, 'INVALID_AUDIT_SUBMISSION');
    exactKeys(s, ['work', 'challenge', 'response', 'receipt'], 'INVALID_AUDIT_SUBMISSION_FIELDS');
    const { receipt, report } = await inspectNativeReceipt(s.receipt);
    const context = await inspectNativeWork(s.work, bytes);
    if (context.result_id !== resultId || report.scope.result_id !== resultId) throw new Error('AUDIT_RESULT_MISMATCH');
    // Reuse Kernel 004's scope, response structure and proof checks. The checker
    // returns only the SIGNED predictions being attributed; no orbit is executed.
    const derived = await verifyNativeChallenge(context, s.challenge, s.response, async () => {
      if (!report.checked_count) throw new Error('AUDIT_HAS_NO_RECOMPUTATION_EVIDENCE');
      return { samples: report.evidence.map(e => e.verifier), implementation: report.implementation! };
    });
    if (!equal(derived.scope, report.scope)) throw new Error('AUDIT_RECEIPT_SCOPE_MISMATCH');
    for (const field of ['response_structurally_valid', 'sampled_entries_bound_to_result_identity'] as const) {
      if (report.claims[field] && !derived.claims[field]) throw new Error('AUDIT_UNSUPPORTED_RECEIPT_CLAIM');
    }
    if (report.checked_count && (derived.checked_count !== report.checked_count || !equal(derived.evidence, report.evidence))) throw new Error('AUDIT_RESPONSE_EVIDENCE_MISMATCH');
    verified.push({ work: structuredClone(s.work), challenge: structuredClone(s.challenge), response: structuredClone(s.response),
      receipt, report, indices: derived.scope.indices, proof_verified: derived.claims.sampled_entries_bound_to_result_identity,
      nonce: claims(s.challenge).merkle_challenge.nonce, challenger_key: keyId(s.challenge.signing.public_key), verifier_key: keyId(receipt.signing.public_key) });
  }
  return verified;
}

function addPrediction(groups: PixelObservations['verifier_predictions'], value: Prediction, receiptId: string) {
  const prediction = { count: value.count, final_real_q: value.final_real_q, final_imag_q: value.final_imag_q };
  let group = groups.find(g => equal(g.prediction, prediction));
  if (!group) { group = { prediction, receipt_ids: [] }; groups.push(group); }
  group.receipt_ids.push(receiptId);
}

function summarize(values: VerifiedSubmission[], model: RandomnessModel | null): AuditSummary {
  const first = values[0].report.scope, header = first.result_header, population = header.width * header.height;
  const challenges = new Map<string, AuditChallenge>(), receipts = new Map<string, ReceiptObservation>();
  const pixels = new Map<number, PixelObservations>(), seenChallenges = new Set<string>(), observed = new Set<number>();
  const progress: AuditSummary['progress'] = [];
  const nonceGroups = new Map<string, Set<string>>();
  const workers = { worlds: new Set<string>(), keys: new Set<string>() };
  for (const [submissionIndex, s] of values.entries()) {
    const scope = s.report.scope, rid = s.receipt.receipt_id, cid = scope.challenge_id;
    const challengeSeen = seenChallenges.has(cid), receiptReplayed = receipts.has(rid);
    seenChallenges.add(cid);
    workers.worlds.add(s.work.source_world); workers.keys.add(keyId(s.work.signing.public_key));
    let challenge = challenges.get(cid);
    if (!challenge) {
      challenge = { challenge_id: cid, work_crossing_id: scope.work_crossing_id, nonce: s.nonce,
        challenger_world: s.challenge.source_world, challenger_particular: s.challenge.source_particular,
        challenger_key: s.challenger_key, indices: s.indices, response_ids: [], receipt_ids: [], submitted_count: 0,
        duplicate_receipt_submissions: 0, same_verifier_rechecks: 0, nonce_reused_across_distinct_ids: false, has_complete_observations: false };
      challenges.set(cid, challenge);
      const group = nonceGroups.get(s.nonce) ?? new Set<string>(); group.add(cid); nonceGroups.set(s.nonce, group);
    }
    challenge.submitted_count++; challenge.response_ids.push(scope.response_id);
    if (receiptReplayed) { receipts.get(rid)!.submitted_count++; challenge.duplicate_receipt_submissions++; }
    else {
      receipts.set(rid, { receipt_id: rid, challenge_id: cid, response_id: scope.response_id, world_id: s.receipt.world_id,
        receiver_particular: s.receipt.receiver_particular, verifier_key: s.verifier_key, implementation: s.report.implementation,
        checked_count: s.report.checked_count, submitted_count: 1, kind: s.receipt.kind, errors: s.report.errors,
        signed_timestamp_claims: { challenge_created_at: s.challenge.created_at, response_created_at: s.response.created_at, receipt_created_at: s.receipt.created_at } });
      challenge.receipt_ids.push(rid);
    }
    for (const [position, index] of s.indices.entries()) {
      let pixel = pixels.get(index);
      if (!pixel) {
        pixel = { index, x: index % header.width, y: Math.floor(index / header.width), challenge_ids: [], proof_bound_challenge_ids: [],
          observed_challenge_ids: [], observation_receipt_ids: [], observation_count: 0, committed_count: null,
          verifier_predictions: [], worker_evidence: [], matching_receipt_ids: [], nonmatching_receipt_ids: [], worker_mismatch_receipt_ids: [] };
        pixels.set(index, pixel);
      }
      pixel.challenge_ids.push(cid);
      if (s.proof_verified) {
        pixel.proof_bound_challenge_ids.push(cid);
        const entry = claims(s.response).merkle_response.samples[position];
        if (pixel.committed_count !== null && pixel.committed_count !== entry.committed_count) throw new Error('AUDIT_COMMITTED_COUNT_CONFLICT');
        pixel.committed_count = entry.committed_count;
        if (!receiptReplayed) addPrediction(pixel.worker_evidence, entry, rid);
      }
    }
    const newObserved: number[] = [];
    if (!receiptReplayed && s.report.checked_count) {
      challenge.has_complete_observations = true;
      for (const entry of s.report.evidence) {
        const pixel = pixels.get(entry.index)!;
        // Valid proofs for the SAME root cannot bind different committed counts
        // at one index without a hash collision. Fail instead of voting over it.
        if (pixel.committed_count !== null && pixel.committed_count !== entry.committed_count) throw new Error('AUDIT_COMMITTED_COUNT_CONFLICT');
        pixel.committed_count = entry.committed_count;
        pixel.observed_challenge_ids.push(cid); pixel.observation_receipt_ids.push(rid); pixel.observation_count++;
        addPrediction(pixel.verifier_predictions, entry.verifier, rid);
        (entry.matched ? pixel.matching_receipt_ids : pixel.nonmatching_receipt_ids).push(rid);
        if (entry.worker.count !== entry.verifier.count || entry.worker.final_real_q !== entry.verifier.final_real_q ||
            entry.worker.final_imag_q !== entry.verifier.final_imag_q) pixel.worker_mismatch_receipt_ids.push(rid);
        if (!observed.has(entry.index)) newObserved.push(entry.index);
        observed.add(entry.index);
      }
    }
    progress.push({ submission_index: submissionIndex, challenge_id: cid, receipt_id: rid, receipt_replayed: receiptReplayed,
      challenge_seen_before: challengeSeen, unique_challenges_so_far: seenChallenges.size, observed_indices_so_far: observed.size,
      newly_observed_indices: indices(newObserved) });
  }
  const challengeList = [...challenges.values()].sort((a, b) => a.challenge_id < b.challenge_id ? -1 : 1);
  const receiptList = [...receipts.values()].sort((a, b) => a.receipt_id < b.receipt_id ? -1 : 1);
  for (const c of challengeList) {
    c.response_ids = sorted(c.response_ids); c.receipt_ids = sorted(c.receipt_ids);
    const keyCounts = new Map<string, number>();
    for (const rid of c.receipt_ids) { const key = receipts.get(rid)!.verifier_key; keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1); }
    c.same_verifier_rechecks = [...keyCounts.values()].reduce((total, n) => total + Math.max(0, n - 1), 0);
    c.nonce_reused_across_distinct_ids = nonceGroups.get(c.nonce)!.size > 1;
  }
  const perIndex = [...pixels.values()].sort((a, b) => a.index - b.index);
  const histogram = new Map<number, number>();
  for (const p of perIndex) {
    p.challenge_ids = sorted(p.challenge_ids); p.proof_bound_challenge_ids = sorted(p.proof_bound_challenge_ids);
    p.observed_challenge_ids = sorted(p.observed_challenge_ids); p.observation_receipt_ids = sorted(p.observation_receipt_ids);
    p.matching_receipt_ids = sorted(p.matching_receipt_ids); p.nonmatching_receipt_ids = sorted(p.nonmatching_receipt_ids);
    p.worker_mismatch_receipt_ids = sorted(p.worker_mismatch_receipt_ids);
    for (const group of [p.verifier_predictions, p.worker_evidence]) {
      group.forEach(g => { g.receipt_ids = sorted(g.receipt_ids); });
      group.sort((a, b) => canonicalBytes(a.prediction).compare(canonicalBytes(b.prediction)));
    }
    histogram.set(p.challenge_ids.length, (histogram.get(p.challenge_ids.length) ?? 0) + 1);
  }
  const contradictions: AuditSummary['contradictions'] = [];
  for (const p of perIndex) {
    const countMismatches = sorted(p.verifier_predictions.filter(g => g.prediction.count !== p.committed_count).flatMap(g => g.receipt_ids));
    const workerCountMismatches = sorted(p.worker_evidence.filter(g => g.prediction.count !== p.committed_count).flatMap(g => g.receipt_ids));
    if (p.verifier_predictions.length > 1 || p.worker_evidence.length > 1 || p.nonmatching_receipt_ids.length || workerCountMismatches.length) contradictions.push({
      index: p.index, x: p.x, y: p.y, verifier_disagreement: p.verifier_predictions.length > 1,
      worker_evidence_conflict: p.worker_evidence.length > 1, count_mismatch_receipt_ids: countMismatches,
      worker_count_mismatch_receipt_ids: workerCountMismatches, worker_mismatch_receipt_ids: p.worker_mismatch_receipt_ids });
  }
  const implementations = new Map<string, AuditSummary['diversity']['implementations'][number]>();
  for (const r of receiptList) if (r.implementation) {
    const { id, source_sha256, runtime } = r.implementation, key = hashValue({ id, source_sha256 });
    const group = implementations.get(key) ?? { id, source_sha256, runtimes: [], receipt_ids: [] };
    group.runtimes.push(runtime); group.receipt_ids.push(r.receipt_id); implementations.set(key, group);
  }
  const implementationList = [...implementations.values()].map(g => ({ ...g, runtimes: sorted(g.runtimes), receipt_ids: sorted(g.receipt_ids) }))
    .sort((a, b) => canonicalBytes({ id: a.id, source_sha256: a.source_sha256 }).compare(canonicalBytes({ id: b.id, source_sha256: b.source_sha256 })));
  const requested = perIndex.map(p => p.index), proofBound = perIndex.filter(p => p.proof_bound_challenge_ids.length).map(p => p.index), observedIndices = indices(observed);
  const sampleSlots = challengeList.reduce((n, c) => n + c.indices.length, 0);
  const eligible = challengeList.filter(c => !c.nonce_reused_across_distinct_ids && c.has_complete_observations);
  return {
    result_id: first.result_id, result_header: header, submission_count: values.length, unique_receipt_count: receiptList.length,
    replayed_receipt_submissions: values.length - receiptList.length, unique_challenge_count: challengeList.length,
    multiply_observed_challenge_ids: challengeList.filter(c => c.receipt_ids.length > 1).map(c => c.challenge_id),
    same_verifier_rechecked_challenge_ids: challengeList.filter(c => c.same_verifier_rechecks > 0).map(c => c.challenge_id),
    requested_indices: requested, proof_bound_indices: proofBound, observed_indices: observedIndices,
    coverage: { population, requested_count: requested.length, proof_bound_count: proofBound.length, observed_count: observedIndices.length,
      observed_fraction: { numerator: observedIndices.length, denominator: population }, all_indices_observed: observedIndices.length === population },
    overlap: { unique_challenge_sample_slots: sampleSlots, repeated_slots: sampleSlots - requested.length,
      indices_shared_by_challenges: perIndex.filter(p => p.challenge_ids.length > 1).map(p => p.index),
      challenge_multiplicity_histogram: [...histogram.entries()].sort((a, b) => a[0] - b[0]).map(([distinct_challenges, index_count]) => ({ distinct_challenges, index_count })) },
    challenges: challengeList, receipts: receiptList, per_index: perIndex, contradictions,
    diversity: { challenger_worlds: sorted(challengeList.map(c => c.challenger_world)), challenger_keys: sorted(challengeList.map(c => c.challenger_key)),
      verifier_worlds: sorted(receiptList.map(r => r.world_id)), verifier_keys: sorted(receiptList.map(r => r.verifier_key)),
      worker_worlds: sorted(workers.worlds), worker_keys: sorted(workers.keys), implementations: implementationList },
    reused_nonces: [...nonceGroups.entries()].filter(([, ids]) => ids.size > 1).sort(([a], [b]) => a < b ? -1 : 1).map(([nonce, ids]) => ({ nonce, challenge_ids: sorted(ids) })),
    progress,
    conditional_model: model === null ? null : { model, assumptions: [...MODEL_ASSUMPTIONS], assumptions_verified: false, eligible_challenge_ids: eligible.map(c => c.challenge_id),
      excluded_challenges: challengeList.filter(c => !eligible.includes(c)).map(c => ({ challenge_id: c.challenge_id,
        reasons: [...(c.nonce_reused_across_distinct_ids ? ['NONCE_REUSED_ACROSS_DISTINCT_CHALLENGE_IDS'] : []), ...(!c.has_complete_observations ? ['NO_COMPLETE_MATHEMATICAL_OBSERVATION'] : [])] })),
      sample_sizes: eligible.map(c => c.indices.length), ex_ante_probability_no_sample_hits_fixed_bad_entry_set: conditionalMissProbability(population, model.bad_entry_count, eligible.map(c => c.indices.length)),
      interpretation: 'conditional sampling-design probability; not artifact correctness, confidence, or consensus' },
    claims: { underlying_signatures_verified: true, exchange_scope_and_positive_proof_claims_verified: true, mathematics_recomputed_by_accumulator: false,
      full_artifact_available: false, full_computation_verified: false, authority_asserted: false, consensus_asserted: false, economic_value_asserted: false, compute_time_inferred: false },
    laws: [...AUDIT_LAWS],
  };
}

export function auditId(value: Omit<AuditObject, 'audit_id'>): string {
  return 'useful-work-audit-v1:' + sha256Hex(Buffer.concat([Buffer.from('UsefulWork-Audit-v1|'), canonicalBytes(value)]));
}
function materialize(job: RenderJob, resultId: string, entries: VerifiedSubmission[], modelValue: unknown): AuditObject {
  countLimit(entries);
  const model = parseModel(modelValue, job.width * job.height), summary = summarize(entries, model);
  const submissions = entries.map(({ work, challenge, response, receipt }) => ({ work, challenge, response, receipt }));
  const body: Omit<AuditObject, 'audit_id'> = { schema: 'useful-work.audit/v1', result_id: resultId, job_spec: job, submissions, model, summary };
  if (canonicalBytes(body).length > MAX_AUDIT_BYTES - 128) throw new Error('AUDIT_SIZE_LIMIT');
  return { ...body, audit_id: auditId(body) };
}
export async function createAudit(jobValue: unknown, resultId: string, submissions: unknown[], model: unknown = null): Promise<AuditObject> {
  const job = parseJob(jobValue); parseResultId(resultId);
  return materialize(job, resultId, await inspectSubmissions(job, resultId, submissions), model);
}
async function inspectAudit(value: unknown) {
  if (canonicalBytes(value).length > MAX_AUDIT_BYTES) throw new Error('AUDIT_SIZE_LIMIT');
  const a = record(value, 'INVALID_AUDIT');
  exactKeys(a, ['schema', 'audit_id', 'result_id', 'job_spec', 'submissions', 'model', 'summary'], 'INVALID_AUDIT_FIELDS');
  if (a.schema !== 'useful-work.audit/v1') throw new Error('UNSUPPORTED_AUDIT');
  const { audit_id: id, ...body } = a;
  if (id !== auditId(body as Omit<AuditObject, 'audit_id'>)) throw new Error('AUDIT_ID_MISMATCH');
  const job = parseJob(a.job_spec); parseResultId(a.result_id);
  const entries = await inspectSubmissions(job, a.result_id, a.submissions);
  const rebuilt = materialize(job, a.result_id, entries, a.model);
  if (!equal(a.summary, rebuilt.summary)) throw new Error('AUDIT_SUMMARY_MISMATCH');
  if (id !== rebuilt.audit_id) throw new Error('AUDIT_ID_MISMATCH');
  return { audit: rebuilt, entries };
}
/** A saved summary is never trusted: every underlying signature and every aggregate are reconstructed. */
export async function verifyAudit(value: unknown): Promise<AuditObject> { return (await inspectAudit(value)).audit; }
export async function appendAudit(value: unknown, additions: unknown[]): Promise<AuditObject> {
  const { audit, entries } = await inspectAudit(value); countLimit(additions);
  integer(entries.length + additions.length, 1, MAX_AUDIT_SUBMISSIONS, 'AUDIT_SUBMISSION_COUNT_LIMIT');
  const next = await inspectSubmissions(audit.job_spec, audit.result_id, additions);
  return materialize(audit.job_spec, audit.result_id, [...entries, ...next], audit.model);
}
