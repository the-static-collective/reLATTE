import { canonicalBytes } from '../job.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { sampleOrbit } from '../algorithm.ts';
import { buildCommitment } from './commitment.ts';
import { inspectChallenge, inspectSampleWork, sealSampleMessage } from './exchange.ts';
import type { SampleResponse, WorkContext } from './exchange.ts';

export async function answerChallenge(context: WorkContext, challengeValue: unknown, counts: number[], keys: P256KeyMaterial, createdAt: string) {
  context = await inspectSampleWork(context.crossing, context.jobBytes);
  if (!canonicalBytes(keys.publicKeyJwk).equals(canonicalBytes(context.crossing.signing.public_key))) throw new Error('WORKER_KEY_MISMATCH');
  const challenge = await inspectChallenge(context, challengeValue);
  const tree = buildCommitment(context.commitment.job_spec_hash, context.commitment.result_hash, counts);
  if (!canonicalBytes(tree.commitment).equals(canonicalBytes(context.commitment))) throw new Error('WORKER_COMMITMENT_MISMATCH');
  const response: SampleResponse = {
    schema: 'useful-work.sample-response/v1', work_crossing_id: context.crossing.crossing_id,
    challenge_id: challenge.crossing.crossing_id, job_spec_hash: context.commitment.job_spec_hash,
    declared_result_hash: context.commitment.result_hash, commitment_root: context.commitment.root_hash,
    samples: challenge.indices.map(index => ({
      ...sampleOrbit(context.job, index), x: index % context.job.width, y: Math.floor(index / context.job.width),
      committed_count: counts[index], proof: tree.proof(index),
    })),
  };
  return sealSampleMessage('response', response, keys, createdAt, context.crossing.source_world);
}
