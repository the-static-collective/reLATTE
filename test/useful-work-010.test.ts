import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, sealCrossingEnvelope, sealReceipt } from '../src/protocol.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { rational } from '../src/useful_work/valuation/rational.ts';
import { createResourceBundle } from '../src/useful_work/resources/bundle.ts';
import { createEvidence, evidenceId, evaluateAcceptance, verifyEvidence } from '../src/useful_work/settlement/evidence.ts';
import { decide, inspectOffer, inspectPresentation, presentEvidence, publishOffer, verifyExchange } from '../src/useful_work/settlement/exchange.ts';
import type { DecisionKind, OfferTerms } from '../src/useful_work/settlement/exchange.ts';
import { inspectSettlement, inspectSettlementReceipt, observeSettlement, recordHash, replaySettlement } from '../src/useful_work/settlement/observation.ts';
import type { SettlementInput } from '../src/useful_work/settlement/observation.ts';
import { createSettlementBundle, settlementBundleId, verifySettlementBundle } from '../src/useful_work/settlement/bundle.ts';
import { acceptancePolicyId, parseAcceptancePolicy } from '../src/useful_work/settlement/policy.ts';
import type { AcceptancePolicy, Clause } from '../src/useful_work/settlement/policy.ts';
import { LIMITS, sealMessage, SETTLEMENT_CONTRACT, SETTLEMENT_LAWS, signer } from '../src/useful_work/settlement/wire.ts';
import type { Wire } from '../src/useful_work/settlement/wire.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(join(root, 'fixtures/useful-work-010-golden.json'), 'utf8'));
const base = Date.parse(fixture.bundle.exchange.presentation.created_at) + 1000;
const t = (ms: number) => new Date(base + ms).toISOString();
const raw = (v: Wire, kind: string) => v.extensions.organ_adapter.donor_claims['settlement_' + kind];
const offererWorld = 'world:test-offerer', presenterWorld = 'world:test-presenter', adapterWorld = 'world:test-external-adapter', replayerWorld = 'world:test-settlement-replayer';
async function setup(kind: 'payment' | 'credit-ledger' | 'resource' = 'credit-ledger') {
  const [offerer, presenter, adapter, replayer] = await Promise.all(Array.from({ length: 4 }, () => generateP256KeyPair()));
  const terms: OfferTerms = structuredClone(raw(fixture.bundle.exchange.offer, 'offer'));
  for (const key of ['schema', 'acceptance_policy_id', 'condition_basis', 'claims', 'laws']) delete (terms as unknown as Wire)[key];
  terms.transfer.kind = kind; terms.present_before = t(100); terms.eligible_presenter = { world_id: presenterWorld, public_key: presenter.publicKeyJwk };
  terms.settlement_adapter = { identity: { world_id: adapterWorld, public_key: adapter.publicKeyJwk }, allowed_record_origins: ['operator-import/v1'] };
  const evidence = structuredClone(fixture.bundle.exchange.evidence);
  const offer = await publishOffer(terms, offerer, offererWorld, t(0));
  const presentation = await presentEvidence(offer, evidence, presenter, presenterWorld, t(1));
  const decision = await decide(offer, evidence, presentation, 'ACCEPT', t(2), 'Admitted locally.', offerer, offererWorld, t(3));
  return { offerer, presenter, adapter, replayer, terms, evidence, offer, presentation, decision,
    exchange: { schema: 'useful-work.offer-exchange/v1', offer, evidence, presentation, decision } };
}
type Setup = Awaited<ReturnType<typeof setup>>;
function externalRecord(s: Setup, amount = rational(12), patch: Partial<SettlementInput> = {}): SettlementInput {
  const transfer = { ...s.terms.transfer, amount };
  const evidence = transfer.kind === 'payment' ? { transaction_ref: 'record:1', status: 'posted' } : transfer.kind === 'resource' ?
    { transfer_ref: 'record:1', status: 'reported-delivered' } : { entry_ref: 'record:1',
      debit: { account_ref: transfer.from_ref, before: rational(100), after: rational(100n * BigInt(amount.denominator) - BigInt(amount.numerator), BigInt(amount.denominator)) },
      credit: { account_ref: transfer.to_ref, before: rational(0), after: amount } };
  const input = { transfer, evidence, record_ref: 'record:1', observed_at: t(20),
    provenance: { record_origin: 'operator-import/v1' as const, provider_ref: 'external:test-source', adapter_version: 'test-reader/v1', record_sha256: '' }, ...patch };
  input.provenance.record_sha256 = recordHash({ transfer: input.transfer, record_ref: input.record_ref, evidence: input.evidence }); return input;
}
async function observation(s: Setup, input = externalRecord(s)) {
  const o = await observeSettlement(s.exchange, input, s.adapter, adapterWorld, t(21));
  const receipt = await replaySettlement(s.exchange, o, s.replayer, replayerWorld, t(22)); return { observation: o, receipt };
}
async function changedDecision(s: Setup, mutate: (body: Wire) => void) {
  const { signing: _, receipt_id: __, ...body } = structuredClone(s.decision); mutate(body); return sealReceipt(body, s.offerer);
}
async function child(args: string[], cwd = root, input?: unknown) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((yes, no) => {
    const p = spawn(args[0], args.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b); p.once('error', no); p.once('close', code => yes({ code, stdout, stderr }));
    p.stdin.end(input === undefined ? undefined : JSON.stringify(input));
  });
}
async function oracle(b: unknown) {
  const result = await child(['python3', 'examples/useful-work-010/settlement_vectors.py'], root, b);
  assert.equal(result.code, 0, result.stderr); return JSON.parse(result.stdout);
}

