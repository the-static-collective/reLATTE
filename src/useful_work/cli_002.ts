import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { readFileBundle } from '../transport.ts';
import { verifyWork } from './verifier.ts';
import { MAX_ARTIFACT_BYTES } from './inspection.ts';
import { verifyWorkPython } from './python_verifier.ts';
import { verificationReceipt } from './receipt.ts';
import { compareWorkReceipts } from './comparison.ts';
import type { ArtifactSource } from './verification_types.ts';

async function durableJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
export async function verifyTwoWorlds(bundlePath: string, out: string, artifactsPath = join(dirname(bundlePath), 'artifacts')) {
  const { crossing } = await readFileBundle(bundlePath);
  const source: ArtifactSource = async address => {
    if (!/^sha256:[a-f0-9]{64}$/.test(address)) throw new Error('INVALID_CONTENT_ADDRESS');
    const path = join(artifactsPath, address.slice(7));
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_LIMIT');
    return readFile(path);
  };
  const reports = await Promise.all([verifyWork(crossing, source), verifyWorkPython(crossing, source)]);
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  const receipts = [];
  for (const [i, label] of ['typescript', 'python'].entries()) {
    const root = join(out, label);
    await mkdir(root);
    const keys = await generateP256KeyPair();
    const receipt = await verificationReceipt(reports[i], keys, new Date().toISOString(), {
      world_id: `world:useful-work:${label}`, receiver_particular: `particular:useful-work:${label}`,
    });
    await durableJson(join(root, 'verifier-result.json'), reports[i]);
    await durableJson(join(root, 'verification-receipt.json'), receipt);
    await durableJson(join(root, 'verifier-public-key.json'), keys.publicKeyJwk);
    receipts.push(receipt);
  }
  const comparison = await compareWorkReceipts(receipts);
  await durableJson(join(out, 'comparison.json'), comparison);
  return { reports, comparison };
}

async function main(args: string[]) {
  const [command, input, ...flags] = args;
  if (!input || !['demo', 'verify', 'compare'].includes(command)) throw new Error(
    'Usage: useful-work-002 demo <job.json> | verify <crossing.json> | compare <receipt-a.json> <receipt-b.json> [--out <new-directory>]',
  );
  const rest = command === 'compare' ? flags.slice(1) : flags;
  if (rest.length !== 0 && (rest.length !== 2 || rest[0] !== '--out' || !rest[1])) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(rest[1] ?? (command === 'demo' ? 'output/useful-work-002' : 'output/useful-work-002-' + command));
  if (command === 'compare') {
    if (!flags[0] || flags[0].startsWith('--')) throw new Error('COMPARISON_REQUIRES_TWO_RECEIPTS');
    const comparison = await compareWorkReceipts(await Promise.all([input, flags[0]].map(async path => JSON.parse(await readFile(path, 'utf8')))));
    await mkdir(dirname(out), { recursive: true }); await mkdir(out);
    await durableJson(join(out, 'comparison.json'), comparison);
    console.log(JSON.stringify({ relation: comparison.relation, subject: comparison.subject, observations: comparison.observations, semantic_effect: 'none', output: out }, null, 2));
    return;
  }
  let bundlePath = resolve(input);
  let verificationOut = out;
  if (command === 'demo') {
    const kernel001 = fileURLToPath(new URL(import.meta.url.endsWith('.js') ? './cli.js' : './cli.ts', import.meta.url));
    const code = await new Promise<number>((resolveCode, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', kernel001, 'run', resolve(input), '--out', out], { stdio: 'inherit' });
      child.once('error', reject); child.once('close', code => resolveCode(code ?? 1));
    });
    if (code !== 0) throw new Error('WORKER_DEMO_FAILED');
    bundlePath = join(out, 'delivery', 'crossing.json'); verificationOut = join(out, 'two-worlds');
  }
  const result = await verifyTwoWorlds(bundlePath, verificationOut);
  console.log(JSON.stringify({
    subject: result.comparison.subject, relation: result.comparison.relation,
    observations: result.comparison.observations, semantic_effect: 'none', output: verificationOut,
  }, null, 2));
  // Local operational failure status, never a winner or a reLATTE admission decision.
  if (result.reports.some(report => report.errors.length)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
