import type { Signer } from '@tbd54566975/dwn-sdk-js';

import {
  readCrossingWithAutomaticFailover,
  type FailoverRoute,
  type AutomaticFailoverResult,
  type FailoverAttempt,
} from './automatic-failover.ts';
import type { DwnRoadDiscoveryReport } from './did-dht-discovery.ts';
import {
  LocalRoadMemory,
  type RoadMemoryDecision,
} from './road-memory.ts';

export interface RoadMemoryFailoverStep {
  candidate_id: string;
  decision: RoadMemoryDecision;
  outcome: 'skipped-open' | 'failed' | 'recovered';
  attempt: FailoverAttempt | null;
}

export interface RoadMemoryFailoverResult {
  schema: 'relatte.road-memory-failover/v0';
  policy: 'road-memory-ordered-first-readable/v0';
  crossing: Record<string, any>;
  crossing_id: string;
  recovered_candidate_id: string;
  recovered_endpoint: string;
  recovered_record_id: string;
  steps: RoadMemoryFailoverStep[];
  semantic_effect: 'none';
  laws: string[];
}

function isIntegrityFailure(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('FAILOVER_INTEGRITY_FAILURE:');
}

function exhaustedAttempt(error: unknown): FailoverAttempt | null {
  if (!(error instanceof Error) || error.message !== 'AUTOMATIC_FAILOVER_EXHAUSTED') {
    return null;
  }
  const attempts = (error as Error & { attempts?: FailoverAttempt[] }).attempts;
  if (!Array.isArray(attempts) || attempts.length !== 1) return null;
  return attempts[0];
}

function isMemoryAvailabilityCode(
  value: string | null,
): value is 'TRANSPORT_UNREACHABLE' | 'REMOTE_HTTP_UNAVAILABLE' {
  return value === 'TRANSPORT_UNREACHABLE' || value === 'REMOTE_HTTP_UNAVAILABLE';
}

export async function readCrossingWithRoadMemory(args: {
  discovery: DwnRoadDiscoveryReport;
  routes: FailoverRoute[];
  tenant_did: string;
  signer: Signer;
  expected_crossing_id: string;
  memory: LocalRoadMemory;
  read_impl?: Parameters<typeof readCrossingWithAutomaticFailover>[0]['read_impl'];
}): Promise<RoadMemoryFailoverResult> {
  if (args.discovery.resolution_status !== 'resolved') {
    throw new Error('ROAD_MEMORY_FAILOVER_DISCOVERY_UNAVAILABLE');
  }
  if (!Array.isArray(args.routes) || args.routes.length === 0) {
    throw new Error('ROAD_MEMORY_FAILOVER_ROUTES_REQUIRED');
  }

  const steps: RoadMemoryFailoverStep[] = [];

  for (const route of args.routes) {
    const candidate = args.discovery.candidates.find(
      (entry) => entry.candidate_id === route.candidate_id,
    );
    if (!candidate) throw new Error('ROAD_MEMORY_FAILOVER_UNKNOWN_CANDIDATE');

    const decision = args.memory.decide({
      candidate_id: candidate.candidate_id,
      endpoint: candidate.endpoint,
      observed_at: route.selected_at,
    });

    if (decision.action === 'SKIP_OPEN') {
      steps.push({
        candidate_id: candidate.candidate_id,
        decision,
        outcome: 'skipped-open',
        attempt: null,
      });
      continue;
    }

    try {
      const result: AutomaticFailoverResult = await readCrossingWithAutomaticFailover({
        discovery: args.discovery,
        routes: [route],
        tenant_did: args.tenant_did,
        signer: args.signer,
        expected_crossing_id: args.expected_crossing_id,
        read_impl: args.read_impl,
      });

      await args.memory.observeSuccess({
        candidate_id: candidate.candidate_id,
        endpoint: candidate.endpoint,
        observed_at: route.selected_at,
      });

      steps.push({
        candidate_id: candidate.candidate_id,
        decision,
        outcome: 'recovered',
        attempt: result.attempts[0],
      });

      return {
        schema: 'relatte.road-memory-failover/v0',
        policy: 'road-memory-ordered-first-readable/v0',
        crossing: result.crossing,
        crossing_id: result.crossing_id,
        recovered_candidate_id: result.recovered_candidate_id,
        recovered_endpoint: result.recovered_endpoint,
        recovered_record_id: result.recovered_record_id,
        steps,
        semantic_effect: 'none',
        laws: [
          'LOCAL ROAD MEMORY != GLOBAL REPUTATION',
          'SKIP != ERASURE',
          'OPEN != PERMANENTLY DEAD',
          'PROBE != TRUST',
          'ROAD HEALTH != RECEIVER AUTHORITY',
          'ROAD CHANGE != CROSSING CHANGE',
          'RECOVERY != ADMISSION',
        ],
      };
    } catch (error) {
      if (isIntegrityFailure(error)) throw error;

      const attempt = exhaustedAttempt(error);
      if (!attempt || attempt.outcome !== 'failed') throw error;

      if (isMemoryAvailabilityCode(attempt.failure_code)) {
        await args.memory.observeAvailabilityFailure({
          candidate_id: candidate.candidate_id,
          endpoint: candidate.endpoint,
          failure_code: attempt.failure_code,
          observed_at: route.selected_at,
        });
      }

      steps.push({
        candidate_id: candidate.candidate_id,
        decision,
        outcome: 'failed',
        attempt,
      });
    }
  }

  const error = new Error('ROAD_MEMORY_FAILOVER_EXHAUSTED');
  (error as Error & { steps?: RoadMemoryFailoverStep[] }).steps = steps;
  throw error;
}
