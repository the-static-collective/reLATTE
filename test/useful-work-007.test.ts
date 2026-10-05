import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateP256KeyPair, sealReceipt, verifyReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { claims } from '../src/useful_work/challenge/exchange.ts';
import { executeNativeJob, nativeOrganSpec, answerNativeChallenge } from '../src/useful_work/merkle_native/worker.ts';
import { createNativeChallenge, inspectNativeWork, sealNativeMessage } from '../src/useful_work/merkle_native/exchange.ts';
import type { NativeResponse } from '../src/useful_work/merkle_native/exchange.ts';
import { verifyNativeChallenge } from '../src/useful_work/merkle_native/verifier.ts';
import { nativeTypescriptChecker } from '../src/useful_work/merkle_native/typescript_checker.ts';
import { nativePythonChecker } from '../src/useful_work/merkle_native/python_checker.ts';
import { nativeReceipt } from '../src/useful_work/merkle_native/receipt.ts';
import { createAudit, appendAudit } from '../src/useful_work/audit/accumulator.ts';
import { createHistory, historyId, verifyHistory } from '../src/useful_work/audit_clock/history.ts';
import { calculate, compareValuations, contextId, createContext, evaluate, inspectResourceClaim, parsePolicy, parseRational, parseResourceClaim,
  policyId, projectMetrics, rational, signResourceClaim, sealInterpretation, verifyContext, verifyValuation, VALUATION_CONTRACT, VALUATION_LAWS } from '../src/useful_work/valuation/index.ts';
import type { Metric, MetricName, ResourceClaim, ValuationBundle, ValuationContext, ValuationInput, ValuationPolicy } from '../src/useful_work/valuation/types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(await readFile(join(root, 'fixtures/useful-work-007-golden.json'), 'utf8'));
const context: ValuationContext = fixture.context;
const policies: ValuationPolicy[] = fixture.opinions.map((o: any) => o.policy);
const bundles: ValuationBundle[] = fixture.opinions.map((o: any) => ({ schema: 'useful-work.valuation/v1', context, ...o }));
const at = '2026-10-05T12:00:00.000Z';
const identity = { world_id: 'world:007-test', particular: 'particular:007-test' };
function input(c = context): ValuationInput { const { schema: _, context_id: __, ...v } = structuredClone(c); return v; }
function rehash(c: ValuationContext) { const { context_id: _, ...body } = c; c.context_id = contextId(body); return c; }
const feature = (metrics: Metric[], name: MetricName) => metrics.find(m => m.metric === name)!.value;
const projection = async (c = context) => projectMetrics(await verifyContext(c));
async function value(c = context, p = policies[0], key?: Awaited<ReturnType<typeof generateP256KeyPair>>) { return evaluate(c, p, key ?? await generateP256KeyPair(), at, identity); }
function simple(metric: MetricName = 'result_entries'): ValuationPolicy {
  return { schema: 'useful-work.valuation-policy/v1', algorithm: 'rational-linear-discount/v1', policy_name: 'local-test', policy_version: 1,
    unit: 'local-points', allow_self_reported_resources: false, terms: [{ metric, weight: rational(1), cap: null, missing: 'reject' }], uncertainty_discounts: [] };
}
async function child(executable: string, args: string[], cwd = root, stdin = '') {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const p = spawn(executable, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    p.stdout.on('data', b => { stdout += b; }); p.stderr.on('data', b => { stderr += b; }); p.once('error', reject);
    p.once('close', code => resolveResult({ code, stdout, stderr })); p.stdin.end(stdin);
  });
}
const cli = (args: string[], cwd = root) => child(process.execPath, ['--experimental-strip-types', 'src/useful_work/cli_007.ts', ...args], cwd);

test('007 signed golden opinions authenticate, preserve native identity and match independent raw-inventory Python vectors', async () => {
  assert.equal(context.context_id, fixture.expected.context_id);
  assert.equal(context.result_id, 'useful-work-merkle-result-v1:ec16f527c1dc41168f4f4c339519b1e620e641f11be41fb098cea78f48274563');
  const python = await child('python3', ['examples/useful-work-007/valuation_vectors.py', '--golden', 'fixtures/useful-work-007-golden.json']);
  assert.equal(python.code, 0, python.stderr); const oracle = JSON.parse(python.stdout);
  for (const [i, b] of bundles.entries()) {
    const v = await verifyValuation(b); assert.deepEqual(v.report.calculation.amount, fixture.expected.amounts[i]);
    assert.deepEqual(v.report.calculation, oracle.calculations[i]);
    assert.deepEqual(Object.fromEntries(v.report.metrics.map(m => [m.metric, m.value])), Object.fromEntries(oracle.metrics.map((m: Metric) => [m.metric, m.value])));
    assert.equal(b.receipt.kind, 'VALUED'); assert.equal(b.receipt.semantic_effect, 'none'); assert.deepEqual(v.report.laws, VALUATION_LAWS);
  }
  assert.deepEqual(fixture.expected.amounts, [rational(9), rational(48), rational(21, 2)]);
});

