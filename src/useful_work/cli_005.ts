import { spawn } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { sealOpaqueOrganCrossing } from '../organ.ts';
import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from './job.ts';
import { now, json, fresh, bundle, held, boundedRead, loadBundle } from './cli_io.ts';
import { inspectNativeWork } from './merkle_native/exchange.ts';
import { verifyNativeChallenge } from './merkle_native/verifier.ts';
import { nativeReceipt } from './merkle_native/receipt.ts';
import { NATIVE_PYTHON_SCRIPT, nativePythonChecker } from './merkle_native/python_checker.ts';
import { appendAudit, createAudit, MAX_AUDIT_BYTES, verifyAudit } from './audit/accumulator.ts';
import { AUDIT_CONTRACT, auditOrganSpec, verifyAuditCrossing } from './audit/transport.ts';
import type { AuditObject, AuditSubmission } from './audit/types.ts';
import type { RandomnessModel } from './audit/model.ts';
import { parseModel } from './audit/model.ts';

async function saveAudit(out: string, audit: AuditObject) {
  await fresh(out);
  await writeFile(join(out, 'audit.json'), canonicalBytes(audit), { flag: 'wx' });
  await json(join(out, 'summary.json'), audit.summary);
  const crossing = await sealOpaqueOrganCrossing(auditOrganSpec(audit.audit_id, audit.result_id, now()), await generateP256KeyPair());
  await bundle(join(out, 'crossing.json'), crossing, 'Useful Work Kernel 005');
  await held(join(out, 'receiver'), crossing, 'world:useful-work-audit-holder', AUDIT_CONTRACT);
  const s = audit.summary;
  console.log(JSON.stringify({ audit_id: audit.audit_id, result_id: audit.result_id, submissions: s.submission_count,
    unique_challenges: s.unique_challenge_count, unique_receipts: s.unique_receipt_count, replayed_receipts: s.replayed_receipt_submissions,
    coverage: s.coverage, contradictory_pixels: s.contradictions.map(p => p.index), conditional_model: s.conditional_model,
    authority_asserted: false, consensus_asserted: false, output: out }, null, 2));
}
async function readJson(path: string, limit = MAX_AUDIT_BYTES) { return JSON.parse((await boundedRead(path, limit)).toString('utf8')); }
async function inputManifest(path: string) {
  const m = record(await readJson(path, 4 * 1024 * 1024), 'INVALID_AUDIT_INPUT');
  exactKeys(m, ['schema', 'job_spec', 'result_id', 'submissions'], 'INVALID_AUDIT_INPUT_FIELDS');
  if (m.schema !== 'useful-work.audit-input/v1' || !Array.isArray(m.submissions)) throw new Error('INVALID_AUDIT_INPUT');
  integer(m.submissions.length, 1, 1024, 'AUDIT_SUBMISSION_COUNT_LIMIT');
  const submissions: AuditSubmission[] = [];
  for (const value of m.submissions) {
    const refs = record(value, 'INVALID_AUDIT_INPUT_REFS');
    exactKeys(refs, ['work', 'challenge', 'response', 'receipt'], 'INVALID_AUDIT_INPUT_REFS');
    for (const ref of Object.values(refs)) if (typeof ref !== 'string' || !ref) throw new Error('INVALID_AUDIT_INPUT_PATH');
    const paths = Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key, resolve(dirname(path), ref)]));
    submissions.push({ work: await loadBundle(paths.work), challenge: await loadBundle(paths.challenge),
      response: await loadBundle(paths.response), receipt: await readJson(paths.receipt, 1_000_000) });
  }
  return { job: parseJob(m.job_spec), result_id: m.result_id as string, submissions };
}
async function kernel004(args: string[]) {
  const path = fileURLToPath(new URL(import.meta.url.endsWith('.js') ? './cli_004.js' : './cli_004.ts', import.meta.url));
  const code = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', path, ...args], { stdio: 'inherit' });
    child.once('error', reject); child.once('close', code => resolveCode(code ?? 1));
  });
  if (code !== 0) throw new Error('AUDIT_DEMO_STEP_FAILED');
}
async function demo(jobPath: string, out: string, rounds: number, samples: number, model: RandomnessModel | null, withMutant: boolean) {
  const { nativeTypescriptChecker } = await import('./merkle_native/typescript_checker.ts');
  const requestedJob = parseJob(await readJson(jobPath, 4096));
  parseModel(model, requestedJob.width * requestedJob.height);
  integer(samples, 1, Math.min(64, requestedJob.width * requestedJob.height), 'INVALID_SAMPLE_COUNT');
  await fresh(out);
  await kernel004(['prepare', jobPath, '--out', join(out, 'prepared')]);
  const workPath = join(out, 'prepared/delivery/work.json'), work = await loadBundle(workPath);
  const job = parseJob(await readJson(join(out, 'prepared/job.json'), 4096));
  const context = await inspectNativeWork(work, canonicalBytes(job));
  const keys = [await generateP256KeyPair(), await generateP256KeyPair()];
  const checkers = [nativeTypescriptChecker, nativePythonChecker()], labels = ['typescript', 'python'];
  let audit: AuditObject | null = null, first: AuditSubmission | null = null;
  await mkdir(join(out, 'snapshots'));
  const inputRefs: Record<string, string>[] = [];
  for (let round = 0; round < rounds; round++) {
    const path = join(out, 'round-' + (round + 1)), challengePath = join(path, 'challenge/challenge.json'), responsePath = join(path, 'answer/response.json');
    await kernel004(['challenge', workPath, '--samples', String(samples), '--out', join(path, 'challenge')]);
    await kernel004(['answer', workPath, challengePath, '--state', join(out, 'prepared/worker-state'), '--out', join(path, 'answer')]);
    const challenge = await loadBundle(challengePath), response = await loadBundle(responsePath), additions: AuditSubmission[] = [];
    for (const [i, label] of labels.entries()) {
      const report = await verifyNativeChallenge(context, challenge, response, checkers[i]);
      const receipt = await nativeReceipt(report, keys[i], now(), { world_id: `world:useful-work-audit:${label}`, receiver_particular: `particular:useful-work-audit:${label}` });
      const receiptPath = join(path, 'worlds', label); await mkdir(receiptPath, { recursive: true });
      await json(join(receiptPath, 'verification-receipt.json'), receipt); await json(join(receiptPath, 'verifier-result.json'), report);
      await held(join(receiptPath, 'receiver'), response, receipt.world_id, 'contract:useful-work/merkle-challenge-v1');
      const submission = { work, challenge, response, receipt }; additions.push(submission); first ??= submission;
      inputRefs.push({ work: 'prepared/delivery/work.json', challenge: `round-${round + 1}/challenge/challenge.json`, response: `round-${round + 1}/answer/response.json`, receipt: `round-${round + 1}/worlds/${label}/verification-receipt.json` });
    }
    audit = audit === null ? await createAudit(job, context.result_id, additions, model) : await appendAudit(audit, additions);
    await writeFile(join(out, 'snapshots', `round-${round + 1}.json`), canonicalBytes(audit), { flag: 'wx' });
  }
  // Both an exact receipt replay and a real recheck of the SAME challenge are visible.
  const recheck = await verifyNativeChallenge(context, first!.challenge, first!.response, nativeTypescriptChecker);
  const receipt = await nativeReceipt(recheck, keys[0], new Date(Math.max(Date.now(), Date.parse(first!.receipt.created_at) + 1)).toISOString(),
    { world_id: first!.receipt.world_id, receiver_particular: first!.receipt.receiver_particular });
  await json(join(out, 'recheck-receipt.json'), receipt);
  audit = await appendAudit(audit!, [first!, { ...first!, receipt }]);
  inputRefs.push(inputRefs[0], { ...inputRefs[0], receipt: 'recheck-receipt.json' });
  if (withMutant) {
    const path = join(out, 'mutated-reference'); await mkdir(path);
    await cp(NATIVE_PYTHON_SCRIPT, join(path, 'merkle_result_v1.py'));
    const math = await boundedRead(join(dirname(NATIVE_PYTHON_SCRIPT), 'julia_q24.py'), 100_000);
    const from = '"final_real_q": str(real)', source = math.toString('utf8');
    if (!source.includes(from)) throw new Error('AUDIT_MUTATION_TARGET_MISSING');
    await writeFile(join(path, 'julia_q24.py'), source.replaceAll(from, '"final_real_q": str(real + 1)'), { flag: 'wx' });
    const report = await verifyNativeChallenge(context, first!.challenge, first!.response, nativePythonChecker({ script: join(path, 'merkle_result_v1.py') }));
    const mutatedReceipt = await nativeReceipt(report, await generateP256KeyPair(), now(), { world_id: 'world:useful-work-audit:python-mutant', receiver_particular: 'particular:useful-work-audit:python-mutant' });
    await json(join(path, 'verification-receipt.json'), mutatedReceipt);
    audit = await appendAudit(audit, [{ ...first!, receipt: mutatedReceipt }]);
    inputRefs.push({ ...inputRefs[0], receipt: 'mutated-reference/verification-receipt.json' });
  }
  await json(join(out, 'audit-input.json'), { schema: 'useful-work.audit-input/v1', job_spec: job, result_id: context.result_id, submissions: inputRefs });
  await saveAudit(join(out, 'audit'), audit);
}