test('010 public golden replays the exact offer/presentation/ACCEPT and a separate ledger change without payment, ownership or finality', async () => {
  const b = await verifySettlementBundle(fixture.bundle), report = (await verifyExchange(b.exchange)).report;
  assert.equal(report.choice, 'ACCEPT'); assert.equal(b.exchange.decision.semantic_effect, 'none'); assert.equal(report.claims.payment_observed, false);
  assert.deepEqual(report.laws, SETTLEMENT_LAWS); assert.equal(b.summary.unique_observations, 1);
  const r = b.summary.observations[0]; assert.equal(r.claims.credit_ledger_changed, true); assert.equal(r.claims.payment_observed, false); assert.equal(r.terms_match, true);
  for (const [key, value] of Object.entries(LIMITS)) assert.equal((r.claims as Wire)[key], value);
  assert.deepEqual(await oracle(b), fixture.expected);
});

test('offers pin data-only acceptance policy, transfer terms, exact cutoff and external adapter identity', async () => {
  const s = await setup(), inspected = await inspectOffer(s.offer);
  assert.equal(inspected.policy_id, acceptancePolicyId(s.terms.policy));
  for (const mutate of [(p: Wire) => p.acceptance_policy_id = 'forged', (p: Wire) => p.claims.obligation_created = true,
    (p: Wire) => p.condition_basis = 'presenter-clock/v1', (p: Wire) => p.transfer.amount = rational(0), (p: Wire) => p.policy.algorithm = 'execute-arbitrary-code/v1',
    (p: Wire) => p.transfer.from_ref = p.transfer.to_ref, (p: Wire) => p.policy.clauses = [], (p: Wire) => p.settlement_adapter.allowed_record_origins = []]) {
    const payload = structuredClone(raw(s.offer, 'offer')); mutate(payload);
    await assert.rejects(inspectOffer(await sealMessage('offer', payload, s.offerer, offererWorld, t(0))));
  }
  await assert.rejects(publishOffer(s.terms, s.offerer, offererWorld, t(100)), /AFTER_CUTOFF/);
  await assert.rejects(publishOffer({ ...s.terms, settlement_adapter: { ...s.terms.settlement_adapter, identity: { world_id: 'alias', public_key: s.offerer.publicKeyJwk } } }, s.offerer, offererWorld, t(0)), /DISTINCT/);
});

