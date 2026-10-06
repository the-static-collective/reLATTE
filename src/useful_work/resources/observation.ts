import { computeReceiptId, sealReceipt, verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { digest } from '../challenge/commitment.ts';
import { equal, instant, nonempty, signerKey } from '../audit_clock/wire.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import type { NativeContext } from '../merkle_native/exchange.ts';
import { cpuProjection } from './cpu.ts';
import { energyProjection } from './energy.ts';
import { storageProjection } from './storage.ts';
import { networkProjection } from './network.ts';
import { contractFor, inspectResourceMessage, sealResourceMessage, RESOURCE_KINDS, RESOURCE_LAWS, NON_AUTHORITY, MAX_RESOURCE_MESSAGE_BYTES } from './wire.ts';
import type { ResourceKind, Wire } from './wire.ts';

export interface CollectorProvenance {
  host_ref: string; runtime: string; collector_source_sha256: string;
  capture_mode: 'live-local/v1' | 'imported-records/v1' | 'signed-meter-ingest/v1';
}
export interface ResourceScope {
  result_id: string; work_crossing_id: string; job_spec_hash: string; execution_ref: string | null;
  association_basis: 'collector-declared/v1';
}
const checkedNative = (n: NativeContext) => inspectNativeWork(n.crossing, n.jobBytes);
export function resourceScope(n: NativeContext, executionRef: string | null): ResourceScope {
  if (executionRef !== null) nonempty(executionRef);
  return { result_id: n.result_id, work_crossing_id: n.crossing.crossing_id, job_spec_hash: n.header.job_spec_hash,
    execution_ref: executionRef, association_basis: 'collector-declared/v1' };
}
function provenanceAt(value: unknown, kind: ResourceKind): CollectorProvenance {
  const p = record(value, 'INVALID_COLLECTOR_PROVENANCE'); exactKeys(p, ['host_ref', 'runtime', 'collector_source_sha256', 'capture_mode'], 'INVALID_COLLECTOR_PROVENANCE');
  nonempty(p.host_ref); nonempty(p.runtime); digest(p.collector_source_sha256);
  if (!(kind === 'energy' ? ['signed-meter-ingest/v1'] : ['live-local/v1', 'imported-records/v1']).includes(p.capture_mode)) throw new Error('UNSUPPORTED_COLLECTOR_CAPTURE_MODE');
  return structuredClone(p) as CollectorProvenance;
}
async function project(kind: ResourceKind, evidence: unknown, native: NativeContext) {
  switch (kind) {
    case 'cpu': return cpuProjection(evidence);
    case 'energy': return energyProjection(evidence);
    case 'storage': return storageProjection(evidence, native);
    case 'network': return networkProjection(evidence);
  }
}
export async function signObservation(native: NativeContext, kind: ResourceKind, evidence: unknown, provenance: CollectorProvenance,
  keys: P256KeyMaterial, world: string, at: string, executionRef: string | null = null) {
  native = await checkedNative(native);
  if (!RESOURCE_KINDS.includes(kind)) throw new Error('UNSUPPORTED_RESOURCE_ADAPTER');
  const projection = await project(kind, evidence, native);
  const payload = { schema: `useful-work.${kind}-observation/v1`, measurement_source: projection.measurement_source,
    scope: resourceScope(native, executionRef), provenance: provenanceAt(provenance, kind), evidence,
    observed: projection.observed, claims: { ...projection.claims, ...NON_AUTHORITY } };
  const crossing = await sealResourceMessage(kind, payload, keys, world, at);
  await inspectObservation(native, crossing); return crossing;
}
export async function inspectObservation(native: NativeContext, value: unknown) {
  native = await checkedNative(native);
  if (canonicalBytes(value).length > MAX_RESOURCE_MESSAGE_BYTES) throw new Error('RESOURCE_MESSAGE_SIZE_LIMIT');
  const envelope = record(value, 'INVALID_RESOURCE_OBSERVATION'), family = envelope.extensions?.organ_adapter?.family_ref;
  const kind = RESOURCE_KINDS.find(k => family === `organ:useful-work/resource-${k}-v1`);
  if (!kind) throw new Error('UNSUPPORTED_RESOURCE_ADAPTER');
  const { crossing, payload: p } = await inspectResourceMessage(value, kind);
  exactKeys(p, ['schema', 'measurement_source', 'scope', 'provenance', 'evidence', 'observed', 'claims'], 'INVALID_RESOURCE_OBSERVATION');
  if (p.schema !== `useful-work.${kind}-observation/v1`) throw new Error('UNSUPPORTED_RESOURCE_OBSERVATION');
  const scope = record(p.scope, 'INVALID_RESOURCE_SCOPE');
  if (!equal(scope, resourceScope(native, scope.execution_ref))) throw new Error('RESOURCE_OBSERVATION_CONTEXT_MISMATCH');
  const provenance = provenanceAt(p.provenance, kind), projection = await project(kind, p.evidence, native);
  if (p.measurement_source !== projection.measurement_source || !equal(p.observed, projection.observed) ||
      !equal(p.claims, { ...projection.claims, ...NON_AUTHORITY })) throw new Error('RESOURCE_OBSERVATION_REPLAY_MISMATCH');
  if (instant(crossing.created_at) < instant(projection.finished_at)) throw new Error('RESOURCE_SIGNED_BEFORE_OBSERVATION');
  if (kind === 'energy' && equal(signerKey(crossing), p.evidence.meter.public_key)) throw new Error('DISTINCT_METER_AND_COLLECTOR_KEYS_REQUIRED');
  return { crossing, kind, projection, provenance, scope: scope as ResourceScope,
    report: { schema: 'useful-work.resource-replay/v1', adapter: kind, measurement_id: crossing.crossing_id,
      measurement_source: projection.measurement_source, scope, collector: { world_id: crossing.source_world, public_key: signerKey(crossing) },
      provenance, observed: projection.observed, claims: { ...projection.claims, ...NON_AUTHORITY,
        measurement_signature_verified: true, collector_source_execution_verified: false },
      started_at: projection.started_at, finished_at: projection.finished_at, laws: [...RESOURCE_LAWS] } };
}
function receiptSpec(report: Wire, world: string, at: string) {
  return { schema: 'relatte.receipt/v0' as const, crossing_id: report.measurement_id, world_id: world,
    receiver_particular: 'particular:useful-work:resource-replayer', kind: 'VERIFIED', semantic_effect: 'none' as const,
    contract_ref: contractFor(report.adapter), pre_state_ref: null, post_state_ref: null, descendant_refs: [], residual_refs: [],
    note: 'Signature, adapter provenance structure and counter/content arithmetic replayed. Physical collection, exclusive work, causation and economic value are unverified.',
    created_at: at, extensions: { useful_work_resource: report } };
}
function separateVerifier(verified: Awaited<ReturnType<typeof inspectObservation>>, key: JsonWebKey, world: string, at: string) {
  nonempty(world);
  if (equal(key, signerKey(verified.crossing)) || world === verified.crossing.source_world ||
      (verified.kind === 'energy' && equal(key, verified.crossing.extensions.organ_adapter.donor_claims.resource_energy.evidence.meter.public_key))) throw new Error('DISTINCT_RESOURCE_VERIFIER_REQUIRED');
  if (instant(at) < instant(verified.crossing.created_at)) throw new Error('RESOURCE_RECEIPT_PRECEDES_MEASUREMENT');
}
export async function replayObservation(native: NativeContext, measurement: unknown, keys: P256KeyMaterial, world: string, at: string) {
  const v = await inspectObservation(native, measurement); separateVerifier(v, keys.publicKeyJwk, world, at);
  return sealReceipt(receiptSpec(v.report, world, at), keys);
}
export async function inspectObservationReceipt(native: NativeContext, measurement: unknown, value: unknown) {
  if (canonicalBytes(value).length > 1_000_000 || !await verifyReceipt(value)) throw new Error('INVALID_RESOURCE_RECEIPT_SIGNATURE');
  const receipt = structuredClone(value) as Wire, v = await inspectObservation(native, measurement);
  separateVerifier(v, signerKey(receipt), receipt.world_id, receipt.created_at);
  if (receipt.receipt_id !== computeReceiptId({ ...receiptSpec(v.report, receipt.world_id, receipt.created_at), signing: receipt.signing })) throw new Error('RESOURCE_RECEIPT_REPLAY_MISMATCH');
  return { receipt, ...v };
}
