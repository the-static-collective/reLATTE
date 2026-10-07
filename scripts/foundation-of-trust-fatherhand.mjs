/** Separate participant processes with private stores outside public evidence.
 * One local host proves process boundaries only, not machine/domain separation.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  generateP256KeyPair, createParticularConstitution, parseEvidenceJson,
  sealCrossingEnvelope, sealReceipt, verifyCrossingEnvelope, forbidPrivateEvidence,
} from '../src/index.ts';

const time = '2026-10-07T00:00:00.000Z';
const json = async path => parseEvidenceJson(await readFile(path, 'utf8'));
const write = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
async function localKey(dir) {
  const jwk = await json(join(dir, 'private-key.json'));
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKeyJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  return { privateKey, publicKeyJwk };
}
export async function participant(command, local, input, output) {
  if (command === 'constitute') {
    const keys = await generateP256KeyPair();
    const constitution = createParticularConstitution({ world_id: input, lineage_root: 'founder-seed', inherited_content_ref: output,
      constitution_nonce: crypto.randomUUID(), created_at: time });
    await mkdir(local, { recursive: true });
    await write(join(local, 'private-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey));
    const publicIdentity = { constitution, public_key: keys.publicKeyJwk };
    forbidPrivateEvidence(publicIdentity); await write(join(local, 'identity.json'), publicIdentity);
    return publicIdentity;
  }
  const identity = await json(join(local, 'identity.json')), keys = await localKey(local);
  if (command === 'source') {
    const request = await json(input); forbidPrivateEvidence(request);
    if (request.source_particular !== identity.constitution.particular_id) throw new Error('LOCAL_SOURCE_IDENTITY_MISMATCH');
    const crossing = await sealCrossingEnvelope(request, keys); forbidPrivateEvidence(crossing); await write(output, crossing); return crossing;
  }
  if (command === 'receiver') {
    const crossing = await json(input); forbidPrivateEvidence(crossing);
    if (!(await verifyCrossingEnvelope(crossing))) throw new Error('INVALID_SOURCE_WITNESS');
    const b = crossing.extensions.two_witness_handoff;
    if (b.receiver_particular !== identity.constitution.particular_id) throw new Error('LOCAL_RECEIVER_IDENTITY_MISMATCH');
    const receipt = await sealReceipt({ schema: 'relatte.receipt/v0', crossing_id: crossing.crossing_id,
      world_id: b.receiver_world, receiver_particular: b.receiver_particular, kind: 'RECEIVED', semantic_effect: 'none', created_at: time,
      extensions: { two_witness_handoff: { ...b, source_particular: crossing.source_particular }, foundation: crossing.extensions.foundation } }, keys);
    forbidPrivateEvidence(receipt); await write(output, receipt); return receipt;
  }
  if (command === 'restart') {
    // Public durable evidence is the reconstruction input; local signing key
    // exists only for fresh acts and is never sufficient to prove history.
    const bundle = await json(input); forbidPrivateEvidence(bundle);
    return { particular_id: identity.constitution.particular_id, records_received: bundle.records.length, public_key: keys.publicKeyJwk };
  }
  throw new Error('UNKNOWN_PARTICIPANT_COMMAND');
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  participant(...process.argv.slice(2)).then(r => process.stdout.write(JSON.stringify(r) + '\n')).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}
