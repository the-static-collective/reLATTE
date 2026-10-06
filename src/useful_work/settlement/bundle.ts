import { exactKeys, integer, record } from '../job.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { equal } from '../audit_clock/wire.ts';
import { verifyExchange } from './exchange.ts';
import { inspectSettlementReceipt } from './observation.ts';
import { bounded, LIMITS, SETTLEMENT_LAWS } from './wire.ts';
import type { Wire } from './wire.ts';

export const settlementBundleId = (body: unknown) => 'useful-work-settlement-bundle-v1:' + domainHash('UsefulWork-SettlementBundle-v1|', body);
export interface SettlementBundleInput { exchange: Wire; observations: { observation: Wire; receipt: Wire }[] }
export async function createSettlementBundle(value: SettlementBundleInput) {
  bounded(value); const i = record(structuredClone(value), 'INVALID_SETTLEMENT_INVENTORY'); exactKeys(i, ['exchange', 'observations'], 'INVALID_SETTLEMENT_INVENTORY');
  const exchange = await verifyExchange(i.exchange);
  if (!Array.isArray(i.observations)) throw new Error('INVALID_SETTLEMENT_INVENTORY'); integer(i.observations.length, 0, 64, 'SETTLEMENT_INVENTORY_LIMIT');
  const observations = new Map<string, Awaited<ReturnType<typeof inspectSettlementReceipt>>>(), receipts = new Set<string>();
  for (const item of i.observations) {
    const e = record(item, 'INVALID_SETTLEMENT_ENTRY'); exactKeys(e, ['observation', 'receipt'], 'INVALID_SETTLEMENT_ENTRY');
    const verified = await inspectSettlementReceipt(exchange.bundle, e.observation, e.receipt);
    observations.set(verified.crossing.crossing_id, verified); receipts.add(verified.receipt.receipt_id);
  }
  const records = [...observations.values()].map(v => v.report);
  const groups = new Map<string, typeof records>();
  for (const r of records) {
    const key = domainHash('UsefulWork-ExternalRecordLabel-v1|', [r.adapter_identity, r.adapter, r.observed_transfer.system_ref, r.record_ref]);
    const group = groups.get(key) ?? []; group.push(r); groups.set(key, group);
  }
  const summary = { offer_id: exchange.offer.crossing.crossing_id, presentation_id: exchange.crossing.crossing_id,
    decision_id: exchange.bundle.decision.receipt_id, decision: exchange.report.choice, evidence_id: exchange.evidence.bundle.evidence_id,
    submitted_observations: i.observations.length, unique_observations: observations.size, unique_replay_receipts: receipts.size,
    replayed_observation_submissions: i.observations.length - observations.size, observations: records,
    repeated_external_record_labels: [...groups.values()].filter(g => g.length > 1).map(g => ({ record_ref: g[0].record_ref,
      observation_ids: g.map(v => v.observation_id), conflicting_record_contents: new Set(g.map(v => v.provenance.record_sha256)).size > 1 })),
    interpretation: 'Individual externally attributed records. No sums, spend accounting, exclusive record allocation, automatic transfer, obligation discharge or universal settlement status.',
    claims: { signatures_and_local_policy_replayed: true, presented_inventory_complete: false, aggregate_paid_amount_computed: false,
      record_labels_globally_unique: false, replay_caused_transfer: false, offer_fulfilled_asserted: false, ...LIMITS }, laws: [...SETTLEMENT_LAWS] };
  const body = { schema: 'useful-work.settlement-bundle/v1', exchange: exchange.bundle, observations: i.observations, summary };
  const bundle = { ...body, bundle_id: settlementBundleId(body) }; bounded(bundle); return bundle;
}
export async function verifySettlementBundle(value: unknown) {
  bounded(value); const b = record(structuredClone(value), 'INVALID_SETTLEMENT_BUNDLE'); exactKeys(b, ['schema', 'bundle_id', 'exchange', 'observations', 'summary'], 'INVALID_SETTLEMENT_BUNDLE');
  const { bundle_id, ...body } = b;
  if (b.schema !== 'useful-work.settlement-bundle/v1' || bundle_id !== settlementBundleId(body)) throw new Error('SETTLEMENT_BUNDLE_ID_MISMATCH');
  const rebuilt = await createSettlementBundle({ exchange: b.exchange, observations: b.observations });
  if (!equal(b, rebuilt)) throw new Error('SETTLEMENT_BUNDLE_REPLAY_MISMATCH'); return rebuilt;
}
