import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import type { P256KeyMaterial } from '../protocol.ts';
import { sealOpaqueOrganCrossing } from '../organ.ts';
import { LocalReceiver } from '../receiver.ts';
import { makeTransportFrame, verifyAndExtractTransportFrame, writeFileBundle } from '../transport.ts';
import { sha256Hex } from '../canonical.ts';
import { buildCommitment } from './challenge/commitment.ts';
import { createChallenge, inspectSampleWork, claims } from './challenge/exchange.ts';
import { verifyChallenge } from './challenge/verifier.ts';
import { pythonChecker } from './challenge/python_checker.ts';
import { challengeReceipt, compareChallengeReceipts } from './challenge/receipt.ts';

const now = () => new Date().toISOString();
async function json(path: string, value: unknown, privateFile = false) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: privateFile ? 0o600 : 0o644 });
}
async function fresh(path: string) { await mkdir(dirname(path), { recursive: true }); await mkdir(path); }
async function bundle(path: string, crossing: Record<string, any>) {
  await writeFileBundle(path, await makeTransportFrame(crossing, 'file-bundle', now(), 'Useful Work Kernel 003'));
}
async function held(root: string, crossing: Record<string, any>, world: string) {
  const receiver = await LocalReceiver.create(root, { world_id: world, receiver_particular: `particular:${world}`, contract_ref: 'contract:useful-work/sample-challenge-v1' });
  const received = await receiver.receive(crossing, now());
  const hold = await receiver.dispose(crossing.crossing_id, 'HOLD', now());
  return { received, hold, snapshot: receiver.snapshot() };
}
async function boundedRead(path: string, limit: number) {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error('INPUT_SIZE_LIMIT');
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error('INPUT_SIZE_LIMIT');
  return bytes;
}
async function loadBundle(path: string) {
  const frame = JSON.parse((await boundedRead(path, 1_000_000)).toString('utf8'));
  if (frame.transport !== 'file-bundle') throw new Error('FILE_BUNDLE_REQUIRES_FILE_TRANSPORT');
  return verifyAndExtractTransportFrame(frame);
}
async function contextAt(path: string) {
  const crossing = await loadBundle(path);
  const hash = claims(crossing).useful_work?.job_spec_hash;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_JOB_ADDRESS');
  return inspectSampleWork(crossing, await boundedRead(join(dirname(path), 'artifacts', hash), 4096));
}
async function readWorkerKeys(path: string): Promise<P256KeyMaterial> {
  const jwk = JSON.parse((await boundedRead(path, 4096)).toString('utf8'));
  const publicKeyJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return { privateKey, publicKey, publicKeyJwk };
}
async function prepare(input: string, out: string) {
  const { executeJob, organSpec } = await import('./worker.ts');
  const work = executeJob(JSON.parse((await boundedRead(input, 4096)).toString('utf8')));
  const tree = buildCommitment(work.manifest.job_spec_hash, work.manifest.result_hash, work.result.escape_counts);
  const spec = organSpec(work.manifest, now());
  spec.donor_claims = { ...spec.donor_claims, sample_commitment: tree.commitment };
  const keys = await generateP256KeyPair();
  const crossing = await sealOpaqueOrganCrossing(spec, keys);
  await fresh(out);
  await mkdir(join(out, 'delivery', 'artifacts'), { recursive: true });
  for (const bytes of Object.values(work.artifacts)) await writeFile(join(out, 'delivery', 'artifacts', sha256Hex(bytes)), bytes, { flag: 'wx' });
  await bundle(join(out, 'delivery', 'work.json'), crossing);
  await json(join(out, 'job.json'), work.job);
  await json(join(out, 'commitment.json'), tree.commitment);
  await mkdir(join(out, 'worker-state'), { mode: 0o700 });
  await json(join(out, 'worker-state', 'private-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
  await json(join(out, 'worker-state', 'counts.json'), work.result.escape_counts, true);
  await held(join(out, 'receiver'), crossing, 'world:useful-work-work-holder');
  console.log(JSON.stringify({ step: 'committed-work', work_id: crossing.crossing_id, root: tree.commitment.root_hash, output: out }));
}
async function issueChallenge(workPath: string, out: string, samples: number) {
  const context = await contextAt(workPath);
  const challenge = await createChallenge(context, samples, await generateP256KeyPair(), now());
  await fresh(out);
  await bundle(join(out, 'challenge.json'), challenge);
  console.log(JSON.stringify({ step: 'signed-challenge', challenge_id: challenge.crossing_id, samples, output: out }));
}
async function answer(workPath: string, challengePath: string, state: string, out: string) {
  const { answerChallenge } = await import('./challenge/worker.ts');
  const context = await contextAt(workPath);
  const challenge = await loadBundle(challengePath);
  const counts = JSON.parse((await boundedRead(join(state, 'counts.json'), 16 * 1024 * 1024)).toString('utf8'));
  const response = await answerChallenge(context, challenge, counts, await readWorkerKeys(join(state, 'private-key.json')), now());
  await fresh(out);
  await held(join(out, 'challenge-receiver'), challenge, 'world:useful-work-worker');
  await bundle(join(out, 'response.json'), response);
  console.log(JSON.stringify({ step: 'signed-response', response_id: response.crossing_id, output: out }));
}
async function verify(workPath: string, challengePath: string, responsePath: string, out: string, world: string) {
  const context = await contextAt(workPath), challenge = await loadBundle(challengePath), response = await loadBundle(responsePath);
  const checkers = world === 'python' ? [['python', pythonChecker()] as const] :
    [['typescript', (await import('./challenge/typescript_checker.ts')).typescriptChecker] as const, ['python', pythonChecker()] as const];
  await fresh(out);
  const receipts = [];
  let failed = false;
  for (const [label, checker] of checkers) {
    const report = await verifyChallenge(context, challenge, response, checker);
    const identity = { world_id: `world:useful-work-samples:${label}`, receiver_particular: `particular:useful-work-samples:${label}` };
    const receipt = await challengeReceipt(report, await generateP256KeyPair(), now(), identity);
    const path = join(out, label); await mkdir(path);
    await held(join(path, 'receiver'), response, identity.world_id);
    await json(join(path, 'verifier-result.json'), report);
    await json(join(path, 'verification-receipt.json'), receipt);
    receipts.push(receipt);
    failed ||= report.errors.length > 0;
    console.log(JSON.stringify({ step: 'scoped-receipt', world: label, checked: report.checked_count, claims: report.claims, errors: report.errors, receipt_id: receipt.receipt_id }));
  }
  if (receipts.length > 1) {
    const comparison = await compareChallengeReceipts(receipts);
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
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-003 demo|prepare <job> | challenge <work> | answer <work> <challenge> --state <worker-state> | verify <work> <challenge> <response> | compare <receipt-a> <receipt-b> [--out <new-directory>] [--samples <1..64>] [--world both|python]');
  const allowed = ['--out', ...(['demo', 'challenge'].includes(command) ? ['--samples'] : []), ...(command === 'answer' ? ['--state'] : []), ...(command === 'verify' ? ['--world'] : [])];
  if (Object.keys(flags).some(flag => !allowed.includes(flag))) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-003${command === 'demo' ? '' : '-' + command}`);
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
    const comparison = await compareChallengeReceipts(await Promise.all(inputs.map(async p => JSON.parse((await boundedRead(p, 1_000_000)).toString('utf8')))));
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
