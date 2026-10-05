import { randomBytes } from 'node:crypto';
import { sealOpaqueOrganCrossing, verifyOpaqueOrganCrossing } from '../../organ.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { CONTRACT, FAMILY, ROLES } from '../contract.ts';
import { deriveSampleIndices, digest, parseCommitment } from './commitment.ts';
import type { SampleCommitment } from './commitment.ts';

export const CHALLENGE_CONTRACT = 'contract:useful-work/sample-challenge-v1';
export interface Challenge {
  schema: 'useful-work.sample-challenge/v1';
  work_crossing_id: string;
  job_spec_hash: string;
  declared_result_hash: string;
  commitment_root: string;
  population: number;
  sample_count: number;
  nonce: string;
}
export interface OrbitSample { index: number; count: number; final_real_q: string; final_imag_q: string }
export interface AnswerSample extends OrbitSample { x: number; y: number; committed_count: number; proof: string[] }
export interface SampleResponse {
  schema: 'useful-work.sample-response/v1';
  work_crossing_id: string;
  challenge_id: string;
  job_spec_hash: string;
  declared_result_hash: string;
  commitment_root: string;
  samples: AnswerSample[];
}
export interface WorkContext {
  crossing: Record<string, any>;
  commitment: SampleCommitment;
  job: RenderJob;
  jobBytes: Buffer;
}
export async function authenticated(value: unknown): Promise<Record<string, any>> {
  if (!await verifyOpaqueOrganCrossing(value)) throw new Error('INVALID_OPAQUE_SIGNATURE');
  return structuredClone(value) as Record<string, any>;
}
export function claims(crossing: Record<string, any>): Record<string, any> { return crossing.extensions.organ_adapter.donor_claims; }
/** Only the tiny canonical job is fetched. Result, image and metadata are never requested. */
export async function inspectSampleWork(value: unknown, jobBytes: Buffer): Promise<WorkContext> {
  const crossing = await authenticated(value);
  const descriptor = crossing.extensions.organ_adapter;
  if (descriptor.family_ref !== FAMILY || descriptor.donor_contract_ref !== CONTRACT) throw new Error('UNSUPPORTED_WORK');
  const manifest = record(claims(crossing).useful_work, 'MISSING_MANIFEST');
  exactKeys(manifest, ['schema', 'job_spec_hash', 'result_hash', 'presentation_hash', 'metadata_hash'], 'INVALID_MANIFEST');
  if (manifest.schema !== 'useful-work.manifest/v1') throw new Error('INVALID_MANIFEST');
  const hashes = [manifest.job_spec_hash, manifest.result_hash, manifest.presentation_hash, manifest.metadata_hash];
  hashes.forEach(digest);
  if (crossing.payload_refs.length !== 4) throw new Error('MANIFEST_PAYLOAD_MISMATCH');
  ROLES.forEach((role, i) => {
    const refs = crossing.payload_refs.filter((ref: any) => ref.role === role);
    if (refs.length !== 1 || refs[0].address !== `sha256:${hashes[i]}` ||
        refs[0].media_type !== (role === 'presentation' ? 'image/x-portable-pixmap' : 'application/json')) throw new Error('MANIFEST_PAYLOAD_MISMATCH');
    exactKeys(refs[0], ['address', 'role', 'media_type'], 'INVALID_PAYLOAD_REF_FIELDS');
  });
  const commitment = parseCommitment(claims(crossing).sample_commitment);
  if (commitment.job_spec_hash !== manifest.job_spec_hash || commitment.result_hash !== manifest.result_hash) throw new Error('COMMITMENT_MANIFEST_MISMATCH');
  if (jobBytes.length > 4096 || sha256Hex(jobBytes) !== commitment.job_spec_hash) throw new Error('JOB_HASH_MISMATCH');
  const job = parseJob(JSON.parse(jobBytes.toString('utf8')));
  if (!jobBytes.equals(canonicalBytes(job))) throw new Error('NON_CANONICAL_JOB');
  if (commitment.population !== job.width * job.height) throw new Error('COMMITMENT_POPULATION_MISMATCH');
  return { crossing, commitment, job, jobBytes: Buffer.from(jobBytes) };
}
export async function sealSampleMessage(kind: 'challenge' | 'response', payload: Challenge | SampleResponse, keys: P256KeyMaterial, createdAt: string, world: string) {
  return sealOpaqueOrganCrossing({
    schema: 'relatte.opaque-organ-spec/v0', family_ref: `organ:useful-work/sample-${kind}-v1`,
    donor_contract_ref: CHALLENGE_CONTRACT, artifact_kind: `useful-work-sample-${kind}`,
    source_world: world, source_particular: `particular:useful-work:sample-${kind}`, source_history_head: null,
    payload_refs: [{ address: `sha256:${sha256Hex(canonicalBytes(payload))}`, role: `sample-${kind}`, media_type: 'application/json' }],
    donor_claims: { [`sample_${kind}`]: payload, ownership_asserted: false, economic_value_asserted: false },
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: createdAt,
  }, keys);
}
export async function createChallenge(context: WorkContext, sampleCount: number, keys: P256KeyMaterial, createdAt: string) {
  context = await inspectSampleWork(context.crossing, context.jobBytes);
  integer(sampleCount, 1, Math.min(context.commitment.population, 64), 'INVALID_SAMPLE_COUNT');
  const c = context.commitment;
  const challenge: Challenge = {
    schema: 'useful-work.sample-challenge/v1', work_crossing_id: context.crossing.crossing_id,
    job_spec_hash: c.job_spec_hash, declared_result_hash: c.result_hash, commitment_root: c.root_hash,
    population: c.population, sample_count: sampleCount, nonce: randomBytes(32).toString('hex'),
  };
  return sealSampleMessage('challenge', challenge, keys, createdAt, 'world:useful-work-challenger');
}
export async function inspectChallenge(context: WorkContext, value: unknown) {
  context = await inspectSampleWork(context.crossing, context.jobBytes);
  const crossing = await authenticated(value);
  const descriptor = crossing.extensions.organ_adapter;
  if (descriptor.family_ref !== 'organ:useful-work/sample-challenge-v1' || descriptor.donor_contract_ref !== CHALLENGE_CONTRACT) throw new Error('INVALID_CHALLENGE_ENVELOPE');
  const challenge = record(claims(crossing).sample_challenge, 'MISSING_CHALLENGE');
  messageRef(crossing, 'challenge', challenge);
  exactKeys(challenge, ['schema', 'work_crossing_id', 'job_spec_hash', 'declared_result_hash', 'commitment_root', 'population', 'sample_count', 'nonce'], 'INVALID_CHALLENGE_FIELDS');
  if (challenge.schema !== 'useful-work.sample-challenge/v1' || challenge.work_crossing_id !== context.crossing.crossing_id ||
      challenge.job_spec_hash !== context.commitment.job_spec_hash || challenge.declared_result_hash !== context.commitment.result_hash ||
      challenge.commitment_root !== context.commitment.root_hash || challenge.population !== context.commitment.population) throw new Error('CHALLENGE_CONTEXT_MISMATCH');
  digest(challenge.nonce);
  const indices = deriveSampleIndices(context.crossing.crossing_id, crossing.crossing_id, challenge.population, challenge.sample_count);
  return { crossing, challenge: challenge as Challenge, indices };
}
/** Authentication/context replay failures are explicit errors, never attestations against an unbound subject. */
export async function inspectResponse(context: WorkContext, challengeValue: unknown, responseValue: unknown) {
  context = await inspectSampleWork(context.crossing, context.jobBytes);
  const challenge = await inspectChallenge(context, challengeValue);
  const crossing = await authenticated(responseValue);
  if (!canonicalBytes(crossing.signing.public_key).equals(canonicalBytes(context.crossing.signing.public_key))) throw new Error('RESPONSE_WORKER_KEY_MISMATCH');
  const descriptor = crossing.extensions.organ_adapter;
  if (descriptor.family_ref !== 'organ:useful-work/sample-response-v1' || descriptor.donor_contract_ref !== CHALLENGE_CONTRACT) throw new Error('INVALID_RESPONSE_ENVELOPE');
  const response = record(claims(crossing).sample_response, 'MISSING_RESPONSE');
  messageRef(crossing, 'response', response);
  if (response.work_crossing_id !== context.crossing.crossing_id || response.challenge_id !== challenge.crossing.crossing_id ||
      response.job_spec_hash !== context.commitment.job_spec_hash || response.declared_result_hash !== context.commitment.result_hash ||
      response.commitment_root !== context.commitment.root_hash) throw new Error('RESPONSE_CONTEXT_MISMATCH');
  return { challenge, crossing, response };
}
function messageRef(crossing: Record<string, any>, kind: string, payload: unknown) {
  const expected = [{ address: `sha256:${sha256Hex(canonicalBytes(payload))}`, role: `sample-${kind}`, media_type: 'application/json' }];
  if (!canonicalBytes(crossing.payload_refs).equals(canonicalBytes(expected))) throw new Error('MESSAGE_PAYLOAD_MISMATCH');
}
export function parseOrbitSample(value: unknown, job: RenderJob): OrbitSample {
  const sample = record(value, 'INVALID_ORBIT_EVIDENCE');
  exactKeys(sample, ['index', 'count', 'final_real_q', 'final_imag_q'], 'INVALID_ORBIT_FIELDS');
  integer(sample.index, 0, job.width * job.height - 1, 'INVALID_SAMPLE_INDEX');
  integer(sample.count, 0, job.iterations, 'INVALID_ESCAPE_COUNT');
  for (const key of ['final_real_q', 'final_imag_q']) {
    if (typeof sample[key] !== 'string' || !/^(0|-[1-9][0-9]{0,19}|[1-9][0-9]{0,19})$/.test(sample[key])) throw new Error('INVALID_TERMINAL_STATE');
  }
  return structuredClone(sample) as OrbitSample;
}
