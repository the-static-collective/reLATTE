/**
 * HUMKIN-GH-RELATTE-001: first real, bounded cross-repository catalog crossing.
 * GitHub Actions carries PUBLIC catalog bytes; reLATTE owns signing, transport,
 * independent receiver history and HOLD. No HUMKIN authority is transferred.
 */
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  runOpaqueOrganRoundTrip, verifyOpaqueOrganCrossing, verifyReceipt,
  LocalReceiver, sha256Hex,
} from '../src/index.ts';

const SOURCE = 'the-static-collective/HUMKIN';
const FILES = ['discovery.json', 'tracks.json'];
const MAX_BYTES = 65536;
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const digest = raw => sha256Hex(raw);
const bounded = async path => {
  const s = await stat(path);
  assert(s.isFile() && s.size > 0 && s.size <= MAX_BYTES, 'INVALID_SOURCE_SIZE');
  const b = await readFile(path);
  assert(b.length <= MAX_BYTES, 'SOURCE_CHANGED_DURING_READ');
  return b;
};
const parse = raw => JSON.parse(raw.toString('utf8'));

export function inspectCatalog(discoveryRaw, tracksRaw, revision, committedAt) {
  assert(/^[a-f0-9]{40}$/.test(revision), 'INVALID_GIT_REVISION');
  const timestamp = new Date(committedAt);
  assert(!Number.isNaN(timestamp.getTime()), 'INVALID_GIT_TIMESTAMP');
  const discovery = parse(discoveryRaw);
  const catalog = parse(tracksRaw);
  assert(isObject(discovery) && discovery.catalog === 'https://humkin.abundent.org/tracks.json', 'WRONG_DISCOVERY_ORIGIN');
  assert(isObject(catalog) && catalog.artist === 'HUMKIN' && Array.isArray(catalog.tracks), 'WRONG_CATALOG');
  assert(catalog.tracks.length === 12, 'UNEXPECTED_TRACK_COUNT');
  const numbers = new Set();
  for (const t of catalog.tracks) {
    assert(isObject(t) && Number.isInteger(t.number) && t.number >= 1 && t.number <= 12, 'INVALID_TRACK_NUMBER');
    assert(typeof t.title === 'string' && t.title.trim().length > 0, 'MISSING_TRACK_TITLE');
    assert(typeof t.url === 'string' && /^audio\/[A-Za-z0-9_ -]+\.mp3$/.test(t.url), 'UNSAFE_TRACK_PATH');
    numbers.add(t.number);
  }
  assert(numbers.size === 12, 'DUPLICATE_TRACK_NUMBER');
  return {
    schema: 'relatte.humkin-github-source/v0',
    source: SOURCE,
    revision,
    committed_at: timestamp.toISOString(),
    files: {
      'discovery.json': digest(discoveryRaw),
      'tracks.json': digest(tracksRaw),
    },
    tracks: 12,
  };
}

async function readCarrier(carrierDir) {
  const d = await bounded(join(carrierDir, 'discovery.json'));
  const t = await bounded(join(carrierDir, 'tracks.json'));
  const manifest = parse(await bounded(join(carrierDir, 'source-manifest.json')));
  const actual = inspectCatalog(d, t, manifest.revision, manifest.committed_at);
  assert(JSON.stringify(manifest) === JSON.stringify(actual), 'SOURCE_MANIFEST_MISMATCH');
  return { manifest, d, t };
}

function nativeRequest(manifest, workRoot) {
  const start = new Date(manifest.committed_at).getTime();
  const time = ms => new Date(start + ms).toISOString();
  return {
    schema: 'relatte.opaque-roundtrip-request/v0',
    spec: {
      schema: 'relatte.opaque-organ-spec/v0',
      family_ref: 'organ:humkin/catalog-discovery',
      donor_contract_ref: 'github:' + SOURCE + '@' + manifest.revision + '#discovery.json',
      artifact_kind: 'public-humkin-catalog-snapshot',
      source_world: 'world:humkin:published-catalog',
      source_particular: 'particular:humkin:git:' + manifest.revision,
      source_history_head: null,
      payload_refs: FILES.map(name => ({
        address: 'sha256:' + manifest.files[name],
        role: name === 'discovery.json' ? 'discovery' : 'catalog',
        media_type: 'application/json',
      })),
      donor_claims: {
        repository: SOURCE, revision: manifest.revision,
        track_count: manifest.tracks,
        source_signed_by_humkin: false,
        recordings_transferred: false,
        licensing_permission_granted: false,
      },
      requested_effect: { kind: 'catalog-candidate-review', authority: 'receiver-local' },
      return_address: 'github:' + SOURCE + '/tree/' + manifest.revision,
      created_at: time(0),
    },
    receiver_root: join(workRoot, 'private', 'receiver'),
    receiver: {
      world_id: 'world:relatte:humkin-github-inbox',
      receiver_particular: 'particular:relatte:humkin-catalog-hold',
      contract_ref: 'contract:humkin-catalog-hold/v0',
    },
    bundle_path: join(workRoot, 'private', 'transport.json'),
    result_path: join(workRoot, 'private', 'roundtrip-result.json'),
    disposition: 'HOLD',
    transport_created_at: time(1000),
    received_at: time(2000),
    disposed_at: time(3000),
    route_note: 'GitHub Actions artifact carried public source files to reLATTE candidate HOLD',
  };
}