test('presentation binds exact evidence inventory and offer; a different offer/evidence or modified native scope cannot substitute', async () => {
  const s = await setup(); await inspectPresentation(s.offer, s.evidence, s.presentation);
  const other = await publishOffer({ ...s.terms, description: 'Another offer.' }, s.offerer, offererWorld, t(0));
  await assert.rejects(inspectPresentation(other, s.evidence, s.presentation), /MISMATCH/);
  const { schema: _, evidence_id: __, ...input } = s.evidence;
  const removed = await createEvidence({ ...input, resources: null }); await assert.rejects(inspectPresentation(s.offer, removed, s.presentation), /MISMATCH/);
  const wrong = structuredClone(s.evidence); wrong.result_id = 'useful-work-merkle-result-v1:' + '0'.repeat(64);
  const { evidence_id: ___, ...body } = wrong; wrong.evidence_id = evidenceId(body); await assert.rejects(verifyEvidence(wrong), /RESULT_MISMATCH/);
  await assert.rejects(presentEvidence(s.offer, s.evidence, s.offerer, 'alias', t(1)), /DISTINCT/);
  await assert.rejects(presentEvidence(s.offer, s.evidence, s.presenter, presenterWorld, new Date(base - 2000).toISOString()), /PRECEDES/);
  const forged = structuredClone(s.presentation); forged.signing.signature = 'invalid'; await assert.rejects(inspectPresentation(s.offer, s.evidence, forged), /SIGNATURE/);
});

test('the offerer observation uses an exclusive cutoff; presenter time does not prove delivery, and a timely presentation permits a later decision', async () => {
  const s = await setup();
  for (const observedAt of [t(100), t(101)]) await assert.rejects(decide(s.offer, s.evidence, s.presentation, 'ACCEPT', observedAt, 'Too late.', s.offerer, offererWorld, t(200)), /LOCAL_CONDITIONS/);
  const lateHold = await decide(s.offer, s.evidence, s.presentation, 'HOLD', t(100), 'Observed at cutoff.', s.offerer, offererWorld, t(200));
  assert.equal((await verifyExchange({ ...s.exchange, decision: lateHold })).report.conditions.within_offerer_observed_window, false);
  const laterDecision = await decide(s.offer, s.evidence, s.presentation, 'ACCEPT', t(99), 'Received before cutoff.', s.offerer, offererWorld, t(200));
  assert.equal((await verifyExchange({ ...s.exchange, decision: laterDecision })).report.choice, 'ACCEPT');
  await assert.rejects(decide(s.offer, s.evidence, s.presentation, 'ACCEPT', t(0), 'Earlier claim.', s.offerer, offererWorld, t(3)), /PRECEDES_PRESENTATION/);
  await assert.rejects(decide(s.offer, s.evidence, s.presentation, 'ACCEPT', t(2), 'Backdated decision.', s.offerer, offererWorld, t(1)), /PRECEDES/);
});

test('PASS permits discretionary HOLD and REJECT; missing resource evidence remains MISSING, never a zero or automatic ACCEPT', async () => {
  const s = await setup();
  for (const choice of ['HOLD', 'REJECT'] as DecisionKind[]) {
    const d = await decide(s.offer, s.evidence, s.presentation, choice, t(2), 'Local discretion.', s.offerer, offererWorld, t(3));
    const v = await verifyExchange({ ...s.exchange, decision: d }); assert.equal(v.report.policy_evaluation.status, 'PASS'); assert.equal(v.report.choice, choice);
    await assert.rejects(observeSettlement(v.bundle, externalRecord(s), s.adapter, adapterWorld, t(21)), /REQUIRES_SPECIFIC_ACCEPTANCE/);
    const empty = await createSettlementBundle({ exchange: v.bundle, observations: [] }); assert.equal(empty.summary.unique_observations, 0);
  }
  const { schema: _, evidence_id: __, ...input } = s.evidence, evidence = await createEvidence({ ...input, resources: null });
  const p = await presentEvidence(s.offer, evidence, s.presenter, presenterWorld, t(1));
  await assert.rejects(decide(s.offer, evidence, p, 'ACCEPT', t(2), 'Missing.', s.offerer, offererWorld, t(3)), /LOCAL_CONDITIONS/);
  const hold = await decide(s.offer, evidence, p, 'HOLD', t(2), 'Need scoped CPU evidence.', s.offerer, offererWorld, t(3));
  assert.equal((await verifyExchange({ ...s.exchange, evidence, presentation: p, decision: hold })).report.policy_evaluation.checks[0].status, 'MISSING');
});

