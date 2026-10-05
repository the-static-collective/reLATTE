import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { digest } from '../challenge/commitment.ts';
import { parseResultId } from '../merkle_native/result.ts';
import type { NativeContext } from '../merkle_native/exchange.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { crossingId, equal, instant, iso, inspectClockMessage, nonempty, publicKey, sealClockMessage, signerKey } from './wire.ts';
import type { AuditPolicy, PlanContext, ScheduledSlot } from './types.ts';

export const MAX_PLAN_ROUNDS = 256;
export const domainHash = (domain: string, value: unknown) => sha256Hex(Buffer.concat([Buffer.from(domain), canonicalBytes(value)]));
export const planId = (policy: AuditPolicy) => 'useful-work-audit-plan-v1:' + domainHash('UsefulWork-AuditPlan-v1|', policy);
export function scheduleSlot(policy: AuditPolicy, index: number): ScheduledSlot {
  integer(index, 0, policy.schedule.rounds - 1, 'INVALID_AUDIT_SLOT');
  const start = instant(policy.schedule.starts_at) + index * policy.schedule.cadence_ms;
  const id = planId(policy);
  return { index, slot_id: 'useful-work-audit-slot-v1:' + domainHash('UsefulWork-AuditSlot-v1|', { plan_id: id, index }),
    scheduled_at: iso(start), issue_deadline: iso(start + policy.schedule.issue_window_ms),
    response_deadline: iso(start + policy.schedule.issue_window_ms + policy.schedule.response_window_ms),
    expected_randomness_sequence: policy.randomness_rule.first_sequence + index };
}
export function parsePolicy(value: unknown): AuditPolicy {
  canonicalBytes(value);
  const p = record(value, 'INVALID_AUDIT_POLICY');
  exactKeys(p, ['schema', 'result_id', 'work_crossing_id', 'job_spec_hash', 'declared_at', 'sample_count', 'expires_at', 'schedule', 'randomness_rule', 'challenge_rule', 'challenger', 'observer'], 'INVALID_AUDIT_POLICY_FIELDS');
  if (p.schema !== 'useful-work.audit-plan/v1' || p.challenge_rule !== 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1') throw new Error('UNSUPPORTED_AUDIT_POLICY');
  parseResultId(p.result_id); crossingId(p.work_crossing_id); digest(p.job_spec_hash); integer(p.sample_count, 1, 64, 'INVALID_SAMPLE_COUNT');
  const s = record(p.schedule, 'INVALID_AUDIT_SCHEDULE'); exactKeys(s, ['starts_at', 'cadence_ms', 'rounds', 'issue_window_ms', 'response_window_ms'], 'INVALID_AUDIT_SCHEDULE_FIELDS');
  integer(s.rounds, 1, MAX_PLAN_ROUNDS, 'INVALID_AUDIT_ROUNDS');
  for (const field of ['cadence_ms', 'issue_window_ms', 'response_window_ms']) integer(s[field], 1, 86_400_000, 'INVALID_AUDIT_WINDOW');
  if (instant(p.declared_at) >= instant(s.starts_at)) throw new Error('PLAN_MUST_PRECEDE_SCHEDULE');
  const r = record(p.randomness_rule, 'INVALID_RANDOMNESS_RULE'); exactKeys(r, ['schema', 'source_world', 'public_key', 'stream_id', 'first_sequence'], 'INVALID_RANDOMNESS_RULE_FIELDS');
  if (r.schema !== 'signed-external-event/v1') throw new Error('UNSUPPORTED_RANDOMNESS_RULE');
  nonempty(r.source_world); nonempty(r.stream_id); publicKey(r.public_key);
  integer(r.first_sequence, 0, Number.MAX_SAFE_INTEGER - MAX_PLAN_ROUNDS, 'INVALID_RANDOMNESS_SEQUENCE');
  for (const field of ['challenger', 'observer']) {
    const identity = record(p[field], 'INVALID_CLOCK_IDENTITY'); exactKeys(identity, ['world_id', 'public_key'], 'INVALID_CLOCK_IDENTITY'); nonempty(identity.world_id); publicKey(identity.public_key);
  }
  if (equal(r.public_key, p.challenger.public_key) || equal(r.public_key, p.observer.public_key) || equal(p.challenger.public_key, p.observer.public_key)) throw new Error('DISTINCT_ATTRIBUTION_KEYS_REQUIRED');
  const policy = structuredClone(p) as AuditPolicy;
  if (instant(policy.expires_at) !== instant(scheduleSlot(policy, s.rounds - 1).response_deadline)) throw new Error('PLAN_EXPIRY_MISMATCH');
  return policy;
}
export async function publishPlan(value: unknown, keys: P256KeyMaterial) {
  const policy = parsePolicy(value);
  if (equal(signerKey({ signing: { public_key: keys.publicKeyJwk } }), policy.randomness_rule.public_key)) throw new Error('EXTERNAL_RANDOMNESS_KEY_REQUIRED');
  await validatePolicyKeys(policy);
  return sealClockMessage('plan', { plan_id: planId(policy), policy }, keys, 'world:useful-work-audit-planner', policy.declared_at);
}
export async function inspectPlan(value: unknown): Promise<PlanContext> {
  const { crossing, payload } = await inspectClockMessage(value, 'plan'); exactKeys(payload, ['plan_id', 'policy'], 'INVALID_PLAN_MESSAGE');
  const policy = parsePolicy(payload.policy);
  if (payload.plan_id !== planId(policy) || crossing.created_at !== policy.declared_at) throw new Error('PLAN_ID_MISMATCH');
  if (equal(signerKey(crossing), policy.randomness_rule.public_key)) throw new Error('EXTERNAL_RANDOMNESS_KEY_REQUIRED');
  await validatePolicyKeys(policy);
  return { plan: crossing, policy, plan_id: payload.plan_id };
}
async function validatePolicyKeys(policy: AuditPolicy) {
  try {
    for (const key of [policy.randomness_rule.public_key, policy.challenger.public_key, policy.observer.public_key]) await crypto.subtle.importKey('jwk', key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  } catch { throw new Error('INVALID_CLOCK_PUBLIC_KEY'); }
}
export async function bindPlan(context: NativeContext, plan: PlanContext) {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  if (plan.policy.result_id !== context.result_id || plan.policy.work_crossing_id !== context.crossing.crossing_id || plan.policy.job_spec_hash !== context.header.job_spec_hash) throw new Error('PLAN_WORK_MISMATCH');
  integer(plan.policy.sample_count, 1, Math.min(64, context.job.width * context.job.height), 'INVALID_SAMPLE_COUNT');
  return context;
}
