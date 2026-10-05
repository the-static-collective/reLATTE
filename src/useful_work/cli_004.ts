import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { sealOpaqueOrganCrossing } from '../organ.ts';
import { sha256Hex } from '../canonical.ts';
import { RESULT_ID_PREFIX } from './merkle_native/result.ts';
import { createNativeChallenge, inspectNativeWork } from './merkle_native/exchange.ts';
import { claims } from './challenge/exchange.ts';
import { CHALLENGE_CONTRACT } from './merkle_native/contract.ts';
import { verifyNativeChallenge } from './merkle_native/verifier.ts';
import { nativePythonChecker } from './merkle_native/python_checker.ts';
import { nativeReceipt, compareNativeReceipts } from './merkle_native/receipt.ts';

import { now, json, fresh, bundle, held, boundedRead, loadBundle, readWorkerKeys } from './cli_io.ts';

async function contextAt(path: string) {
  const crossing = await loadBundle(path);
  const hash = claims(crossing).useful_work_native?.job_spec_hash;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_JOB_ADDRESS');
  return inspectNativeWork(crossing, await boundedRead(join(dirname(path), 'artifacts', hash), 4096));
}
async function prepare(input: string, out: string) {
  const { executeNativeJob, nativeOrganSpec } = await import('./merkle_native/worker.ts');
  const work = executeNativeJob(JSON.parse((await boundedRead(input, 4096)).toString('utf8')));
  const keys = await generateP256KeyPair();
  const crossing = await sealOpaqueOrganCrossing(nativeOrganSpec(work.manifest, work.tree.header, now()), keys);
  await fresh(out); await mkdir(join(out, 'delivery', 'artifacts'), { recursive: true });
  for (const [role, bytes] of Object.entries(work.artifacts)) {
    const name = role === 'merkle-result' ? work.manifest.result_id.slice(RESULT_ID_PREFIX.length) : sha256Hex(bytes);
    await writeFile(join(out, 'delivery', 'artifacts', name), bytes, { flag: 'wx' });
  }
  await bundle(join(out, 'delivery', 'work.json'), crossing, 'Useful Work Kernel 004');
  await json(join(out, 'job.json'), work.job); await json(join(out, 'result-header.json'), work.tree.header);
  await json(join(out, 'manifest.json'), work.manifest);
  await mkdir(join(out, 'worker-state'), { mode: 0o700 });
  await json(join(out, 'worker-state', 'private-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
  await writeFile(join(out, 'worker-state', 'result.json'), work.tree.bytes, { flag: 'wx', mode: 0o600 });
  await held(join(out, 'receiver'), crossing, 'world:useful-work-native-holder', CHALLENGE_CONTRACT);
  console.log(JSON.stringify({ step: 'merkle-native-result', work_id: crossing.crossing_id, result_id: work.manifest.result_id, output: out }));
}
async function issueChallenge(workPath: string, out: string, samples: number) {
  const context = await contextAt(workPath);
  const challenge = await createNativeChallenge(context, samples, await generateP256KeyPair(), now());
  await fresh(out);
  await bundle(join(out, 'challenge.json'), challenge, 'Useful Work Kernel 004');
  console.log(JSON.stringify({ step: 'signed-challenge', challenge_id: challenge.crossing_id, samples, output: out }));
}
async function answer(workPath: string, challengePath: string, state: string, out: string) {
  const { answerNativeChallenge } = await import('./merkle_native/worker.ts');
  const context = await contextAt(workPath);
  const challenge = await loadBundle(challengePath);
  const artifact = await boundedRead(join(state, 'result.json'), 16 * 1024 * 1024);
  const response = await answerNativeChallenge(context, challenge, artifact, await readWorkerKeys(join(state, 'private-key.json')), now());
  await fresh(out);
  await held(join(out, 'challenge-receiver'), challenge, 'world:useful-work-native-worker', CHALLENGE_CONTRACT);
  await bundle(join(out, 'response.json'), response, 'Useful Work Kernel 004');
  console.log(JSON.stringify({ step: 'signed-response', response_id: response.crossing_id, output: out }));
}
async function verify(workPath: string, challengePath: string, responsePath: string, out: string, world: string) {
  const context = await contextAt(workPath), challenge = await loadBundle(challengePath), response = await loadBundle(responsePath);
  const checkers = world === 'python' ? [['python', nativePythonChecker()] as const] :
    [['typescript', (await import('./merkle_native/typescript_checker.ts')).nativeTypescriptChecker] as const, ['python', nativePythonChecker()] as const];
  await fresh(out);
  const receipts = [];
  let failed = false;
  for (const [label, checker] of checkers) {
    const report = await verifyNativeChallenge(context, challenge, response, checker);
    const identity = { world_id: `world:useful-work-native-samples:${label}`, receiver_particular: `particular:useful-work-native-samples:${label}` };
    const receipt = await nativeReceipt(report, await generateP256KeyPair(), now(), identity);
    const path = join(out, label); await mkdir(path);
    await held(join(path, 'receiver'), response, identity.world_id, CHALLENGE_CONTRACT);
    await json(join(path, 'verifier-result.json'), report);
    await json(join(path, 'verification-receipt.json'), receipt);
    receipts.push(receipt);
    failed ||= report.errors.length > 0;
    console.log(JSON.stringify({ step: 'scoped-receipt', world: label, checked: report.checked_count, claims: report.claims, errors: report.errors, receipt_id: receipt.receipt_id }));
  }
  if (receipts.length > 1) {
    const comparison = await compareNativeReceipts(receipts);
    await json(join(out, 'comparison.json'), comparison);
    console.log(JSON.stringify({ relation: comparison.relation, semantic_effect: 'none', output: out }));
  }
  if (failed) process.exitCode = 1;
}
async function subprocess(args: string[]) {
  const code = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), ...args], { stdio: 'inherit' });
    child.once('error', reject); child.once('close', code => resolveCode(code ?? 1));
  });
  if (code !== 0) throw new Error('DEMO_STEP_FAILED');
}
async function main(args: string[]) {
  const command = args.shift();
  const inputs: string[] = [];
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  const flags: Record<string, string> = {};
  while (args.length) {
    const flag = args.shift()!, value = args.shift();
    if (!['--out', '--samples', '--state', '--world'].includes(flag) || flags[flag] || !value || value.startsWith('--')) throw new Error('INVALID_CLI_OPTIONS');
    flags[flag] = value;
  }
  const arity: Record<string, number> = { demo: 1, prepare: 1, challenge: 1, answer: 2, verify: 3, compare: 2 };
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-004 demo|prepare <job> | challenge <work> | answer <work> <challenge> --state <worker-state> | verify <work> <challenge> <response> | compare <receipt-a> <receipt-b> [--out <new-directory>] [--samples <1..64>] [--world both|python]');
  const allowed = ['--out', ...(['demo', 'challenge'].includes(command) ? ['--samples'] : []), ...(command === 'answer' ? ['--state'] : []), ...(command === 'verify' ? ['--world'] : [])];
  if (Object.keys(flags).some(flag => !allowed.includes(flag))) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-004${command === 'demo' ? '' : '-' + command}`);
  const samples = Number(flags['--samples'] ?? '16');
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 64) throw new Error('INVALID_SAMPLE_COUNT');
  const world = flags['--world'] ?? 'both';
  if (!['both', 'python'].includes(world)) throw new Error('INVALID_WORLD');
  if (command === 'prepare') return prepare(inputs[0], out);
  if (command === 'challenge') return issueChallenge(inputs[0], out, samples);
  if (command === 'answer') {
    if (!flags['--state']) throw new Error('WORKER_STATE_REQUIRED');
    return answer(inputs[0], inputs[1], resolve(flags['--state']), out);
  }
  if (command === 'verify') return verify(inputs[0], inputs[1], inputs[2], out, world);
  if (command === 'compare') {
    const comparison = await compareNativeReceipts(await Promise.all(inputs.map(async p => JSON.parse((await boundedRead(p, 1_000_000)).toString('utf8')))));
    await fresh(out); await json(join(out, 'comparison.json'), comparison); console.log(JSON.stringify(comparison, null, 2)); return;
  }
  // Distinct processes and durable commitment before the challenger creates fresh entropy.
  await fresh(out);
  await subprocess(['prepare', inputs[0], '--out', join(out, 'prepared')]);
  const work = join(out, 'prepared', 'delivery', 'work.json'), challenge = join(out, 'challenge', 'challenge.json');
  await subprocess(['challenge', work, '--samples', String(samples), '--out', join(out, 'challenge')]);
  await subprocess(['answer', work, challenge, '--state', join(out, 'prepared', 'worker-state'), '--out', join(out, 'answer')]);
  await subprocess(['verify', work, challenge, join(out, 'answer', 'response.json'), '--out', join(out, 'worlds')]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