test('target and eligible presenter restrictions gate ACCEPT while cryptographically valid presentations remain inspectable', async () => {
  const s = await setup();
  for (const terms of [{ ...s.terms, target: { ...s.terms.target!, job_spec_hash: '0'.repeat(64) } },
    { ...s.terms, eligible_presenter: { world_id: 'world:other-presenter', public_key: s.presenter.publicKeyJwk } }]) {
    const o = await publishOffer(terms, s.offerer, offererWorld, t(0)), p = await presentEvidence(o, s.evidence, s.presenter, presenterWorld, t(1));
    await assert.rejects(decide(o, s.evidence, p, 'ACCEPT', t(2), 'Wrong eligible scope.', s.offerer, offererWorld, t(3)), /LOCAL_CONDITIONS/);
    const d = await decide(o, s.evidence, p, 'REJECT', t(2), 'Local conditions differ.', s.offerer, offererWorld, t(3));
    assert.equal((await verifyExchange({ ...s.exchange, offer: o, presentation: p, decision: d })).report.eligible_for_local_acceptance, false);
  }
});

test('only the offerer can decide; fully signed claim/effect/report upgrades and envelope metadata substitutions reject', async () => {
  const s = await setup();
  await assert.rejects(decide(s.offer, s.evidence, s.presentation, 'ACCEPT', t(2), 'Impersonation.', s.presenter, offererWorld, t(3)), /ISSUED_BY_OFFERER/);
  for (const mutate of [(r: Wire) => r.extensions.useful_work_offer_decision.claims.payment_observed = true,
    (r: Wire) => r.extensions.useful_work_offer_decision.claims.obligation_created = true, (r: Wire) => r.extensions.useful_work_offer_decision.policy_evaluation.status = 'MISSING',
    (r: Wire) => r.semantic_effect = 'ADMIT', (r: Wire) => r.post_state_ref = 'owned', (r: Wire) => r.extensions.useful_work_offer_decision.evidence.evidence_id = 'other']) {
    await assert.rejects(verifyExchange({ ...s.exchange, decision: await changedDecision(s, mutate) }), /REPLAY_MISMATCH/);
  }
  const { signing: _, crossing_id: __, ...body } = s.offer;
  const altered = await sealCrossingEnvelope({ ...body, parents: [s.presentation.crossing_id] }, s.offerer); await assert.rejects(inspectOffer(altered), /ENVELOPE_RULE/);
});

test('resource policy admits single typed observations from named collector/replayer and never adds duplicates or separate measurements', async () => {
  const s = await setup(), v = await verifyEvidence(s.evidence), policy = structuredClone(s.terms.policy);
  const cpu = v.resources!.summary.by_adapter.cpu[0].observed as Wire;
  const threshold = rational(BigInt(cpu.cpu_time_observed.numerator) * 2n, BigInt(cpu.cpu_time_observed.denominator));
  (policy.clauses[0] as Wire).minimum = threshold;
  assert.equal(evaluateAcceptance(v, policy).status, 'FAIL');
  const entries = s.evidence.resources.observations;
  const duplicated = await createResourceBundle({ job_spec: s.evidence.job_spec, work: s.evidence.work, observations: [...entries, ...entries] });
  const { schema: _, evidence_id: __, ...input } = s.evidence;
  const dup = await createEvidence({ ...input, resources: duplicated }); assert.equal(evaluateAcceptance(await verifyEvidence(dup), policy).status, 'FAIL');
  for (const mutate of [(c: Wire) => c.collector.world_id = 'alias', (c: Wire) => c.replayer.public_key = s.replayer.publicKeyJwk,
    (c: Wire) => c.allowed_capture_modes = ['imported-records/v1'], (c: Wire) => c.maximum = rational(0)]) {
    const changed = structuredClone(s.terms.policy); mutate(changed.clauses[0]);
    if ((changed.clauses[0] as Wire).maximum) (changed.clauses[0] as Wire).minimum = rational(0);
    assert.equal(evaluateAcceptance(v, changed).status, 'FAIL');
  }
  assert.throws(() => parseAcceptancePolicy({ ...policy, clauses: [{ ...policy.clauses[0], metric: 'resource_proven' }] }), /UNSUPPORTED/);
  assert.throws(() => parseAcceptancePolicy({ ...policy, clauses: [{ ...policy.clauses[0], minimum: { numerator: '2', denominator: '2' } }] }), /NON_CANONICAL/);
});

