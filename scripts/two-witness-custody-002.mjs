/** TWO-WITNESS-CUSTODY-002
 *
 * A source runner signs a handoff and exports only public evidence.
 * A separate receiver runner creates its witness after receiving A's carrier,
 * generating a fresh key that never leaves receiver process memory.
 * A third runner reconstructs the corroboration from public artifacts only.
 *
 * This proves machine/process separation inside one CI run plus non-transfer of
 * private keys. It does NOT prove separate humans, organizations, or non-collusion.
 */
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';

import {
  assessTwoWitnessHandoff,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
  sha256Hex,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

const THING_REF = 'sha256:' + '4'.repeat(64);
const MAX = 160000;

const validate = (condition, code) => {
  if (!condition) throw new Error(code);
};

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(path) {
  const info = await lstat(path);
  validate(info.isFile() && !info.isSymbolicLink(), 'UNSAFE_ARTIFACT');
  validate(info.size > 0 && info.size <= MAX, 'OVERSIZED_ARTIFACT');
  const raw = await readFile(path);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('MALFORMED_ARTIFACT');
  }
  validate(isRecord(parsed), 'ARTIFACT_OBJECT_REQUIRED');
  return parsed;
}

function forbidPrivate(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    validate(
      ![
        'd',
        'p',
        'q',
        'dp',
        'dq',
        'qi',
        'private_key',
        'privateKey',
        'secret',
        'token',
        'password',
      ].includes(key),
      'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT',
    );
    forbidPrivate(nested);
  }
}

async function writePublicJson(dir, filename, value) {
  forbidPrivate(value);
  await mkdir(dir, { recursive: true });
  const path = join(dir, filename);
  validate(!(await exists(path)), 'PUBLIC_ARTIFACT_ALREADY_EXISTS');
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
}

async function machineFingerprint() {
  let boot = 'no-boot-id';
  try {
    boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  } catch {
    // Hostname fallback is weaker and remains diagnostic only.
  }
  return sha256Hex(Buffer.from(hostname() + '|' + boot));
}

async function jobWitness(role) {
  return {
    role,
    run_id: String(process.env.GITHUB_RUN_ID || 'local'),
    machine_fingerprint: await machineFingerprint(),
  };
}

function validateJobWitness(value, role) {
  validate(isRecord(value), 'INVALID_JOB_WITNESS');
  validate(value.role === role, 'WRONG_JOB_ROLE');
  validate(
    typeof value.run_id === 'string' &&
      (/^[0-9]{1,20}$/.test(value.run_id) || value.run_id === 'local'),
    'INVALID_RUN_ID',
  );
  validate(
    typeof value.machine_fingerprint === 'string' &&
      /^[a-f0-9]{64}$/.test(value.machine_fingerprint),
    'INVALID_MACHINE_FINGERPRINT',
  );
}

function assertMachineSeparated(sender, receiver) {
  validateJobWitness(sender, 'sender');
  validateJobWitness(receiver, 'receiver');
  validate(sender.run_id === receiver.run_id, 'RUN_ID_MISMATCH');
  validate(
    sender.machine_fingerprint !== receiver.machine_fingerprint,
    'NO_MACHINE_SEPARATION_EVIDENCE',
  );
}

async function makeCrossing(keys) {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:fatherhand-source',
    source_world: 'world:fatherhand-source',
    source_history_head: null,
    parents: [],
    declared_kind: 'TWO_WITNESS_CUSTODY_002',
    payload_refs: [{
      address: THING_REF,
      role: 'payload',
      media_type: 'application/octet-stream',
    }],
    requested_effect: {
      kind: 'founding-handoff-candidate',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:fatherhand-source',
    created_at: new Date().toISOString(),
    extensions: {
      two_witness_handoff: {
        schema: 'relatte.two-witness-handoff/v0',
        handoff_id: 'handoff:custody-002',
        receiver_world: 'world:fatherhand-child',
        receiver_particular: 'particular:fatherhand-child',
        thing_ref: THING_REF,
      },
      custody_002: {
        private_key_exported: false,
        law: 'PRIVATE KEY != PUBLIC WITNESS',
      },
    },
  }, keys);
}