test('007 local calculation reproduces across unrelated worlds without making the units a universal price', async () => {
  const a = await value(), b = await evaluate(context, policies[0], await generateP256KeyPair(), at, { world_id: 'world:007-other', particular: 'particular:007-other' });
  assert.deepEqual((await verifyValuation(a)).report, (await verifyValuation(b)).report);
  assert.notEqual(a.receipt.receipt_id, b.receipt.receipt_id);
  const comparison = await compareValuations([a, b]); assert.equal(comparison.relation, 'same-local-amounts'); assert.equal(comparison.winner_selected, false);
});

test('007 same evidence supports contradictory valuations and a retained same-key local policy revision', async () => {
  const comparison = await compareValuations(bundles);
  assert.equal(comparison.relation, 'different-local-amounts'); assert.equal(comparison.observations.length, 3);
  assert.equal(bundles[0].receipt.world_id, bundles[2].receipt.world_id);
  assert.deepEqual(bundles[0].receipt.signing.public_key, bundles[2].receipt.signing.public_key);
  assert.notEqual(bundles[0].receipt.receipt_id, bundles[2].receipt.receipt_id);
  assert.equal(comparison.winner_selected, false); assert.equal(comparison.universal_value_asserted, false); assert.equal(comparison.semantic_effect, 'none');
  assert.deepEqual(await compareValuations([...bundles].reverse()), comparison);
});

test('007 policy identity binds name, version, unit, weights, caps and missing-evidence choices', () => {
  const original = policyId(policies[0]);
  for (const change of [ { policy_name: 'new' }, { policy_version: 2 }, { unit: 'other-local-unit' },
    { terms: [{ ...policies[0].terms[0], weight: rational(5) }] }, { terms: [{ ...policies[0].terms[0], cap: rational(0) }] },
    { uncertainty_discounts: [{ ...policies[0].uncertainty_discounts[0], missing: 'no-discount' }] } ]) {
    const p = parsePolicy({ ...policies[0], ...change }); assert.notEqual(policyId(p), original);
  }
});

test('007 exact rational caps, negative contributions, zero floor and multiplicative uncertainty are explicit', () => {
  const p = simple(); p.terms = [{ metric: 'result_entries', weight: rational(1, 3), cap: rational(5), missing: 'reject' },
    { metric: 'artifact_present_at_evaluation', weight: rational(-1, 7), cap: null, missing: 'zero' }];
  p.uncertainty_discounts = [{ metric: 'incomplete_schedule_fraction', rate: rational(1, 3), missing: 'max-discount' }];
  const metrics: Metric[] = [{ metric: 'result_entries', value: rational(12), basis: 'test', source_ids: [] },
    { metric: 'artifact_present_at_evaluation', value: rational(1), basis: 'test', source_ids: [] },
    { metric: 'incomplete_schedule_fraction', value: rational(1, 2), basis: 'test', source_ids: [] }];
  const result = calculate(p, metrics); assert.deepEqual(result.subtotal, rational(32, 21)); assert.deepEqual(result.amount, rational(80, 63));
  p.terms[0].cap = rational(0); const negative = calculate(p, metrics);
  assert.deepEqual(negative.subtotal, rational(-1, 7)); assert.deepEqual(negative.amount, rational(0));
});

