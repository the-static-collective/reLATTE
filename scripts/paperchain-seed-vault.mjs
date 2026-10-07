// PAPERCHAIN-SEED-VAULT-001 — donor-owned seed profile, unchanged reLATTE core.
// This program crosses a bounded manifest, NOT the full source PNG.
// No receiver admission, worldwide publication, or image-byte custody is implied.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  LocalReceiver, generateP256KeyPair, sealCrossingEnvelope,
  sha256Hex, verifyCrossingEnvelope, verifyReceipt,
} from '../src/index.ts';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const SCHEMA = 'lemonpress.paperchain-seed/v0';

async function regularBytes(path, maxSize, label) {
  if (!isAbsolute(path)) throw new Error(label + '_PATH_NOT_ABSOLUTE');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size === 0 || info.size > maxSize)
    throw new Error(label + '_NOT_BOUNDED_REGULAR_FILE');
  return readFile(path);
}

function dimensions(png) {
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== PNG_SIGNATURE ||
      png.subarray(12, 16).toString('ascii') !== 'IHDR')
    throw new Error('PNG_SIGNATURE_OR_IHDR_MISSING');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (!width || !height || width > 20000 || height > 20000)
    throw new Error('UNSUPPORTED_PNG_DIMENSIONS');
  return {width, height}; // Header-only inspection; not a full image decode.
}

function plus(date, ms) {
  return new Date(Date.parse(date) + ms).toISOString();
}

