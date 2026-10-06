import type { P256KeyMaterial } from '../../protocol.ts';
import { sealOpaqueOrganCrossing } from '../../organ.ts';
import { verifyCrossingEnvelope } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { equal, expectedCrossingId, instant } from '../audit_clock/wire.ts';
import { signer } from '../settlement/wire.ts';
import type { Wire } from '../settlement/wire.ts';
import type { WorldRole } from '../field_test/profile.ts';
import { worldId } from '../field_test/profile.ts';
import { offerTerms, valuationPolicy } from '../field_test/profile.ts';
import { sha256Hex } from '../../canonical.ts';
import { assert, hash, inspectMessage, validatePeers, verifyAcknowledgement, WIRE_CONTRACT } from './message.ts';

export interface LocalView { schema: string; run_id: string; role: WorldRole; peers: Wire; messages: Wire[]; events: Wire[]; summary: Wire; view_id: string }
export const viewId = (body: unknown) => 'useful-work-wire-local-view-v1:' + hash('UsefulWork-WireLocalView-v1|', body);
async function project(input: { run_id: string; role: WorldRole; peers: Wire; messages: Wire[]; events: Wire[] }) {
  const { run_id, role, messages, events } = input, peers = validatePeers(input.peers); assert(Object.hasOwn(peers, role), 'INVALID_WIRE_VIEW_ROLE');
  assert(Array.isArray(events) && events.length <= 10000 && Array.isArray(messages) && messages.length <= 256 && canonicalBytes(input).length <= 64 * 1024 * 1024, 'WIRE_VIEW_LIMIT');
  const map = new Map<string, Awaited<ReturnType<typeof inspectMessage>>>();
  for (const value of messages) { const m = await inspectMessage(value, run_id, peers); assert(!map.has(m.id), 'WIRE_VIEW_DUPLICATE_MESSAGE'); map.set(m.id, m); }
  const seen = new Set<string>(), received = new Set<string>(), applied = new Set<string>(), intents = new Set<string>(), acked = new Set<string>(), attempts = new Map<string, Wire>();
  const pending = new Set<string>(), failed=new Set<string>(),failures: Wire[] = [], topics: Record<string, string[]> = {}; let duplicateReceives = 0, previous = null;
  for (const [sequence, e] of events.entries()) {
    exactKeys(record(e, 'INVALID_WIRE_EVENT'), ['schema', 'run_id', 'role', 'sequence', 'previous', 'observed_at', 'kind', 'message_id', 'detail', 'event_id'], 'INVALID_WIRE_EVENT');
    const { event_id, ...body } = e;
    assert(e.schema === 'useful-work.wire-local-event/v1' && e.run_id === run_id && e.role === role && e.sequence === sequence && e.previous === previous && event_id === hash('UsefulWork-WireLocalEvent-v1|', body), 'WIRE_LOCAL_CHAIN_MISMATCH');
    instant(e.observed_at); previous = event_id;
    const m = e.message_id === null ? null : map.get(e.message_id); assert(e.message_id === null || m, 'WIRE_EVENT_MESSAGE_MISSING');
    if (e.kind === 'SEND_INTENT') {
      assert(m && m.claims.from === role && !intents.has(m.id), 'INVALID_WIRE_SEND_INTENT'); intents.add(m.id); seen.add(m.id);
    } else if (e.kind === 'RECEIVE') {
      assert(m && m.claims.recipients.includes(role) && e.detail.first_seen === !received.has(m.id), 'INVALID_WIRE_RECEIVE');
      await verifyAcknowledgement(e.detail.ack, m.id, role, peers);
      if (received.has(m.id)) duplicateReceives++; received.add(m.id); seen.add(m.id);
    } else if (e.kind === 'PENDING') {
      assert(m && received.has(m.id) && !applied.has(m.id) && equal(e.detail.missing, m.claims.dependencies.filter((id: string) => !seen.has(id))) && e.detail.missing.length > 0, 'INVALID_WIRE_PENDING'); pending.add(m.id);
    } else if (e.kind === 'APPLIED') {
      assert(m && received.has(m.id) && !applied.has(m.id) && !failed.has(m.id) && m.claims.dependencies.every((id: string) => seen.has(id)), 'INVALID_WIRE_APPLICATION');
      applied.add(m.id); pending.delete(m.id); (topics[m.claims.topic] ??= []).push(m.id);
    } else if (e.kind === 'SEND_ATTEMPT') {
      assert(m && intents.has(m.id) && m.claims.recipients.includes(e.detail.recipient) && typeof e.detail.attempt_id === 'string' && !attempts.has(e.detail.attempt_id), 'INVALID_WIRE_SEND_ATTEMPT');
      attempts.set(e.detail.attempt_id, { id: m.id, recipient: e.detail.recipient, outcome: null });
    } else if (['SEND_FAILURE', 'SEND_ACK', 'ATTEMPT_INTERRUPTED'].includes(e.kind)) {
      const attempt = attempts.get(e.detail.attempt_id);
      assert(m && attempt && attempt.id === m.id && attempt.recipient === e.detail.recipient && attempt.outcome === null, 'INVALID_WIRE_ATTEMPT_OUTCOME'); attempt.outcome = e.kind;
      if (e.kind === 'SEND_ACK') { await verifyAcknowledgement(e.detail.ack, m.id, attempt.recipient, peers); acked.add(m.id + '/' + attempt.recipient); }
      else failures.push({ message_id: m.id, recipient: attempt.recipient, kind: e.kind, observed_at: e.observed_at, reason: e.detail.reason });
    } else if(e.kind==='DOMAIN_FAILURE') {
      assert(m&&received.has(m.id)&&!applied.has(m.id)&&!failed.has(m.id)&&typeof e.detail.error==='string'&&e.detail.error.length>0,'INVALID_WIRE_DOMAIN_FAILURE');failed.add(m.id);pending.delete(m.id);
    } else assert(['START', 'STOP', 'UNAVAILABLE'].includes(e.kind), 'UNSUPPORTED_WIRE_EVENT');
  }
  for (const id of received) { if (!applied.has(id)&&!failed.has(id)) pending.add(id); }
  assert([...map.keys()].every(id => seen.has(id)), 'WIRE_VIEW_UNOBSERVED_MESSAGE');
  const effective=[...map.values()].filter(m=>intents.has(m.id)||applied.has(m.id));
  const domain: Wire = {}, packetMessage=effective.find(m=>m.claims.topic==='packet');
  if(packetMessage) {
    const p=packetMessage.body; exactKeys(record(p,'INVALID_WIRE_ARTIFACT_PACKET'),['schema','job_spec','native','legacy'],'INVALID_WIRE_ARTIFACT_PACKET');
    assert(p.schema==='useful-work.field-packet/v1','INVALID_WIRE_ARTIFACT_PACKET');
    const n=await(await import('../merkle_native/exchange.ts')).inspectNativeWork(p.native.work,canonicalBytes(p.job_spec));
    assert(equal(signer(n.crossing),peers.A.keys.primary),'WIRE_ARTIFACT_PRODUCER_MISMATCH');
    const artifact=(await import('../merkle_native/result.ts')).inspectArtifact(Buffer.from(p.native.artifact_base64,'base64'),n.job,n.result_id);
    assert(Array.isArray(p.legacy.artifacts)&&p.legacy.artifacts.length===4,'WIRE_LEGACY_ARTIFACT_PROFILE');
    const artifacts=new Map<string,Buffer>();for(const a of p.legacy.artifacts){const bytes=Buffer.from(a.base64,'base64');assert(a.address==='sha256:'+sha256Hex(bytes)&&!artifacts.has(a.address),'WIRE_LEGACY_ARTIFACT_HASH');artifacts.set(a.address,bytes);}
    const old=await(await import('../inspection.ts')).inspectWork(p.legacy.work,async(address:string)=>{const bytes=artifacts.get(address);assert(bytes,'WIRE_LEGACY_ARTIFACT_MISSING');return bytes;},'hash-only');
    assert(equal(signer(p.legacy.work),peers.A.keys.primary)&&!old.report.errors.length&&old.result&&equal(old.job,n.job)&&equal(old.result.escape_counts,artifact.artifact.escape_counts),'WIRE_LEGACY_NATIVE_MISMATCH');
    domain.kernel_trace={'001':{work_id:p.legacy.work.crossing_id},'004':{native_work_id:n.crossing.crossing_id,result_id:n.result_id},native_and_legacy_job_and_counts_matched:true,mathematics_recomputed_by_local_replay:false};
  }
  // The world's evidence is replayed from its own retained packets, including outgoing packets.
  // This does not infer that another world received, agreed with, or saw the same set.
  for (const m of effective) {
    if (!seen.has(m.id)) continue;
    if (['acceptance', 'late-hold'].includes(m.claims.topic)) {
      const v = await (await import('../settlement/exchange.ts')).verifyExchange(m.body);
      assert(equal(signer(v.bundle.decision), peers.B.keys.primary)&&equal(signer(v.bundle.presentation),peers.A.keys.primary)&&equal(signer(v.bundle.offer),peers.B.keys.primary), 'WIRE_EXCHANGE_OFFERER_MISMATCH');
      if (m.claims.topic === 'acceptance') {
        assert(v.report.choice === 'ACCEPT', 'WIRE_ACCEPTANCE_REQUIRED');
        assert(packetMessage&&equal(v.offer.terms,offerTerms(packetMessage.body,peers,v.offer.terms.present_before)),'WIRE_PRIMARY_OFFER_POLICY_MISMATCH');
        assert(v.evidence.audit?.summary.contradictions.length===1&&v.evidence.service?.summary.schedule_accounting.in_window_verified_slots===1&&v.evidence.resources?.summary.unique_measurements===3,'WIRE_ACCEPTED_EVIDENCE_PROFILE');
        domain.acceptance = { decision_id: v.bundle.decision.receipt_id, choice: v.report.choice, B_value: v.evidence.valuations[0].report.calculation.amount,
          contradiction_count: v.evidence.audit!.summary.contradictions.length, expired_service_slots: v.evidence.service!.summary.slots.filter(s => s.status === 'EXPIRED').map(s => s.index) };
      } else { assert(v.report.choice === 'HOLD' && v.report.conditions.within_offerer_observed_window === false, 'WIRE_LATE_HOLD_REQUIRED'); domain.late_evidence = { decision_id: v.bundle.decision.receipt_id, choice: 'HOLD', within_offerer_observed_window: false }; }
    } else if (m.claims.topic === 'settlement') {
      const s = await (await import('../settlement/bundle.ts')).verifySettlementBundle(m.body);
      assert(s.summary.observations.length === 1 && s.summary.observations[0].terms_match && equal(signer(s.observations[0].receipt), peers.C.keys.primary) && equal(signer(s.observations[0].observation), peers.adapter.keys.primary), 'WIRE_SETTLEMENT_ROLE_OR_TERMS_MISMATCH');
      domain.settlement = { bundle_id: s.bundle_id, credit_ledger_changed: s.summary.observations[0].claims.credit_ledger_changed, transfer_performed_by_relatte: false, universal_finality_asserted: false };
    } else if (m.claims.topic === 'dissent') {
      const v = await (await import('../valuation/evaluator.ts')).verifyValuation(m.body);
      assert(equal(signer(v.bundle.crossing), peers.D.keys.primary)&&packetMessage&&equal(v.bundle.policy,valuationPolicy('D',packetMessage.body.job_spec)), 'WIRE_DISSENTER_MISMATCH');
      domain.dissent = { valuation_id: v.bundle.crossing.crossing_id, amount: v.report.calculation.amount, context_id: v.bundle.context.context_id };
    }
  }
  const evidenceMessage=effective.find(m=>m.claims.topic==='evidence');
  if(evidenceMessage) {
    assert(packetMessage,'WIRE_EVIDENCE_PACKET_MISSING');
    const evidenceApi=await import('../settlement/evidence.ts');
    const e=await evidenceApi.verifyEvidence(await evidenceApi.createEvidence(evidenceMessage.body.evidence)),baseline=evidenceMessage.body.baseline;
    assert(equal(e.bundle.work,packetMessage.body.native.work),'WIRE_EVIDENCE_WORK_MISMATCH');
    const full=await(await import('../comparison.ts')).compareWorkReceipts(baseline.full_receipts),sample=await(await import('../challenge/receipt.ts')).compareChallengeReceipts(baseline.sample_receipts);
    assert(full.relation==='compatible'&&full.subject?.crossing_id===packetMessage.body.legacy.work.crossing_id&&sample.relation==='compatible'&&baseline.full_receipts.length===2&&baseline.sample_receipts.length===2,'WIRE_LEGACY_COMPARISON_MISMATCH');
    const legacy=await(await import('../challenge/exchange.ts')).inspectSampleWork(packetMessage.body.legacy.work,canonicalBytes(packetMessage.body.job_spec));
    for(const role of ['B','C'] as const) {
      const receipt=baseline.sample_receipts.find((r:Wire)=>equal(signer(r),peers[role].keys.math));assert(receipt,'WIRE_LEGACY_VERIFIER_MISSING');
      const r=receipt.extensions.useful_work_challenge;
      const replay=await(await import('../challenge/verifier.ts')).verifyChallenge(legacy,baseline.challenge,baseline.response,async()=>({samples:r.evidence.map((i:Wire)=>i.verifier),implementation:r.implementation}));
      assert(equal(r,replay),'WIRE_LEGACY_SAMPLE_REPLAY_MISMATCH');
      assert(baseline.full_receipts.some((r:Wire)=>equal(signer(r),peers[role].keys.math)),'WIRE_LEGACY_VERIFIER_MISSING');
    }
    domain.kernel_trace={...domain.kernel_trace,'002':full,'003':sample,'005':{audit_id:e.audit!.audit_id,contradictions:e.audit!.summary.contradictions},
      '006':{history_id:e.history!.history_id,schedule_accounting:e.history!.summary.schedule_accounting},'007':{B_amount:e.valuations[0].report.calculation.amount},
      '008':{history_id:e.service!.history_id,slots:e.service!.summary.slots},'009':{bundle_id:e.resources!.bundle_id,observations:e.resources!.summary.by_adapter,missing_energy_is_zero:false}};
    if(domain.acceptance)domain.kernel_trace['010']=domain.acceptance;
  }
  if (domain.dissent && domain.acceptance) {
    const b = effective.find(m => m.claims.topic === 'acceptance')!.body.evidence.valuations[0];
    const d = effective.find(m => m.claims.topic === 'dissent')!.body;
    domain.value_comparison = await (await import('../valuation/evaluator.ts')).compareValuations([b, d]);
    assert(domain.value_comparison.relation==='different-local-amounts'&&b.context.context_id===d.context.context_id,'WIRE_DISSENT_CONTEXT_MISMATCH');
  }
  return { schema: 'useful-work.wire-local-summary/v1', local_role: role, local_chain_head: previous, received_message_ids: [...received].sort(),
    applied_message_ids: [...applied].sort(), pending_message_ids: [...pending].sort(),failed_message_ids:[...failed].sort(), outgoing_message_ids: [...intents].sort(), acknowledged_deliveries: [...acked].sort(),
    duplicate_deliveries_observed: duplicateReceives, transport_failures: failures, application_topics: topics, domain,
    application_failures:events.filter(e=>e.kind==='DOMAIN_FAILURE').map(e=>({message_id:e.message_id,error:e.detail.error})),
    claims: { local_history_reconstructed: true, complete_network_history_asserted: false, global_reconstruction_required: false, global_order_asserted: false,
      exactly_once_network_delivery_asserted: false, shared_truth_selected: false, universal_value_selected: false, objective_time_verified: false,
      remote_host_death_verified: false, physical_geography_verified: false, transfer_performed_by_relatte: false } };
}
export async function createLocalView(input: { run_id: string; role: WorldRole; peers: Wire; messages: Wire[]; events: Wire[] }) {
  const summary = await project(input), body = { schema: 'useful-work.wire-local-view/v1', ...structuredClone(input), summary }; return { ...body, view_id: viewId(body) } as LocalView;
}
function cutSpec(v: LocalView, at: string) {
  return { schema: 'relatte.opaque-organ-spec/v0' as const, family_ref: 'organ:useful-work/field-test-002-local-cut-v1', donor_contract_ref: WIRE_CONTRACT,
    artifact_kind: 'local-wire-history', source_world: worldId(v.role), source_particular: 'particular:wire:local-preserver', source_history_head: null,
    payload_refs: [{ address: v.view_id, role: 'local-wire-view', media_type: 'application/json' }],
    donor_claims: { run_id: v.run_id, role: v.role, local_chain_head: v.summary.local_chain_head, local_only: true,
      global_history_complete: false, global_order_asserted: false, shared_state_asserted: false, winner_selected: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export async function sealLocalView(input: Parameters<typeof createLocalView>[0], keys: P256KeyMaterial, at: string) {
  const view = await createLocalView(input); assert(equal(keys.publicKeyJwk, view.peers[view.role].keys.primary.public_key), 'WIRE_LOCAL_CUT_KEY_MISMATCH');
  const crossing = await sealOpaqueOrganCrossing(cutSpec(view, at), keys); return { schema: 'useful-work.wire-local-delivery/v1', view, crossing };
}
export async function verifyLocalView(value: unknown) {
  assert(canonicalBytes(value).length <= 64 * 1024 * 1024, 'WIRE_VIEW_LIMIT'); const d = record(structuredClone(value), 'INVALID_WIRE_LOCAL_DELIVERY');
  exactKeys(d, ['schema', 'view', 'crossing'], 'INVALID_WIRE_LOCAL_DELIVERY'); assert(d.schema === 'useful-work.wire-local-delivery/v1', 'UNSUPPORTED_WIRE_LOCAL_DELIVERY');
  const a = record(d.view, 'INVALID_WIRE_LOCAL_VIEW'); exactKeys(a, ['schema', 'run_id', 'role', 'peers', 'messages', 'events', 'summary', 'view_id'], 'INVALID_WIRE_LOCAL_VIEW');
  const { schema, summary, view_id, ...input } = a; assert(schema === 'useful-work.wire-local-view/v1' && view_id === viewId({ schema, ...input, summary }), 'WIRE_LOCAL_VIEW_ID_MISMATCH');
  const v = await createLocalView(input as Parameters<typeof createLocalView>[0]); assert(equal(v, a), 'WIRE_LOCAL_REPLAY_MISMATCH');
  assert(await verifyCrossingEnvelope(d.crossing) && equal(signer(d.crossing), v.peers[v.role].keys.primary) &&
    d.crossing.crossing_id === expectedCrossingId(cutSpec(v, d.crossing.created_at), v.peers[v.role].keys.primary.public_key), 'WIRE_LOCAL_CUT_REFERENCE_MISMATCH');
  return { schema: d.schema, view: v, crossing: d.crossing };
}
