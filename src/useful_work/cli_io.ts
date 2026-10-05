import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { P256KeyMaterial } from '../protocol.ts';
import { LocalReceiver } from '../receiver.ts';
import { makeTransportFrame, verifyAndExtractTransportFrame, writeFileBundle } from '../transport.ts';

export const now = () => new Date().toISOString();
export async function json(path: string, value: unknown, privateFile = false) {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: privateFile ? 0o600 : 0o644 });
}
export async function fresh(path: string) { await mkdir(dirname(path), { recursive: true }); await mkdir(path); }
export async function bundle(path: string, crossing: Record<string, any>, routeNote = 'Useful Work Kernel 003') {
  await writeFileBundle(path, await makeTransportFrame(crossing, 'file-bundle', now(), routeNote));
}
export async function held(root: string, crossing: Record<string, any>, world: string, contractRef = 'contract:useful-work/sample-challenge-v1') {
  const receiver = await LocalReceiver.create(root, { world_id: world, receiver_particular: `particular:${world}`, contract_ref: contractRef });
  const received = await receiver.receive(crossing, now());
  const hold = await receiver.dispose(crossing.crossing_id, 'HOLD', now());
  return { received, hold, snapshot: receiver.snapshot() };
}
export async function boundedRead(path: string, limit: number) {
  const info = await stat(path);
  if (!info.isFile() || info.size > limit) throw new Error('INPUT_SIZE_LIMIT');
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error('INPUT_SIZE_LIMIT');
  return bytes;
}
export async function loadBundle(path: string) {
  const frame = JSON.parse((await boundedRead(path, 1_000_000)).toString('utf8'));
  if (frame.transport !== 'file-bundle') throw new Error('FILE_BUNDLE_REQUIRES_FILE_TRANSPORT');
  return verifyAndExtractTransportFrame(frame);
}
export async function readWorkerKeys(path: string): Promise<P256KeyMaterial> {
  const jwk = JSON.parse((await boundedRead(path, 4096)).toString('utf8'));
  const publicKeyJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return { privateKey, publicKey, publicKeyJwk };
}
