import { computeReceiptId, sealReceipt, verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { exactKeys, record } from '../job.ts';
import { equal, instant, nonempty, crossingId } from '../audit_clock/wire.ts';
import { parseResultId } from '../merkle_native/result.ts';
import { digest } from '../challenge/commitment.ts';
import { acceptancePolicyId, enumeration, ORIGINS, parseAcceptancePolicy, parseTransfer } from './policy.ts';
import type { AcceptancePolicy, Origin, Transfer } from './policy.ts';
import { evidenceReference, evaluateAcceptance, latestSignedAt, verifyEvidence } from './evidence.ts';
import { bounded, identity, inspectMessage, LIMITS, sealMessage, SETTLEMENT_CONTRACT, SETTLEMENT_LAWS, signer, snapshot } from './wire.ts';
import type { Identity, Wire } from './wire.ts';

export interface OfferTerms {
  description: string; transfer: Transfer; policy: AcceptancePolicy; present_before: string;
  eligible_presenter: Identity | null; target: { result_id: string; work_crossing_id: string; job_spec_hash: string } | null;
  settlement_adapter: { identity: Identity; allowed_record_origins: Origin[] };
}
function terms(value: unknown): OfferTerms {
  const t = record(value, 'INVALID_OFFER_TERMS'); exactKeys(t, ['description', 'transfer', 'policy', 'present_before', 'eligible_presenter', 'target', 'settlement_adapter'], 'INVALID_OFFER_TERMS');
  nonempty(t.description); instant(t.present_before);
  const transfer = parseTransfer(t.transfer), policy = parseAcceptancePolicy(t.policy), eligible = t.eligible_presenter === null ? null : identity(t.eligible_presenter);
  if (t.target !== null) {
    const target = record(t.target, 'INVALID_OFFER_TARGET'); exactKeys(target, ['result_id', 'work_crossing_id', 'job_spec_hash'], 'INVALID_OFFER_TARGET');
    parseResultId(target.result_id); crossingId(target.work_crossing_id); digest(target.job_spec_hash);
  }
  const s = record(t.settlement_adapter, 'INVALID_OFFER_SETTLEMENT_ADAPTER'); exactKeys(s, ['identity', 'allowed_record_origins'], 'INVALID_OFFER_SETTLEMENT_ADAPTER');
  const origins = enumeration(s.allowed_record_origins, ORIGINS); if (!origins.length) throw new Error('EMPTY_SETTLEMENT_ORIGIN_POLICY');
  return { ...structuredClone(t), transfer, policy, eligible_presenter: eligible,
    settlement_adapter: { identity: identity(s.identity), allowed_record_origins: origins as Origin[] } } as OfferTerms;
}
function offerPayload(t: OfferTerms) {
  return { schema: 'useful-work.offer/v1', ...t, acceptance_policy_id: acceptancePolicyId(t.policy),
    condition_basis: 'offerer-observed-presentation-before-exclusive-cutoff/v1', claims: { local_conditional_offer: true, ...LIMITS }, laws: [...SETTLEMENT_LAWS] };
}
export async function publishOffer(value: OfferTerms, keys: P256KeyMaterial, world: string, at: string) {
  const crossing = await sealMessage('offer', offerPayload(terms(value)), keys, world, at); await inspectOffer(crossing); return crossing;
}
export async function inspectOffer(value: unknown) {
  const { crossing, payload } = await inspectMessage(value, 'offer');
  const { schema, acceptance_policy_id, condition_basis, claims, laws, ...input } = payload;
  const t = terms(input);
  if (!equal(payload, offerPayload(t))) throw new Error('OFFER_POLICY_OR_LIMITS_MISMATCH');
  if (instant(crossing.created_at) >= instant(t.present_before)) throw new Error('OFFER_PUBLISHED_AFTER_CUTOFF');
  if (equal(signer(crossing).public_key, t.settlement_adapter.identity.public_key) || crossing.source_world === t.settlement_adapter.identity.world_id) throw new Error('DISTINCT_OFFERER_AND_SETTLEMENT_ADAPTER_REQUIRED');
  return { crossing, terms: t, policy_id: acceptancePolicyId(t.policy), offerer: signer(crossing) };
}
function presentationPayload(o: Awaited<ReturnType<typeof inspectOffer>>, b: Awaited<ReturnType<typeof verifyEvidence>>['bundle']) {
  return { schema: 'useful-work.offer-presentation/v1', offer_id: o.crossing.crossing_id, acceptance_policy_id: o.policy_id,
    evidence: evidenceReference(b), claims: { specific_evidence_presented: true, offerer_received_presentation_verified: false, ...LIMITS } };
}
export async function presentEvidence(offer: unknown, evidence: unknown, keys: P256KeyMaterial, world: string, at: string) {
  evidence = snapshot(evidence);
  const o = await inspectOffer(offer), b = await verifyEvidence(evidence);
  const crossing = await sealMessage('presentation', presentationPayload(o, b.bundle), keys, world, at);
  await inspectPresentation(o.crossing, b.bundle, crossing); return crossing;
}
export async function inspectPresentation(offer: unknown, evidence: unknown, value: unknown) {
  // Recheck at public boundaries; a cached context is not a signing authority.
  evidence = snapshot(evidence); value = snapshot(value, 2_000_000);
  const o = await inspectOffer(offer), e = await verifyEvidence(evidence), { crossing, payload } = await inspectMessage(value, 'presentation');
  if (!equal(payload, presentationPayload(o, e.bundle))) throw new Error('PRESENTATION_EVIDENCE_OR_OFFER_MISMATCH');
  if (instant(crossing.created_at) < Math.max(instant(o.crossing.created_at), latestSignedAt(e.bundle))) throw new Error('PRESENTATION_PRECEDES_SIGNED_EVIDENCE_OR_OFFER');
  if (equal(signer(crossing).public_key, o.offerer.public_key) || crossing.source_world === o.offerer.world_id) throw new Error('DISTINCT_OFFERER_AND_PRESENTER_REQUIRED');
  return { offer: o, evidence: e, crossing, presenter: signer(crossing) };
}
export type DecisionKind = 'ACCEPT' | 'HOLD' | 'REJECT';
function decisionReport(v: Awaited<ReturnType<typeof inspectPresentation>>, choice: DecisionKind, observedAt: string, reason: string) {
  if (!['ACCEPT', 'HOLD', 'REJECT'].includes(choice)) throw new Error('INVALID_LOCAL_DECISION'); nonempty(reason);
  const observed = instant(observedAt);
  if (observed < instant(v.crossing.created_at)) throw new Error('OFFERER_OBSERVATION_PRECEDES_PRESENTATION');
  const policy = evaluateAcceptance(v.evidence, v.offer.terms.policy);
  const conditions = { within_offerer_observed_window: observed < instant(v.offer.terms.present_before),
    eligible_presenter_matched: v.offer.terms.eligible_presenter === null || equal(v.presenter, v.offer.terms.eligible_presenter),
    target_matched: v.offer.terms.target === null || equal(v.offer.terms.target, { result_id: v.evidence.native.result_id,
      work_crossing_id: v.evidence.native.crossing.crossing_id, job_spec_hash: v.evidence.native.header.job_spec_hash }) };
  const eligible = policy.status === 'PASS' && Object.values(conditions).every(Boolean);
  if (choice === 'ACCEPT' && !eligible) throw new Error('ACCEPT_REQUIRES_POLICY_AND_LOCAL_CONDITIONS');
  return { schema: 'useful-work.offer-decision/v1', offer_id: v.offer.crossing.crossing_id, presentation_id: v.crossing.crossing_id,
    evidence: evidenceReference(v.evidence.bundle), acceptance_policy_id: v.offer.policy_id, offerer: v.offer.offerer, presenter: v.presenter,
    observed_at: observedAt, observation_basis: 'signed-offerer-local-claim/v1', conditions, policy_evaluation: policy,
    eligible_for_local_acceptance: eligible, choice, reason, claims: { local_decision_issued: true, policy_replayed: true,
      offerer_received_presentation_attributed: true, payment_observed: false, credit_ledger_changed: false, resource_transferred: false,
      irrevocable_acceptance_asserted: false, unique_acceptance_asserted: false, ...LIMITS }, laws: [...SETTLEMENT_LAWS] };
}
function decisionSpec(v: Awaited<ReturnType<typeof inspectPresentation>>, r: Wire, at: string) {
  if (instant(at) < instant(r.observed_at)) throw new Error('DECISION_PRECEDES_OFFERER_OBSERVATION');
  return { schema: 'relatte.receipt/v0' as const, crossing_id: v.crossing.crossing_id, world_id: v.offer.offerer.world_id,
    receiver_particular: 'particular:useful-work:offerer', kind: r.choice, semantic_effect: 'none', contract_ref: SETTLEMENT_CONTRACT,
    pre_state_ref: null, post_state_ref: null, descendant_refs: [], residual_refs: [], created_at: at,
    note: 'A local offerer decision about this exact presentation. It creates no protocol obligation and performs or guarantees no external transfer.',
    extensions: { useful_work_offer_decision: r } };
}
export async function decide(offer: unknown, evidence: unknown, presentation: unknown, choice: DecisionKind, observedAt: string,
  reason: string, keys: P256KeyMaterial, world: string, at: string) {
  const v = await inspectPresentation(offer, evidence, presentation);
  if (!equal(v.offer.offerer, identity({ world_id: world, public_key: keys.publicKeyJwk }))) throw new Error('DECISION_MUST_BE_ISSUED_BY_OFFERER');
  const receipt = await sealReceipt(decisionSpec(v, decisionReport(v, choice, observedAt, reason), at), keys);
  bounded(receipt, 2_000_000); return receipt;
}
export interface ExchangeBundle { schema: 'useful-work.offer-exchange/v1'; offer: Wire; evidence: Wire; presentation: Wire; decision: Wire }
export async function verifyExchange(value: unknown) {
  bounded(value); const b = record(structuredClone(value), 'INVALID_OFFER_EXCHANGE'); exactKeys(b, ['schema', 'offer', 'evidence', 'presentation', 'decision'], 'INVALID_OFFER_EXCHANGE');
  if (b.schema !== 'useful-work.offer-exchange/v1') throw new Error('UNSUPPORTED_OFFER_EXCHANGE');
  bounded(b.decision, 2_000_000); if (!await verifyReceipt(b.decision)) throw new Error('INVALID_OFFER_DECISION_SIGNATURE');
  const v = await inspectPresentation(b.offer, b.evidence, b.presentation), d = b.decision as Wire;
  if (!equal(signer(d), v.offer.offerer)) throw new Error('DECISION_MUST_BE_ISSUED_BY_OFFERER');
  const signed = record(d.extensions?.useful_work_offer_decision, 'INVALID_OFFER_DECISION');
  const report = decisionReport(v, d.kind, signed.observed_at, signed.reason);
  if (d.receipt_id !== computeReceiptId({ ...decisionSpec(v, report, d.created_at), signing: d.signing })) throw new Error('OFFER_DECISION_REPLAY_MISMATCH');
  return { bundle: { schema: b.schema, offer: v.offer.crossing, evidence: v.evidence.bundle, presentation: v.crossing, decision: d } as ExchangeBundle, report, ...v };
}
