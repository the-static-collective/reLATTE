import { spawn } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import type { P256KeyMaterial } from '../protocol.ts';
import { canonicalBytes, exactKeys, integer, record } from './job.ts';
import { fresh, now, json, bundle, held, boundedRead, loadBundle, readWorkerKeys } from './cli_io.ts';
import { appendHistory, sealHistoryCut, verifyHistory } from './audit_clock/history.ts';
import { inspectNativeWork } from './merkle_native/exchange.ts';
import { verifyNativeChallenge } from './merkle_native/verifier.ts';
import { nativeReceipt } from './merkle_native/receipt.ts';
import { NATIVE_PYTHON_SCRIPT, nativePythonChecker } from './merkle_native/python_checker.ts';
import { createContext, MAX_VALUATION_BUNDLE_BYTES, MAX_VALUATION_CONTEXT_BYTES } from './valuation/context.ts';
import { evaluate, compareValuations, verifyValuation } from './valuation/evaluator.ts';
import { signResourceClaim } from './valuation/resource.ts';
import { VALUATION_CONTRACT } from './valuation/wire.ts';
import type { ResourceClaim, ValuationBundle, ValuationInput } from './valuation/types.ts';

const repositoryRoot = fileURLToPath(new URL(import.meta.url.includes('/.build/') ? '../../..' + '/' : '../../', import.meta.url));
async function readJson(path: string, max = MAX_VALUATION_BUNDLE_BYTES) { return JSON.parse((await boundedRead(path, max)).toString('utf8')); }
async function writeCanonical(path: string, value: unknown) { await writeFile(path, canonicalBytes(value), { flag: 'wx' }); }
async function inputAt(path: string): Promise<ValuationInput> {
  const m = record(await readJson(path, 100_000), 'INVALID_VALUATION_INPUT_MANIFEST');
  exactKeys(m, ['schema', 'result_id', 'job_spec', 'work', 'audit', 'history', 'resource_claims', 'canonical_artifact'], 'INVALID_VALUATION_INPUT_MANIFEST_FIELDS');
  if (m.schema !== 'useful-work.valuation-input/v1' || !Array.isArray(m.resource_claims)) throw new Error('UNSUPPORTED_VALUATION_INPUT_MANIFEST');
  integer(m.resource_claims.length, 0, 128, 'RESOURCE_CLAIM_COUNT_LIMIT');
  const pathAt = (value: unknown) => { if (typeof value !== 'string' || !value) throw new Error('INVALID_VALUATION_INPUT_PATH'); return resolve(dirname(path), value); };
  const resources = []; for (const ref of m.resource_claims) resources.push(await loadBundle(pathAt(ref)));
  return { result_id: m.result_id, job_spec: m.job_spec, work: await loadBundle(pathAt(m.work)), audit: m.audit === null ? null : await readJson(pathAt(m.audit), MAX_VALUATION_CONTEXT_BYTES),
    history: m.history === null ? null : await readJson(pathAt(m.history), MAX_VALUATION_CONTEXT_BYTES), resource_claims: resources,
    canonical_artifact: m.canonical_artifact === null ? null : (await boundedRead(pathAt(m.canonical_artifact), 16 * 1024 * 1024)).toString('utf8') };
}
async function saveValuation(out: string, value: ValuationBundle) {
  const verified = await verifyValuation(value); await fresh(out);
  await writeCanonical(join(out, 'valuation.json'), verified.bundle);
  await json(join(out, 'valuation-receipt.json'), verified.bundle.receipt); await json(join(out, 'report.json'), verified.report);
  await bundle(join(out, 'crossing.json'), verified.bundle.crossing, 'Useful Work Kernel 007');
  await held(join(out, 'receiver'), verified.bundle.crossing, 'world:useful-work-local-valuation-holder', VALUATION_CONTRACT);
  console.log(JSON.stringify({ receipt_id: verified.bundle.receipt.receipt_id, world_id: verified.bundle.receipt.world_id,
    result_id: verified.report.scope.result_id, context_id: verified.report.scope.context_id, policy_id: verified.report.scope.policy_id,
    unit: verified.report.scope.unit, amount: verified.report.calculation.amount, local_opinion: true, economic_entitlement_asserted: false, output: out }, null, 2));
}
async function saveKey(out: string, keys: P256KeyMaterial) {
  await mkdir(join(out, 'evaluator-state'), { mode: 0o700 });
  await json(join(out, 'evaluator-state/private-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
}
async function subprocess(path: string, args: string[]) {
  const code = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', path, ...args], { stdio: 'inherit' });
    child.once('error', reject); child.once('close', code => resolveCode(code ?? 1));
  });
  if (code !== 0) throw new Error('VALUATION_DEMO_STEP_FAILED');
}
async function demo(jobPath: string, out: string, withMutant: boolean) {
  await fresh(out);
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  await subprocess(fileURLToPath(new URL(`./cli_006.${extension}`, import.meta.url)), ['demo', jobPath, '--rounds', '4', '--samples', '4', '--out', join(out, 'audit-history')]);
  const historyPath = join(out, 'audit-history/history/history.json');
  let { history } = await verifyHistory(await readJson(historyPath));
  if (withMutant) {
    const path = join(out, 'mutated-reference'); await mkdir(path);
    await cp(NATIVE_PYTHON_SCRIPT, join(path, 'merkle_result_v1.py'));
    const source = (await boundedRead(join(dirname(NATIVE_PYTHON_SCRIPT), 'julia_q24.py'), 100_000)).toString('utf8'), target = '"final_real_q": str(real)';
    if (!source.includes(target)) throw new Error('VALUATION_MUTATION_TARGET_MISSING');
    await writeFile(join(path, 'julia_q24.py'), source.replaceAll(target, '"final_real_q": str(real + 1)'), { flag: 'wx' });
    const context = await inspectNativeWork(history.work, canonicalBytes(history.job_spec)), issue = history.issues[0];
    const report = await verifyNativeChallenge(context, issue.challenge, history.responses[0], nativePythonChecker({ script: join(path, 'merkle_result_v1.py') }));
    if (!report.checked_count || !report.errors.includes('SAMPLED_COMPUTATION_MISMATCH')) throw new Error('VALUATION_MUTANT_DID_NOT_DISAGREE');
    const receipt = await nativeReceipt(report, await generateP256KeyPair(), now(), { world_id: 'world:useful-work-valuation:python-mutant', receiver_particular: 'particular:useful-work-valuation:python-mutant' });
    await json(join(path, 'verification-receipt.json'), receipt);
    const { schema: _, history_id: __, summary: ___, ...input } = history;
    const next = { ...input, receipts: [...input.receipts, receipt], prior_cuts: [...input.prior_cuts, history.cut] };
    const cut = await sealHistoryCut(next, await readWorkerKeys(join(out, 'audit-history/local-state/observer-key.json')), now());
    history = await appendHistory(history, { receipts: [receipt] }, cut);
  }
  await writeCanonical(join(out, 'observed-history.json'), history);
  const artifact = (await boundedRead(join(out, 'audit-history/prepared/worker-state/result.json'), 16 * 1024 * 1024)).toString('utf8');
  await writeFile(join(out, 'artifact.json'), artifact, { flag: 'wx' });
  const provider = await generateP256KeyPair(), claimIdentity = { world_id: 'world:useful-work-local-resource-claimant', particular: 'particular:useful-work-local-resource-claimant' };
  const claim: ResourceClaim = { schema: 'useful-work.resource-claim/v1', result_id: history.summary.result_id, audit_id: history.summary.evidence_accumulator!.audit_id,
    history_id: history.history_id, basis: 'self-reported/v1', claimed_at: now(), note: 'Signed local counters; physical expenditure, serving and persistent storage are unproven.',
    amounts: { cpu_ms: 6000, energy_millijoules: 45000, stored_bytes: Buffer.byteLength(artifact), served_bytes: 8192, mirrored_bytes: 2048 } };
  const claims = [await signResourceClaim(claim, provider, claimIdentity), await signResourceClaim({ ...claim, amounts: { ...claim.amounts, cpu_ms: 9000, served_bytes: 4096 } }, provider, claimIdentity)];
  await mkdir(join(out, 'resources'));
  for (const [i, c] of claims.entries()) await bundle(join(out, 'resources/claim-' + (i + 1) + '.json'), c, 'Useful Work Kernel 007');
  const input: ValuationInput = { result_id: history.summary.result_id, job_spec: history.job_spec, work: history.work, audit: null, history,
    resource_claims: claims, canonical_artifact: artifact }, context = await createContext(input);
  await writeCanonical(join(out, 'context.json'), context);
  await json(join(out, 'valuation-input.json'), { schema: 'useful-work.valuation-input/v1', result_id: input.result_id, job_spec: input.job_spec,
    work: 'audit-history/prepared/delivery/work.json', audit: null, history: 'observed-history.json', resource_claims: ['resources/claim-1.json', 'resources/claim-2.json'], canonical_artifact: 'artifact.json' });
  const coverage = await generateP256KeyPair(), discovery = await generateP256KeyPair(), values = [];
  for (const name of ['coverage-v1', 'discovery-v1', 'coverage-v2']) {
    const policy = await readJson(join(repositoryRoot, 'examples/useful-work-007', name + '.json'), 100_000), isDiscovery = name.startsWith('discovery');
    const keys = isDiscovery ? discovery : coverage, identity = { world_id: `world:useful-work-local-${isDiscovery ? 'discovery' : 'coverage'}`, particular: `particular:useful-work-local-${isDiscovery ? 'discovery' : 'coverage'}` };
    const value = await evaluate(context, policy, keys, now(), identity); values.push(value);
    await saveValuation(join(out, name), value); await saveKey(join(out, name), keys);
  }
  await json(join(out, 'comparison.json'), await compareValuations(values));
  console.log(JSON.stringify({ valuations: values.map(v => ({ receipt_id: v.receipt.receipt_id, world_id: v.receipt.world_id,
    policy_version: v.policy.policy_version, amount: v.receipt.extensions.useful_work_valuation.calculation.amount })),
    same_evidence: true, local_revision_retained: true, winner_selected: false, universal_value_asserted: false, output: out }, null, 2));
}
async function main(args: string[]) {
  const command = args.shift(), inputs: string[] = [], flags: Record<string, string | true> = {};
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  while (args.length) { const name = args.shift()!; if (Object.hasOwn(flags, name)) throw new Error('INVALID_CLI_OPTIONS'); if (name === '--with-mutant') flags[name] = true;
    else { const value = args.shift(); if (!value || value.startsWith('--')) throw new Error('INVALID_CLI_OPTIONS'); flags[name] = value; } }
  const arity: Record<string, number> = { demo: 1, context: 1, claim: 1, evaluate: 2, verify: 1 };
  if (!command || (command === 'compare' ? inputs.length < 2 || inputs.length > 16 : arity[command] !== inputs.length)) throw new Error('Usage: useful-work-007 demo <job> [--with-mutant] | context <manifest> | claim <claim-spec> | evaluate <context.json> <policy.json> | verify <valuation.json> [--crossing <bundle>] | compare <valuation-a.json> <valuation-b.json> [more...] [--out <new-directory>] [--key <local-private-key>] [--world <id>] [--particular <id>]');
  const signing = ['evaluate', 'claim'].includes(command);
  const allowed = ['--out', ...(command === 'demo' ? ['--with-mutant'] : []), ...(signing ? ['--key', '--world', '--particular'] : []), ...(command === 'evaluate' ? ['--at'] : []), ...(command === 'verify' ? ['--crossing'] : [])];
  if (Object.keys(flags).some(f => !allowed.includes(f))) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(String(flags['--out'] ?? `output/useful-work-007${command === 'demo' ? '' : '-' + command}`));
  if (command === 'demo') return demo(inputs[0], out, Boolean(flags['--with-mutant']));
  if (command === 'context') { const context = await createContext(await inputAt(inputs[0])); await fresh(out); await writeCanonical(join(out, 'context.json'), context); console.log(JSON.stringify({ context_id: context.context_id, output: out })); return; }
  if (command === 'claim' || command === 'evaluate') {
    const keys = flags['--key'] ? await readWorkerKeys(resolve(String(flags['--key']))) : await generateP256KeyPair();
    const identity = { world_id: String(flags['--world'] ?? 'world:useful-work-local-evaluator'), particular: String(flags['--particular'] ?? 'particular:useful-work-local-evaluator') };
    if (command === 'claim') { const claim = await signResourceClaim(await readJson(inputs[0], 100_000), keys, identity); await fresh(out); await bundle(join(out, 'resource-claim.json'), claim); if (!flags['--key']) await saveKey(out, keys); return; }
    await saveValuation(out, await evaluate(await readJson(inputs[0], MAX_VALUATION_CONTEXT_BYTES), await readJson(inputs[1], 100_000), keys, String(flags['--at'] ?? now()), identity));
    if (!flags['--key']) await saveKey(out, keys); return;
  }
  if (command === 'compare') { const values = []; for (const path of inputs) values.push(await readJson(path)); const comparison = await compareValuations(values); await fresh(out); await json(join(out, 'comparison.json'), comparison); console.log(JSON.stringify(comparison, null, 2)); return; }
  const value = await readJson(inputs[0]);
  if (flags['--crossing']) value.crossing = await loadBundle(resolve(String(flags['--crossing'])));
  return saveValuation(out, (await verifyValuation(value)).bundle);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