test('energy origin opt-in and storage/network thresholds preserve separate adapter meanings', async () => {
  const s = await setup(), v = await verifyEvidence(s.evidence), resources = v.resources!;
  for (const [adapter, metric] of [['energy', 'energy_watt_hours_observed'], ['storage', 'logical_file_bytes_observed'], ['network', 'interface_rx_bytes_observed']] as const) {
    const entry = resources.observations.find(e => e.measurement.extensions.organ_adapter.artifact_kind === 'resource-' + adapter)!;
    const clause: Clause = { kind: 'resource', collector: signer(entry.measurement), replayer: signer(entry.receipt), metric, minimum: rational(1, 10), maximum: null,
      allowed_capture_modes: adapter === 'energy' ? ['signed-meter-ingest/v1'] : ['live-local/v1'], allowed_reading_origins: adapter === 'energy' ? ['simulation/v1'] : [] };
    const policy: AcceptancePolicy = { schema: 'useful-work.acceptance-policy/v1', algorithm: 'typed-evidence-all/v1', name: 'Typed source check.', clauses: [clause] };
    assert.equal(evaluateAcceptance(v, policy).status, 'PASS');
    if (adapter === 'energy') { clause.allowed_reading_origins = ['device-telemetry/v1']; assert.equal(evaluateAcceptance(v, policy).status, 'FAIL'); }
  }
});

test('a valuation must match the evaluator, policy, unit and exact evidence context; local units have no conversion', async () => {
  const s = await setup(), v = await verifyEvidence(s.evidence);
  for (const mutate of [(c: Wire) => c.evaluator.world_id = 'alias', (c: Wire) => c.policy_id = 'useful-work-valuation-policy-v1:' + '0'.repeat(64),
    (c: Wire) => c.unit = 'money', (c: Wire) => c.minimum_amount = rational(13)]) {
    const policy = structuredClone(s.terms.policy); mutate(policy.clauses[1]); assert.equal(evaluateAcceptance(v, policy).status, 'FAIL');
  }
  const foreign = JSON.parse(await readFile(join(root, 'fixtures/useful-work-007-golden.json'), 'utf8'));
  const { schema: _, evidence_id: __, ...input } = s.evidence;
  await assert.rejects(createEvidence({ ...input, valuations: [{ schema: 'useful-work.valuation/v1', context: foreign.context, ...foreign.opinions[0] }] }), /VALUATION_SCOPE_MISMATCH/);
  const bad = structuredClone(s.evidence); bad.valuations[0].receipt.signing.signature = 'invalid';
  const { evidence_id: ___, ...body } = bad; bad.evidence_id = evidenceId(body); await assert.rejects(verifyEvidence(bad), /SIGNATURE/);
});

test('005 audit, 006 audit-history and 008 service policies replay public evidence with distinct trusted signers and native scopes', async () => {
  for (const n of ['005', '006', '008']) {
    const f = JSON.parse(await readFile(join(root, 'fixtures/useful-work-' + n + '-golden.json'), 'utf8'));
    const h = f.history, a = f.audit, work = a?.submissions[0].work ?? h.work, job = a?.job_spec ?? h.job_spec;
    const evidence = await createEvidence({ result_id: a?.result_id ?? h.summary.result_id, job_spec: job, work,
      audit: a ?? null, audit_history: n === '006' ? h : null, service_history: n === '008' ? h : null, resources: null, valuations: [] });
    const clause: Clause = n === '005' ? { kind: 'audit', verifiers: [signer(a.submissions[0].receipt)], minimum_matching_entries: 1, reject_contradictions: false } :
      n === '006' ? { kind: 'audit-history', observer: signer(h.cut), minimum_completed_slots: 1 } :
        { kind: 'service', observer: signer(h.cut), host: signer(h.commitment), minimum_in_window_verified_slots: 1 };
    const p: AcceptancePolicy = { schema: 'useful-work.acceptance-policy/v1', algorithm: 'typed-evidence-all/v1', name: 'Pinned evidence sources.', clauses: [clause] };
    const v = await verifyEvidence(evidence); assert.equal(evaluateAcceptance(v, p).status, 'PASS');
    if (clause.kind === 'audit') clause.verifiers[0].world_id = 'untrusted-world'; else clause.observer.world_id = 'untrusted-world';
    assert.equal(evaluateAcceptance(v, p).status, 'FAIL');
    const s = await setup(), { schema: _, evidence_id: __, ...input } = s.evidence;
    await assert.rejects(createEvidence({ ...input, audit: n === '005' ? a : null, audit_history: n === '006' ? h : null, service_history: n === '008' ? h : null }), /SCOPE_MISMATCH/);
  }
});