async function destinationProcess(request) {
  // The receiver-side material verifier runs in a separate Node process.
  // This still shares one local filesystem / OS authority: not network federation.
  const entry = fileURLToPath(new URL('./material-delivery.ts', import.meta.url));
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', entry], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', part => {stdout += part;});
    child.stderr.on('data', part => {stderr += part;});
    child.once('error', fail);
    child.once('close', code => {
      if (code !== 0) { fail(new Error('DESTINATION_PROCESS_FAILED:' + stderr)); return; }
      try {ok(JSON.parse(stdout));} catch {fail(new Error('INVALID_DESTINATION_RESULT'));}
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function runPaperchainSeedVault(imagePath, textPath, rootPath, createdAt = new Date().toISOString()) {
  if (![imagePath, textPath, rootPath].every(isAbsolute)) throw new Error('ABSOLUTE_PATHS_REQUIRED');
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('INVALID_CREATION_TIME');
  // First-run only: no rewriting of an existing receiver journal or root.
  try { await lstat(rootPath); throw new Error('OUTPUT_ROOT_ALREADY_EXISTS'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const png = await regularBytes(imagePath, 32 * 1024 * 1024, 'IMAGE');
  const manuscript = await regularBytes(textPath, 2 * 1024 * 1024, 'MANUSCRIPT');
  const pixels = dimensions(png);
  const imageHash = sha256Hex(png);
  const textHash = sha256Hex(manuscript);
  const seedId = 'paperchain-seed:' + sha256Hex(Buffer.from(
    'PAPERCHAIN-SEED-v0|' + imageHash + '|' + textHash, 'utf8'
  ));
  const manifest = {
    schema: SCHEMA,
    seed_id: seedId,
    title: 'The Seed Vault at the End of the Driveway',
    source_world: 'world:lemonpress/seed-vault',
    source_artifacts: [
      {role: 'original-manga-page', media_type: 'image/png', sha256: imageHash,
       byte_length: png.length, dimensions: pixels, delivery_state: 'SOURCE_LOCAL_ONLY'},
      {role: 'original-seed-manuscript', media_type: 'text/plain', sha256: textHash,
       byte_length: manuscript.length, delivery_state: 'SOURCE_LOCAL_ONLY'},
    ],
    proposed_children: ['PANEL', 'SOUND', 'WEBZ_WORLD'],
    status: 'CANDIDATE',
    rights_verification: 'NOT_EVALUATED_BY_THIS_PROOF',
    guardrails: ['SEED != ADMISSION', 'ANCESTRY != AUTHORITY',
      'SIGNED MANIFEST != IMAGE BYTE CUSTODY', 'HOLD != PLANT'],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  if (manifestBytes.length > 65536) throw new Error('SEED_MANIFEST_TOO_LARGE');

  await mkdir(rootPath, {recursive: true});
  const manifestPath = join(rootPath, 'seed-manifest.json');
  await writeFile(manifestPath, manifestBytes);
  const receiverRoot = join(rootPath, 'receiver');
  const receiver = await LocalReceiver.create(receiverRoot, {
    world_id: 'world:seedbank/receiving-orchard',
    receiver_particular: 'particular:seedbank/seed-vault-inbox',
    contract_ref: 'contract:seedbank/local-hold-v0',
  });
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: seedId,
    source_world: manifest.source_world,
    source_history_head: 'sha256:' + imageHash,
    parents: [],
    declared_kind: 'OPAQUE_ORGAN_ARTIFACT',
    payload_refs: [
      {address: 'sha256:' + sha256Hex(manifestBytes), role: 'seed-manifest-custody',
       media_type: 'application/json'},
      {address: 'sha256:' + imageHash, role: 'original-manga-reference-only',
       media_type: 'image/png'},
      {address: 'sha256:' + textHash, role: 'original-manuscript-reference-only',
       media_type: 'text/plain'},
    ],
    requested_effect: {kind: 'candidate-germination', authority: 'receiver-local'},
    capability_ref: null, privacy_policy: null, audience_policy: null,
    return_address: 'return:lemonpress/seed-vault',
    created_at: createdAt,
    extensions: {seed_profile: {schema: SCHEMA, seed_id: seedId}},
  }, await generateP256KeyPair());

  await receiver.receive(crossing, plus(createdAt, 1000));
  await receiver.dispose(crossing.crossing_id, 'HOLD', plus(createdAt, 2000));
  const carrierPath = join(rootPath, 'seed.carrier.json');
  await writeFile(carrierPath, JSON.stringify({
    schema: 'webz.material-carrier/v0',
    crossing,
    payload_base64: manifestBytes.toString('base64'),
  }) + '\n');
  const custody = await destinationProcess({
    schema: 'relatte.material-delivery/v0',
    carrier_path: carrierPath,
    receiver_root: receiverRoot,
    expected_crossing_id: crossing.crossing_id,
    created_at: plus(createdAt, 3000),
  });
  if (!(await verifyCrossingEnvelope(crossing)) ||
      !(await verifyReceipt(custody.custody_receipt)) ||
      custody.payload_sha256 !== sha256Hex(manifestBytes) ||
      custody.receiver_disposition !== 'R3_HOLD' ||
      custody.retained !== true)
    throw new Error('SEED_CUSTODY_PROOF_FAILED');

  const candidate = {
    schema: 'lemonpress.paperchain-panel-candidate/v0',
    parent_seed: seedId,
    parent_crossing: crossing.crossing_id,
    source_image: 'sha256:' + imageHash,
    proposed_region_px: {x: 0, y: 0, width: pixels.width,
      height: Math.max(1, Math.floor(pixels.height * 0.19))},
    status: 'CANDIDATE_NOT_GERMINATED',
    requires: ['EXPLICIT_RECEIVER_ADMISSION', 'REAL_DESCENDANT_BYTES',
      'FRESH_SIGNED_DESCENDANT_CROSSING'],
  };
  const candidatePath = join(rootPath, 'first-panel-candidate.json');
  await writeFile(candidatePath, JSON.stringify(candidate, null, 2) + '\n');
  const witness = {
    schema: 'paperchain-seed-vault-witness/v0',
    seed_id: seedId,
    source_image_sha256: imageHash,
    source_manuscript_sha256: textHash,
    seed_manifest_sha256: sha256Hex(manifestBytes),
    crossing_id: crossing.crossing_id,
    receive_receipt_id: custody.receive_receipt.receipt_id,
    hold_receipt_id: custody.disposition_receipt.receipt_id,
    custody_receipt_id: custody.custody_receipt.receipt_id,
    receiver_cold_replay: custody.receiver_snapshot,
    evidence: 'SIGNED_MANIFEST_BYTES_VERIFIED_AND_HELD',
    not_proven: ['source-image-byte-custody', 'germination',
      'receiver-admission', 'remote-network-crossing', 'human-identity'],
    paths: {manifest: manifestPath, carrier: carrierPath, receiver: receiverRoot,
      first_panel_candidate: candidatePath},
  };
  const witnessPath = join(rootPath, 'witness.json');
  await writeFile(witnessPath, JSON.stringify(witness, null, 2) + '\n');
  return { ...witness, witness_path: witnessPath };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [image, text, root] = process.argv.slice(2).map(arg => arg && resolve(arg));
  if (!image || !text || !root) {
    process.stderr.write('Usage: node --experimental-strip-types scripts/paperchain-seed-vault.mjs IMAGE.png THE_SEED.txt OUTPUT_DIR\n');
    process.exitCode = 2;
  } else {
    runPaperchainSeedVault(image, text, root)
      .then(result => {process.stdout.write(JSON.stringify(result, null, 2) + '\n');})
      .catch(error => {
        process.stderr.write(JSON.stringify({error: error.message}) + '\n');
        process.exitCode = 1;
      });
  }
}
