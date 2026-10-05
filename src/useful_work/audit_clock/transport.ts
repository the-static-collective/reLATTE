import type { P256KeyMaterial } from '../../protocol.ts';
import { exactKeys } from '../job.ts';
import { CLOCK_LAWS, equal, inspectClockMessage, sealClockMessage } from './wire.ts';
import { verifyHistory } from './history.ts';
import type { AuditHistory } from './types.ts';

const ref = (h: AuditHistory) => ({ history_id: h.history_id, plan_id: h.summary.plan_id, result_id: h.summary.result_id, laws: [...CLOCK_LAWS], complete_history_asserted: false });
export async function sealHistoryCrossing(value: unknown, keys: P256KeyMaterial, at: string) {
  const { history } = await verifyHistory(value);
  return sealClockMessage('history', ref(history), keys, 'world:useful-work-audit-clock-holder', at);
}
export async function verifyHistoryCrossing(crossingValue: unknown, value: unknown) {
  const verified = await verifyHistory(value), { payload } = await inspectClockMessage(crossingValue, 'history');
  exactKeys(payload, Object.keys(ref(verified.history)), 'INVALID_HISTORY_REFERENCE');
  if (!equal(payload, ref(verified.history))) throw new Error('HISTORY_CROSSING_REFERENCE_MISMATCH');
  return verified;
}