test('payment, credit-ledger and resource adapters sign distinct observations; each replay establishes only its own attributed record', async () => {
  for (const kind of ['payment', 'credit-ledger', 'resource'] as const) {
    const s = await setup(kind), entry = await observation(s), v = await inspectSettlementReceipt(s.exchange, entry.observation, entry.receipt);
    assert.equal(v.report.adapter, kind); assert.equal(v.report.terms_match, true);
    assert.equal(v.report.claims.payment_observed, kind === 'payment'); assert.equal(v.report.claims.credit_ledger_changed, kind === 'credit-ledger'); assert.equal(v.report.claims.resource_transferred, kind === 'resource');
    assert.equal(entry.receipt.kind, 'SETTLEMENT_OBSERVED'); assert.equal(entry.receipt.semantic_effect, 'none');
    assert.equal(v.report.claims.provider_authenticity_verified, false); assert.equal(v.report.claims.offer_fulfilled_asserted, false);
    await oracle(await createSettlementBundle({ exchange: s.exchange, observations: [entry] }));
  }
});

test('partial, excess, wrong-system and wrong-unit records remain separate, with explicit comparison and no global paid flag', async () => {
  const s = await setup('payment'), entries = [];
  for (const amount of [rational(1, 3), rational(13)]) {
    const entry = await observation(s, externalRecord(s, amount)), v = await inspectSettlement(s.exchange, entry.observation);
    assert.equal(v.report.terms_match, false); assert.equal(v.report.amount_relation, amount.numerator === '13' ? 'greater' : 'less'); entries.push(entry);
  }
  for (const patch of [{ unit: 'foreign-credit' }, { system_ref: 'another-ledger' }, { to_ref: 'another-recipient' }]) {
    const entry = await observation(s, externalRecord(s, rational(12), { transfer: { ...s.terms.transfer, ...patch } }));
    const v = await inspectSettlement(s.exchange, entry.observation); assert.equal(v.report.terms_match, false); assert.equal(v.report.amount_relation, 'incomparable'); entries.push(entry);
  }
  const b = await createSettlementBundle({ exchange: s.exchange, observations: entries });
  assert.equal(b.summary.claims.aggregate_paid_amount_computed, false); assert.equal(b.summary.claims.offer_fulfilled_asserted, false);
  assert.equal(b.summary.repeated_external_record_labels[0].conflicting_record_contents, true); await oracle(b);
});

test('ledger deltas, source digests, posted status, provenance and chronological order must match before any settlement receipt', async () => {
  const s = await setup();
  for (const mutate of [(p: SettlementInput) => p.evidence.credit.after = rational(13), (p: SettlementInput) => p.evidence.debit.account_ref = 'wrong-account',
    (p: SettlementInput) => p.evidence.entry_ref = 'another-record', (p: SettlementInput) => p.observed_at = t(2),
    (p: SettlementInput) => p.provenance.record_origin = 'simulation/v1']) {
    const input = externalRecord(s); mutate(input); input.provenance.record_sha256 = recordHash({ transfer: input.transfer, record_ref: input.record_ref, evidence: input.evidence });
    await assert.rejects(observeSettlement(s.exchange, input, s.adapter, adapterWorld, t(21)));
  }
  const wrongHash = externalRecord(s); wrongHash.provenance.record_sha256 = '0'.repeat(64); await assert.rejects(observeSettlement(s.exchange, wrongHash, s.adapter, adapterWorld, t(21)), /DIGEST/);
  await assert.rejects(observeSettlement(s.exchange, externalRecord(s), s.adapter, adapterWorld, t(19)), /TIME_MISMATCH/);
  const payment = await setup('payment'), pending = externalRecord(payment); pending.evidence.status = 'pending'; pending.provenance.record_sha256 = recordHash({ transfer: pending.transfer, record_ref: pending.record_ref, evidence: pending.evidence });
  await assert.rejects(observeSettlement(payment.exchange, pending, payment.adapter, adapterWorld, t(21)), /NOT_POSTED/);
});

