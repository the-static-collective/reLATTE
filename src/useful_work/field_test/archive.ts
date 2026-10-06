import { verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { sealOpaqueOrganCrossing } from '../../organ.ts';
import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, integer, parseJob, record } from '../job.ts';
import { inspectWork } from '../inspection.ts';
import { compareWorkReceipts } from '../comparison.ts';
import { inspectSampleWork } from '../challenge/exchange.ts';
import { verifyChallenge } from '../challenge/verifier.ts';
import { compareChallengeReceipts } from '../challenge/receipt.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { inspectArtifact } from '../merkle_native/result.ts';
import { compareNativeReceipts } from '../merkle_native/receipt.ts';
import { compareValuations, verifyValuation } from '../valuation/evaluator.ts';
import { domainHash, inspectPlan } from '../audit_clock/policy.ts';
import { equal, expectedCrossingId, instant, nonempty } from '../audit_clock/wire.ts';
import { verifyExchange } from '../settlement/exchange.ts';
import { verifySettlementBundle } from '../settlement/bundle.ts';
import { bounded, identity, signer, snapshot } from '../settlement/wire.ts';
import type { Wire } from '../settlement/wire.ts';
import { offerTerms, roleIdentity, valuationPolicy, WORLD_KEYS, worldId } from './profile.ts';
import type { WorldRole } from './profile.ts';

export const FIELD_CONTRACT = 'contract:useful-work/field-test-001-v1';
export const FIELD_LAWS = ['COOPERATION ≠ SHARED TRUTH', 'LOCAL ACCEPTANCE ≠ GLOBAL AUTHORITY',
  'DIFFERENT VALUE ≠ INVALID EVIDENCE', 'SHARED EVIDENCE ≠ SHARED STATE', 'PRESERVATION ≠ ADJUDICATION'];
