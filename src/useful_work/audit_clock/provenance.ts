import { randomBytes } from 'node:crypto';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { digest } from '../challenge/commitment.ts';
import { inspectChallenge, nativeMessageSpec, sealNativeMessage } from '../merkle_native/exchange.ts';
import type { NativeContext, NativeChallenge } from '../merkle_native/exchange.ts';
import { assertSigner, crossingId, equal, expectedCrossingId, instant, inspectClockMessage, nonempty, sealClockMessage } from './wire.ts';
import type { Wire } from './wire.ts';
import { bindPlan, domainHash, inspectPlan, scheduleSlot } from './policy.ts';
import type { ClockObservation, ObservationKind, PlanContext, RandomnessEvent, ScheduledIssue } from './types.ts';

export async function emitRandomness(planValue: unknown, slotIndex: number, keys: P256KeyMaterial, at: string, valueHex = randomBytes(32).toString('hex')) {
  const p = await inspectPlan(planValue), slot = scheduleSlot(p.policy, slotIndex); digest(valueHex);
  if (!equal(keys.publicKeyJwk, p.policy.randomness_rule.public_key)) throw new Error('CLOCK_SIGNER_MISMATCH');
  const event: RandomnessEvent = { schema: 'useful-work.randomness-event/v1', stream_id: p.policy.randomness_rule.stream_id,
    sequence: slot.expected_randomness_sequence, value_hex: valueHex, emitted_at: at };
  const crossing = await sealClockMessage('randomness', event, keys, p.policy.randomness_rule.source_world, at);
  await inspectRandomness(p, crossing); return crossing;
}
export async function inspectRandomness(p: PlanContext, value: unknown) {
  const { crossing, payload: e } = await inspectClockMessage(value, 'randomness');
  exactKeys(e, ['schema', 'stream_id', 'sequence', 'value_hex', 'emitted_at'], 'INVALID_RANDOMNESS_EVENT');
  const rule = p.policy.randomness_rule;
  if (e.schema !== 'useful-work.randomness-event/v1' || e.stream_id !== rule.stream_id) throw new Error('RANDOMNESS_STREAM_MISMATCH');
  assertSigner(crossing, rule.public_key, rule.source_world); digest(e.value_hex);
  integer(e.sequence, rule.first_sequence, rule.first_sequence + p.policy.schedule.rounds - 1, 'RANDOMNESS_SEQUENCE_OUTSIDE_PLAN');
  const slot = scheduleSlot(p.policy, e.sequence - rule.first_sequence);
  if (crossing.created_at !== e.emitted_at || instant(e.emitted_at) < instant(slot.scheduled_at)) throw new Error('RANDOMNESS_BEFORE_SLOT');
  return { crossing, event: e as RandomnessEvent, slot };
}
export async function observe(planValue: unknown, kind: ObservationKind, slotIndex: number | null, subjectId: string | null,
  keys: P256KeyMaterial, at: string, note: string | null = null) {
  const p = await inspectPlan(planValue);
  if (!equal(keys.publicKeyJwk, p.policy.observer.public_key)) throw new Error('CLOCK_SIGNER_MISMATCH');
  const payload: ClockObservation = { schema: 'useful-work.audit-clock-observation/v1', plan_id: p.plan_id,
    plan_crossing_id: p.plan.crossing_id, slot_index: slotIndex, kind, subject_id: subjectId, observed_at: at, note };
  const crossing = await sealClockMessage('observation', payload, keys, p.policy.observer.world_id, at);
  await inspectObservation(p, crossing); return crossing;
}
export async function inspectObservation(p: PlanContext, value: unknown) {
  const { crossing, payload: o } = await inspectClockMessage(value, 'observation');
  exactKeys(o, ['schema', 'plan_id', 'plan_crossing_id', 'slot_index', 'kind', 'subject_id', 'observed_at', 'note'], 'INVALID_CLOCK_OBSERVATION');
  if (o.schema !== 'useful-work.audit-clock-observation/v1' || o.plan_id !== p.plan_id || o.plan_crossing_id !== p.plan.crossing_id || crossing.created_at !== o.observed_at) throw new Error('OBSERVATION_PLAN_MISMATCH');
  assertSigner(crossing, p.policy.observer.public_key, p.policy.observer.world_id);
  const time = instant(o.observed_at);
  if (o.note !== null) nonempty(o.note);
  if (o.kind === 'PLAN_PUBLISHED') {
    if (o.slot_index !== null || o.subject_id !== p.plan.crossing_id || time < instant(p.policy.declared_at) || time >= instant(p.policy.schedule.starts_at)) throw new Error('PUBLICATION_MUST_PRECEDE_SCHEDULE');
  } else {
    const slot = scheduleSlot(p.policy, o.slot_index);
    if (time < instant(slot.scheduled_at)) throw new Error('OBSERVATION_BEFORE_SLOT');
    if (['ISSUE_SEEN', 'RESPONSE_SEEN'].includes(o.kind)) crossingId(o.subject_id);
    else if (['MISS_REPORTED', 'UNAVAILABLE_REPORTED'].includes(o.kind)) {
      if (o.subject_id !== null || (o.kind === 'MISS_REPORTED' && time <= instant(slot.issue_deadline))) throw new Error('INVALID_ABSENCE_OBSERVATION');
    } else throw new Error('UNSUPPORTED_CLOCK_OBSERVATION');
  }
  return { crossing, observation: o as ClockObservation };
}
export function scheduledNonce(p: PlanContext, slotIndex: number, eventId: string) {
  crossingId(eventId); const slot = scheduleSlot(p.policy, slotIndex);
  return domainHash('UsefulWork-ScheduledChallenge-v1|', { plan_id: p.plan_id, slot_id: slot.slot_id, randomness_event_id: eventId });
}
function issuancePayload(p: PlanContext, slotIndex: number, event: Wire, publication: Wire, challengeId: string) {
  const slot = scheduleSlot(p.policy, slotIndex);
  return { schema: 'useful-work.audit-issuance/v1', plan_id: p.plan_id, slot_id: slot.slot_id, slot_index: slotIndex,
    randomness_event_id: event.crossing_id, publication_observation_id: publication.crossing_id, challenge_id: challengeId };
}
export async function issueScheduledChallenge(context: NativeContext, planValue: unknown, publicationValue: unknown, eventValue: unknown, keys: P256KeyMaterial): Promise<ScheduledIssue> {
  const p = await inspectPlan(planValue); context = await bindPlan(context, p);
  const publication = await inspectObservation(p, publicationValue), e = await inspectRandomness(p, eventValue);
  if (publication.observation.kind !== 'PLAN_PUBLISHED') throw new Error('PUBLICATION_REQUIRED');
  if (instant(e.event.emitted_at) > instant(e.slot.issue_deadline)) throw new Error('RANDOMNESS_AFTER_ISSUE_WINDOW');
  if (!equal(keys.publicKeyJwk, p.policy.challenger.public_key)) throw new Error('CLOCK_SIGNER_MISMATCH');
  const payload: NativeChallenge = { schema: 'useful-work.merkle-challenge/v1', work_crossing_id: context.crossing.crossing_id,
    result_id: p.policy.result_id, sample_count: p.policy.sample_count, nonce: scheduledNonce(p, e.slot.index, e.crossing.crossing_id) };
  const challenge = await sealNativeMessage('challenge', payload, keys, e.event.emitted_at, p.policy.challenger.world_id);
  const issuance = await sealClockMessage('issuance', issuancePayload(p, e.slot.index, e.crossing, publication.crossing, challenge.crossing_id),
    keys, p.policy.challenger.world_id, e.event.emitted_at);
  return { issuance, challenge };
}
export async function inspectScheduledIssue(context: NativeContext, p: PlanContext, publicationValue: unknown, eventValue: unknown, value: unknown) {
  const issue = record(value, 'INVALID_SCHEDULED_ISSUE'); exactKeys(issue, ['issuance', 'challenge'], 'INVALID_SCHEDULED_ISSUE');
  const publication = await inspectObservation(p, publicationValue), e = await inspectRandomness(p, eventValue);
  if (publication.observation.kind !== 'PLAN_PUBLISHED') throw new Error('PUBLICATION_REQUIRED');
  if (instant(e.event.emitted_at) > instant(e.slot.issue_deadline)) throw new Error('RANDOMNESS_AFTER_ISSUE_WINDOW');
  const { crossing, payload } = await inspectClockMessage(issue.issuance, 'issuance');
  assertSigner(crossing, p.policy.challenger.public_key, p.policy.challenger.world_id);
  const ch = await inspectChallenge(context, issue.challenge);
  const expected: NativeChallenge = { schema: 'useful-work.merkle-challenge/v1', work_crossing_id: p.policy.work_crossing_id,
    result_id: p.policy.result_id, sample_count: p.policy.sample_count, nonce: scheduledNonce(p, e.slot.index, e.crossing.crossing_id) };
  if (ch.crossing.crossing_id !== expectedCrossingId(nativeMessageSpec('challenge', expected, e.event.emitted_at, p.policy.challenger.world_id), p.policy.challenger.public_key)) throw new Error('SCHEDULED_CHALLENGE_DERIVATION_MISMATCH');
  if (!equal(payload, issuancePayload(p, e.slot.index, e.crossing, publication.crossing, ch.crossing.crossing_id)) || crossing.created_at !== e.event.emitted_at) throw new Error('ISSUANCE_SLOT_BINDING_MISMATCH');
  return { issuance: crossing, challenge: ch.crossing, indices: ch.indices, slot: e.slot, event: e.crossing };
}
