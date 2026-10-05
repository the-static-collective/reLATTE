import { instant } from '../audit_clock/wire.ts';
import { hashValue } from '../job.ts';
import { METRICS, RESOURCE_FIELDS, RESOURCE_METRICS } from './types.ts';
import type { Metric, MetricName, ResourceObservations } from './types.ts';
import type { VerifiedContext } from './context.ts';
import { rational } from './rational.ts';
import type { Rational } from './rational.ts';

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();
/** Origins remain visible: arithmetic over signed claims is not verification of their truth. */
export function projectMetrics(v: VerifiedContext) {
  const metrics = new Map<MetricName, Metric>(METRICS.map(metric => [metric, { metric, value: null, basis: 'not-observed', source_ids: [] }]));
  const set = (metric: MetricName, value: Rational | null, basis: string, sourceIds: string[]) => metrics.set(metric, { metric, value, basis, source_ids: sorted(sourceIds) });
  const job = v.context.job_spec, population = job.width * job.height;
  set('result_entries', rational(population), 'canonical-job-bound-to-native-result', [v.native.crossing.crossing_id]);
  set('declared_iteration_budget', rational(population * job.iterations), 'declared-job-upper-bound-not-executed-resource-work', [v.native.crossing.crossing_id]);
  const evidenceIds = v.audit ? [v.audit.audit_id] : v.history ? [v.history.history_id] : [];
  if (v.audit || v.history) {
    const a = v.audit?.summary, observed = a?.coverage.observed_count ?? 0, contradictions = a?.contradictions.length ?? 0;
    set('observed_sample_entries', rational(observed), 'attributed-complete-sampled-mathematical-observations', evidenceIds);
    set('matching_sample_entries', rational(a?.per_index.filter(p => p.matching_receipt_ids.length).length ?? 0), 'attributed-matching-predictions-not-mathematical-truth', evidenceIds);
    set('observed_sample_coverage', rational(observed, population), 'union-of-attributed-mathematical-observations', evidenceIds);
    set('observed_challenge_ids', rational(a?.unique_challenge_count ?? 0), 'distinct-challenges-with-recorded-receipts-not-independent-randomness', evidenceIds);
    const receipts = a?.receipts.filter(r => r.checked_count > 0) ?? [];
    set('mathematical_verifier_keys', rational(new Set(receipts.map(r => r.verifier_key)).size), 'attributed-public-keys-not-independent-execution', evidenceIds);
    set('mathematical_implementation_fingerprints', rational(new Set(receipts.map(r => hashValue({ id: r.implementation!.id, source_sha256: r.implementation!.source_sha256 }))).size), 'attributed-source-fingerprints-not-independent-execution', evidenceIds);
    set('contradictory_sample_entries', rational(contradictions), 'localized-attributed-disagreement-not-proof-of-fraud', evidenceIds);
    const observedIndices = new Set(a?.observed_indices ?? []), observedContradictions = a?.contradictions.filter(c => observedIndices.has(c.index)).length ?? 0;
    set('contradictory_observed_fraction', observed ? rational(observedContradictions, observed) : null, 'localized-attributed-disagreement-within-observed-union', evidenceIds);
  }
  if (v.history) {
    const h = v.history, accounting = h.summary.schedule_accounting, ids = [h.history_id];
    set('issued_scheduled_slots', rational(accounting.issued_slots), 'declared-schedule-slots-with-attributed-issuance', ids);
    set('completed_sample_observation_slots', rational(accounting.completed_observation_slots), 'declared-slots-with-complete-sample-observations-including-negative-claims', ids);
    set('incomplete_schedule_fraction', rational(accounting.slots_without_complete_mathematical_observation, accounting.planned_slots), 'all-declared-slots-including-future-slots-not-observed-as-complete', ids);
    const closed = h.summary.slots.filter(s => instant(s.response_deadline) < instant(h.summary.as_of_observer_claim));
    set('observed_timely_answered_slot_fraction', closed.length ? rational(closed.filter(s => s.response_window_observations.some(o => o.within_window)).length, closed.length) : null,
      'observer-attributed-in-window-response-observations-over-all-closed-slots-not-objective-response-time', ids);
  }
  if (v.artifactBytes !== null) {
    set('artifact_present_at_evaluation', rational(1), 'canonical-artifact-present-and-native-identity-checked-not-durable-storage', [v.context.result_id]);
    set('artifact_bytes_present', rational(v.artifactBytes), 'canonical-artifact-bytes-present-not-resource-expenditure', [v.context.result_id]);
  }
  set('full_computation_verified_result', null, 'no-full-computation-proof-adapter-in-this-contract', []);
  set('proven_cpu_ms', null, 'no-resource-measurement-proof-adapter-in-this-contract', []);
  const unique = new Map(v.resources.map(r => [r.crossing.crossing_id, r]));
  const observations: ResourceObservations = { submitted_claim_count: v.resources.length, unique_claim_count: unique.size,
    replayed_claim_submissions: v.resources.length - unique.size, conflicting_amounts: [] };
  for (const [position, field] of RESOURCE_FIELDS.entries()) {
    const values = new Map<number, string[]>();
    for (const r of unique.values()) {
      const amount = r.claim.amounts[field]; if (amount !== null) values.set(amount, [...(values.get(amount) ?? []), r.crossing.crossing_id]);
    }
    const groups = [...values.entries()].sort(([a], [b]) => a - b).map(([amount, ids]) => ({ amount, claim_ids: sorted(ids) }));
    if (groups.length > 1) observations.conflicting_amounts.push({ field, values: groups });
    set(RESOURCE_METRICS[position], groups.length ? rational(groups.at(-1)!.amount) : null,
      'maximum-of-signed-self-reported-claims-not-resource-proof', groups.flatMap(g => g.claim_ids));
  }
  return { metrics: METRICS.map(name => metrics.get(name)!), resource_observations: observations };
}
