import type { P256KeyMaterial } from '../../protocol.ts';
import type { RenderJob } from '../job.ts';
import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from '../job.ts';
import { domainHash, scheduleSlot } from '../audit_clock/policy.ts';
import { inspectRandomness } from '../audit_clock/provenance.ts';
import { assertSigner, equal, instant } from '../audit_clock/wire.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { inspectCommitment, inspectPublication } from './commitment.ts';
import { inspectServiceChallenge, inspectServiceResponse } from './exchange.ts';
import { inspectServiceReceipt } from './receipt.ts';
import { inspectServiceMessage, sealServiceMessage, SERVICE_LAWS, UNPROVEN } from './wire.ts';
import type { Wire } from './wire.ts';

export interface ServiceHistoryInput {
  job_spec: RenderJob; work: Wire; plan: Wire; commitment: Wire; publication: Wire | null;
  events: Wire[]; challenges: Wire[]; responses: Wire[]; receipts: Wire[]; prior_cuts: Wire[]; cut: Wire;
}
const arrays = ['events', 'challenges', 'responses', 'receipts', 'prior_cuts'] as const;
const inputFields = ['job_spec', 'work', 'plan', 'commitment', 'publication', ...arrays, 'cut'];
type Inventory = Omit<ServiceHistoryInput, 'cut'>;
export const MAX_SERVICE_HISTORY_BYTES = 32 * 1024 * 1024;
const counts = (i: Inventory) => Object.fromEntries(arrays.map(k => [k, i[k].length]));
export function serviceInventoryHash(i: Inventory) {
  return hashValue({ job_spec: i.job_spec, work_id: i.work.crossing_id, plan_crossing_id: i.plan.crossing_id,
    commitment_id: i.commitment.crossing_id, publication_id: i.publication?.crossing_id ?? null,
    ...Object.fromEntries(arrays.map(k => [k, i[k].map(v => k === 'receipts' ? v.receipt_id : v.crossing_id)])) });
}
export async function sealServiceCut(input: Inventory, keys: P256KeyMaterial, at: string) {
  const s = await inspectCommitment(await inspectNativeWork(input.work, canonicalBytes(input.job_spec)), input.plan, input.commitment);
  if (!equal(keys.publicKeyJwk, s.plan.policy.observer.public_key)) throw new Error('SERVICE_OBSERVER_KEY_MISMATCH');
  return sealServiceMessage('cut', { schema: 'useful-work.service-cut/v1', commitment_id: s.commitment.crossing_id,
    observed_at: at, inventory_hash: serviceInventoryHash(input), inventory_counts: counts(input), complete_history_asserted: false }, keys, s.plan.policy.observer.world_id, at);
}
function inputAt(value: unknown): ServiceHistoryInput {
  if (canonicalBytes(value).length > MAX_SERVICE_HISTORY_BYTES) throw new Error('SERVICE_HISTORY_SIZE_LIMIT');
  const i = record(value, 'INVALID_SERVICE_HISTORY_INPUT'); exactKeys(i, inputFields, 'INVALID_SERVICE_HISTORY_INPUT');
  for (const k of arrays) {
    if (!Array.isArray(i[k])) throw new Error('INVALID_SERVICE_HISTORY_ARRAY');
    integer(i[k].length, 0, 1024, 'SERVICE_HISTORY_RECORD_LIMIT');
    for (const v of i[k]) if (canonicalBytes(v).length > 1_000_000) throw new Error('SERVICE_HISTORY_RECORD_SIZE_LIMIT');
  }
  return structuredClone(i) as ServiceHistoryInput;
}
async function reconstruct(value: unknown, validatePrior = true) {
  const i = inputAt(value); i.job_spec = parseJob(i.job_spec);
  const s = await inspectCommitment(await inspectNativeWork(i.work, canonicalBytes(i.job_spec)), i.plan, i.commitment);
  const { crossing: cut, payload: c } = await inspectServiceMessage(i.cut, 'cut');
  assertSigner(cut, s.plan.policy.observer.public_key, s.plan.policy.observer.world_id);
  const expected = { schema: 'useful-work.service-cut/v1', commitment_id: s.commitment.crossing_id,
    observed_at: cut.created_at, inventory_hash: serviceInventoryHash(i), inventory_counts: counts(i), complete_history_asserted: false };
  if (!equal(c, expected)) throw new Error('SERVICE_OBSERVER_INVENTORY_MISMATCH');
  const asOf = instant(c.observed_at);
  if (asOf < instant(s.declaration.declared_at)) throw new Error('SERVICE_CUT_BEFORE_COMMITMENT');
  const publication = i.publication === null ? null : await inspectPublication(s, i.publication);
  if (publication && instant(publication.created_at) > asOf) throw new Error('SERVICE_PUBLICATION_AFTER_CUT');
  if (i.challenges.length && !publication) throw new Error('SERVICE_PUBLICATION_REQUIRED');
  const slots = Array.from({ length: s.plan.policy.schedule.rounds }, (_, index) => ({ ...scheduleSlot(s.plan.policy, index),
    status: 'PLANNED', event_ids: [] as string[], challenge_ids: [] as string[], response_ids: [] as string[], receipt_ids: [] as string[],
    verified_response_ids: [] as string[], in_window_response_ids: [] as string[],
    randomness_equivocation: false, response_window_observations: [] as { receipt_id: string; response_id: string | null; observed_at: string; within_window: boolean }[] }));
  const events = new Map<string, Wire>(), challenges = new Map<string, Awaited<ReturnType<typeof inspectServiceChallenge>>>();
  const responses = new Map<string, Awaited<ReturnType<typeof inspectServiceResponse>>>();
  const receipts = new Map<string, Awaited<ReturnType<typeof inspectServiceReceipt>>>();
  for (const v of i.events) {
    const e = await inspectRandomness(s.plan, v);
    if (instant(e.event.emitted_at) > asOf) throw new Error('SERVICE_EVENT_AFTER_CUT');
    events.set(e.crossing.crossing_id, e.crossing); slots[e.slot.index].event_ids.push(e.crossing.crossing_id);
  }
  for (const v of i.challenges) {
    const { payload } = await inspectServiceMessage(v, 'challenge'), event = events.get(payload.randomness_event_id);
    if (!event) throw new Error('SERVICE_CHALLENGE_WITHOUT_EVENT');
    const ch = await inspectServiceChallenge(s, publication, event, v);
    challenges.set(ch.crossing.crossing_id, ch); slots[ch.slot.index].challenge_ids.push(ch.crossing.crossing_id);
  }
  for (const v of i.responses) {
    const { payload } = await inspectServiceMessage(v, 'response'), ch = challenges.get(payload.challenge_id);
    if (!ch) throw new Error('SERVICE_RESPONSE_WITHOUT_CHALLENGE');
    const r = await inspectServiceResponse(s, ch.crossing.crossing_id, v);
    responses.set(r.crossing.crossing_id, r); slots[ch.slot.index].response_ids.push(r.crossing.crossing_id);
  }
  for (const v of i.receipts) {
    const scope = v.extensions?.useful_work_service?.scope, ch = challenges.get(scope?.challenge_id);
    if (!ch) throw new Error('SERVICE_RECEIPT_WITHOUT_CHALLENGE');
    const r = scope.response_id === null ? null : responses.get(scope.response_id);
    if (scope.response_id !== null && !r) throw new Error('SERVICE_RECEIPT_WITHOUT_RESPONSE');
    const verified = await inspectServiceReceipt(s, publication, ch.event, ch.crossing, r?.crossing ?? null, v);
    if (instant(verified.report.scope.observed_at) > asOf) throw new Error('SERVICE_RECEIPT_AFTER_CUT');
    receipts.set(verified.receipt.receipt_id, verified);
  }
  // Authenticate first; exact replays must not add rounds, bytes or observations.
  const observedResponses = new Map<string, number>(), verifiedIndices = new Set<number>();
  for (const { receipt, report } of receipts.values()) {
    const slot = slots[report.scope.slot_index]; slot.receipt_ids.push(receipt.receipt_id);
    slot.response_window_observations.push({ receipt_id: receipt.receipt_id, response_id: report.scope.response_id,
      observed_at: report.scope.observed_at, within_window: report.claims.response_within_observer_window });
    if (report.scope.response_id) {
      observedResponses.set(report.scope.response_id, report.claims.bytes_returned);
      if (report.claims.requested_bytes_matched) slot.verified_response_ids.push(report.scope.response_id);
      if (report.claims.response_within_observer_window) slot.in_window_response_ids.push(report.scope.response_id);
      for (const e of report.evidence) if (e.proof_verified) verifiedIndices.add(e.index);
    }
  }
  const reused = new Map<string, { value_hex: string; event_ids: string[]; slot_indices: number[] }>();
  for (const event of events.values()) {
    const e = await inspectRandomness(s.plan, event);
    const g = reused.get(e.event.value_hex) ?? { value_hex: e.event.value_hex, event_ids: [], slot_indices: [] };
    g.event_ids.push(event.crossing_id); g.slot_indices.push(e.slot.index); reused.set(g.value_hex, g);
  }
  for (const slot of slots) {
    for (const k of ['event_ids', 'challenge_ids', 'response_ids', 'receipt_ids', 'verified_response_ids', 'in_window_response_ids'] as const) slot[k] = [...new Set(slot[k])].sort();
    slot.randomness_equivocation = slot.event_ids.length > 1;
    slot.status = slot.response_ids.length ? 'ANSWERED' : slot.challenge_ids.length ?
      asOf > instant(slot.response_deadline) ? 'EXPIRED' : 'ISSUED' : asOf > instant(slot.issue_deadline) ? 'WITHHELD / UNKNOWN' : 'PLANNED';
  }
  if (validatePrior) {
    let previousTime = instant(s.declaration.declared_at);
    const previousCounts: Record<string, number> = Object.fromEntries(arrays.map(k => [k, 0]));
    for (const [index, prior] of i.prior_cuts.entries()) {
      const { payload } = await inspectServiceMessage(prior, 'cut');
      const sizes = record(payload.inventory_counts, 'INVALID_SERVICE_PREFIX_COUNTS'); exactKeys(sizes, [...arrays], 'INVALID_SERVICE_PREFIX_COUNTS');
      for (const k of arrays) {
        integer(sizes[k], previousCounts[k], i[k].length, 'SERVICE_PREFIX_MOVED_BACKWARDS'); previousCounts[k] = sizes[k];
      }
      if (sizes.prior_cuts !== index || instant(prior.created_at) < previousTime || instant(prior.created_at) > asOf) throw new Error('INVALID_SERVICE_PRIOR_CUT');
      previousTime = instant(prior.created_at);
      const prefix = { ...i, ...Object.fromEntries(arrays.map(k => [k, i[k].slice(0, sizes[k])])), cut: prior };
      await reconstruct(prefix, false);
    }
  }
  const summary = { commitment_id: s.commitment.crossing_id, plan_id: s.plan.plan_id, result_id: s.native.result_id,
    as_of_observer_claim: c.observed_at, publication_observed: publication !== null, slots,
    schedule_accounting: { planned_slots: slots.length, issued_slots: slots.filter(v => v.challenge_ids.length).length,
      answered_slots: slots.filter(v => v.response_ids.length).length, verified_chunk_slots: slots.filter(v => v.verified_response_ids.length).length,
      in_window_observed_slots: slots.filter(v => v.in_window_response_ids.length).length,
      in_window_verified_slots: slots.filter(v => v.verified_response_ids.some(id => v.in_window_response_ids.includes(id))).length,
      schedule_denominator_known: true },
    bytes_returned: [...observedResponses.values()].reduce((a, b) => a + b, 0), byte_accounting: 'unique-observed-response-native-content/v1',
    verified_chunk_indices: [...verifiedIndices].sort((a, b) => a - b),
    replays: { events: i.events.length - events.size, challenges: i.challenges.length - challenges.size,
      responses: i.responses.length - responses.size, receipts: i.receipts.length - receipts.size },
    randomness_reused_values: [...reused.values()].filter(g => new Set(g.slot_indices).size > 1),
    observer_cuts: [...i.prior_cuts, cut].map(v => ({ cut_id: v.crossing_id, observed_at: v.created_at })),
    claims: { signatures_and_bindings_verified: true, signed_observer_inventory_verified: true,
      observation_basis: 'signed-observer-claim/v1', observed_history_complete: false, missing_response_proves_unavailability: false, ...UNPROVEN }, laws: [...SERVICE_LAWS] };
  const body = { schema: 'useful-work.service-history/v1', ...i, summary };
  if (canonicalBytes(body).length > MAX_SERVICE_HISTORY_BYTES - 128) throw new Error('SERVICE_HISTORY_SIZE_LIMIT');
  return { ...body, history_id: serviceHistoryId(body) };
}
export const serviceHistoryId = (body: unknown) => 'useful-work-service-history-v1:' + domainHash('UsefulWork-ServiceHistory-v1|', body);
export const createServiceHistory = (input: ServiceHistoryInput) => reconstruct(input);
export type ServiceHistory = Awaited<ReturnType<typeof createServiceHistory>>;
export async function verifyServiceHistory(value: unknown): Promise<ServiceHistory> {
  if (canonicalBytes(value).length > MAX_SERVICE_HISTORY_BYTES) throw new Error('SERVICE_HISTORY_SIZE_LIMIT');
  const h = record(value, 'INVALID_SERVICE_HISTORY'); exactKeys(h, ['schema', 'history_id', 'summary', ...inputFields], 'INVALID_SERVICE_HISTORY');
  const { schema, history_id, summary, ...input } = h;
  if (schema !== 'useful-work.service-history/v1') throw new Error('UNSUPPORTED_SERVICE_HISTORY');
  if (history_id !== serviceHistoryId({ schema, ...input, summary })) throw new Error('SERVICE_HISTORY_ID_MISMATCH');
  const rebuilt = await reconstruct(input);
  if (!equal(rebuilt.summary, summary) || history_id !== rebuilt.history_id) throw new Error('SERVICE_HISTORY_REPLAY_MISMATCH');
  return rebuilt;
}
export async function appendServiceHistory(value: unknown, additions: Partial<Pick<ServiceHistoryInput, 'events' | 'challenges' | 'responses' | 'receipts'>>, cut: Wire) {
  const { schema: _, history_id: __, summary: ___, ...input } = await verifyServiceHistory(value);
  if (Object.keys(additions).some(k => !['events', 'challenges', 'responses', 'receipts'].includes(k))) throw new Error('INVALID_SERVICE_ADDITIONS');
  for (const k of ['events', 'challenges', 'responses', 'receipts'] as const) {
    if (additions[k] !== undefined && !Array.isArray(additions[k])) throw new Error('INVALID_SERVICE_ADDITIONS');
    input[k] = [...input[k], ...(additions[k] ?? [])];
  }
  input.prior_cuts = [...input.prior_cuts, input.cut];
  return createServiceHistory({ ...input, cut });
}
const historyRef = (h: ServiceHistory) => ({ history_id: h.history_id, commitment_id: h.summary.commitment_id,
  plan_id: h.summary.plan_id, result_id: h.summary.result_id, complete_history_asserted: false });
export async function sealServiceHistoryCrossing(value: unknown, keys: P256KeyMaterial, world: string, at: string) {
  return sealServiceMessage('history', historyRef(await verifyServiceHistory(value)), keys, world, at);
}
export async function verifyServiceHistoryCrossing(crossing: unknown, value: unknown) {
  const history = await verifyServiceHistory(value), { payload } = await inspectServiceMessage(crossing, 'history');
  if (!equal(payload, historyRef(history))) throw new Error('SERVICE_HISTORY_REFERENCE_MISMATCH'); return history;
}