test('007 missing metrics remain unknown and the declared missing rule chooses zero, reject or discount', () => {
  const p = simple('proven_cpu_ms'), metrics: Metric[] = [{ metric: 'proven_cpu_ms', value: null, basis: 'no-adapter', source_ids: [] },
    { metric: 'incomplete_schedule_fraction', value: null, basis: 'unknown', source_ids: [] }];
  assert.throws(() => calculate(p, metrics), /MISSING_VALUATION_METRIC:proven_cpu_ms/);
  p.terms[0].missing = 'zero'; assert.equal(calculate(p, metrics).terms[0].missing_applied, true);
  p.terms = [{ metric: 'result_entries', weight: rational(1), cap: null, missing: 'reject' }];
  metrics.push({ metric: 'result_entries', value: rational(12), basis: 'test', source_ids: [] });
  p.uncertainty_discounts = [{ metric: 'incomplete_schedule_fraction', rate: rational(1, 2), missing: 'max-discount' }];
  assert.deepEqual(calculate(p, metrics).amount, rational(6)); p.uncertainty_discounts[0].missing = 'no-discount';
  assert.deepEqual(calculate(p, metrics).amount, rational(12)); p.uncertainty_discounts[0].missing = 'reject';
  assert.throws(() => calculate(p, metrics), /MISSING_VALUATION_METRIC:incomplete_schedule_fraction/);
});

test('007 generated rational vectors cross-check full traces with a separate Python fractions implementation', async () => {
  let state = 7007; const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  const vectors = Array.from({ length: 96 }, (_, i) => {
    const p = simple(); p.terms = ['result_entries', 'matching_sample_entries', 'artifact_bytes_present'].map(metric => ({ metric: metric as MetricName,
      weight: rational(next() % 35 - 12, next() % 17 + 1), cap: i % 3 ? rational(next() % 25, next() % 7 + 1) : null, missing: 'zero' }));
    p.uncertainty_discounts = ['contradictory_observed_fraction', 'incomplete_schedule_fraction'].map(metric => ({ metric: metric as 'incomplete_schedule_fraction',
      rate: rational(next() % 11, 10), missing: i % 2 ? 'max-discount' : 'no-discount' }));
    const metrics: Metric[] = [...p.terms.map(t => ({ metric: t.metric, value: next() % 5 ? rational(next() % 100, next() % 13 + 1) : null, basis: 'vector', source_ids: [] })),
      ...p.uncertainty_discounts.map(d => ({ metric: d.metric, value: next() % 4 ? rational(next() % 11, 10) : null, basis: 'vector', source_ids: [] }))];
    return { policy: p, metrics };
  });
  const python = await child('python3', ['examples/useful-work-007/valuation_vectors.py'], root, JSON.stringify(vectors));
  assert.equal(python.code, 0, python.stderr); assert.deepEqual(vectors.map(v => calculate(v.policy, v.metrics)), JSON.parse(python.stdout));
});

test('007 malformed or unsupported policy/rational inputs fail explicitly with bounded arithmetic', () => {
  for (const r of [{ numerator: '2', denominator: '4' }, { numerator: '-0', denominator: '1' }, { numerator: '01', denominator: '1' },
    { numerator: '1', denominator: '0' }, { numerator: '1', denominator: '-2' }, { numerator: '9'.repeat(257), denominator: '1' }]) assert.throws(() => parseRational(r));
  assert.throws(() => rational(Number.MAX_SAFE_INTEGER + 1), /INVALID_RATIONAL_INTEGER/);
  const p = simple();
  for (const invalid of [{ ...p, algorithm: 'arbitrary-code/v1' }, { ...p, terms: [] }, { ...p, terms: [p.terms[0], p.terms[0]] },
    { ...p, terms: [{ ...p.terms[0], metric: 'universal_truth' }] }, { ...p, extra: true }, { ...p, policy_version: 0 },
    { ...p, uncertainty_discounts: [{ metric: 'incomplete_schedule_fraction', rate: rational(2), missing: 'max-discount' }] }]) assert.throws(() => parsePolicy(invalid));
  p.terms[0].weight = rational(BigInt('9'.repeat(256)));
  assert.throws(() => calculate(p, [{ metric: 'result_entries', value: rational(12), basis: 'test', source_ids: [] }]), /VALUATION_ARITHMETIC_LIMIT/);
  p.terms[0].weight = rational(1); const m: Metric = { metric: 'result_entries', value: rational(-1), basis: 'test', source_ids: [] };
  assert.throws(() => calculate(p, [m]), /NEGATIVE_PROJECTED_METRIC/); assert.throws(() => calculate(p, [m, m]), /DUPLICATE_PROJECTED_METRIC/);
});

