import { computeReceiptId, sealReceipt, verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { exactKeys, hashValue, record } from '../job.ts';
import { equal, instant, nonempty } from '../audit_clock/wire.ts';
import { compare, parseRational, subtract } from '../valuation/rational.ts';
import { enumeration, ORIGINS, parseTransfer } from './policy.ts';
import type { Origin, Transfer } from './policy.ts';
import { verifyExchange } from './exchange.ts';
import { bounded, identity, inspectMessage, LIMITS, sealMessage, SETTLEMENT_CONTRACT, SETTLEMENT_LAWS, signer, snapshot } from './wire.ts';
import type { Wire } from './wire.ts';

export const ADAPTER_SOURCES = { payment: 'external/payment-record/v1', 'credit-ledger': 'external/credit-ledger-record/v1', resource: 'external/resource-transfer-record/v1' } as const;
export interface SettlementInput {
  transfer: Transfer; record_ref: string; observed_at: string;
  provenance: { record_origin: Origin; provider_ref: string; adapter_version: string; record_sha256: string };
  evidence: Wire;
}
function projection(value: unknown) {
  bounded(value, 1_000_000); const p = record(value, 'INVALID_EXTERNAL_SETTLEMENT_RECORD');
  exactKeys(p, ['transfer', 'record_ref', 'observed_at', 'provenance', 'evidence'], 'INVALID_EXTERNAL_SETTLEMENT_RECORD');
  const transfer = parseTransfer(p.transfer); nonempty(p.record_ref); instant(p.observed_at);
  const provenance = record(p.provenance, 'INVALID_SETTLEMENT_PROVENANCE'); exactKeys(provenance, ['record_origin', 'provider_ref', 'adapter_version', 'record_sha256'], 'INVALID_SETTLEMENT_PROVENANCE');
  enumeration([provenance.record_origin], ORIGINS); nonempty(provenance.provider_ref); nonempty(provenance.adapter_version);
  const e = record(p.evidence, 'INVALID_SETTLEMENT_SOURCE_EVIDENCE');
  // The digest commits the imported adapter record. No claim that the provider actually authored it.
  if (provenance.record_sha256 !== recordHash({ transfer, record_ref: p.record_ref, evidence: e })) throw new Error('SETTLEMENT_RECORD_DIGEST_MISMATCH');
  switch (transfer.kind) {
    case 'payment':
      exactKeys(e, ['transaction_ref', 'status'], 'INVALID_PAYMENT_RECORD'); nonempty(e.transaction_ref);
      if (e.transaction_ref !== p.record_ref || e.status !== 'posted') throw new Error('PAYMENT_RECORD_NOT_POSTED'); break;
    case 'credit-ledger': {
      exactKeys(e, ['entry_ref', 'debit', 'credit'], 'INVALID_LEDGER_RECORD');
      if (e.entry_ref !== p.record_ref) throw new Error('LEDGER_RECORD_REFERENCE_MISMATCH');
      for (const [entry, account, delta] of [[e.debit, transfer.from_ref, 'debit'], [e.credit, transfer.to_ref, 'credit']] as const) {
        const b = record(entry, 'INVALID_LEDGER_BALANCE'); exactKeys(b, ['account_ref', 'before', 'after'], 'INVALID_LEDGER_BALANCE');
        const before = parseRational(b.before), after = parseRational(b.after);
        if (b.account_ref !== account || !equal(delta === 'debit' ? subtract(before, after) : subtract(after, before), transfer.amount)) throw new Error('LEDGER_CHANGE_AMOUNT_MISMATCH');
      } break;
    }
    case 'resource':
      exactKeys(e, ['transfer_ref', 'status'], 'INVALID_RESOURCE_TRANSFER_RECORD'); nonempty(e.transfer_ref);
      if (e.transfer_ref !== p.record_ref || e.status !== 'reported-delivered') throw new Error('RESOURCE_RECORD_NOT_REPORTED_DELIVERED'); break;
  }
  return { transfer, record_ref: p.record_ref as string, observed_at: p.observed_at as string,
    provenance: structuredClone(provenance) as SettlementInput['provenance'], evidence: structuredClone(e),
    measurement_source: ADAPTER_SOURCES[transfer.kind],
    claims: { payment_observed: transfer.kind === 'payment', credit_ledger_changed: transfer.kind === 'credit-ledger', resource_transferred: transfer.kind === 'resource',
      observation_basis: 'signed-adapter-record-claim/v1', source_record_digest_verified: true, ledger_arithmetic_replayed: transfer.kind === 'credit-ledger',
      provider_authenticity_verified: false, physical_delivery_verified: false, bank_finality_verified: false, legal_discharge_verified: false,
      ledger_persistence_verified: false, ownership_verified: false, exclusive_job_causation_verified: false, ...LIMITS } };
}
export const recordHash = (value: unknown) => hashValue(value);
function scope(v: Awaited<ReturnType<typeof verifyExchange>>) {
  return { offer_id: v.offer.crossing.crossing_id, presentation_id: v.crossing.crossing_id, decision_id: v.bundle.decision.receipt_id,
    evidence_id: v.evidence.bundle.evidence_id, result_id: v.evidence.native.result_id, work_crossing_id: v.evidence.native.crossing.crossing_id };
}
function authorized(v: Awaited<ReturnType<typeof verifyExchange>>, actor: Wire, p: ReturnType<typeof projection>, at: string) {
  if (v.report.choice !== 'ACCEPT') throw new Error('SETTLEMENT_REQUIRES_SPECIFIC_ACCEPTANCE');
  const adapter = v.offer.terms.settlement_adapter;
  if (!equal(signer(actor), adapter.identity)) throw new Error('SETTLEMENT_ADAPTER_IDENTITY_MISMATCH');
  if (equal(signer(actor).public_key, v.presenter.public_key) || actor.source_world === v.presenter.world_id) throw new Error('DISTINCT_PRESENTER_AND_SETTLEMENT_ADAPTER_REQUIRED');
  if (!adapter.allowed_record_origins.includes(p.provenance.record_origin)) throw new Error('SETTLEMENT_RECORD_ORIGIN_NOT_ADMITTED');
  if (instant(p.observed_at) < instant(v.bundle.decision.created_at) || instant(at) < instant(p.observed_at)) throw new Error('SETTLEMENT_OBSERVATION_TIME_MISMATCH');
}
function payload(v: Awaited<ReturnType<typeof verifyExchange>>, p: ReturnType<typeof projection>) {
  return { schema: `useful-work.${p.transfer.kind}-settlement-observation/v1`, scope: scope(v), ...p, laws: [...SETTLEMENT_LAWS] };
}
export async function observeSettlement(exchange: unknown, input: SettlementInput, keys: P256KeyMaterial, world: string, at: string) {
  const p = projection(structuredClone(input)), v = await verifyExchange(exchange);
  const crossing = await sealMessage('observation-' + p.transfer.kind, payload(v, p), keys, world, at);
  authorized(v, crossing, p, at); return crossing;
}
export async function inspectSettlement(exchange: unknown, value: unknown) {
  value = snapshot(value, 2_000_000); const v = await verifyExchange(exchange);
  const family = record(value, 'INVALID_SETTLEMENT_OBSERVATION').extensions?.organ_adapter?.family_ref;
  const kind = (Object.keys(ADAPTER_SOURCES) as (keyof typeof ADAPTER_SOURCES)[]).find(k => family === `organ:useful-work/settlement-observation-${k}-v1`);
  if (!kind) throw new Error('UNSUPPORTED_SETTLEMENT_ADAPTER');
  const { crossing, payload: signed } = await inspectMessage(value, 'observation-' + kind);
  const { schema, scope: _, measurement_source, claims, laws, ...input } = signed, p = projection(input);
  if (p.transfer.kind !== kind || !equal(signed, payload(v, p))) throw new Error('SETTLEMENT_SCOPE_OR_CLAIMS_MISMATCH');
  authorized(v, crossing, p, crossing.created_at);
  const expected = v.offer.terms.transfer, { amount: __, ...wanted } = expected, { amount: ___, ...actual } = p.transfer;
  const comparable = equal(wanted, actual), comparison = comparable ? compare(p.transfer.amount, expected.amount) : null;
  const report = { schema: 'useful-work.settlement-replay/v1', scope: scope(v), observation_id: crossing.crossing_id,
    adapter: kind, adapter_identity: signer(crossing), measurement_source: p.measurement_source, record_ref: p.record_ref,
    observed_at: p.observed_at, provenance: p.provenance, observed_transfer: p.transfer, offered_transfer: expected,
    terms_match: comparable && comparison === 0, amount_relation: comparison === null ? 'incomparable' : comparison < 0 ? 'less' : comparison > 0 ? 'greater' : 'equal',
    claims: { ...p.claims, adapter_signature_verified: true, acceptance_binding_verified: true, source_execution_verified: false,
      exclusive_record_use_verified: false, offer_fulfilled_asserted: false }, laws: [...SETTLEMENT_LAWS] };
  return { exchange: v, crossing, projection: p, report };
}
function replaySpec(report: Wire, world: string, at: string) {
  return { schema: 'relatte.receipt/v0' as const, crossing_id: report.observation_id, world_id: world,
    receiver_particular: 'particular:useful-work:settlement-replayer', kind: 'SETTLEMENT_OBSERVED', semantic_effect: 'none',
    contract_ref: SETTLEMENT_CONTRACT, pre_state_ref: null, post_state_ref: null, descendant_refs: [], residual_refs: [], created_at: at,
    note: 'An external adapter observation attributed and replayed against one ACCEPT receipt. No transfer is performed, guaranteed, made exclusive or declared universally final.',
    extensions: { useful_work_settlement: report } };
}
function separate(v: Awaited<ReturnType<typeof inspectSettlement>>, actor: { world_id: string; public_key: JsonWebKey }, at: string) {
  identity(actor);
  for (const i of [v.report.adapter_identity, v.exchange.offer.offerer, v.exchange.presenter])
    if (equal(actor.public_key, i.public_key) || actor.world_id === i.world_id) throw new Error('DISTINCT_SETTLEMENT_REPLAYER_REQUIRED');
  if (instant(at) < instant(v.crossing.created_at)) throw new Error('SETTLEMENT_REPLAY_PRECEDES_OBSERVATION');
}
export async function replaySettlement(exchange: unknown, observation: unknown, keys: P256KeyMaterial, world: string, at: string) {
  const v = await inspectSettlement(exchange, observation); separate(v, { world_id: world, public_key: keys.publicKeyJwk }, at);
  const receipt = await sealReceipt(replaySpec(v.report, world, at), keys); bounded(receipt, 2_000_000); return receipt;
}
export async function inspectSettlementReceipt(exchange: unknown, observation: unknown, value: unknown) {
  exchange = snapshot(exchange); observation = snapshot(observation, 2_000_000);
  bounded(value, 2_000_000); const receipt = structuredClone(value) as Wire;
  if (!await verifyReceipt(receipt)) throw new Error('INVALID_SETTLEMENT_RECEIPT_SIGNATURE');
  const v = await inspectSettlement(exchange, observation); separate(v, signer(receipt), receipt.created_at);
  if (receipt.receipt_id !== computeReceiptId({ ...replaySpec(v.report, receipt.world_id, receipt.created_at), signing: receipt.signing })) throw new Error('SETTLEMENT_RECEIPT_REPLAY_MISMATCH');
  return { ...v, receipt };
}
