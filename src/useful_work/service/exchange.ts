import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { deriveSampleIndices } from '../challenge/commitment.ts';
import { inspectRandomness } from '../audit_clock/provenance.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { assertSigner, equal, expectedCrossingId, instant } from '../audit_clock/wire.ts';
import { inspectArtifact, verifyResultProof } from '../merkle_native/result.ts';
import { inspectPublication, recheckService } from './commitment.ts';
import type { ServiceContext } from './commitment.ts';
import { inspectServiceMessage, sealServiceMessage, serviceSpec } from './wire.ts';

function challengePayload(s: ServiceContext, event: Awaited<ReturnType<typeof inspectRandomness>>, publicationId: string) {
  const commitment_id = s.commitment.crossing_id, plan_id = s.plan.plan_id, slot_id = event.slot.slot_id, randomness_event_id = event.crossing.crossing_id;
  return { schema: 'useful-work.service-challenge/v1', commitment_id, plan_id, slot_id, slot_index: event.slot.index,
    result_id: s.native.result_id, randomness_event_id, publication_id: publicationId, sample_count: s.plan.policy.sample_count,
    nonce: domainHash('UsefulWork-ServiceChallenge-v1|', { commitment_id, plan_id, slot_id, randomness_event_id }) };
}
export async function issueServiceChallenge(s: ServiceContext, publicationValue: unknown, eventValue: unknown, keys: P256KeyMaterial) {
  s = await recheckService(s);
  const publication = await inspectPublication(s, publicationValue), e = await inspectRandomness(s.plan, eventValue);
  if (instant(e.event.emitted_at) > instant(e.slot.issue_deadline)) throw new Error('SERVICE_RANDOMNESS_AFTER_ISSUE_WINDOW');
  const crossing = await sealServiceMessage('challenge', challengePayload(s, e, publication.crossing_id), keys, s.plan.policy.challenger.world_id, e.event.emitted_at);
  await inspectServiceChallenge(s, publication, eventValue, crossing); return crossing;
}
export async function inspectServiceChallenge(s: ServiceContext, publicationValue: unknown, eventValue: unknown, value: unknown) {
  s = await recheckService(s);
  const publication = await inspectPublication(s, publicationValue), event = await inspectRandomness(s.plan, eventValue);
  if (instant(event.event.emitted_at) > instant(event.slot.issue_deadline)) throw new Error('SERVICE_RANDOMNESS_AFTER_ISSUE_WINDOW');
  const { crossing, payload } = await inspectServiceMessage(value, 'challenge');
  const expected = challengePayload(s, event, publication.crossing_id), p = s.plan.policy;
  assertSigner(crossing, p.challenger.public_key, p.challenger.world_id);
  if (!equal(payload, expected) || crossing.crossing_id !== expectedCrossingId(serviceSpec('challenge', expected, p.challenger.world_id, event.event.emitted_at), p.challenger.public_key)) throw new Error('SERVICE_CHALLENGE_DERIVATION_MISMATCH');
  return { crossing, slot: event.slot, indices: deriveSampleIndices(s.commitment.crossing_id, crossing.crossing_id,
    s.native.header.width * s.native.header.height, p.sample_count), event: event.crossing };
}
export async function answerServiceChallenge(s: ServiceContext, publication: unknown, event: unknown, challengeValue: unknown, artifact: Buffer, keys: P256KeyMaterial, at: string) {
  s = await recheckService(s);
  if (!equal(keys.publicKeyJwk, s.declaration.host.public_key)) throw new Error('SERVICE_HOST_KEY_MISMATCH');
  const ch = await inspectServiceChallenge(s, publication, event, challengeValue), tree = inspectArtifact(artifact, s.native.job, s.native.result_id);
  const payload = { schema: 'useful-work.service-response/v1', commitment_id: s.commitment.crossing_id,
    challenge_id: ch.crossing.crossing_id, result_id: s.native.result_id,
    chunks: ch.indices.map(index => ({ index, bytes_base64: canonicalBytes({ index, count: tree.artifact.escape_counts[index] }).toString('base64'), proof: tree.proof(index) })) };
  return sealServiceMessage('response', payload, keys, s.declaration.host.world_id, at);
}
export async function inspectServiceResponse(s: ServiceContext, challengeId: string, value: unknown) {
  s = await recheckService(s);
  const { crossing, payload: r } = await inspectServiceMessage(value, 'response');
  assertSigner(crossing, s.declaration.host.public_key, s.declaration.host.world_id);
  exactKeys(r, ['schema', 'commitment_id', 'challenge_id', 'result_id', 'chunks'], 'INVALID_SERVICE_RESPONSE');
  if (r.schema !== 'useful-work.service-response/v1' || r.commitment_id !== s.commitment.crossing_id || r.challenge_id !== challengeId || r.result_id !== s.native.result_id) throw new Error('SERVICE_RESPONSE_CONTEXT_MISMATCH');
  if (!Array.isArray(r.chunks)) throw new Error('INVALID_SERVICE_CHUNKS');
  integer(r.chunks.length, 0, 64, 'INVALID_SERVICE_CHUNK_COUNT');
  return { crossing, response: r };
}
/** Bad content is retained as a negative observation; authentication/context failures are protocol errors. */
export function checkChunks(s: ServiceContext, indices: number[], chunks: unknown[]) {
  let bytes_returned = 0;
  const evidence = chunks.map(value => {
    const c = record(value, 'INVALID_SERVICE_CHUNK');
    exactKeys(c, ['index', 'bytes_base64', 'proof'], 'INVALID_SERVICE_CHUNK');
    integer(c.index, 0, s.native.header.width * s.native.header.height - 1, 'INVALID_SERVICE_CHUNK_INDEX');
    if (typeof c.bytes_base64 !== 'string' || c.bytes_base64.length > 344 ||
        Buffer.from(c.bytes_base64, 'base64').toString('base64') !== c.bytes_base64) throw new Error('INVALID_SERVICE_CHUNK_ENCODING');
    const bytes = Buffer.from(c.bytes_base64, 'base64');
    if (bytes.length > 256) throw new Error('INVALID_SERVICE_CHUNK_ENCODING');
    bytes_returned += bytes.length;
    let canonical_chunk = false, proof_verified = false;
    try {
      const leaf = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), 'INVALID_SERVICE_LEAF');
      exactKeys(leaf, ['index', 'count'], 'INVALID_SERVICE_LEAF');
      integer(leaf.count, 0, s.native.job.iterations, 'INVALID_SERVICE_LEAF_COUNT');
      canonical_chunk = leaf.index === c.index && bytes.equals(canonicalBytes(leaf));
      proof_verified = canonical_chunk && verifyResultProof(s.native.header, s.native.result_id, c.index, leaf.count, c.proof);
    } catch { /* Decoded bytes exist, but fail the native chunk contract. */ }
    return { index: c.index, byte_length: bytes.length, canonical_chunk, proof_verified };
  });
  const artifact_chunk_proof_verified = evidence.length > 0 && evidence.every(e => e.proof_verified);
  const requested_bytes_matched = artifact_chunk_proof_verified && equal(evidence.map(e => e.index), indices);
  return { bytes_returned, artifact_chunk_proof_verified, requested_bytes_matched, evidence };
}