export interface FieldInput { actors: Wire; packet: Wire; baseline: Wire; settlement: Wire; dissent: Wire; boundary_holds: Wire[]; external_ledger: Wire; transcript: Wire[] }
const inputKeys = ['actors', 'packet', 'baseline', 'settlement', 'dissent', 'boundary_holds', 'external_ledger', 'transcript'];
export const fieldId = (body: unknown) => 'useful-work-field-test-001-v1:' + domainHash('UsefulWork-FieldTest001-v1|', body);
function requireThat(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function actorsAt(value: unknown) {
  const actors = record(value, 'INVALID_FIELD_ACTORS'); exactKeys(actors, Object.keys(WORLD_KEYS), 'INVALID_FIELD_ACTORS');
  const keys = new Set<string>();
  for (const role of Object.keys(WORLD_KEYS) as WorldRole[]) {
    const actor = record(actors[role], 'INVALID_FIELD_ACTOR'); exactKeys(actor, ['schema', 'role', 'world_id', 'keys', 'process_id'], 'INVALID_FIELD_ACTOR');
    requireThat(actor.schema === 'useful-work.field-actor/v1' && actor.role === role && actor.world_id === worldId(role), 'FIELD_ACTOR_ROLE_MISMATCH');
    integer(actor.process_id, 1, 2147483647, 'INVALID_FIELD_PROCESS'); exactKeys(record(actor.keys, 'INVALID_FIELD_KEYS'), [...WORLD_KEYS[role]], 'INVALID_FIELD_KEYS');
    for (const name of WORLD_KEYS[role]) {
      const k = identity(actor.keys[name]); requireThat(k.world_id === roleIdentity(role, name), 'FIELD_KEY_WORLD_MISMATCH');
      const label = canonicalBytes(k.public_key).toString(); requireThat(!keys.has(label), 'FIELD_ROLES_SHARE_KEY'); keys.add(label);
    }
  }
  return actors;
}
const assertIdentity = (value: Wire, expected: Wire) => requireThat(equal(signer(value), expected), 'FIELD_SIGNER_ROLE_MISMATCH');
function latestSignedClaim(value: unknown) {
  const pending: unknown[] = [value]; let latest = -Infinity;
  while (pending.length) {
    const item = pending.pop(); if (!item || typeof item !== 'object') continue;
    const v = item as Wire;
    if (v.signing && ['relatte.crossing-envelope/v0', 'relatte.receipt/v0'].includes(v.schema)) latest = Math.max(latest, instant(v.created_at));
    pending.push(...Object.values(v).filter(x => x && typeof x === 'object'));
  }
  return latest;
}
const bytes = (value: unknown) => {
  requireThat(typeof value === 'string' && value.length <= 24 * 1024 * 1024 && Buffer.from(value, 'base64').toString('base64') === value, 'INVALID_FIELD_BASE64');
  return Buffer.from(value, 'base64');
};
async function reconstruct(value: unknown) {
  const i = record(snapshot(value), 'INVALID_FIELD_INPUT'); exactKeys(i, inputKeys, 'INVALID_FIELD_INPUT'); const actors = actorsAt(i.actors);
  const packet = record(i.packet, 'INVALID_FIELD_PACKET'); exactKeys(packet, ['schema', 'job_spec', 'native', 'legacy'], 'INVALID_FIELD_PACKET');
  requireThat(packet.schema === 'useful-work.field-packet/v1', 'UNSUPPORTED_FIELD_PACKET'); const job = parseJob(packet.job_spec);
  exactKeys(record(packet.native, 'INVALID_FIELD_NATIVE'), ['work', 'artifact_base64'], 'INVALID_FIELD_NATIVE');
  exactKeys(record(packet.legacy, 'INVALID_FIELD_LEGACY'), ['work', 'artifacts'], 'INVALID_FIELD_LEGACY');
  const native = await inspectNativeWork(packet.native.work, canonicalBytes(job)); assertIdentity(native.crossing, actors.A.keys.primary);
  const artifactBytes = bytes(packet.native.artifact_base64), artifact = inspectArtifact(artifactBytes, job, native.result_id);
  requireThat(Array.isArray(packet.legacy.artifacts) && packet.legacy.artifacts.length === 4, 'INVALID_FIELD_LEGACY_ARTIFACTS');
  const artifacts = new Map<string, Buffer>();
  for (const entry of packet.legacy.artifacts) {
    const a = record(entry, 'INVALID_FIELD_ARTIFACT'); exactKeys(a, ['address', 'base64'], 'INVALID_FIELD_ARTIFACT'); const b = bytes(a.base64);
    requireThat(a.address === 'sha256:' + sha256Hex(b) && !artifacts.has(a.address), 'FIELD_ARTIFACT_ADDRESS_MISMATCH'); artifacts.set(a.address, b);
  }
  const source = async (address: string) => { const b = artifacts.get(address); if (!b) throw new Error('FIELD_ARTIFACT_MISSING'); return b; };
  const old = await inspectWork(packet.legacy.work, source, 'hash-only'); requireThat(!old.report.errors.length && old.result && equal(old.job, job), 'FIELD_BASELINE_ARTIFACT_INVALID');
  assertIdentity(packet.legacy.work, actors.A.keys.primary);
  requireThat(equal(old.result.escape_counts, artifact.artifact.escape_counts), 'FIELD_NATIVE_LEGACY_COUNTS_DIFFER');
  const baseline = record(i.baseline, 'INVALID_FIELD_BASELINE'); exactKeys(baseline, ['full_receipts', 'challenge', 'response', 'sample_receipts'], 'INVALID_FIELD_BASELINE');
  requireThat(Array.isArray(baseline.full_receipts) && baseline.full_receipts.length === 2 && Array.isArray(baseline.sample_receipts) && baseline.sample_receipts.length === 2, 'FIELD_BASELINE_RECEIPTS_REQUIRED');
  const fullComparison = await compareWorkReceipts(baseline.full_receipts);
  requireThat(fullComparison.subject?.crossing_id === packet.legacy.work.crossing_id && fullComparison.relation === 'compatible', 'FIELD_BASELINE_COMPARISON_MISMATCH');
  for (const [index, role] of (['B', 'C'] as const).entries()) {
    assertIdentity(baseline.full_receipts[index], actors[role].keys.math);
    requireThat(baseline.full_receipts[index].extensions.useful_work.claims.computation_independently_verified === true, 'FIELD_BASELINE_NOT_RECOMPUTED');
    requireThat(baseline.full_receipts[index].extensions.useful_work.implementation.id === `useful-work/${role === 'B' ? 'typescript' : 'python'}-q24/v1`, 'FIELD_BASELINE_IMPLEMENTATION_MISMATCH');
  }
  const legacy = await inspectSampleWork(packet.legacy.work, canonicalBytes(job)), sampleComparison = await compareChallengeReceipts(baseline.sample_receipts);
  requireThat(equal(signer(baseline.challenge).public_key, actors.B.keys.challenger.public_key), 'FIELD_LEGACY_CHALLENGER_MISMATCH');
  requireThat(sampleComparison.relation === 'compatible', 'FIELD_BASELINE_SAMPLE_DISAGREEMENT');
  for (const [index, role] of (['B', 'C'] as const).entries()) {
    const receipt = baseline.sample_receipts[index], r = receipt.extensions.useful_work_challenge; assertIdentity(receipt, actors[role].keys.math);
    const projected = await verifyChallenge(legacy, baseline.challenge, baseline.response, async () => ({ samples: r.evidence.map((e: Wire) => e.verifier), implementation: r.implementation }));
    requireThat(equal(r, projected), 'FIELD_BASELINE_SAMPLE_REPLAY_MISMATCH');
  }
  const settlement = await verifySettlementBundle(i.settlement), exchange = await verifyExchange(settlement.exchange), evidence = exchange.evidence;
  requireThat(equal(evidence.bundle.work, native.crossing) && equal(evidence.bundle.job_spec, job), 'FIELD_EXCHANGE_WORK_MISMATCH');
  assertIdentity(exchange.offer.crossing, actors.B.keys.primary); assertIdentity(exchange.crossing, actors.A.keys.primary); assertIdentity(exchange.bundle.decision, actors.B.keys.primary);
  requireThat(equal(exchange.offer.terms, offerTerms(packet, actors, exchange.offer.terms.present_before)), 'FIELD_OFFER_POLICY_MISMATCH');
  requireThat(exchange.report.choice === 'ACCEPT' && exchange.report.policy_evaluation.status === 'PASS', 'FIELD_LOCAL_ACCEPTANCE_MISSING');
  requireThat(evidence.audit && evidence.history && evidence.service && evidence.resources, 'FIELD_EVIDENCE_COMPONENT_MISSING');
  const audit = evidence.audit, history = evidence.history, serving = evidence.service, resources = evidence.resources;
  for (const planValue of [history.plan, serving.plan]) {
    const p = await inspectPlan(planValue);
    requireThat(equal(signer(planValue).public_key, actors.B.keys.planner.public_key) && equal(p.policy.challenger, actors.B.keys.challenger) &&
      equal(p.policy.observer, actors.B.keys.observer) && equal({ world_id: p.policy.randomness_rule.source_world, public_key: p.policy.randomness_rule.public_key }, actors.C.keys.randomness), 'FIELD_SCHEDULE_ROLE_MISMATCH');
  }
  requireThat(history.summary.schedule_accounting.planned_slots === 2 && history.summary.schedule_accounting.completed_observation_slots === 2, 'FIELD_AUDIT_SCHEDULE_INCOMPLETE');
  requireThat(instant(exchange.offer.crossing.created_at) < instant(history.events[0].created_at) && instant(exchange.offer.crossing.created_at) < instant(serving.events[0].created_at), 'FIELD_OFFER_NOT_PREDECLARED');
  const comparisons = [];
  for (const [slotIndex, issue] of history.issues.entries()) {
    const receipts = history.receipts.filter(r => r.extensions.useful_work_native.scope.challenge_id === issue.challenge.crossing_id);
    requireThat(receipts.length === (slotIndex === 0 ? 3 : 2), 'FIELD_AUDIT_RECEIPT_PROFILE_MISMATCH');
    comparisons.push(await compareNativeReceipts(receipts));
    for (const receipt of receipts) {
      const r = receipt.extensions.useful_work_native;
      requireThat(['field-test/deliberate-count-fault/v1', 'useful-work/python-merkle-q24/v1', 'useful-work/typescript-merkle-q24/v1'].includes(r.implementation.id), 'FIELD_MATHEMATICAL_IMPLEMENTATION_MISMATCH');
      const expected = r.implementation.id === 'field-test/deliberate-count-fault/v1' ? actors.D.keys.fault :
        r.implementation.id === 'useful-work/python-merkle-q24/v1' ? actors.C.keys.math : actors.B.keys.math;
      assertIdentity(receipt, expected);
      requireThat(r.claims.sampled_computation_verified === (r.implementation.id !== 'field-test/deliberate-count-fault/v1'), 'FIELD_EXPECTED_MATHEMATICAL_OUTCOME_MISSING');
    }
  }
  requireThat(comparisons.filter(c => c.relation === 'contradictory').length === 1 && audit.summary.contradictions.length === 1, 'FIELD_DELIBERATE_CONTRADICTION_MISSING');
  const fault = history.receipts.filter(r => r.extensions.useful_work_native.implementation.id === 'field-test/deliberate-count-fault/v1');
  requireThat(fault.length === 1 && fault[0].kind === 'FAILED', 'FIELD_FAULT_RECEIPT_NOT_RETAINED');
  requireThat(serving.summary.schedule_accounting.planned_slots === 2 && serving.summary.schedule_accounting.issued_slots === 2 &&
    serving.summary.schedule_accounting.in_window_verified_slots === 1 && serving.summary.slots.filter(s => s.status === 'EXPIRED').length === 1, 'FIELD_EXPIRED_SERVICE_SLOT_MISSING');
  requireThat(resources.summary.unique_measurements === 3 && resources.summary.by_adapter.energy.length === 0, 'FIELD_RESOURCE_PROFILE_MISMATCH');
  for (const kind of ['cpu', 'storage', 'network'] as const) requireThat(resources.summary.by_adapter[kind].length === 1, 'FIELD_RESOURCE_ADAPTER_MISSING');
  for (const entry of resources.observations) { assertIdentity(entry.measurement, actors.A.keys.primary); assertIdentity(entry.receipt, actors.C.keys.primary); }
  requireThat(evidence.valuations.length === 1, 'FIELD_B_VALUE_REQUIRED'); const bValue = evidence.valuations[0], dValue = await verifyValuation(i.dissent);
  assertIdentity(bValue.bundle.crossing, actors.B.keys.primary); assertIdentity(dValue.bundle.crossing, actors.D.keys.primary);
  requireThat(equal(bValue.bundle.policy, valuationPolicy('B', job)) && equal(dValue.bundle.policy, valuationPolicy('D', job)), 'FIELD_VALUATION_POLICY_MISMATCH');
  const valueComparison = await compareValuations([bValue.bundle, dValue.bundle]);
  requireThat(valueComparison.relation === 'different-local-amounts' && equal(bValue.report.calculation.amount, { numerator: '12', denominator: '1' }) &&
    equal(dValue.report.calculation.amount, { numerator: '5', denominator: '1' }), 'FIELD_SOVEREIGN_VALUE_DISSENT_MISSING');
  requireThat(settlement.observations.length === 1, 'FIELD_SETTLEMENT_RECORD_REQUIRED'); const observed = settlement.observations[0];
  assertIdentity(observed.observation, actors.adapter.keys.primary); assertIdentity(observed.receipt, actors.C.keys.primary);
  requireThat(settlement.summary.observations[0].terms_match && settlement.summary.observations[0].adapter === 'credit-ledger', 'FIELD_LEDGER_TERMS_MISMATCH');
  const ledger = record(i.external_ledger, 'INVALID_FIELD_EXTERNAL_LEDGER'); exactKeys(ledger, ['request', 'record', 'before', 'after'], 'INVALID_FIELD_EXTERNAL_LEDGER');
  requireThat(equal(ledger.before, { B: '100', A: '0' }) && equal(ledger.after, { B: '88', A: '12' }), 'FIELD_EXTERNAL_LEDGER_BALANCE_MISMATCH');
  const expectedRequest = { entry_ref: 'field-entry-1', amount: '12', acceptance_ref: exchange.bundle.decision.receipt_id, evidence_ref: evidence.bundle.evidence_id };
  requireThat(equal(ledger.request, expectedRequest) && equal(ledger.record.request, expectedRequest), 'FIELD_LEDGER_ACCEPTANCE_CORRELATION_MISMATCH');
  exactKeys(record(ledger.record, 'INVALID_FIELD_LEDGER_RECORD'), ['schema', 'request', 'entry_ref', 'debit', 'credit'], 'INVALID_FIELD_LEDGER_RECORD');
  const adapterEvidence = observed.observation.extensions.organ_adapter.donor_claims['settlement_observation-credit-ledger'].evidence;
  requireThat(ledger.record.schema === 'external.field-ledger-entry/v1' && equal(adapterEvidence, { entry_ref: ledger.record.entry_ref, debit: ledger.record.debit, credit: ledger.record.credit }), 'FIELD_LEDGER_IMPORTED_RECORD_MISMATCH');
  requireThat(Array.isArray(i.boundary_holds) && i.boundary_holds.length === 4, 'FIELD_LOCAL_HOLDS_REQUIRED');
  for (const h of i.boundary_holds) {
    exactKeys(record(h, 'INVALID_FIELD_HOLD'), ['role', 'received', 'hold'], 'INVALID_FIELD_HOLD');
    requireThat(['A', 'B', 'C', 'D'].includes(h.role), 'INVALID_FIELD_HOLD_WORLD');
    for (const receipt of [h.received, h.hold]) requireThat(await verifyReceipt(receipt) && receipt.world_id === worldId(h.role) && receipt.semantic_effect === 'none', 'INVALID_FIELD_LOCAL_RECEIPT');
    const expectedId = h.role === 'A' ? exchange.offer.crossing.crossing_id : h.role === 'C' ? history.responses[0].crossing_id : native.crossing.crossing_id;
    requireThat(h.received.kind === 'RECEIVED' && h.hold.kind === 'R3_HOLD' && h.received.crossing_id === expectedId && h.hold.crossing_id === expectedId, 'FIELD_HOLD_SCOPE_MISMATCH');
  }
  requireThat(new Set(i.boundary_holds.map((h: Wire) => h.role)).size === 4, 'FIELD_HOLD_WORLD_DUPLICATE');
  requireThat(Array.isArray(i.transcript), 'INVALID_FIELD_TRANSCRIPT'); integer(i.transcript.length, 1, 128, 'FIELD_TRANSCRIPT_LIMIT');
  const pids = new Set<number>();
  for (const entry of i.transcript) {
    exactKeys(record(entry, 'INVALID_FIELD_PROCESS_ENTRY'), ['step', 'actor', 'command', 'pid', 'started_at', 'finished_at', 'input_sha256', 'output_sha256', 'exit_code'], 'INVALID_FIELD_PROCESS_ENTRY');
    for (const key of ['step', 'actor', 'command']) nonempty(entry[key]); integer(entry.pid, 1, 2147483647, 'INVALID_FIELD_PROCESS');
    requireThat(entry.exit_code === 0 && instant(entry.finished_at) >= instant(entry.started_at), 'FIELD_PROCESS_STEP_FAILED');
    for (const key of ['input_sha256', 'output_sha256']) requireThat(typeof entry[key] === 'string' && /^[a-f0-9]{64}$/.test(entry[key]), 'INVALID_FIELD_TRANSCRIPT_HASH');
    pids.add(entry.pid);
  }
  const summary = { schema: 'useful-work.field-test-001-summary/v1', result_id: native.result_id, evidence_id: evidence.bundle.evidence_id,
    kernel_trace: {
      '001': { work_id: packet.legacy.work.crossing_id, canonical_artifact_hash: old.report.manifest!.result_hash },
      '002': fullComparison, '003': sampleComparison, '004': { native_work_id: native.crossing.crossing_id, comparisons },
      '005': { audit_id: audit.audit_id, contradictions: audit.summary.contradictions, receipt_ids: audit.summary.receipts.map(r => r.receipt_id) },
      '006': { history_id: history.history_id, schedule_accounting: history.summary.schedule_accounting },
      '007': valueComparison, '008': { history_id: serving.history_id, slots: serving.summary.slots, schedule_accounting: serving.summary.schedule_accounting },
      '009': { bundle_id: resources.bundle_id, observations: resources.summary.by_adapter, missing_energy_is_zero: false },
      '010': { offer_id: exchange.offer.crossing.crossing_id, decision_id: exchange.bundle.decision.receipt_id, choice: exchange.report.choice,
        policy_evaluation: exchange.report.policy_evaluation, settlement_bundle_id: settlement.bundle_id, receipt: settlement.summary.observations[0] } },
    observations: { B_local_value: bValue.report.calculation.amount, D_local_value: dValue.report.calculation.amount, unit: 'field-credit',
      external_ledger_before: ledger.before, external_ledger_after: ledger.after, deliberate_fault_receipt_id: fault[0].receipt_id,
      expired_service_slots: serving.summary.slots.filter(s => s.status === 'EXPIRED').map(s => s.index), reported_process_count: pids.size },
    claims: { public_signatures_bindings_and_local_calculations_replayed: true, native_and_legacy_job_and_counts_matched: true,
      disagreement_retained: true, value_dissent_retained: true, expired_service_retained: true,
      mathematics_recomputed_by_archive: false, shared_truth_selected: false, universal_value_selected: false, authority_selected: false,
      shared_state_established: false, consensus_asserted: false, transfer_performed_by_relatte: false, financial_payment_performed: false,
      ownership_transferred: false, universal_finality_asserted: false, objective_time_verified: false,
      operating_system_isolation_verified: false, organizational_independence_verified: false, observed_history_complete: false }, laws: [...FIELD_LAWS] };
  const body = { schema: 'useful-work.field-test-001/v1', ...(i as FieldInput), summary }; const archive = { ...body, field_id: fieldId(body) }; bounded(archive); return archive;
}
export const createFieldArchive = (input: FieldInput) => reconstruct(input);
export async function verifyFieldArchive(value: unknown) {
  const a = record(snapshot(value), 'INVALID_FIELD_ARCHIVE'); exactKeys(a, ['schema', 'field_id', 'summary', ...inputKeys], 'INVALID_FIELD_ARCHIVE');
  const { field_id, schema, summary, ...input } = a;
  requireThat(schema === 'useful-work.field-test-001/v1' && field_id === fieldId({ schema, ...input, summary }), 'FIELD_ARCHIVE_ID_MISMATCH');
  const rebuilt = await reconstruct(input); requireThat(equal(a, rebuilt), 'FIELD_ARCHIVE_REPLAY_MISMATCH'); return rebuilt;
}
function archiveSpec(archive: Awaited<ReturnType<typeof createFieldArchive>>, at: string) {
  requireThat(instant(at) >= latestSignedClaim(archive), 'FIELD_PRESERVATION_PRECEDES_EVIDENCE');
  return { schema: 'relatte.opaque-organ-spec/v0' as const, family_ref: 'organ:useful-work/field-test-001-v1', donor_contract_ref: FIELD_CONTRACT,
    artifact_kind: 'two-worlds-trade-public-evidence', source_world: worldId('C'), source_particular: 'particular:field:preserver', source_history_head: null,
    payload_refs: [{ address: archive.field_id, role: 'public-field-archive', media_type: 'application/json' }],
    donor_claims: { field_id: archive.field_id, result_id: archive.summary.result_id, evidence_id: archive.summary.evidence_id,
      preservation_only: true, winner_selected: false, truth_selected: false, authority_asserted: false, ownership_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
export async function sealFieldArchive(value: unknown, keys: P256KeyMaterial, at: string) {
  const archive = await verifyFieldArchive(value);
  requireThat(equal(keys.publicKeyJwk, archive.actors.C.keys.primary.public_key), 'FIELD_PRESERVER_KEY_MISMATCH');
  return sealOpaqueOrganCrossing(archiveSpec(archive, at), keys);
}
export async function verifyFieldDelivery(value: unknown) {
  const d = record(snapshot(value), 'INVALID_FIELD_DELIVERY'); exactKeys(d, ['schema', 'archive', 'crossing', 'retention'], 'INVALID_FIELD_DELIVERY');
  requireThat(d.schema === 'useful-work.field-test-001-delivery/v1', 'UNSUPPORTED_FIELD_DELIVERY');
  const { archive, crossing } = await verifyFieldReference(d.archive, d.crossing);
  requireThat(Array.isArray(d.retention) && d.retention.length === 4, 'FIELD_PEER_RETENTION_REQUIRED');
  const roles = new Set<string>();
  for (const h of d.retention) {
    exactKeys(record(h, 'INVALID_FIELD_RETENTION'), ['role', 'received', 'hold'], 'INVALID_FIELD_RETENTION');
    requireThat(['A', 'B', 'C', 'D'].includes(h.role) && !roles.has(h.role), 'INVALID_FIELD_RETENTION_WORLD'); roles.add(h.role);
    for (const r of [h.received, h.hold]) requireThat(await verifyReceipt(r) && r.world_id === worldId(h.role) && r.crossing_id === crossing.crossing_id && r.semantic_effect === 'none' && instant(r.created_at) >= instant(crossing.created_at), 'INVALID_FIELD_RETENTION_RECEIPT');
    requireThat(instant(h.hold.created_at) >= instant(h.received.created_at), 'FIELD_HOLD_PRECEDES_RECEIVE');
    requireThat(h.received.kind === 'RECEIVED' && h.hold.kind === 'R3_HOLD', 'INVALID_FIELD_RETENTION_DISPOSITION');
  }
  return { schema: d.schema, archive, crossing, retention: d.retention };
}
export async function verifyFieldReference(value: unknown, crossingValue: unknown) {
  crossingValue = snapshot(crossingValue); const archive = await verifyFieldArchive(value);
  const { authenticated } = await import('../challenge/exchange.ts'); const crossing = await authenticated(crossingValue); assertIdentity(crossing, archive.actors.C.keys.primary);
  requireThat(crossing.crossing_id === expectedCrossingId(archiveSpec(archive, crossing.created_at), signer(crossing).public_key), 'FIELD_PRESERVATION_REFERENCE_MISMATCH');
  return { archive, crossing };
}
