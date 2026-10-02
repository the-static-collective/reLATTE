import type { Signer } from '@tbd54566975/dwn-sdk-js';

import {
  canonicalizeDomainValue,
  sha256Hex,
} from './canonical.ts';
import {
  type DwnRoadDiscoveryReport,
  selectDwnRoadCandidate,
} from './did-dht-discovery.ts';
import {
  readCrossingFromRemoteDwn,
  type RemoteDwnReadResult,
} from './remote-dwn-road.ts';
import { verifyCrossingEnvelope } from './protocol.ts';

export const ROAD_ATTEMPT_ID_DOMAIN = 'reLATTE-RoadAttempt-v0|';
export const AUTOMATIC_FAILOVER_ID_DOMAIN = 'reLATTE-AutomaticFailover-v0|';

export interface FailoverRoute {
  candidate_id: string;
  record_id: string;
  selected_at: string;
}

export interface FailoverAttempt {
  schema: 'relatte.road-attempt/v0';
  attempt_id: string;
  attempt_index: number;
  candidate_id: string;
  selection_id: string;
  endpoint: string;
  record_id: string;
  outcome: 'failed' | 'recovered';
  failure_code: string | null;
  crossing_id: string | null;
  semantic_effect: 'none';
  laws: string[];
}

export interface AutomaticFailoverResult {
  schema: 'relatte.automatic-failover/v0';
  failover_id: string;
  did_uri: string;
  policy: 'ordered-first-readable/v0';
  tenant_did: string;
  expected_crossing_id: string;
  attempts: FailoverAttempt[];
  recovered_candidate_id: string;
  recovered_endpoint: string;
  recovered_record_id: string;
  crossing: Record<string, any>;
  crossing_id: string;
  semantic_effect: 'none';
  laws: string[];
}

type ReadImpl = typeof readCrossingFromRemoteDwn;

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.startsWith('FAILOVER_INTEGRITY_FAILURE:') ||
    message.includes('INVALID_REMOTE_DWN_CROSSING') ||
    message.includes('REMOTE_DWN_CROSSING_BODY_NOT_CANONICAL') ||
    message.includes('INVALID_REMOTE_DWN_CROSSING_BODY')
  ) {
    throw new Error(
      message.startsWith('FAILOVER_INTEGRITY_FAILURE:')
        ? message
        : `FAILOVER_INTEGRITY_FAILURE:${message}`
    );
  }
  if (message.startsWith('REMOTE_DWN_HTTP_READ_FAILED:')) return 'REMOTE_HTTP_UNAVAILABLE';
  if (message.startsWith('REMOTE_DWN_READ_REJECTED:')) return 'REMOTE_READ_REJECTED';
  if (message.includes('REMOTE_DWN_READ_RESPONSE_HEADER_MISSING')) return 'REMOTE_PROTOCOL_MISMATCH';
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) return 'TRANSPORT_UNREACHABLE';
  return 'REMOTE_READ_FAILED';
}

function attemptIdentityBody(value: Omit<FailoverAttempt, 'attempt_id'>): Record<string, unknown> {
  return {
    schema: value.schema,
    attempt_index: value.attempt_index,
    candidate_id: value.candidate_id,
    selection_id: value.selection_id,
    endpoint: value.endpoint,
    record_id: value.record_id,
    outcome: value.outcome,
    failure_code: value.failure_code,
    crossing_id: value.crossing_id,
    semantic_effect: 'none',
    laws: [...value.laws],
  };
}

function sealAttempt(value: Omit<FailoverAttempt, 'attempt_id'>): FailoverAttempt {
  return {
    ...value,
    attempt_id: `relatte-road-attempt-v0:${sha256Hex(
      canonicalizeDomainValue(ROAD_ATTEMPT_ID_DOMAIN, attemptIdentityBody(value))
    )}`,
  };
}

function failoverIdentityBody(
  value: Omit<AutomaticFailoverResult, 'failover_id' | 'crossing'>
): Record<string, unknown> {
  return {
    schema: value.schema,
    did_uri: value.did_uri,
    policy: value.policy,
    tenant_did: value.tenant_did,
    expected_crossing_id: value.expected_crossing_id,
    attempts: value.attempts.map((attempt) => ({
      attempt_id: attempt.attempt_id,
      attempt_index: attempt.attempt_index,
      candidate_id: attempt.candidate_id,
      selection_id: attempt.selection_id,
      endpoint: attempt.endpoint,
      record_id: attempt.record_id,
      outcome: attempt.outcome,
      failure_code: attempt.failure_code,
      crossing_id: attempt.crossing_id,
    })),
    recovered_candidate_id: value.recovered_candidate_id,
    recovered_endpoint: value.recovered_endpoint,
    recovered_record_id: value.recovered_record_id,
    crossing_id: value.crossing_id,
    semantic_effect: 'none',
    laws: [...value.laws],
  };
}