async function makeReceipt(crossing, keys) {
  const binding = crossing.extensions.two_witness_handoff;
  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: binding.receiver_world,
    receiver_particular: binding.receiver_particular,
    kind: 'RECEIVED',
    semantic_effect: 'none',
    contract_ref: 'contract:two-witness-custody-002/v0',
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: 'Receiver-side custody witness from a separate ephemeral runner.',
    created_at: new Date().toISOString(),
    extensions: {
      two_witness_handoff: {
        schema: 'relatte.two-witness-handoff/v0',
        handoff_id: binding.handoff_id,
        source_particular: crossing.source_particular,
        receiver_world: binding.receiver_world,
        receiver_particular: binding.receiver_particular,
        thing_ref: binding.thing_ref,
      },
      custody_002: {
        private_key_exported: false,
        law: 'DISTINCT RUNNER != DISTINCT HUMAN',
      },
    },
  }, keys);
}

export async function sender(outputDir) {
  const job = await jobWitness('sender');
  const keys = await generateP256KeyPair();
  const crossing = await makeCrossing(keys);
  validate(await verifyCrossingEnvelope(crossing), 'SOURCE_SIGNATURE_FAILED');

  const artifact = {
    schema: 'relatte.two-witness-custody-source/v0',
    job,
    crossing,
    scope: 'public-source-witness-only;private-key-never-exported',
  };
  await writePublicJson(outputDir, 'source-witness.json', artifact);

  const files = (await readdir(outputDir)).sort();
  validate(
    JSON.stringify(files) === JSON.stringify(['source-witness.json']),
    'UNEXPECTED_SOURCE_ARTIFACTS',
  );
  return artifact;
}

export async function receiver(sourceDir, outputDir) {
  const source = await readJson(join(sourceDir, 'source-witness.json'));
  validate(
    source.schema === 'relatte.two-witness-custody-source/v0',
    'INVALID_SOURCE_SCHEMA',
  );
  validateJobWitness(source.job, 'sender');
  validate(
    source.scope === 'public-source-witness-only;private-key-never-exported',
    'INVALID_SOURCE_SCOPE',
  );
  forbidPrivate(source);
  validate(
    await verifyCrossingEnvelope(source.crossing),
    'INVALID_SOURCE_WITNESS',
  );

  const job = await jobWitness('receiver');
  assertMachineSeparated(source.job, job);

  // Fresh key exists only in this receiver process. It is never serialized.
  const keys = await generateP256KeyPair();
  const receipt = await makeReceipt(source.crossing, keys);
  validate(await verifyReceipt(receipt), 'RECEIVER_SIGNATURE_FAILED');

  const assessment = await assessTwoWitnessHandoff({
    crossing: source.crossing,
    receiver_receipt: receipt,
  });
  validate(assessment.status === 'CORROBORATED', 'PAIR_NOT_CORROBORATED');

  const artifact = {
    schema: 'relatte.two-witness-custody-receiver/v0',
    source_job: source.job,
    receiver_job: job,
    receipt,
    local_assessment: assessment,
    scope:
      'separate-ephemeral-runner;fresh-receiver-key;private-key-never-exported',
  };
  await writePublicJson(outputDir, 'receiver-witness.json', artifact);

  const files = (await readdir(outputDir)).sort();
  validate(
    JSON.stringify(files) === JSON.stringify(['receiver-witness.json']),
    'UNEXPECTED_RECEIVER_ARTIFACTS',
  );
  return artifact;
}