test('007 resource claims require explicit opt-in and a cap; signed attribution never proves expenditure', async () => {
  const p = simple('max_claimed_cpu_ms'); assert.throws(() => parsePolicy(p), /RESOURCE_CLAIM_REQUIRES_OPT_IN_AND_CAP/);
  p.allow_self_reported_resources = true; assert.throws(() => parsePolicy(p), /RESOURCE_CLAIM_REQUIRES_OPT_IN_AND_CAP/);
  p.terms[0].cap = rational(5000); const r = (await verifyValuation(await value(context, p))).report;
  assert.deepEqual(r.calculation.terms[0].observed_value, rational(9000)); assert.deepEqual(r.calculation.amount, rational(5000));
  assert.equal(r.claims.resource_claim_signatures_verified, true); assert.equal(r.claims.resource_measurements_proven, false);
  assert.equal(feature(r.metrics, 'proven_cpu_ms'), null);
});

test('007 replayed or many signed resource claims cannot sum-inflate metrics, and conflicts remain visible', async () => {
  const v = input(); v.resource_claims.push(structuredClone(v.resource_claims[0]));
  const claim = (await inspectResourceClaim(v.resource_claims[0])).claim;
  v.resource_claims.push(await signResourceClaim(claim, await generateP256KeyPair(), identity));
  const projection = await projectMetrics(await verifyContext(await createContext(v)));
  assert.deepEqual(feature(projection.metrics, 'max_claimed_cpu_ms'), rational(9000));
  assert.equal(projection.resource_observations.submitted_claim_count, 4); assert.equal(projection.resource_observations.unique_claim_count, 3);
  assert.equal(projection.resource_observations.replayed_claim_submissions, 1);
  const cpu = projection.resource_observations.conflicting_amounts.find(c => c.field === 'cpu_ms')!;
  assert.deepEqual(cpu.values.map(v => v.amount), [6000, 9000]); assert.equal(cpu.values[0].claim_ids.length, 2);
});

test('007 every replay is authenticated before deduplication, including underlying history receipts', async () => {
  const v = input(); const bad = structuredClone(v.resource_claims[0]); bad.signing.signature = 'A'.repeat(86); v.resource_claims.push(bad);
  await assert.rejects(createContext(v), /INVALID_OPAQUE_SIGNATURE/);
  const h = input(); h.history!.receipts[0].signing.signature = 'A'.repeat(86); const { history_id: _, ...body } = h.history!; h.history!.history_id = historyId(body);
  await assert.rejects(createContext(h), /INVALID_RECEIPT_SIGNATURE|HISTORY_ID_MISMATCH/);
  const work = input(); work.work.signing.signature = 'A'.repeat(86); await assert.rejects(createContext(work), /INVALID_OPAQUE_SIGNATURE/);
});

test('007 claims bind result, audit and history IDs; measured-resource fiction is unsupported', async () => {
  const original = (await inspectResourceClaim(context.resource_claims[0])).claim;
  for (const change of [{ result_id: 'useful-work-merkle-result-v1:' + '0'.repeat(64) }, { audit_id: 'useful-work-audit-v1:' + '0'.repeat(64) },
    { history_id: 'useful-work-audit-history-v1:' + '0'.repeat(64) }]) {
    const v = input(); v.resource_claims = [await signResourceClaim({ ...original, ...change }, await generateP256KeyPair(), identity)];
    await assert.rejects(createContext(v), /RESOURCE_CLAIM_SCOPE_MISMATCH/);
  }
  assert.throws(() => parseResourceClaim({ ...original, basis: 'measured-and-proven/v1' }), /UNSUPPORTED_RESOURCE_CLAIM_BASIS/);
  assert.throws(() => parseResourceClaim({ ...original, amounts: { cpu_ms: null, energy_millijoules: null, stored_bytes: null, served_bytes: null, mirrored_bytes: null } }), /EMPTY_RESOURCE_CLAIM/);
  assert.throws(() => parseResourceClaim({ ...original, amounts: { ...original.amounts, cpu_ms: -1 } }), /INVALID_RESOURCE_AMOUNT/);
  const signed = await signResourceClaim({ ...original, audit_id: null, history_id: null }, await generateP256KeyPair(), identity);
  const v = input(); v.resource_claims = [signed]; await createContext(v); // Declared result-only scope is permitted, not silently tightened.
});

