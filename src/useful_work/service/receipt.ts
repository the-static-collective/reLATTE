import { computeReceiptId, sealReceipt, verifyReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes } from '../job.ts';
import { assertSigner, equal, instant } from '../audit_clock/wire.ts';
import { recheckService } from './commitment.ts';
import type { ServiceContext } from './commitment.ts';
import { inspectServiceChallenge, inspectServiceResponse, checkChunks } from './exchange.ts';
import { SERVICE_CONTRACT, SERVICE_LAWS, UNPROVEN } from './wire.ts';

export interface ServiceObservation { endpoint: string; sent_at: string; observed_at: string }
export async function serviceReport(s: ServiceContext, publication: unknown, event: unknown, challenge: unknown, response: unknown | null, observation: ServiceObservation) {
  s = await recheckService(s);
  const ch = await inspectServiceChallenge(s, publication, event, challenge);
  const sent = instant(observation.sent_at), seen = instant(observation.observed_at);
  if (observation.endpoint !== s.declaration.endpoint || sent < instant(ch.crossing.created_at) || seen < sent) throw new Error('INVALID_SERVICE_OBSERVATION');
  const returned = response === null ? null : await inspectServiceResponse(s, ch.crossing.crossing_id, response);
  const checks = checkChunks(s, ch.indices, returned?.response.chunks ?? []);
  return { schema: 'useful-work.service-observation/v1', scope: { commitment_id: s.commitment.crossing_id, plan_id: s.plan.plan_id,
    result_id: s.native.result_id, slot_id: ch.slot.slot_id, slot_index: ch.slot.index, challenge_id: ch.crossing.crossing_id,
    response_id: returned?.crossing.crossing_id ?? null, requested_indices: ch.indices, endpoint: observation.endpoint,
    host: s.declaration.host, sent_at: observation.sent_at, observed_at: observation.observed_at,
    response_deadline: ch.slot.response_deadline },
    claims: { artifact_chunk_proof_verified: checks.artifact_chunk_proof_verified, response_observed: returned !== null,
      response_within_observer_window: returned !== null && sent >= instant(ch.slot.scheduled_at) && seen <= instant(ch.slot.response_deadline),
      bytes_returned: checks.bytes_returned, requested_bytes_matched: checks.requested_bytes_matched, ...UNPROVEN },
    evidence: checks.evidence, byte_accounting: 'decoded-native-chunk-content/v1',
    observation_basis: 'signed-observer-claim/v1',
    errors: returned === null ? ['NO_RESPONSE_OBSERVED'] : checks.requested_bytes_matched ? [] : ['REQUESTED_CHUNKS_NOT_VERIFIED'] };
}
function receiptSpec(report: Awaited<ReturnType<typeof serviceReport>>, world: string) {
  return { schema: 'relatte.receipt/v0' as const, crossing_id: report.scope.response_id ?? report.scope.challenge_id,
    world_id: world, receiver_particular: 'particular:useful-work:service-observer', kind: report.claims.requested_bytes_matched ? 'VERIFIED' : 'FAILED',
    semantic_effect: 'none' as const, contract_ref: SERVICE_CONTRACT, pre_state_ref: null, post_state_ref: null,
    descendant_refs: [], residual_refs: [], created_at: report.scope.observed_at,
    note: 'Native chunk proofs and byte counts are replayable. Endpoint access, response observation and timing are attributed to this observer. A missing response is not proven unavailability.',
    extensions: { useful_work_service: report, laws: [...SERVICE_LAWS] } };
}
export async function observeService(s: ServiceContext, publication: unknown, event: unknown, challenge: unknown, response: unknown | null,
  observation: ServiceObservation, keys: P256KeyMaterial) {
  s = await recheckService(s);
  const report = await serviceReport(s, publication, event, challenge, response, observation);
  if (!equal(keys.publicKeyJwk, s.plan.policy.observer.public_key)) throw new Error('SERVICE_OBSERVER_KEY_MISMATCH');
  return sealReceipt(receiptSpec(report, s.plan.policy.observer.world_id), keys);
}
export async function inspectServiceReceipt(s: ServiceContext, publication: unknown, event: unknown, challenge: unknown, response: unknown | null, value: unknown) {
  s = await recheckService(s);
  if (canonicalBytes(value).length > 1_000_000 || !await verifyReceipt(value)) throw new Error('INVALID_SERVICE_RECEIPT_SIGNATURE');
  const receipt = structuredClone(value) as Record<string, any>;
  // Receipt identities are world_id rather than source_world, but use the same pinned key check.
  assertSigner({ ...receipt, source_world: receipt.world_id }, s.plan.policy.observer.public_key, s.plan.policy.observer.world_id);
  const scope = receipt.extensions?.useful_work_service?.scope;
  if (!scope) throw new Error('INVALID_SERVICE_RECEIPT');
  const report = await serviceReport(s, publication, event, challenge, response,
    { endpoint: scope.endpoint, sent_at: scope.sent_at, observed_at: scope.observed_at });
  const expected = { ...receiptSpec(report, s.plan.policy.observer.world_id), signing: receipt.signing };
  if (computeReceiptId(expected) !== receipt.receipt_id) throw new Error('SERVICE_RECEIPT_REPLAY_MISMATCH');
  return { receipt, report };
}