async function main(args: string[]) {
  const command = args.shift(), inputs: string[] = [], flags: Record<string, string | true> = {};
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  while (args.length) {
    const name = args.shift()!;
    if (Object.hasOwn(flags, name)) throw new Error('INVALID_CLI_OPTIONS');
    if (['--assume-honest-fresh', '--with-mutant'].includes(name)) flags[name] = true;
    else {
      const value = args.shift();
      if (!['--out', '--rounds', '--samples', '--bad-entries', '--crossing'].includes(name) || !value || value.startsWith('--')) throw new Error('INVALID_CLI_OPTIONS');
      flags[name] = value;
    }
  }
  const arity: Record<string, number> = { demo: 1, collect: 1, append: 2, verify: 1 };
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-005 demo <job> [--rounds 3] [--samples 16] [--with-mutant] | collect <audit-input.json> | append <audit.json> <audit-input.json> | verify <audit.json> [--crossing <bundle>] [--out <new-directory>] [--assume-honest-fresh --bad-entries <count>]');
  const allowed = ['--out', ...(command === 'demo' ? ['--rounds', '--samples', '--with-mutant'] : []),
    ...(['demo', 'collect'].includes(command) ? ['--assume-honest-fresh', '--bad-entries'] : []), ...(command === 'verify' ? ['--crossing'] : [])];
  if (Object.keys(flags).some(f => !allowed.includes(f))) throw new Error('INVALID_CLI_OPTIONS');
  if (Boolean(flags['--assume-honest-fresh']) !== Boolean(flags['--bad-entries'])) throw new Error('MODEL_REQUIRES_EXPLICIT_ASSUMPTION_AND_BAD_ENTRY_COUNT');
  const model: RandomnessModel | null = flags['--assume-honest-fresh'] ? { schema: 'useful-work.audit-randomness-model/v1',
    assumption: 'honest-independent-fresh-uniform-challenges-against-a-fixed-error-set', bad_entry_count: Number(flags['--bad-entries']) } : null;
  const out = resolve(String(flags['--out'] ?? (command === 'demo' ? 'output/useful-work-005' : `output/useful-work-005-${command}`)));
  if (command === 'demo') return demo(inputs[0], out, integer(Number(flags['--rounds'] ?? '3'), 1, 100, 'INVALID_AUDIT_ROUNDS'), integer(Number(flags['--samples'] ?? '16'), 1, 64, 'INVALID_SAMPLE_COUNT'), model, Boolean(flags['--with-mutant']));
  if (command === 'collect') {
    const m = await inputManifest(inputs[0]); return saveAudit(out, await createAudit(m.job, m.result_id, m.submissions, model));
  }
  if (command === 'append') {
    const previous = await verifyAudit(await readJson(inputs[0])), m = await inputManifest(inputs[1]);
    if (m.result_id !== previous.result_id || hashValue(m.job) !== hashValue(previous.job_spec)) throw new Error('AUDIT_INPUT_CONTEXT_MISMATCH');
    return saveAudit(out, await appendAudit(previous, m.submissions));
  }
  const value = await readJson(inputs[0]);
  const verified = flags['--crossing'] ? await verifyAuditCrossing(await loadBundle(resolve(String(flags['--crossing']))), value) : await verifyAudit(value);
  await saveAudit(out, verified);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