test('007 artifact presence verifies native structure and identity, not full computation or durable storage', async () => {
  const r = (await verifyValuation(bundles[0])).report;
  assert.equal(r.claims.artifact_structure_checked, true); assert.equal(r.claims.full_computation_verified, false);
  assert.deepEqual(feature(r.metrics, 'artifact_present_at_evaluation'), rational(1)); assert.equal(feature(r.metrics, 'full_computation_verified_result'), null);
  const v = input(); v.canonical_artifact = null; const missing = await projection(await createContext(v));
  assert.equal(feature(missing.metrics, 'artifact_present_at_evaluation'), null); assert.equal(feature(missing.metrics, 'artifact_bytes_present'), null);
  const altered = input(); const artifact = JSON.parse(altered.canonical_artifact!); artifact.escape_counts[0]++;
  altered.canonical_artifact = canonicalBytes(artifact).toString(); await assert.rejects(createContext(altered), /RESULT|ROOT/);
  const noncanonical = input(); noncanonical.canonical_artifact += '\n'; await assert.rejects(createContext(noncanonical), /NON_CANONICAL/);
});

test('007 all planned slots remain in uncertainty denominators and timing stays an observer claim', async () => {
  const r = (await verifyValuation(bundles[0])).report;
  assert.deepEqual(feature(r.metrics, 'incomplete_schedule_fraction'), rational(1, 2));
  assert.deepEqual(feature(r.metrics, 'completed_sample_observation_slots'), rational(2));
  assert.deepEqual(feature(r.metrics, 'observed_timely_answered_slot_fraction'), rational(1, 2));
  assert.equal(r.claims.objective_time_verified, false); assert.equal(r.claims.observed_history_complete, false); assert.equal(r.claims.uncertainty_is_fraud, false);
  const v = input(); const verified = await verifyHistory(v.history); v.audit = verified.audit; v.history = null; v.resource_claims = [];
  const a = await projection(await createContext(v)); assert.equal(feature(a.metrics, 'incomplete_schedule_fraction'), null);
  assert.equal(feature(a.metrics, 'observed_timely_answered_slot_fraction'), null); assert.deepEqual(feature(a.metrics, 'observed_sample_coverage'), rational(1, 2));
});

test('007 a pre-challenge inventory exposes all future slots with no invented timing or negative computation claim', async () => {
  const original = JSON.parse(await readFile(join(root, 'fixtures/useful-work-006-golden.json'), 'utf8')).history;
  const { schema: _, history_id: __, summary: ___, ...hist } = original;
  const planned = await createHistory({ ...hist, events: [], issues: [], responses: [], receipts: [], observations: [], prior_cuts: [], cut: original.prior_cuts[0] });
  const c = await createContext({ result_id: planned.summary.result_id, job_spec: planned.job_spec, work: planned.work, audit: null, history: planned,
    resource_claims: [], canonical_artifact: null });
  const r = (await verifyValuation(await value(c, simple('result_entries')))).report;
  assert.deepEqual(feature(r.metrics, 'incomplete_schedule_fraction'), rational(1));
  assert.deepEqual(feature(r.metrics, 'observed_sample_entries'), rational(0));
  assert.equal(feature(r.metrics, 'observed_timely_answered_slot_fraction'), null);
  assert.equal(r.claims.full_computation_verified, false); assert.equal(r.claims.uncertainty_is_fraud, false);
});

test('007 redundant exact audit/history references never double-reward; cherry-picked audit mismatch rejects', async () => {
  const h = await verifyHistory(context.history), v = input(); v.audit = h.audit;
  const both = await projection(await createContext(v)); assert.deepEqual(both.metrics, (await projection()).metrics);
  assert.notEqual((await createContext(v)).context_id, context.context_id);
  v.audit = await createAudit(context.job_spec, context.result_id, h.audit!.submissions.slice(0, 1));
  v.resource_claims = []; await assert.rejects(createContext(v), /VALUATION_AUDIT_HISTORY_MISMATCH/);
});

test('007 work without evidence remains valuatable under a declared workload policy; absent evidence is not zero knowledge', async () => {
  const v = input(); v.audit = null; v.history = null; v.resource_claims = []; v.canonical_artifact = null;
  const c = await createContext(v), r = (await verifyValuation(await value(c, simple('declared_iteration_budget')))).report;
  assert.deepEqual(r.calculation.amount, rational(192)); assert.equal(feature(r.metrics, 'observed_sample_entries'), null);
  assert.equal(feature(r.metrics, 'max_claimed_cpu_ms'), null); assert.equal(r.claims.resource_measurements_proven, false);
  await assert.rejects(value(c, simple('matching_sample_entries')), /MISSING_VALUATION_METRIC/);
});