test('settlement cannot substitute an acceptance, adapter, evidence or stronger signed claims, and replay requires distinct role keys', async () => {
  const s = await setup(), entry = await observation(s);
  await assert.rejects(observeSettlement(s.exchange, externalRecord(s), s.presenter, adapterWorld, t(21)), /IDENTITY/);
  const otherDecision = await decide(s.offer, s.evidence, s.presentation, 'ACCEPT', t(2), 'Another attributed decision.', s.offerer, offererWorld, t(4));
  await assert.rejects(inspectSettlement({ ...s.exchange, decision: otherDecision }, entry.observation), /SCOPE/);
  for (const mutate of [(p: Wire) => p.claims.ownership_verified = true, (p: Wire) => p.claims.transfer_performed_by_relatte = true,
    (p: Wire) => p.scope.evidence_id = 'other', (p: Wire) => p.measurement_source = 'universal/finality/v1']) {
    const p = structuredClone(raw(entry.observation, 'observation-credit-ledger')); mutate(p);
    await assert.rejects(inspectSettlement(s.exchange, await sealMessage('observation-credit-ledger', p, s.adapter, adapterWorld, t(21))), /SCOPE_OR_CLAIMS/);
  }
  for (const key of [s.offerer, s.presenter, s.adapter]) await assert.rejects(replaySettlement(s.exchange, entry.observation, key, 'world:alias', t(22)), /DISTINCT/);
  await assert.rejects(replaySettlement(s.exchange, entry.observation, s.replayer, replayerWorld, t(20)), /PRECEDES/);
  for (const mutate of [(r: Wire) => r.extensions.useful_work_settlement.claims.universal_finality_asserted = true,
    (r: Wire) => r.extensions.useful_work_settlement.claims.provider_authenticity_verified = true,
    (r: Wire) => r.extensions.useful_work_settlement.terms_match = false, (r: Wire) => r.semantic_effect = 'ADMIT']) {
    const { receipt_id: _, signing: __, ...body } = structuredClone(entry.receipt); mutate(body);
    await assert.rejects(inspectSettlementReceipt(s.exchange, entry.observation, await sealReceipt(body, s.replayer)), /REPLAY_MISMATCH/);
  }
});

test('authentication precedes deduplication; repeated observations/record labels remain visible without crediting transfers twice', async () => {
  const s = await setup(), entry = await observation(s), b = await createSettlementBundle({ exchange: s.exchange, observations: [entry, entry] });
  assert.equal(b.summary.submitted_observations, 2); assert.equal(b.summary.unique_observations, 1); assert.equal(b.summary.replayed_observation_submissions, 1);
  const bad = structuredClone(entry); bad.observation.signing.signature = 'invalid'; await assert.rejects(createSettlementBundle({ exchange: s.exchange, observations: [entry, bad] }), /SIGNATURE/);
  const changed = structuredClone(b); changed.summary.claims.aggregate_paid_amount_computed = true;
  const { bundle_id: _, ...body } = changed; changed.bundle_id = settlementBundleId(body); await assert.rejects(verifySettlementBundle(changed), /REPLAY/);
  const second = await observeSettlement(s.exchange, externalRecord(s), s.adapter, adapterWorld, t(23));
  const receipt = await replaySettlement(s.exchange, second, s.replayer, replayerWorld, t(24));
  const repeated = await createSettlementBundle({ exchange: s.exchange, observations: [entry, { observation: second, receipt }] });
  assert.equal(repeated.summary.unique_observations, 2); assert.equal(repeated.summary.repeated_external_record_labels[0].conflicting_record_contents, false);
});

test('public inspection snapshots mutable inputs before asynchronous signature checks', async () => {
  const s = await setup(), originalOfferId = s.offer.crossing_id;
  const pendingOffer = inspectOffer(s.offer); s.offer.created_at = t(1000); s.offer.signing.signature = 'invalid';
  assert.equal((await pendingOffer).crossing.crossing_id, originalOfferId);
  const intact = s.exchange.offer = (await pendingOffer).crossing;
  const pendingPresentation = inspectPresentation(intact, s.evidence, s.presentation);
  s.presentation.signing.signature = 'invalid'; s.evidence.resources = null;
  const verified = await pendingPresentation; assert.equal(verified.evidence.bundle.evidence_id, fixture.bundle.exchange.evidence.evidence_id);
  s.exchange.evidence = verified.evidence.bundle; s.exchange.presentation = verified.crossing;
  const entry = await observation(s), pendingSettlement = inspectSettlementReceipt(s.exchange, entry.observation, entry.receipt);
  entry.observation.signing.signature = 'invalid'; entry.receipt.extensions.useful_work_settlement.claims.universal_finality_asserted = true;
  assert.equal((await pendingSettlement).report.claims.universal_finality_asserted, false);
});