export async function sender(checkoutRoot, carrierDir) {
  const repoDir = resolve(checkoutRoot);
  const revision = execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  const committedAt = execFileSync('git', ['-C', repoDir, 'show', '-s', '--format=%cI', 'HEAD'], {encoding:'utf8'}).trim();
  const discovery = await bounded(join(repoDir, FILES[0]));
  const tracks = await bounded(join(repoDir, FILES[1]));
  const manifest = inspectCatalog(discovery, tracks, revision, committedAt);
  await mkdir(carrierDir, {recursive:true});
  await writeFile(join(carrierDir, 'discovery.json'), discovery, {flag:'wx'});
  await writeFile(join(carrierDir, 'tracks.json'), tracks, {flag:'wx'});
  await writeFile(join(carrierDir, 'source-manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag:'wx'});
  return manifest;
}

export async function receive(carrierDir, workRoot) {
  const {manifest} = await readCarrier(carrierDir);
  const req = nativeRequest(manifest, workRoot);
  const result = await runOpaqueOrganRoundTrip(req);
  assert(await verifyOpaqueOrganCrossing(result.crossing), 'INVALID_NATIVE_CROSSING');
  assert(await verifyReceipt(result.receive_receipt), 'INVALID_NATIVE_RECEIVE');
  assert(await verifyReceipt(result.disposition_receipt), 'INVALID_NATIVE_DISPOSITION');
  assert(result.receive_receipt.kind === 'RECEIVED' && result.disposition_receipt.kind === 'R3_HOLD', 'NOT_HELD');
  assert(result.receiver_snapshot.held.includes(result.crossing.crossing_id), 'MISSING_HOLD');
  const cold = await LocalReceiver.open(req.receiver_root);
  assert(cold.snapshot().held.includes(result.crossing.crossing_id), 'COLD_REPLAY_MISSING_HOLD');
  const publicRoot = join(workRoot, 'public');
  await mkdir(publicRoot, {recursive:true});
  for (const name of [...FILES, 'source-manifest.json']) {
    await copyFile(join(carrierDir,name), join(publicRoot,name));
  }
  await writeFile(join(publicRoot, 'native-result.json'), JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  const witness = await verifyPublic(publicRoot);
  return {...witness, local_cold_replay_verified: true};
}

export async function verifyPublic(publicRoot) {
  const {manifest} = await readCarrier(publicRoot);
  const result = parse(await bounded(join(publicRoot, 'native-result.json')));
  assert(result.schema === 'relatte.opaque-roundtrip-result/v0', 'BAD_NATIVE_RESULT');
  const crossing = result.crossing;
  assert(await verifyOpaqueOrganCrossing(crossing), 'BAD_SIGNED_CROSSING');
  assert(await verifyReceipt(result.receive_receipt) && await verifyReceipt(result.disposition_receipt), 'BAD_SIGNED_RECEIPT');
  assert(result.receive_receipt.crossing_id === crossing.crossing_id, 'RECEIVE_CROSSING_MISMATCH');
  assert(result.disposition_receipt.crossing_id === crossing.crossing_id, 'HOLD_CROSSING_MISMATCH');
  assert(result.receive_receipt.kind === 'RECEIVED' && result.disposition_receipt.kind === 'R3_HOLD', 'UNAUTHORIZED_DISPOSITION');
  assert(result.receive_receipt.semantic_effect === 'none' && result.disposition_receipt.semantic_effect === 'none', 'UNAUTHORIZED_EFFECT');
  assert(crossing.source_particular === 'particular:humkin:git:' + manifest.revision, 'REVISION_NOT_BOUND');
  assert(crossing.source_world === 'world:humkin:published-catalog', 'WRONG_SOURCE_WORLD');
  const refs = crossing.payload_refs;
  assert(Array.isArray(refs) && refs.length === 2, 'INVALID_PAYLOAD_REFS');
  for (const [i, name] of FILES.entries()) {
    assert(refs[i].address === 'sha256:' + manifest.files[name], 'PAYLOAD_DIGEST_NOT_BOUND');
  }
  const claims = crossing.extensions?.organ_adapter?.donor_claims;
  assert(claims?.repository === SOURCE && claims?.revision === manifest.revision && claims?.recordings_transferred === false && claims?.licensing_permission_granted === false, 'CLAIMS_NOT_BOUND');
  assert(Array.isArray(result.receiver_snapshot?.held) && result.receiver_snapshot.held.includes(crossing.crossing_id), 'RECEIVER_DID_NOT_REPORT_HOLD');
  return {
    schema: 'relatte.humkin-github-witness/v0',
    source_revision: manifest.revision,
    crossing_id: crossing.crossing_id,
    receive_receipt_id: result.receive_receipt.receipt_id,
    hold_receipt_id: result.disposition_receipt.receipt_id,
    catalog_count: manifest.tracks,
    public_bytes_verified: true,
    signed_receipts_verified: true,
    disposition: 'HOLD',
    source_author_signature_verified: false,
    receiver_admitted: false,
    audio_transferred: false,
  };
}

async function main() {
  const [mode, first, second] = process.argv.slice(2);
  let result;
  if (mode === 'sender' && first && second) result = await sender(first, second);
  else if (mode === 'receiver' && first && second) result = await receive(first, second);
  else if (mode === 'verify' && first && !second) result = await verifyPublic(first);
  else throw new Error('USAGE: sender CHECKOUT CARRIER | receiver CARRIER WORK | verify PUBLIC');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e => { process.stderr.write(String(e.message || e)+'\n'); process.exitCode = 1; });
}