test('007 evidence changes require a new context; a rehashed tampered job still fails the work binding', async () => {
  const c = structuredClone(context); c.canonical_artifact = null; await assert.rejects(verifyContext(c), /VALUATION_CONTEXT_ID_MISMATCH/);
  rehash(c); await verifyContext(c); assert.notEqual(c.context_id, context.context_id);
  const job = structuredClone(context); job.job_spec.seed++; rehash(job); await assert.rejects(verifyContext(job), /JOB_HASH_MISMATCH/);
  const wrong = input(); wrong.result_id = 'useful-work-merkle-result-v1:' + '0'.repeat(64); await assert.rejects(createContext(wrong), /VALUATION_RESULT_MISMATCH/);
});

async function nativeSetup() {
  const w = executeNativeJob(context.job_spec), key = await generateP256KeyPair();
  const crossing = await sealOpaqueOrganCrossing(nativeOrganSpec(w.manifest, w.tree.header, at), key);
  const ctx = await inspectNativeWork(crossing, canonicalBytes(w.job));
  return { w, key, ctx };
}
test('007 proof-only worker contradictions outside observed pixels cannot inflate an observed-fraction discount', async () => {
  const { w, key, ctx } = await nativeSetup();
  const challenge = await createNativeChallenge(ctx, 12, await generateP256KeyPair(), at);
  const response = await answerNativeChallenge(ctx, challenge, w.tree.bytes, key, at);
  const changed = structuredClone(claims(response).merkle_response) as NativeResponse;
  for (const s of changed.samples) s.final_real_q = (BigInt(s.final_real_q) + 1n).toString();
  const other = await sealNativeMessage('response', changed, key, at, response.source_world);
  const submissions = [];
  for (const responseValue of [response, other]) {
    const report = await verifyNativeChallenge(ctx, challenge, responseValue, nativePythonChecker({ executable: '/missing/python' }));
    submissions.push({ work: ctx.crossing, challenge, response: responseValue, receipt: await nativeReceipt(report, await generateP256KeyPair(), at, { world_id: 'world:offline', receiver_particular: 'particular:offline' }) });
  }
  let audit = await createAudit(w.job, ctx.result_id, submissions);
  const v: ValuationInput = { result_id: ctx.result_id, job_spec: w.job, work: ctx.crossing, audit, history: null, resource_claims: [], canonical_artifact: null };
  let projected = await projection(await createContext(v)); assert.deepEqual(feature(projected.metrics, 'contradictory_sample_entries'), rational(12));
  assert.equal(feature(projected.metrics, 'contradictory_observed_fraction'), null);
  const smallChallenge = await createNativeChallenge(ctx, 1, await generateP256KeyPair(), at), smallResponse = await answerNativeChallenge(ctx, smallChallenge, w.tree.bytes, key, at);
  const report = await verifyNativeChallenge(ctx, smallChallenge, smallResponse, nativeTypescriptChecker);
  audit = await appendAudit(audit, [{ work: ctx.crossing, challenge: smallChallenge, response: smallResponse, receipt: await nativeReceipt(report, await generateP256KeyPair(), at, { world_id: 'world:one', receiver_particular: 'particular:one' }) }]);
  v.audit = audit; projected = await projection(await createContext(v));
  assert.deepEqual(feature(projected.metrics, 'observed_sample_entries'), rational(1)); assert.deepEqual(feature(projected.metrics, 'contradictory_observed_fraction'), rational(1));
});

test('007 world/runtime aliases and rechecks do not establish additional implementation independence or full computation', async () => {
  const { w, key, ctx } = await nativeSetup(), challenge = await createNativeChallenge(ctx, 12, await generateP256KeyPair(), at);
  const response = await answerNativeChallenge(ctx, challenge, w.tree.bytes, key, at), report = await verifyNativeChallenge(ctx, challenge, response, nativeTypescriptChecker);
  const verifier = await generateP256KeyPair(), submissions = [];
  for (let i = 0; i < 3; i++) {
    const r = structuredClone(report); r.implementation!.runtime = `alias-${i}`;
    submissions.push({ work: ctx.crossing, challenge, response, receipt: await nativeReceipt(r, verifier, at, { world_id: `world:alias-${i}`, receiver_particular: `particular:alias-${i}` }) });
  }
  const audit = await createAudit(w.job, ctx.result_id, [...submissions, submissions[0]]);
  const c = await createContext({ result_id: ctx.result_id, job_spec: w.job, work: ctx.crossing, audit, history: null, resource_claims: [], canonical_artifact: null });
  const r = (await verifyValuation(await value(c, simple('mathematical_implementation_fingerprints')))).report;
  assert.deepEqual(r.calculation.amount, rational(1)); assert.deepEqual(feature(r.metrics, 'mathematical_verifier_keys'), rational(1));
  assert.deepEqual(feature(r.metrics, 'observed_sample_coverage'), rational(1)); assert.equal(feature(r.metrics, 'full_computation_verified_result'), null);
  assert.equal(r.claims.independent_verifier_execution_proven, false);
});

