import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { equal, instant } from '../audit_clock/wire.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { verifyAudit } from '../audit/accumulator.ts';
import { verifyHistory } from '../audit_clock/history.ts';
import { verifyServiceHistory } from '../service/history.ts';
import { verifyResourceBundle } from '../resources/bundle.ts';
import { verifyValuation } from '../valuation/evaluator.ts';
import { compare, rational } from '../valuation/rational.ts';
import { parseAcceptancePolicy, RESOURCE_METRICS } from './policy.ts';
import type { AcceptancePolicy } from './policy.ts';
import { bounded, signer } from './wire.ts';
import type { Identity, Wire } from './wire.ts';

export interface EvidenceInput { result_id: string; job_spec: RenderJob; work: Wire; audit: Wire | null; audit_history: Wire | null;
  service_history: Wire | null; resources: Wire | null; valuations: Wire[] }
export const evidenceId = (body: unknown) => 'useful-work-offer-evidence-v1:' + domainHash('UsefulWork-OfferEvidence-v1|', body);
async function reconstruct(value: unknown) {
  bounded(value); const i = record(structuredClone(value), 'INVALID_OFFER_EVIDENCE');
  exactKeys(i, ['result_id', 'job_spec', 'work', 'audit', 'audit_history', 'service_history', 'resources', 'valuations'], 'INVALID_OFFER_EVIDENCE');
  const job = parseJob(i.job_spec), native = await inspectNativeWork(i.work, canonicalBytes(job));
  if (i.result_id !== native.result_id) throw new Error('OFFER_EVIDENCE_RESULT_MISMATCH');
  const history = i.audit_history === null ? null : await verifyHistory(i.audit_history);
  const suppliedAudit = i.audit === null ? null : await verifyAudit(i.audit), audit = suppliedAudit ?? history?.audit ?? null;
  if (history && (!equal(history.history.job_spec, job) || history.history.work.crossing_id !== native.crossing.crossing_id)) throw new Error('OFFER_AUDIT_HISTORY_SCOPE_MISMATCH');
  if (suppliedAudit && history && suppliedAudit.audit_id !== history.audit?.audit_id) throw new Error('OFFER_AUDIT_HISTORY_DISAGREEMENT');
  if (audit && (audit.result_id !== native.result_id || !equal(audit.job_spec, job) || audit.submissions.some(s => s.work.crossing_id !== native.crossing.crossing_id))) throw new Error('OFFER_AUDIT_SCOPE_MISMATCH');
  const service = i.service_history === null ? null : await verifyServiceHistory(i.service_history);
  if (service && (service.work.crossing_id !== native.crossing.crossing_id || !equal(service.job_spec, job))) throw new Error('OFFER_SERVICE_SCOPE_MISMATCH');
  const resources = i.resources === null ? null : await verifyResourceBundle(i.resources);
  if (resources && (resources.work.crossing_id !== native.crossing.crossing_id || !equal(resources.job_spec, job))) throw new Error('OFFER_RESOURCE_SCOPE_MISMATCH');
  if (!Array.isArray(i.valuations)) throw new Error('INVALID_OFFER_VALUATIONS'); integer(i.valuations.length, 0, 16, 'OFFER_VALUATION_LIMIT');
  const valuations = [];
  for (const v of i.valuations) {
    const checked = await verifyValuation(v), s = checked.report.scope;
    if (s.result_id !== native.result_id || s.work_crossing_id !== native.crossing.crossing_id || s.job_spec_hash !== native.header.job_spec_hash ||
        s.audit_id !== (audit?.audit_id ?? null) || s.history_id !== (history?.history.history_id ?? null)) throw new Error('OFFER_VALUATION_SCOPE_MISMATCH');
    valuations.push(checked);
  }
  const body = { schema: 'useful-work.offer-evidence/v1' as const, ...(i as EvidenceInput), job_spec: job, work: native.crossing };
  const bundle = { ...body, evidence_id: evidenceId(body) }; bounded(bundle);
  return { bundle, native, audit, history: history?.history ?? null, service, resources, valuations };
}
export type EvidenceBundle = Awaited<ReturnType<typeof createEvidence>>;
export const createEvidence = async (input: EvidenceInput) => (await reconstruct(input)).bundle;
export async function verifyEvidence(value: unknown) {
  bounded(value); const b = record(structuredClone(value), 'INVALID_OFFER_EVIDENCE_BUNDLE');
  exactKeys(b, ['schema', 'evidence_id', 'result_id', 'job_spec', 'work', 'audit', 'audit_history', 'service_history', 'resources', 'valuations'], 'INVALID_OFFER_EVIDENCE_BUNDLE');
  const { schema, evidence_id, ...input } = b;
  if (schema !== 'useful-work.offer-evidence/v1' || evidence_id !== evidenceId({ schema, ...input })) throw new Error('OFFER_EVIDENCE_ID_MISMATCH');
  const rebuilt = await reconstruct(input); if (!equal(b, rebuilt.bundle)) throw new Error('OFFER_EVIDENCE_REPLAY_MISMATCH'); return rebuilt;
}
export function evidenceReference(b: EvidenceBundle) {
  return { evidence_id: b.evidence_id, result_id: b.result_id, work_crossing_id: b.work.crossing_id,
    job_spec_hash: hashValue(b.job_spec), audit_id: b.audit?.audit_id ?? null, audit_history_id: b.audit_history?.history_id ?? null,
    service_history_id: b.service_history?.history_id ?? null, resource_bundle_id: b.resources?.bundle_id ?? null,
    valuation_ids: b.valuations.map((v: Wire) => v.crossing.crossing_id) };
}
export function latestSignedAt(b: EvidenceBundle): number {
  const pending: unknown[] = [b]; let latest = -Infinity;
  while (pending.length) {
    const item = pending.pop(); if (!item || typeof item !== 'object') continue;
    const v = item as Wire;
    if (v.signing && ['relatte.crossing-envelope/v0', 'relatte.receipt/v0'].includes(v.schema)) latest = Math.max(latest, instant(v.created_at));
    pending.push(...Object.values(v).filter(x => x && typeof x === 'object'));
  }
  return latest;
}
const trusted = (value: Wire, expected: Identity) => equal(signer(value), expected);
/** Thresholds apply to attributed evidence, never to physical causation or global truth. */
export function evaluateAcceptance(verified: Awaited<ReturnType<typeof verifyEvidence>>, value: AcceptancePolicy) {
  const policy = parseAcceptancePolicy(value), { audit, history, service, resources, valuations } = verified;
  const checks = policy.clauses.map((c, index) => {
    let present = false, passed = false; let observed: unknown = null; let sourceIds: string[] = [];
    switch (c.kind) {
      case 'audit': {
        present = audit !== null;
        if (audit) {
          const ids = new Set(audit.submissions.filter(s => c.verifiers.some(v => trusted(s.receipt, v))).map(s => s.receipt.receipt_id));
          const matching = audit.summary.per_index.filter(p => p.matching_receipt_ids.some(id => ids.has(id))).map(p => p.index);
          observed = { matching_indices_from_admitted_verifiers: matching, contradictions_in_presented_audit: audit.summary.contradictions.length };
          sourceIds = [audit.audit_id, ...ids]; passed = matching.length >= c.minimum_matching_entries && (!c.reject_contradictions || !audit.summary.contradictions.length);
        } break;
      }
      case 'audit-history':
        present = history !== null;
        if (history) { observed = history.summary.schedule_accounting; sourceIds = [history.history_id, history.cut.crossing_id];
          passed = trusted(history.cut, c.observer) && history.summary.schedule_accounting.completed_observation_slots >= c.minimum_completed_slots; } break;
      case 'service':
        present = service !== null;
        if (service) { observed = service.summary.schedule_accounting; sourceIds = [service.history_id, service.cut.crossing_id, service.commitment.crossing_id];
          passed = trusted(service.cut, c.observer) && trusted(service.commitment, c.host) && service.summary.schedule_accounting.in_window_verified_slots >= c.minimum_in_window_verified_slots; } break;
      case 'resource': {
        const adapter = RESOURCE_METRICS[c.metric], records = resources?.summary.by_adapter[adapter] ?? [];
        present = records.length > 0;
        const observations = records.map(o => {
          const raw = (o.observed as Wire)[c.metric], amount = typeof raw === 'string' ? rational(BigInt(raw)) : raw;
          const entries = resources!.observations.filter(e => e.measurement.crossing_id === o.measurement_id);
          const admitted = equal(o.collector, c.collector) && entries.some(e => trusted(e.receipt, c.replayer)) &&
            c.allowed_capture_modes.includes(o.provenance.capture_mode) && (adapter !== 'energy' || c.allowed_reading_origins.includes((o.observed as Wire).reading_origin));
          const matches = admitted && compare(amount, c.minimum) >= 0 && (c.maximum === null || compare(amount, c.maximum) <= 0);
          return { measurement_id: o.measurement_id, replay_receipt_ids: entries.map(e => e.receipt.receipt_id), amount, admitted_provenance: admitted, matches };
        });
        observed = { adapter, metric: c.metric, selection: 'exists-single-observation/v1', observations };
        sourceIds = observations.flatMap(o => [o.measurement_id, ...o.replay_receipt_ids]); passed = observations.some(o => o.matches); break;
      }
      case 'valuation': {
        present = valuations.length > 0;
        const observations = valuations.map(v => ({ valuation_id: v.bundle.crossing.crossing_id, evaluator: signer(v.bundle.crossing),
          policy_id: v.report.scope.policy_id, unit: v.report.scope.unit, amount: v.report.calculation.amount,
          matches: trusted(v.bundle.crossing, c.evaluator) && v.report.scope.policy_id === c.policy_id && v.report.scope.unit === c.unit && compare(v.report.calculation.amount, c.minimum_amount) >= 0 }));
        observed = { selection: 'exists-single-local-valuation/v1', observations }; sourceIds = observations.map(o => o.valuation_id); passed = observations.some(o => o.matches); break;
      }
    }
    return { clause_index: index, kind: c.kind, status: !present ? 'MISSING' : passed ? 'PASS' : 'FAIL', observed, source_ids: [...new Set(sourceIds)].sort() };
  });
  return { algorithm: policy.algorithm, checks, status: checks.some(c => c.status === 'FAIL') ? 'FAIL' : checks.some(c => c.status === 'MISSING') ? 'MISSING' : 'PASS',
    claims: { admitted_evidence_and_thresholds_replayed: true, observed_history_complete: false, full_computation_verified: false,
      physical_resource_causation_verified: false, universal_value_asserted: false } };
}