test('opaque offers traverse RECEIVE/HOLD while a local ACCEPT receipt creates no receiver admission or transfer effects', async () => {
  const s = await setup(), dir = await mkdtemp(join(tmpdir(), 'relatte-offer-receiver-'));
  try {
    const receiver = await LocalReceiver.create(join(dir, 'receiver'), { world_id: 'world:test-offer-holder', receiver_particular: 'particular:test-holder', contract_ref: SETTLEMENT_CONTRACT });
    await receiver.receive(s.offer, t(1)); const disposition = await receiver.dispose(s.offer.crossing_id, 'HOLD', t(2)); assert.equal(disposition.semantic_effect, 'none');
    const acceptance = (await verifyExchange(s.exchange)).report; assert.equal(acceptance.claims.transfer_performed_by_relatte, false); assert.equal(acceptance.claims.obligation_created, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('fresh relocated verification needs no demo ledger, collectors, mathematics, original artifacts, private keys or Python', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-settlement-portable-'));
  try {
    await cp(join(root, 'src'), join(dir, 'src'), { recursive: true }); await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await writeFile(join(dir, 'package.json'), '{"type":"module"}'); await writeFile(join(dir, 'settlement.json'), canonicalBytes(fixture.bundle));
    for (const path of ['src/useful_work/resources/collectors.ts', 'src/useful_work/algorithm.ts', 'src/useful_work/merkle_native/worker.ts', 'src/useful_work/worker.ts']) await rm(join(dir, path));
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_010.ts', 'verify', 'settlement.json', '--out', 'verified'], dir);
    assert.equal(result.code, 0, result.stderr); const b = JSON.parse(await readFile(join(dir, 'verified/settlement.json'), 'utf8')); assert.equal(b.bundle_id, fixture.bundle.bundle_id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('010 demo changes a separate local ledger after ACCEPT; standalone replay and CLI decisions/observations cannot execute that transfer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-settlement-demo-'));
  try {
    const out = join(dir, 'demo'), result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_010.ts', 'demo', '--out', out]);
    assert.equal(result.code, 0, result.stderr); const b = await verifySettlementBundle(JSON.parse(await readFile(join(out, 'settlement.json'), 'utf8')));
    const ledgerPath = join(out, 'local-state/external-demo-ledger.json'), before = await readFile(ledgerPath, 'utf8');
    assert.deepEqual(JSON.parse(before).balances, { offerer: '88', presenter: '12' }); await oracle(b);
    for (const choice of ['hold', 'reject']) assert.equal((await verifyExchange(JSON.parse(await readFile(join(out, choice + '-exchange.json'), 'utf8')))).report.choice, choice.toUpperCase());
    const provenance = JSON.parse(await readFile(join(out, 'demo-provenance.json'), 'utf8')); assert.equal(provenance.financial_payment_performed, false);
    for (const [command, paths] of [['replay', [join(out, 'exchange.json'), join(out, 'observation.json')]], ['observe', [join(out, 'exchange.json'), join(out, 'external-record.json')]]] as const) {
      const isReplay = command === 'replay', key = join(out, 'local-state', isReplay ? 'replayer-key.json' : 'adapter-key.json');
      const r = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_010.ts', command, ...paths, '--key', key,
        '--world', isReplay ? 'world:another-replayer' : 'world:offer-demo-ledger-adapter', '--out', join(dir, command)]);
      assert.equal(r.code, 0, r.stderr); assert.equal(await readFile(ledgerPath, 'utf8'), before);
    }
    const duplicate = await child([process.execPath, '--experimental-strip-types', 'examples/useful-work-010/demo-ledger.ts', 'transfer', ledgerPath, 'demo-entry-1', '12']);
    assert.equal(duplicate.code, 0, duplicate.stderr); assert.equal(await readFile(ledgerPath, 'utf8'), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
