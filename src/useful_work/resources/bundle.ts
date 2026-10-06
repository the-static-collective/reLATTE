import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { equal } from '../audit_clock/wire.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { inspectObservationReceipt } from './observation.ts';
import { inspectResourceMessage, sealResourceMessage, RESOURCE_KINDS, RESOURCE_LAWS } from './wire.ts';
import type { Wire } from './wire.ts';

export interface ResourceInput { job_spec: RenderJob; work: Wire; observations: { measurement: Wire; receipt: Wire }[] }
export const MAX_RESOURCE_BUNDLE_BYTES = 64 * 1024 * 1024;
export const resourceBundleId = (body: unknown) => 'useful-work-resource-bundle-v1:' + domainHash('UsefulWork-ResourceBundle-v1|', body);
export async function createResourceBundle(value: ResourceInput) {
  if (canonicalBytes(value).length > MAX_RESOURCE_BUNDLE_BYTES) throw new Error('RESOURCE_BUNDLE_SIZE_LIMIT');
  const i = record(value, 'INVALID_RESOURCE_INPUT'); exactKeys(i, ['job_spec', 'work', 'observations'], 'INVALID_RESOURCE_INPUT');
  if (!Array.isArray(i.observations)) throw new Error('INVALID_RESOURCE_INVENTORY'); integer(i.observations.length, 0, 128, 'RESOURCE_INVENTORY_LIMIT');
  const job = parseJob(i.job_spec), native = await inspectNativeWork(i.work, canonicalBytes(job));
  const measurements = new Map<string, Awaited<ReturnType<typeof inspectObservationReceipt>>>(), receipts = new Set<string>();
  for (const entry of i.observations) {
    const e = record(entry, 'INVALID_RESOURCE_ENTRY'); exactKeys(e, ['measurement', 'receipt'], 'INVALID_RESOURCE_ENTRY');
    const v = await inspectObservationReceipt(native, e.measurement, e.receipt); measurements.set(v.crossing.crossing_id, v); receipts.add(v.receipt.receipt_id);
  }
  const summary = { result_id: native.result_id, work_crossing_id: native.crossing.crossing_id,
    submitted_observations: i.observations.length, unique_measurements: measurements.size, unique_replay_receipts: receipts.size,
    replayed_measurement_submissions: i.observations.length - measurements.size,
    by_adapter: Object.fromEntries(RESOURCE_KINDS.map(kind => [kind, [...measurements.values()].filter(v => v.kind === kind).map(v => ({
      measurement_id: v.crossing.crossing_id, measurement_source: v.report.measurement_source, collector: v.report.collector,
      scope: v.scope, provenance: v.provenance, observed: v.report.observed, claims: v.report.claims,
      started_at: v.report.started_at, finished_at: v.report.finished_at }))])),
    interpretation: 'Scoped source observations; overlapping intervals, shared meters and repeated snapshots are retained without summing or selecting an exclusive job cost.',
    claims: { arithmetic_and_signatures_replayed: true, source_observations_are_attributed: true, observed_history_complete: false,
      aggregate_job_resource_cost_computed: false, economic_value_asserted: false, authority_asserted: false }, laws: [...RESOURCE_LAWS] };
  const body = { schema: 'useful-work.resource-bundle/v1', job_spec: job, work: native.crossing, observations: structuredClone(i.observations), summary };
  if (canonicalBytes(body).length > MAX_RESOURCE_BUNDLE_BYTES - 128) throw new Error('RESOURCE_BUNDLE_SIZE_LIMIT');
  return { ...body, bundle_id: resourceBundleId(body) };
}
export type ResourceBundle = Awaited<ReturnType<typeof createResourceBundle>>;
export async function verifyResourceBundle(value: unknown) {
  if (canonicalBytes(value).length > MAX_RESOURCE_BUNDLE_BYTES) throw new Error('RESOURCE_BUNDLE_SIZE_LIMIT');
  const b = record(value, 'INVALID_RESOURCE_BUNDLE'); exactKeys(b, ['schema', 'bundle_id', 'job_spec', 'work', 'observations', 'summary'], 'INVALID_RESOURCE_BUNDLE');
  const { schema, bundle_id, summary, ...input } = b;
  if (schema !== 'useful-work.resource-bundle/v1' || bundle_id !== resourceBundleId({ schema, ...input, summary })) throw new Error('RESOURCE_BUNDLE_ID_MISMATCH');
  const rebuilt = await createResourceBundle(input as ResourceInput);
  if (bundle_id !== rebuilt.bundle_id || !equal(summary, rebuilt.summary)) throw new Error('RESOURCE_BUNDLE_REPLAY_MISMATCH'); return rebuilt;
}
function reference(b: ResourceBundle) {
  return { bundle_id: b.bundle_id, result_id: b.summary.result_id, work_crossing_id: b.summary.work_crossing_id,
    inventory: b.observations.map(e => ({ measurement_id: e.measurement.crossing_id, receipt_id: e.receipt.receipt_id })), complete_history_asserted: false };
}
export async function sealResourceBundleCrossing(value: unknown, keys: P256KeyMaterial, world: string, at: string) {
  return sealResourceMessage('inventory', reference(await verifyResourceBundle(value)), keys, world, at);
}
export async function verifyResourceBundleCrossing(crossing: unknown, value: unknown) {
  const b = await verifyResourceBundle(value), { payload } = await inspectResourceMessage(crossing, 'inventory');
  if (!equal(payload, reference(b))) throw new Error('RESOURCE_INVENTORY_REFERENCE_MISMATCH'); return b;
}
