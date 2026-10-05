import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import { inspectNativeWork, inspectResponse } from '../merkle_native/exchange.ts';
import { inspectNativeReceipt } from '../merkle_native/receipt.ts';
import { createAudit } from '../audit/accumulator.ts';
import type { AuditObject, AuditSubmission } from '../audit/types.ts';
import { bindPlan, domainHash, inspectPlan, scheduleSlot } from './policy.ts';
import { inspectObservation, inspectRandomness, inspectScheduledIssue } from './provenance.ts';
import { assertSigner, CLOCK_LAWS, equal, instant, inspectClockMessage, sealClockMessage } from './wire.ts';
import type { Wire } from './wire.ts';
import type { AuditHistory, ClockObservation, HistoryInput, HistorySummary, SlotHistory } from './types.ts';

export const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
export const historyId = (body: Omit<AuditHistory, 'history_id'>) => 'useful-work-audit-history-v1:' + domainHash('UsefulWork-AuditHistory-v1|', body);
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();
const idList = (values: Wire[], field = 'crossing_id') => values.map(v => v[field]);
/** Ordered claim-ID inventory binds replays and missing records, without claiming completeness of the world. */
export function inventoryHash(input: Omit<HistoryInput, 'cut'>) {
  return hashValue({ plan_id: claims(input.plan).audit_clock_plan.plan_id, plan_crossing_id: input.plan.crossing_id,
    work_crossing_id: input.work.crossing_id, job_spec: input.job_spec, publication_id: input.publication?.crossing_id ?? null,
    events: idList(input.events), issuances: input.issues.map(i => i.issuance.crossing_id), challenges: input.issues.map(i => i.challenge.crossing_id),
    responses: idList(input.responses), receipts: idList(input.receipts, 'receipt_id'), observations: idList(input.observations), prior_cuts: idList(input.prior_cuts) });
}
const inventoryFields = ['events', 'issues', 'responses', 'receipts', 'observations', 'prior_cuts'] as const;
const inventoryCounts = (input: Omit<HistoryInput, 'cut'>) => Object.fromEntries(inventoryFields.map(field => [field, input[field].length]));
export async function sealHistoryCut(input: Omit<HistoryInput, 'cut'>, keys: P256KeyMaterial, at: string) {
  const p = await inspectPlan(input.plan);
  if (!equal(keys.publicKeyJwk, p.policy.observer.public_key)) throw new Error('CLOCK_SIGNER_MISMATCH');
  return sealClockMessage('cut', { schema: 'useful-work.audit-clock-cut/v1', plan_id: p.plan_id,
    plan_crossing_id: p.plan.crossing_id, observed_at: at, inventory_hash: inventoryHash(input), inventory_counts: inventoryCounts(input), complete_history_asserted: false }, keys, p.policy.observer.world_id, at);
}
function boundedArrays(input: Record<string, any>) {
  for (const field of inventoryFields) {
    if (!Array.isArray(input[field])) throw new Error('INVALID_HISTORY_ARRAY');
    integer(input[field].length, 0, 1024, 'HISTORY_RECORD_COUNT_LIMIT');
    for (const value of input[field]) if (canonicalBytes(value).length > 1_000_000) throw new Error('HISTORY_RECORD_SIZE_LIMIT');
  }
}
async function reconstruct(inputValue: unknown) {
  if (canonicalBytes(inputValue).length > MAX_HISTORY_BYTES) throw new Error('HISTORY_SIZE_LIMIT');
  const input = record(inputValue, 'INVALID_AUDIT_HISTORY_INPUT');
  exactKeys(input, ['job_spec', 'work', 'plan', 'publication', 'events', 'issues', 'responses', 'receipts', 'observations', 'prior_cuts', 'cut'], 'INVALID_HISTORY_INPUT_FIELDS');
  boundedArrays(input);
  const job = parseJob(input.job_spec), p = await inspectPlan(input.plan);
  const context = await bindPlan(await inspectNativeWork(input.work, canonicalBytes(job)), p);
  const { crossing: cut, payload: c } = await inspectClockMessage(input.cut, 'cut');
  exactKeys(c, ['schema', 'plan_id', 'plan_crossing_id', 'observed_at', 'inventory_hash', 'inventory_counts', 'complete_history_asserted'], 'INVALID_HISTORY_CUT');
  assertSigner(cut, p.policy.observer.public_key, p.policy.observer.world_id);
  if (c.schema !== 'useful-work.audit-clock-cut/v1' || c.plan_id !== p.plan_id || c.plan_crossing_id !== p.plan.crossing_id || c.complete_history_asserted !== false || cut.created_at !== c.observed_at) throw new Error('INVALID_HISTORY_CUT');
  const asOf = instant(c.observed_at);
  if (asOf < instant(p.policy.declared_at)) throw new Error('CUT_BEFORE_PLAN');
  if (c.inventory_hash !== inventoryHash(input as unknown as HistoryInput) || !equal(c.inventory_counts, inventoryCounts(input as unknown as HistoryInput))) throw new Error('OBSERVER_INVENTORY_MISMATCH');
  const publication = input.publication === null ? null : await inspectObservation(p, input.publication);
  if (publication && (publication.observation.kind !== 'PLAN_PUBLISHED' || instant(publication.observation.observed_at) > asOf)) throw new Error('INVALID_PUBLICATION_OBSERVATION');
  if (input.issues.length && !publication) throw new Error('PUBLICATION_REQUIRED');
  const slots: SlotHistory[] = Array.from({ length: p.policy.schedule.rounds }, (_, i) => ({ ...scheduleSlot(p.policy, i),
    status: 'PLANNED', status_basis: 'NO_ISSUANCE_OBSERVED_WITHIN_OPEN_SCHEDULE', event_ids: [], issuance_ids: [], challenge_ids: [], response_ids: [], receipt_ids: [], observation_ids: [],
    randomness_equivocation: false, has_mathematical_observation: false, response_window_observations: [], issue_window_observations: [], conflicting_absence_reports: [] }));
  const eventMap = new Map<string, Awaited<ReturnType<typeof inspectRandomness>>>();
  for (const value of input.events) {
    const e = await inspectRandomness(p, value);
    if (instant(e.event.emitted_at) > asOf) throw new Error('EVENT_AFTER_OBSERVER_CUT');
    eventMap.set(e.crossing.crossing_id, e); slots[e.slot.index].event_ids.push(e.crossing.crossing_id);
  }
  const issueMap = new Map<string, Awaited<ReturnType<typeof inspectScheduledIssue>>>(), challengeMap = new Map<string, Awaited<ReturnType<typeof inspectScheduledIssue>>>();
  for (const value of input.issues) {
    const issue = record(value, 'INVALID_SCHEDULED_ISSUE'), { payload } = await inspectClockMessage(issue.issuance, 'issuance');
    const event = eventMap.get(payload?.randomness_event_id); if (!event) throw new Error('ISSUANCE_RANDOMNESS_NOT_OBSERVED');
    const verified = await inspectScheduledIssue(context, p, publication!.crossing, event.crossing, issue);
    issueMap.set(verified.issuance.crossing_id, verified); challengeMap.set(verified.challenge.crossing_id, verified);
    slots[verified.slot.index].issuance_ids.push(verified.issuance.crossing_id); slots[verified.slot.index].challenge_ids.push(verified.challenge.crossing_id);
  }
  const responseMap = new Map<string, { crossing: Wire; issue: Awaited<ReturnType<typeof inspectScheduledIssue>> }>();
  for (const value of input.responses) {
    const signed = await authenticated(value), payload = claims(signed).merkle_response, issue = challengeMap.get(payload?.challenge_id);
    if (!issue) throw new Error('RESPONSE_WITHOUT_SCHEDULED_CHALLENGE');
    const response = await inspectResponse(context, issue.challenge, value);
    responseMap.set(response.crossing.crossing_id, { crossing: response.crossing, issue }); slots[issue.slot.index].response_ids.push(response.crossing.crossing_id);
  }
  const submissions: AuditSubmission[] = [];
  for (const value of input.receipts) {
    const { receipt, report } = await inspectNativeReceipt(value), response = responseMap.get(report.scope.response_id);
    if (!response) throw new Error('RECEIPT_WITHOUT_OBSERVED_RESPONSE');
    const slot = slots[response.issue.slot.index]; slot.receipt_ids.push(receipt.receipt_id);
    slot.has_mathematical_observation ||= report.checked_count > 0;
    submissions.push({ work: context.crossing, challenge: response.issue.challenge, response: response.crossing, receipt });
  }
  const audit: AuditObject | null = submissions.length ? await createAudit(job, p.policy.result_id, submissions) : null;
  const observationMap = new Map<string, ClockObservation>();
  for (const value of input.observations) {
    const o = await inspectObservation(p, value), observation = o.observation;
    if (observation.kind === 'PLAN_PUBLISHED' || instant(observation.observed_at) > asOf) throw new Error('OBSERVATION_OUTSIDE_HISTORY_CUT');
    observationMap.set(o.crossing.crossing_id, observation);
    const slot = slots[observation.slot_index!]; slot.observation_ids.push(o.crossing.crossing_id);
    if (observation.kind === 'ISSUE_SEEN') {
      const issue = issueMap.get(observation.subject_id!);
      if (!issue || issue.slot.index !== slot.index) throw new Error('OBSERVATION_SUBJECT_MISMATCH');
      if (instant(observation.observed_at) < instant(issue.event.created_at)) throw new Error('OBSERVATION_BEFORE_RANDOMNESS');
      slot.issue_window_observations.push({ issuance_id: issue.issuance.crossing_id, observation_id: o.crossing.crossing_id,
        observed_at: observation.observed_at, within_window: instant(observation.observed_at) <= instant(slot.issue_deadline) });
    } else if (observation.kind === 'RESPONSE_SEEN') {
      const response = responseMap.get(observation.subject_id!);
      if (!response || response.issue.slot.index !== slot.index) throw new Error('OBSERVATION_SUBJECT_MISMATCH');
      if (instant(observation.observed_at) < instant(response.issue.event.created_at)) throw new Error('OBSERVATION_BEFORE_RANDOMNESS');
      slot.response_window_observations.push({ response_id: response.crossing.crossing_id, observation_id: o.crossing.crossing_id,
        observed_at: observation.observed_at, within_window: instant(observation.observed_at) <= instant(slot.response_deadline) });
    }
  }
  const observerCuts: HistorySummary['observer_cuts'] = [];
  let previousTime = instant(p.policy.declared_at), previousCounts = Object.fromEntries(inventoryFields.map(f => [f, 0]));
  for (const [position, value] of [...input.prior_cuts, cut].entries()) {
    const checked = await inspectClockMessage(value, 'cut'), pc = checked.payload;
    exactKeys(pc, ['schema', 'plan_id', 'plan_crossing_id', 'observed_at', 'inventory_hash', 'inventory_counts', 'complete_history_asserted'], 'INVALID_HISTORY_CUT');
    assertSigner(checked.crossing, p.policy.observer.public_key, p.policy.observer.world_id);
    if (pc.schema !== 'useful-work.audit-clock-cut/v1' || pc.plan_id !== p.plan_id || pc.plan_crossing_id !== p.plan.crossing_id || pc.complete_history_asserted !== false || pc.observed_at !== checked.crossing.created_at) throw new Error('INVALID_HISTORY_CUT');
    const counts = record(pc.inventory_counts, 'INVALID_INVENTORY_COUNTS'); exactKeys(counts, [...inventoryFields], 'INVALID_INVENTORY_COUNTS');
    if (instant(pc.observed_at) < previousTime || counts.prior_cuts !== position) throw new Error('INVALID_OBSERVER_CUT_CHAIN');
    const prefix = { ...input };
    for (const field of inventoryFields) { integer(counts[field], previousCounts[field], input[field].length, 'INVALID_INVENTORY_COUNTS'); prefix[field] = input[field].slice(0, counts[field]); }
    if (pc.inventory_hash !== inventoryHash(prefix as unknown as HistoryInput)) throw new Error('OBSERVER_INVENTORY_MISMATCH');
    const events = new Set(idList(prefix.events)), challenges = new Set(prefix.issues.map((i: any) => i.challenge.crossing_id)),
      issuances = new Set(prefix.issues.map((i: any) => i.issuance.crossing_id)), responses = new Set(idList(prefix.responses));
    if (publication && instant(publication.observation.observed_at) > instant(pc.observed_at)) throw new Error('PUBLICATION_AFTER_OBSERVER_CUT');
    if (prefix.events.some((e: Wire) => instant(e.created_at) > instant(pc.observed_at)) || prefix.observations.some((o: Wire) => instant(o.created_at) > instant(pc.observed_at))) throw new Error('EVIDENCE_AFTER_OBSERVER_CUT');
    if (prefix.issues.some((i: any) => !events.has(claims(i.issuance).audit_clock_issuance.randomness_event_id)) ||
        prefix.responses.some((r: Wire) => !challenges.has(claims(r).merkle_response.challenge_id)) ||
        prefix.receipts.some((r: Wire) => !responses.has(r.extensions.useful_work_native.scope.response_id))) throw new Error('CUT_INVENTORY_DEPENDENCY_MISSING');
    for (const o of prefix.observations as Wire[]) {
      const obs = observationMap.get(o.crossing_id)!;
      if ((obs.kind === 'ISSUE_SEEN' && !issuances.has(obs.subject_id!)) || (obs.kind === 'RESPONSE_SEEN' && !responses.has(obs.subject_id!))) throw new Error('CUT_INVENTORY_DEPENDENCY_MISSING');
    }
    observerCuts.push({ cut_id: checked.crossing.crossing_id, observed_at: pc.observed_at, inventory_counts: structuredClone(counts) });
    previousTime = instant(pc.observed_at); previousCounts = counts;
  }
  for (const slot of slots) {
    for (const field of ['event_ids', 'issuance_ids', 'challenge_ids', 'response_ids', 'receipt_ids', 'observation_ids'] as const) slot[field] = sorted(slot[field]);
    slot.randomness_equivocation = slot.event_ids.length > 1;
    const observations = slot.observation_ids.map(id => ({ id, observation: observationMap.get(id)! }));
    // Replayed signed observer claims remain authenticated but count only once.
    slot.response_window_observations = [...new Map(slot.response_window_observations.map(o => [o.observation_id, o])).values()].sort((a, b) => a.observation_id.localeCompare(b.observation_id));
    slot.issue_window_observations = [...new Map(slot.issue_window_observations.map(o => [o.observation_id, o])).values()].sort((a, b) => a.observation_id.localeCompare(b.observation_id));
    const misses = observations.filter(o => o.observation.kind === 'MISS_REPORTED');
    slot.conflicting_absence_reports = misses.filter(o => slot.issue_window_observations.some(i => instant(i.observed_at) <= instant(o.observation.observed_at))).map(o => o.id);
    if (slot.response_ids.length) { slot.status = 'ANSWERED'; slot.status_basis = 'AUTHENTICATED_RESPONSE_OBSERVED_NOT_A_COMPUTATION_VERDICT'; }
    else if (slot.issuance_ids.length && asOf > instant(slot.response_deadline)) { slot.status = 'EXPIRED'; slot.status_basis = 'OBSERVER_CUT_PAST_WINDOW_WITH_NO_RESPONSE_IN_THIS_INVENTORY'; }
    else if (observations.some(o => o.observation.kind === 'UNAVAILABLE_REPORTED')) { slot.status = 'WITHHELD / UNKNOWN'; slot.status_basis = 'ATTRIBUTED_UNAVAILABILITY_REPORT_WITHOUT_INFERRED_INTENT'; }
    else if (slot.issuance_ids.length) { slot.status = 'ISSUED'; slot.status_basis = 'AUTHENTICATED_ISSUANCE_OBSERVED_RESPONSE_WINDOW_OPEN'; }
    else if (misses.length) { slot.status = 'MISSED'; slot.status_basis = 'ATTRIBUTED_NO_ISSUANCE_REPORT_NOT_PROVEN_ABSENCE'; }
    else if (asOf > instant(slot.issue_deadline)) { slot.status = 'WITHHELD / UNKNOWN'; slot.status_basis = 'NO_OBSERVABLE_ISSUANCE_AFTER_WINDOW_UNKNOWN_OUTSIDE_THIS_HISTORY'; }
  }
  const counts: HistorySummary['status_counts'] = { PLANNED: 0, ISSUED: 0, ANSWERED: 0, MISSED: 0, EXPIRED: 0, 'WITHHELD / UNKNOWN': 0 };
  slots.forEach(s => counts[s.status]++);
  const valueGroups = new Map<string, { value_hex: string; event_ids: string[]; slot_indices: number[] }>();
  for (const e of eventMap.values()) {
    const group = valueGroups.get(e.event.value_hex) ?? { value_hex: e.event.value_hex, event_ids: [], slot_indices: [] };
    group.event_ids.push(e.crossing.crossing_id); group.slot_indices.push(e.slot.index); valueGroups.set(e.event.value_hex, group);
  }
  const summary: HistorySummary = { plan_id: p.plan_id, result_id: p.policy.result_id, as_of_observer_claim: c.observed_at, publication_observed: publication !== null,
    slots, status_counts: counts, schedule_accounting: { planned_slots: slots.length, issued_slots: slots.filter(s => s.issuance_ids.length).length,
      answered_slots: slots.filter(s => s.response_ids.length).length, completed_observation_slots: slots.filter(s => s.has_mathematical_observation).length,
      slots_without_observed_issuance: slots.filter(s => !s.issuance_ids.length).length, issued_slots_without_observed_response: slots.filter(s => s.issuance_ids.length && !s.response_ids.length).length,
      slots_without_complete_mathematical_observation: slots.filter(s => !s.has_mathematical_observation).length, unique_challenges: challengeMap.size, schedule_denominator_known: true },
    replays: { events: input.events.length - eventMap.size, issues: input.issues.length - issueMap.size, responses: input.responses.length - responseMap.size,
      receipts: input.receipts.length - new Set(input.receipts.map((r: Wire) => r.receipt_id)).size, observations: input.observations.length - observationMap.size },
    observer_cuts: observerCuts,
    randomness_reused_values: [...valueGroups.values()].filter(g => new Set(g.slot_indices).size > 1).map(g => ({ ...g, event_ids: sorted(g.event_ids), slot_indices: [...new Set(g.slot_indices)].sort((a, b) => a - b) })).sort((a, b) => a.value_hex < b.value_hex ? -1 : 1),
    evidence_accumulator: audit ? { audit_id: audit.audit_id, summary: audit.summary } : null,
    claims: { signatures_and_policy_bindings_verified: true, signed_observer_inventory_verified: true, publication_order_is_attributed: true,
      observed_history_complete: false, objective_time_verified: false, randomness_unpredictability_verified: false, mathematics_recomputed: false,
      nonresponse_proves_computation_failure: false, guilt_asserted: false, authority_asserted: false, consensus_asserted: false, economic_value_asserted: false, compute_time_inferred: false }, laws: [...CLOCK_LAWS] };
  const body: Omit<AuditHistory, 'history_id'> = { schema: 'useful-work.audit-clock-history/v1', job_spec: job, work: context.crossing, plan: p.plan,
    publication: publication?.crossing ?? null, events: structuredClone(input.events), issues: structuredClone(input.issues), responses: structuredClone(input.responses),
    receipts: structuredClone(input.receipts), observations: structuredClone(input.observations), prior_cuts: structuredClone(input.prior_cuts), cut, summary };
  if (canonicalBytes(body).length > MAX_HISTORY_BYTES - 128) throw new Error('HISTORY_SIZE_LIMIT');
  return { history: { ...body, history_id: historyId(body) }, audit };
}
export async function createHistory(input: HistoryInput) { return (await reconstruct(input)).history; }
export async function verifyHistory(value: unknown) {
  if (canonicalBytes(value).length > MAX_HISTORY_BYTES) throw new Error('HISTORY_SIZE_LIMIT');
  const h = record(value, 'INVALID_AUDIT_HISTORY');
  exactKeys(h, ['schema', 'history_id', 'summary', 'job_spec', 'work', 'plan', 'publication', 'events', 'issues', 'responses', 'receipts', 'observations', 'prior_cuts', 'cut'], 'INVALID_AUDIT_HISTORY_FIELDS');
  const { schema, history_id, summary, ...input } = h;
  if (schema !== 'useful-work.audit-clock-history/v1') throw new Error('UNSUPPORTED_AUDIT_HISTORY');
  if (history_id !== historyId({ schema, summary, ...input } as Omit<AuditHistory, 'history_id'>)) throw new Error('HISTORY_ID_MISMATCH');
  const rebuilt = await reconstruct(input);
  if (!equal(summary, rebuilt.history.summary)) throw new Error('HISTORY_SUMMARY_MISMATCH');
  if (history_id !== rebuilt.history.history_id) throw new Error('HISTORY_ID_MISMATCH');
  return rebuilt;
}
/** A later signed cut must name the complete retained inventory, including old absence observations. */
export async function appendHistory(previous: unknown, additions: Partial<Pick<HistoryInput, 'events' | 'issues' | 'responses' | 'receipts' | 'observations'>>, cut: Wire) {
  const { history } = await verifyHistory(previous);
  const { schema: _, history_id: __, summary: ___, ...input } = history;
  const added = record(additions, 'INVALID_HISTORY_ADDITIONS');
  if (Object.keys(added).some(k => !['events', 'issues', 'responses', 'receipts', 'observations'].includes(k))) throw new Error('INVALID_HISTORY_ADDITIONS');
  for (const field of ['events', 'issues', 'responses', 'receipts', 'observations'] as const) {
    if (added[field] !== undefined && !Array.isArray(added[field])) throw new Error('INVALID_HISTORY_ARRAY');
    (input[field] as unknown[]) = [...input[field], ...(added[field] ?? [])];
  }
  if (instant(cut.created_at) < instant(history.cut.created_at)) throw new Error('OBSERVER_CUT_MOVED_BACKWARDS');
  input.prior_cuts = [...input.prior_cuts, history.cut];
  return createHistory({ ...input, cut });
}
