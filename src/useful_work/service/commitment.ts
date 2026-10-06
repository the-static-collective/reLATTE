import type { P256KeyMaterial } from '../../protocol.ts';
import { exactKeys, record } from '../job.ts';
import { bindPlan, inspectPlan } from '../audit_clock/policy.ts';
import type { PlanContext } from '../audit_clock/types.ts';
import { assertSigner, equal, instant, nonempty, publicKey } from '../audit_clock/wire.ts';
import type { NativeContext } from '../merkle_native/exchange.ts';
import { endpoint, inspectServiceMessage, sealServiceMessage } from './wire.ts';
import type { Wire } from './wire.ts';

export interface ServiceCommitment {
  schema: 'useful-work.service-commitment/v1'; result_id: string; work_crossing_id: string;
  plan_id: string; plan_crossing_id: string; counts_root: string; chunk_rule: 'native-pixel-jcs/v1';
  declared_at: string; service_window: { starts_at: string; ends_at: string };
  endpoint: string; host: { world_id: string; public_key: JsonWebKey };
}
export interface ServiceContext { native: NativeContext; plan: PlanContext; commitment: Wire; declaration: ServiceCommitment }
export async function inspectCommitment(native: NativeContext, planValue: unknown, value: unknown): Promise<ServiceContext> {
  const plan = await inspectPlan(planValue); native = await bindPlan(native, plan);
  const { crossing, payload: c } = await inspectServiceMessage(value, 'commitment');
  exactKeys(c, ['schema', 'result_id', 'work_crossing_id', 'plan_id', 'plan_crossing_id', 'counts_root', 'chunk_rule', 'declared_at', 'service_window', 'endpoint', 'host'], 'INVALID_SERVICE_COMMITMENT');
  if (c.schema !== 'useful-work.service-commitment/v1' || c.chunk_rule !== 'native-pixel-jcs/v1') throw new Error('UNSUPPORTED_SERVICE_COMMITMENT');
  if (c.result_id !== native.result_id || c.work_crossing_id !== native.crossing.crossing_id || c.counts_root !== native.header.counts_root ||
      c.plan_id !== plan.plan_id || c.plan_crossing_id !== plan.plan.crossing_id) throw new Error('SERVICE_CONTEXT_MISMATCH');
  const window = record(c.service_window, 'INVALID_SERVICE_WINDOW'); exactKeys(window, ['starts_at', 'ends_at'], 'INVALID_SERVICE_WINDOW');
  if (window.starts_at !== plan.policy.schedule.starts_at || window.ends_at !== plan.policy.expires_at ||
      instant(c.declared_at) < instant(plan.policy.declared_at) || instant(c.declared_at) >= instant(window.starts_at) || c.declared_at !== crossing.created_at) throw new Error('INVALID_SERVICE_WINDOW');
  const host = record(c.host, 'INVALID_SERVICE_HOST'); exactKeys(host, ['world_id', 'public_key'], 'INVALID_SERVICE_HOST');
  nonempty(host.world_id); publicKey(host.public_key); endpoint(c.endpoint);
  assertSigner(crossing, host.public_key, host.world_id);
  for (const key of [plan.policy.observer.public_key, plan.policy.challenger.public_key, plan.policy.randomness_rule.public_key])
    if (equal(host.public_key, key)) throw new Error('DISTINCT_SERVICE_ROLE_KEYS_REQUIRED');
  return { native, plan, commitment: crossing, declaration: structuredClone(c) as ServiceCommitment };
}
export const recheckService = (s: ServiceContext) => inspectCommitment(s.native, s.plan.plan, s.commitment);
export async function commitService(native: NativeContext, planValue: unknown, url: string, keys: P256KeyMaterial, world: string, at: string) {
  const p = await inspectPlan(planValue); native = await bindPlan(native, p);
  const payload: ServiceCommitment = { schema: 'useful-work.service-commitment/v1', result_id: native.result_id,
    work_crossing_id: native.crossing.crossing_id, plan_id: p.plan_id, plan_crossing_id: p.plan.crossing_id,
    counts_root: native.header.counts_root, chunk_rule: 'native-pixel-jcs/v1', declared_at: at,
    service_window: { starts_at: p.policy.schedule.starts_at, ends_at: p.policy.expires_at }, endpoint: url,
    host: { world_id: world, public_key: keys.publicKeyJwk } };
  const crossing = await sealServiceMessage('commitment', payload, keys, world, at);
  await inspectCommitment(native, planValue, crossing); return crossing;
}
export async function publishService(s: ServiceContext, keys: P256KeyMaterial, at: string) {
  s = await recheckService(s);
  const payload = { schema: 'useful-work.service-publication/v1', commitment_id: s.commitment.crossing_id,
    plan_id: s.plan.plan_id, plan_crossing_id: s.plan.plan.crossing_id, observed_at: at };
  const crossing = await sealServiceMessage('publication', payload, keys, s.plan.policy.observer.world_id, at);
  await inspectPublication(s, crossing); return crossing;
}
export async function inspectPublication(s: ServiceContext, value: unknown) {
  s = await recheckService(s);
  const { crossing, payload } = await inspectServiceMessage(value, 'publication');
  const expected = { schema: 'useful-work.service-publication/v1', commitment_id: s.commitment.crossing_id,
    plan_id: s.plan.plan_id, plan_crossing_id: s.plan.plan.crossing_id, observed_at: crossing.created_at };
  if (!equal(payload, expected) || instant(payload.observed_at) < instant(s.declaration.declared_at) ||
      instant(payload.observed_at) >= instant(s.declaration.service_window.starts_at)) throw new Error('SERVICE_PUBLICATION_MUST_PRECEDE_SCHEDULE');
  assertSigner(crossing, s.plan.policy.observer.public_key, s.plan.policy.observer.world_id);
  return crossing;
}