export async function verify(sourceDir, receiverDir) {
  const source = await readJson(join(sourceDir, 'source-witness.json'));
  const receiver = await readJson(join(receiverDir, 'receiver-witness.json'));
  forbidPrivate(source);
  forbidPrivate(receiver);

  validate(
    source.schema === 'relatte.two-witness-custody-source/v0',
    'INVALID_SOURCE_SCHEMA',
  );
  validate(
    receiver.schema === 'relatte.two-witness-custody-receiver/v0',
    'INVALID_RECEIVER_SCHEMA',
  );
  validateJobWitness(source.job, 'sender');
  validateJobWitness(receiver.source_job, 'sender');
  validateJobWitness(receiver.receiver_job, 'receiver');
  validate(
    JSON.stringify(source.job) === JSON.stringify(receiver.source_job),
    'SOURCE_JOB_WITNESS_CHANGED',
  );
  assertMachineSeparated(source.job, receiver.receiver_job);

  validate(
    await verifyCrossingEnvelope(source.crossing),
    'VERIFIER_REJECTED_SOURCE',
  );
  validate(
    await verifyReceipt(receiver.receipt),
    'VERIFIER_REJECTED_RECEIVER',
  );

  const assessment = await assessTwoWitnessHandoff({
    crossing: source.crossing,
    receiver_receipt: receiver.receipt,
  });
  validate(
    assessment.status === 'CORROBORATED',
    'VERIFIER_PAIR_NOT_CORROBORATED',
  );
  validate(
    assessment.independence_basis === 'DISTINCT_SIGNING_KEYS_ONLY',
    'UNEXPECTED_CRYPTO_INDEPENDENCE_BASIS',
  );

  // Third-party hostile checks from public evidence only.
  const tamperedReceipt = structuredClone(receiver.receipt);
  tamperedReceipt.receiver_particular = 'particular:hostile-rewrite';
  const tamperedReceiverAssessment = await assessTwoWitnessHandoff({
    crossing: source.crossing,
    receiver_receipt: tamperedReceipt,
  });
  validate(
    tamperedReceiverAssessment.status === 'HOLD',
    'TAMPERED_RECEIVER_WAS_ACCEPTED',
  );

  const tamperedSource = structuredClone(source.crossing);
  tamperedSource.extensions.two_witness_handoff.thing_ref =
    'sha256:' + '5'.repeat(64);
  const tamperedSourceAssessment = await assessTwoWitnessHandoff({
    crossing: tamperedSource,
    receiver_receipt: receiver.receipt,
  });
  validate(
    tamperedSourceAssessment.status === 'HOLD',
    'TAMPERED_SOURCE_WAS_ACCEPTED',
  );

  return {
    schema: 'relatte.two-witness-custody-verification/v0',
    verified: true,
    status: assessment.status,
    handoff_id: assessment.handoff_id,
    cryptographic_independence_basis: assessment.independence_basis,
    custody_evidence: {
      same_ci_run: true,
      distinct_ephemeral_runner_fingerprints: true,
      receiver_depended_on_sender_job: true,
      source_private_key_in_public_artifact: false,
      receiver_private_key_in_public_artifact: false,
      third_party_reverification_from_public_evidence: true,
    },
    limits: [
      'SEPARATE RUNNERS != SEPARATE HUMANS',
      'SEPARATE RUNNERS != NON_COLLUSION',
      'HOST FINGERPRINT != HARDWARE ATTESTATION',
      'CORROBORATION != TRUTH',
      'CORROBORATION != ADMISSION',
    ],
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'sender' && args.length === 1) {
    process.stdout.write(JSON.stringify(await sender(args[0]), null, 2) + '\n');
    return;
  }
  if (command === 'receiver' && args.length === 2) {
    process.stdout.write(
      JSON.stringify(await receiver(args[0], args[1]), null, 2) + '\n',
    );
    return;
  }
  if (command === 'verify' && args.length === 2) {
    process.stdout.write(
      JSON.stringify(await verify(args[0], args[1]), null, 2) + '\n',
    );
    return;
  }
  throw new Error(
    'USAGE: sender <public-out> | receiver <source-dir> <public-out> | verify <source-dir> <receiver-dir>',
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  main().catch((error) => {
    process.stderr.write(String(error?.message ?? 'TWO_WITNESS_CUSTODY_002_FAILED') + '\n');
    process.exitCode = 1;
  });
}
