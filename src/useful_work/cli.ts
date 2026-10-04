import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, sha256Hex } from '../canonical.ts';
import { generateP256KeyPair } from '../protocol.ts';
import { runOpaqueOrganRoundTrip } from '../roundtrip.ts';
import { readFileBundle } from '../transport.ts';
import { canonicalBytes } from './job.ts';
import { executeJob, organSpec, ROLES } from './worker.ts';
import { MAX_ARTIFACT_BYTES, verifyWork } from './verifier.ts';
import { verificationReceipt } from './receipt.ts';

async function json(path: string, value: unknown, mode = 0o644): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode });
}
function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`MISSING_${name}_VALUE`);
  return args[i + 1];
}
function validateArgs(args: string[], allowed: string[]): void {
  for (let i = 2; i < args.length; i++) {
    if (!allowed.includes(args[i])) throw new Error(`UNKNOWN_OPTION:${args[i]}`);
    if (args[i] !== '--hash-only') i++;
  }
}
async function boundedRead(path: string): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_LIMIT');
  const bytes = await readFile(path);
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error('ARTIFACT_SIZE_LIMIT');
  return bytes;
}
async function verifyCommand(input: string, out: string, artifacts: string, hashOnly: boolean): Promise<void> {
  const delivered = await readFileBundle(input);
  const report = await verifyWork(delivered.crossing, async address => {
    // Content addresses are never interpreted as paths or remote URLs.
    if (!/^sha256:[a-f0-9]{64}$/.test(address)) throw new Error('INVALID_CONTENT_ADDRESS');
    return boundedRead(join(artifacts, address.slice(7)));
  }, hashOnly ? 'hash-only' : 'recompute');
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // A new attestation never overwrites an older receipt.
  const keys = await generateP256KeyPair();
  const receipt = await verificationReceipt(report, keys, new Date().toISOString());
  await json(join(out, 'verifier-result.json'), report);
  await json(join(out, 'verification-receipt.json'), receipt);
  await json(join(out, 'verifier-public-key.json'), keys.publicKeyJwk);
  console.log(JSON.stringify({
    verification: report.claims, errors: report.errors,
    receipt: join(out, 'verification-receipt.json'),
    verifier_key_fingerprint: sha256Hex(canonicalBytes(keys.publicKeyJwk)),
  }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
async function runCommand(jobPath: string, out: string): Promise<void> {
  const work = executeJob(JSON.parse((await boundedRead(jobPath)).toString('utf8')));
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  const workerRoot = join(out, 'worker');
  const deliveryRoot = join(out, 'delivery');
  const artifactsRoot = join(deliveryRoot, 'artifacts');
  await mkdir(workerRoot);
  await mkdir(artifactsRoot, { recursive: true });
  const names = ['job.json', 'result.json', 'render.ppm', 'execution.json'];
  for (const [i, role] of ROLES.entries()) {
    const bytes = work.artifacts[role];
    const path = join(workerRoot, names[i]);
    await writeFile(path, bytes, { flag: 'wx' });
    await copyFile(path, join(artifactsRoot, sha256Hex(bytes)));
  }
  await json(join(workerRoot, 'manifest.json'), work.manifest);
  const now = new Date().toISOString();
  const bundlePath = join(deliveryRoot, 'crossing.json');
  const request = {
    schema: 'relatte.opaque-roundtrip-request/v0',
    spec: organSpec(work.manifest, now), receiver_root: join(out, 'receiver'),
    receiver: {
      world_id: 'world:useful-work-receiver', receiver_particular: 'particular:useful-work-receiver',
      contract_ref: 'contract:useful-work/receiver-local-v1',
    },
    bundle_path: bundlePath, result_path: join(out, 'roundtrip.json'), disposition: 'HOLD',
    transport_created_at: now, received_at: now, disposed_at: now,
    route_note: 'Useful Work Kernel 001: worker -> file bundle -> sovereign HOLD',
  };
  const roundtrip = await runOpaqueOrganRoundTrip(request);
  console.log(JSON.stringify({
    job_spec_hash: work.manifest.job_spec_hash, result_hash: work.manifest.result_hash,
    crossing_id: roundtrip.crossing.crossing_id, receive: roundtrip.receive_receipt.kind,
    disposition: roundtrip.disposition_receipt.kind, semantic_effect: roundtrip.disposition_receipt.semantic_effect,
    portable_delivery: deliveryRoot,
  }, null, 2));
  // Independent address space, reads only the portable delivery; no in-memory worker result.
  const code = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(process.execPath, [
      '--experimental-strip-types', fileURLToPath(import.meta.url), 'verify', bundlePath,
      '--out', join(out, 'verification'),
    ], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', code => resolveCode(code ?? 1));
  });
  if (code !== 0) process.exitCode = code;
}

export async function main(args: string[]): Promise<void> {
  if (!args[1]) throw new Error('Usage: npm run useful-work -- run <job.json> --out <new-directory> | verify <crossing.json> --out <new-directory> [--artifacts <directory>] [--hash-only]');
  const [command, input] = args;
  if (command === 'run') {
    validateArgs(args, ['--out']);
    await runCommand(resolve(input), resolve(option(args, '--out') ?? 'output/useful-work-001'));
  } else if (command === 'verify') {
    validateArgs(args, ['--out', '--artifacts', '--hash-only']);
    await verifyCommand(resolve(input), resolve(option(args, '--out') ?? 'verification'),
      resolve(option(args, '--artifacts') ?? join(dirname(resolve(input)), 'artifacts')),
      args.includes('--hash-only'));
  } else throw new Error('UNKNOWN_COMMAND');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : canonicalize(error));
    process.exitCode = 1;
  });
}