async function forged(change: (report: any) => void) {
  const key = await generateP256KeyPair(), b = await value(context, policies[0], key);
  const report = structuredClone(b.receipt.extensions.useful_work_valuation); change(report);
  b.crossing = await sealInterpretation('valuation', report, key, identity, at);
  const { receipt_id: _, signing: __, ...draft } = b.receipt;
  b.receipt = await sealReceipt({ ...draft, crossing_id: b.crossing.crossing_id, extensions: { useful_work_valuation: report, laws: VALUATION_LAWS } }, key);
  assert.equal(await verifyReceipt(b.receipt), true); return b;
}
test('007 valid signatures cannot hide wrong policy arithmetic, scope, metric origin or stronger truth/resource/ownership claims', async () => {
  for (const change of [(r: any) => { r.calculation.amount = rational(999); }, (r: any) => { r.scope.unit = 'global-price'; },
    (r: any) => { r.metrics[0].basis = 'proved-resource'; }, (r: any) => { r.claims.full_computation_verified = true; },
    (r: any) => { r.claims.ownership_transferred = true; }, (r: any) => { r.claims.payment_performed = true; }, (r: any) => { r.claims.resource_measurements_proven = true; }, (r: any) => { r.claims.economic_entitlement_asserted = true; }]) {
    await assert.rejects(verifyValuation(await forged(change)), /VALUATION_POLICY_CALCULATION_OR_SCOPE_MISMATCH/);
  }
});

test('007 receipt signatures, evaluator keys, world scope, semantic effect and policy bytes are independently enforced', async () => {
  const key = await generateP256KeyPair(), b = await value(context, policies[0], key);
  const invalid = structuredClone(b); invalid.receipt.signing.signature = 'A'.repeat(86); await assert.rejects(verifyValuation(invalid), /INVALID_VALUATION_RECEIPT_SIGNATURE/);
  const policy = structuredClone(b); policy.policy.policy_version++; await assert.rejects(verifyValuation(policy), /VALUATION_POLICY_CALCULATION_OR_SCOPE_MISMATCH/);
  const { receipt_id: _, signing: __, ...draft } = b.receipt;
  const otherKey = { ...b, receipt: await sealReceipt(draft, await generateP256KeyPair()) }; await assert.rejects(verifyValuation(otherKey), /VALUATION_EVALUATOR_KEY_MISMATCH/);
  for (const change of [{ world_id: 'world:fake' }, { semantic_effect: 'admit', pre_state_ref: 'state:before', post_state_ref: 'state:after' }, { kind: 'VERIFIED' }]) {
    const changed = { ...b, receipt: await sealReceipt({ ...draft, ...change }, key) };
    await assert.rejects(verifyValuation(changed), /INVALID_VALUATION_RECEIPT_SCOPE_OR_EFFECT/);
  }
});

test('007 unrecognized unsigned envelope/receipt fields cannot smuggle additional valuation semantics', async () => {
  const crossing = structuredClone(bundles[0]); crossing.crossing.ownership_transferred = true;
  await assert.rejects(verifyValuation(crossing), /INVALID_OPAQUE_SIGNATURE/);
  const receipt = structuredClone(bundles[0]); receipt.receipt.payment_performed = true;
  assert.equal(await verifyReceipt(receipt.receipt), false); // Existing protocol authentication rejects unexpected outer fields.
  await assert.rejects(verifyValuation(receipt), /INVALID_VALUATION_RECEIPT_SIGNATURE/);
});

test('007 comparison keeps units and evidence contexts separate and authenticates all opinions', async () => {
  const differentUnit = await value(context, { ...policies[0], unit: 'other-local-points' });
  assert.equal((await compareValuations([bundles[0], differentUnit])).relation, 'different-local-units');
  const v = input(); v.canonical_artifact = null; const differentContext = await value(await createContext(v));
  assert.equal((await compareValuations([bundles[0], differentContext])).relation, 'different-evidence-contexts');
  const bad = structuredClone(bundles[1]); bad.receipt.signing.signature = 'A'.repeat(86);
  await assert.rejects(compareValuations([bundles[0], bad]), /INVALID_VALUATION_RECEIPT_SIGNATURE/);
});

