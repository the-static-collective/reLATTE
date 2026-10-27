import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { generateP256KeyPair } from '../src/protocol.ts';
import type { P256KeyMaterial } from '../src/protocol.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { FileCommuterCursorStore } from '../src/commuter-store.ts';
import { pollEvidenceOnce } from '../src/evidence-transit.ts';
import { NightShiftPublicEvidenceSource } from '../src/night-shift-evidence-source.ts';

/**
 * One bounded real-source run. The sender key and receiver signing journal
 * survive process restarts. --admit-observations opts in only to local
 * observation storage; it never changes Night Shift task/reviewer state.
 */
const active = process.argv.includes('--admit-observations');
const root = resolve(process.env.RELATTE_NIGHT_EVIDENCE_HOME ||
  join(homedir(), '.relatte', 'night-shift-evidence'));
const mode = active ? 'approved-source-observations' : 'held-observations';

async function sourceKey(): Promise<P256KeyMaterial> {
  const path = join(root, 'source-key.json');
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() ||
        (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)) {
      throw new Error('UNSAFE_EVIDENCE_KEY_FILE');
    }
    const saved = JSON.parse(await readFile(path, 'utf8'));
    if (saved.schema !== 'relatte.source-key/v0' ||
        saved.private_jwk?.kty !== 'EC' || saved.private_jwk?.crv !== 'P-256' ||
        saved.public_jwk?.kty !== 'EC' || saved.public_jwk?.crv !== 'P-256') {
      throw new Error('INVALID_EVIDENCE_KEY_FILE');
    }
    return {
      privateKey: await crypto.subtle.importKey('jwk', saved.private_jwk,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
      publicKey: await crypto.subtle.importKey('jwk', saved.public_jwk,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']),
      publicKeyJwk: saved.public_jwk,
    };
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const keys = await generateP256KeyPair();
  const data = JSON.stringify({
    schema: 'relatte.source-key/v0',
    private_jwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
    public_jwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
  }) + '\n';
  try {
    await writeFile(path, data, { mode: 0o600, flag: 'wx' });
    return keys;
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error;
    // Concurrent first-run setup: validate the winner, do not silently rotate.
    return sourceKey();
  }
}

async function main(): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    const st = await lstat(root);
    if (!st.isDirectory() || (st.mode & 0o077) !== 0) {
      throw new Error('EVIDENCE_HOME_MUST_BE_PRIVATE');
    }
  }
  const keys = await sourceKey();
  const worldRoot = join(root, mode, 'receiver');
  let receiver: LocalReceiver;
  try {
    await lstat(worldRoot);
    receiver = await LocalReceiver.open(worldRoot);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    receiver = await LocalReceiver.create(worldRoot, {
      world_id: 'world:night-shift-local-' + mode,
      receiver_particular: 'particular:night-source-receiver',
      contract_ref: 'contract:night-owner-evidence-observation/v0',
    });
  }
  const cursor = new FileCommuterCursorStore(join(root, mode, 'cursor.json'));
  const source = new NightShiftPublicEvidenceSource();
  const results = await pollEvidenceOnce(source, cursor, {
    destination: 'local:' + mode,
    capability_ref: active ? 'capability:local-owner-opt-in' : null,
    source_keys: keys,
    receiver,
    received_at: () => new Date().toISOString(),
    evaluate: async event => ({
      disposition: active && event.source_system === 'night-shift:github-rest' &&
          event.evidence_level === 'source_observed' ? 'ADMIT' : 'HOLD',
      reason: active ? 'explicit owner opted into local observation storage' :
        'receiver default: preserve signed observation in HOLD',
    }),
    ...(active ? {
      store: async (event: { source_event_id: string; payload_ref: string },
        context: { event_id: string; crossing_id: string }) => {
        const folder = join(root, mode, 'observations');
        await mkdir(folder, { recursive: true, mode: 0o700 });
        const filename = context.event_id.split(':')[1];
        if (!filename || !/^[a-f0-9]{64}$/.test(filename)) throw new Error('INVALID_EVIDENCE_STORE_ID');
        const target = join(folder, filename + '.json');
        const record = JSON.stringify({
          schema: 'relatte.local-evidence-record/v0', event_id: context.event_id,
          crossing_id: context.crossing_id, source_event_id: event.source_event_id,
          payload_ref: event.payload_ref,
        }) + '\n';
        try {
          await writeFile(target, record, { flag: 'wx', mode: 0o600 });
          return { status: 'stored' as const, record_ref: 'local:' + filename };
        } catch (err: any) {
          if (err?.code !== 'EEXIST') throw err;
          if (await readFile(target, 'utf8') !== record) throw new Error('EVIDENCE_STORE_COLLISION');
          return { status: 'already-stored' as const, record_ref: 'local:' + filename };
        }
      },
    } : {}),
  });
  console.log(JSON.stringify({
    schema: 'relatte.night-shift-run/v0', mode,
    observations: results.length,
    outcomes: results.map(r => ({
      event_id: r.event_id, crossing_id: r.crossing_id,
      receive_receipt_id: r.receive_receipt_id,
      disposition_receipt_id: r.disposition_receipt_id,
      status: r.status,
    })),
    receiver_history_head: receiver.snapshot().history_head,
    note: 'Signed receipts prove local reception and decision only; not GitHub authorship or task completion.',
  }, null, 2));
}
main().catch(error => {
  console.error('Night evidence run failed:', (error as Error).message);
  process.exitCode = 1;
});