export async function readCrossingWithAutomaticFailover(args: {
  discovery: DwnRoadDiscoveryReport;
  routes: FailoverRoute[];
  tenant_did: string;
  signer: Signer;
  expected_crossing_id: string;
  read_impl?: ReadImpl;
}): Promise<AutomaticFailoverResult> {
  if (args.discovery.resolution_status !== 'resolved') throw new Error('FAILOVER_DISCOVERY_UNAVAILABLE');
  if (!Array.isArray(args.routes) || args.routes.length === 0) throw new Error('FAILOVER_ROUTES_REQUIRED');

  const tenantDid = nonEmpty(args.tenant_did, 'INVALID_FAILOVER_TENANT_DID');
  const expectedCrossingId = nonEmpty(
    args.expected_crossing_id,
    'INVALID_FAILOVER_EXPECTED_CROSSING_ID',
  );
  const readImpl = args.read_impl ?? readCrossingFromRemoteDwn;
  const attempts: FailoverAttempt[] = [];
  const seenCandidates = new Set<string>();

  for (let index = 0; index < args.routes.length; index++) {
    const route = args.routes[index];
    const candidateId = nonEmpty(route.candidate_id, 'INVALID_FAILOVER_CANDIDATE_ID');
    const recordId = nonEmpty(route.record_id, 'INVALID_FAILOVER_RECORD_ID');
    if (seenCandidates.has(candidateId)) throw new Error('FAILOVER_DUPLICATE_CANDIDATE');
    seenCandidates.add(candidateId);

    const selection = selectDwnRoadCandidate(
      args.discovery,
      candidateId,
      route.selected_at,
    );

    try {
      const recovered: RemoteDwnReadResult = await readImpl({
        endpoint: selection.endpoint,
        tenant_did: tenantDid,
        signer: args.signer,
        record_id: recordId,
      });

      if (!(await verifyCrossingEnvelope(recovered.crossing))) {
        throw new Error('FAILOVER_INTEGRITY_FAILURE:INVALID_REMOTE_DWN_CROSSING');
      }
      if (recovered.crossing_id !== expectedCrossingId) {
        throw new Error(
          `FAILOVER_INTEGRITY_FAILURE:UNEXPECTED_CROSSING_ID:${recovered.crossing_id}`
        );
      }

      attempts.push(sealAttempt({
        schema: 'relatte.road-attempt/v0',
        attempt_index: index,
        candidate_id: candidateId,
        selection_id: selection.selection_id,
        endpoint: selection.endpoint,
        record_id: recordId,
        outcome: 'recovered',
        failure_code: null,
        crossing_id: recovered.crossing_id,
        semantic_effect: 'none',
        laws: [
          'FAILOVER SELECTION != AUTHORIZATION',
          'ROAD CHANGE != CROSSING CHANGE',
          'RECOVERED != ADMITTED',
        ],
      }));

      const body: Omit<AutomaticFailoverResult, 'failover_id' | 'crossing'> = {
        schema: 'relatte.automatic-failover/v0',
        did_uri: args.discovery.did_uri,
        policy: 'ordered-first-readable/v0',
        tenant_did: tenantDid,
        expected_crossing_id: expectedCrossingId,
        attempts,
        recovered_candidate_id: candidateId,
        recovered_endpoint: selection.endpoint,
        recovered_record_id: recordId,
        crossing_id: recovered.crossing_id,
        semantic_effect: 'none',
        laws: [
          'FAILURE OBSERVED != ROAD ERASED',
          'FAILOVER != CONSENSUS',
          'ROAD CHANGE != CROSSING CHANGE',
          'FAILOVER != AUTHORITY TRANSFER',
          'RECOVERY != ADMISSION',
        ],
      };

      return {
        ...body,
        crossing: recovered.crossing,
        failover_id: `relatte-automatic-failover-v0:${sha256Hex(
          canonicalizeDomainValue(
            AUTOMATIC_FAILOVER_ID_DOMAIN,
            failoverIdentityBody(body),
          )
        )}`,
      };
    } catch (error) {
      const code = failureCode(error);
      attempts.push(sealAttempt({
        schema: 'relatte.road-attempt/v0',
        attempt_index: index,
        candidate_id: candidateId,
        selection_id: selection.selection_id,
        endpoint: selection.endpoint,
        record_id: recordId,
        outcome: 'failed',
        failure_code: code,
        crossing_id: null,
        semantic_effect: 'none',
        laws: [
          'FAILURE OBSERVED != ROAD ERASED',
          'FAILED ROAD != FAILED HISTORY',
          'FAILURE != AUTHORITY',
        ],
      }));
    }
  }

  const error = new Error('AUTOMATIC_FAILOVER_EXHAUSTED');
  (error as Error & { attempts?: FailoverAttempt[] }).attempts = attempts;
  throw error;
}
