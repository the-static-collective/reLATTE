import { randomBytes } from 'node:crypto';
import { sealOpaqueOrganCrossing } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { authenticated, claims } from '../challenge/exchange.ts';
import type { AnswerSample } from '../challenge/exchange.ts';
import { deriveSampleIndices, digest } from '../challenge/commitment.ts';
import { headerForJob, parseResultId, resultId } from './result.ts';
import type { ResultHeader } from './result.ts';
import { FAMILY, CONTRACT, CHALLENGE_CONTRACT, ROLES } from './contract.ts';
import type { NativeManifest } from './contract.ts';

export interface NativeContext {
  crossing: Record<string, any>; manifest: NativeManifest; header: ResultHeader;
  result_id: string; job: RenderJob; jobBytes: Buffer;
}
export interface NativeChallenge {
  schema: 'useful-work.merkle-challenge/v1'; work_crossing_id: string; result_id: string;
  sample_count: number; nonce: string;
}
export interface NativeResponse {
  schema: 'useful-work.merkle-response/v1'; work_crossing_id: string; challenge_id: string;
  result_id: string; samples: AnswerSample[];
}
export async function inspectNativeWork(value: unknown, bytes: Buffer): Promise<NativeContext> {
  const crossing = await authenticated(value), descriptor = crossing.extensions.organ_adapter;
  if (descriptor.family_ref !== FAMILY || descriptor.donor_contract_ref !== CONTRACT) throw new Error('UNSUPPORTED_NATIVE_WORK');
  const donor = claims(crossing);
  exactKeys(donor, ['useful_work_native', 'result_header', 'ownership_asserted', 'economic_value_asserted'], 'INVALID_NATIVE_CLAIMS');
  if (donor.ownership_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_NATIVE_AUTHORITY_CLAIM');
  const manifest = record(donor.useful_work_native, 'INVALID_NATIVE_MANIFEST');
  exactKeys(manifest, ['schema', 'job_spec_hash', 'result_id', 'presentation_hash', 'metadata_hash'], 'INVALID_NATIVE_MANIFEST');
  if (manifest.schema !== 'useful-work.merkle-manifest/v1') throw new Error('UNSUPPORTED_NATIVE_MANIFEST');
  for (const key of ['job_spec_hash', 'presentation_hash', 'metadata_hash']) digest(manifest[key]);
  parseResultId(manifest.result_id);
  if (!(bytes instanceof Uint8Array) || bytes.length > 4096 || sha256Hex(bytes) !== manifest.job_spec_hash) throw new Error('JOB_HASH_MISMATCH');
  const job = parseJob(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (!bytes.equals(canonicalBytes(job))) throw new Error('NON_CANONICAL_JOB');
  const header = headerForJob(donor.result_header, job);
  if (resultId(header) !== manifest.result_id) throw new Error('RESULT_IDENTITY_MISMATCH');
  const addresses = [`sha256:${manifest.job_spec_hash}`, manifest.result_id, `sha256:${manifest.presentation_hash}`, `sha256:${manifest.metadata_hash}`];
  if (crossing.payload_refs.length !== 4) throw new Error('MANIFEST_PAYLOAD_MISMATCH');
  ROLES.forEach((role, i) => {
    const refs = crossing.payload_refs.filter((r: any) => r.role === role);
    if (refs.length !== 1 || refs[0].address !== addresses[i] || refs[0].media_type !== (role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json')) throw new Error('MANIFEST_PAYLOAD_MISMATCH');
    exactKeys(refs[0], ['address', 'role', 'media_type'], 'INVALID_PAYLOAD_REF_FIELDS');
  });
  return { crossing, manifest: structuredClone(manifest) as NativeManifest, header, result_id: manifest.result_id, job, jobBytes: Buffer.from(bytes) };
}
export async function sealNativeMessage(kind: 'challenge' | 'response', payload: NativeChallenge | NativeResponse, keys: P256KeyMaterial, createdAt: string, world: string) {
  return sealOpaqueOrganCrossing({ schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/merkle-${kind}-v1`,
    donor_contract_ref: CHALLENGE_CONTRACT, artifact_kind: `useful-work-merkle-${kind}`, source_world: world,
    source_particular: `particular:useful-work:merkle-${kind}`, source_history_head: null,
    payload_refs: [{ address: `sha256:${sha256Hex(canonicalBytes(payload))}`, role: `merkle-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`merkle_${kind}`]: payload, ownership_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: createdAt }, keys);
}
export async function createNativeChallenge(context: NativeContext, sampleCount: number, keys: P256KeyMaterial, createdAt: string) {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  integer(sampleCount, 1, Math.min(64, context.job.width * context.job.height), 'INVALID_SAMPLE_COUNT');
  return sealNativeMessage('challenge', { schema: 'useful-work.merkle-challenge/v1', work_crossing_id: context.crossing.crossing_id,
    result_id: context.result_id, sample_count: sampleCount, nonce: randomBytes(32).toString('hex') }, keys, createdAt, 'world:useful-work-native-challenger');
}
async function message(value: unknown, kind: string) {
  const crossing = await authenticated(value), d = crossing.extensions.organ_adapter;
  if (d.family_ref !== `organ:useful-work/merkle-${kind}-v1` || d.donor_contract_ref !== CHALLENGE_CONTRACT) throw new Error('INVALID_NATIVE_MESSAGE');
  const donor = claims(crossing);
  exactKeys(donor, [`merkle_${kind}`, 'ownership_asserted', 'economic_value_asserted'], 'INVALID_NATIVE_MESSAGE_CLAIMS');
  if (donor.ownership_asserted !== false || donor.economic_value_asserted !== false) throw new Error('UNSUPPORTED_NATIVE_AUTHORITY_CLAIM');
  const payload = record(donor[`merkle_${kind}`], 'MISSING_NATIVE_MESSAGE');
  const refs = [{ address: `sha256:${sha256Hex(canonicalBytes(payload))}`, role: `merkle-${kind}`, media_type: 'application/json' }];
  if (!canonicalBytes(crossing.payload_refs).equals(canonicalBytes(refs))) throw new Error('MESSAGE_PAYLOAD_MISMATCH');
  return { crossing, payload };
}
export async function inspectChallenge(context: NativeContext, value: unknown) {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  const { crossing, payload } = await message(value, 'challenge');
  exactKeys(payload, ['schema', 'work_crossing_id', 'result_id', 'sample_count', 'nonce'], 'INVALID_NATIVE_CHALLENGE');
  if (payload.schema !== 'useful-work.merkle-challenge/v1' || payload.work_crossing_id !== context.crossing.crossing_id || payload.result_id !== context.result_id) throw new Error('CHALLENGE_CONTEXT_MISMATCH');
  digest(payload.nonce);
  const indices = deriveSampleIndices(context.crossing.crossing_id, crossing.crossing_id, context.job.width * context.job.height, payload.sample_count);
  return { crossing, challenge: payload as NativeChallenge, indices };
}
export async function inspectResponse(context: NativeContext, challengeValue: unknown, value: unknown) {
  context = await inspectNativeWork(context.crossing, context.jobBytes);
  const challenge = await inspectChallenge(context, challengeValue), { crossing, payload } = await message(value, 'response');
  if (!canonicalBytes(crossing.signing.public_key).equals(canonicalBytes(context.crossing.signing.public_key))) throw new Error('RESPONSE_WORKER_KEY_MISMATCH');
  if (payload.work_crossing_id !== context.crossing.crossing_id || payload.challenge_id !== challenge.crossing.crossing_id || payload.result_id !== context.result_id) throw new Error('RESPONSE_CONTEXT_MISMATCH');
  return { challenge, crossing, response: payload };
}