test('007 signed valuation traverses opaque machinery and a receiver HOLD without ownership, payment or admission', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw007-hold-'));
  try {
    const receiver = await LocalReceiver.create(join(temp, 'receiver'), { world_id: 'world:007-holder', receiver_particular: 'particular:007-holder', contract_ref: VALUATION_CONTRACT });
    const crossing = JSON.parse(canonicalBytes(bundles[0].crossing).toString()); await receiver.receive(crossing, at); await receiver.dispose(crossing.crossing_id, 'HOLD', at);
    assert.equal(receiver.snapshot().held.length, 1); assert.equal(receiver.getDispositionReceipt(crossing.crossing_id)?.semantic_effect, 'none');
    const before = receiver.snapshot(); await verifyValuation({ ...bundles[0], crossing }); assert.deepEqual(receiver.snapshot(), before);
    assert.equal(claims(crossing).ownership_asserted, false); assert.equal(claims(crossing).economic_entitlement_asserted, false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('007 durable real demo supports manifest collection, local revision, comparison and later Node-only verification without workers', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'uw007-demo-'));
  try {
    const job = join(temp, 'job.json'); await writeFile(job, canonicalBytes(context.job_spec)); const out = join(temp, 'demo');
    const run = await cli(['demo', job, '--with-mutant', '--out', out]); assert.equal(run.code, 0, run.stderr);
    const v = (await verifyValuation(JSON.parse(await readFile(join(out, 'coverage-v1/valuation.json'), 'utf8')))).bundle;
    assert.equal(v.context.history!.summary.schedule_accounting.planned_slots, 4);
    assert.equal(v.context.history!.summary.schedule_accounting.completed_observation_slots, 2);
    assert.ok((await verifyHistory(v.context.history)).audit!.summary.contradictions.length > 0);
    const collected = await cli(['context', join(out, 'valuation-input.json'), '--out', join(temp, 'collected')]); assert.equal(collected.code, 0, collected.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'collected/context.json'), 'utf8')).context_id, v.context.context_id);
    const evaluated = await cli(['evaluate', join(temp, 'collected/context.json'), 'examples/useful-work-007/coverage-v2.json', '--key', join(out, 'coverage-v1/evaluator-state/private-key.json'),
      '--world', v.receipt.world_id, '--particular', v.receipt.receiver_particular, '--out', join(temp, 'revision')]); assert.equal(evaluated.code, 0, evaluated.stderr);
    const compared = await cli(['compare', join(out, 'coverage-v1/valuation.json'), join(temp, 'revision/valuation.json'), '--out', join(temp, 'compared')]); assert.equal(compared.code, 0, compared.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'compared/comparison.json'), 'utf8')).winner_selected, false);
    const claim = (await inspectResourceClaim(v.context.resource_claims[0])).claim; await writeFile(join(temp, 'claim.json'), canonicalBytes(claim));
    const claimed = await cli(['claim', join(temp, 'claim.json'), '--out', join(temp, 'claimed')]); assert.equal(claimed.code, 0, claimed.stderr);
    await cp(join(out, 'coverage-v1/valuation.json'), join(temp, 'valuation.json')); await cp(join(out, 'coverage-v1/crossing.json'), join(temp, 'crossing.json'));
    await rm(out, { recursive: true }); await cp(join(root, 'src'), join(temp, 'src'), { recursive: true }); await cp(join(root, 'package.json'), join(temp, 'package.json'));
    await symlink(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir');
    for (const file of ['worker.ts', 'algorithm.ts', 'verifier.ts', 'merkle_native/worker.ts', 'merkle_native/typescript_checker.ts']) await rm(join(temp, 'src/useful_work', file), { recursive: true });
    const later = await cli(['verify', 'valuation.json', '--crossing', 'crossing.json', '--out', 'later'], temp); assert.equal(later.code, 0, later.stderr);
    assert.equal(JSON.parse(await readFile(join(temp, 'later/valuation.json'), 'utf8')).receipt.receipt_id, v.receipt.receipt_id);
    const failed = await cli(['evaluate', 'valuation.json', 'missing-policy.json', '--out', 'invalid'], temp); assert.notEqual(failed.code, 0);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
