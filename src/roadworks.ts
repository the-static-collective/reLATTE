/** ROADWORKS 001: explicit road policy over a separately signed crossing.
 * No anonymity, peer authentication or transport security is inferred from a label.
 */
export type RoadKind =
  | 'loopback-http'
  | 'file-bundle'
  | 'wireguard'
  | 'tor-onion'
  | 'i2p'
  | 'yggdrasil'
  | 'reticulum'
  | 'briar';

export interface RoadDescriptor {
  id: string;
  kind: RoadKind;
}

export interface RoadPolicy {
  allowedRoadIds: readonly string[];
  allowedKinds: readonly RoadKind[];
  maxAttempts: number;
}

export const ROAD_CAPABILITIES: Record<RoadKind, {
  execution: 'lab-adapter' | 'future-adapter' | 'human-only';
  purpose: string;
}> = {
  'loopback-http': { execution: 'lab-adapter', purpose: 'local HTTP integration test; not public transport' },
  'file-bundle': { execution: 'lab-adapter', purpose: 'verified file handoff' },
  wireguard: { execution: 'future-adapter', purpose: 'explicitly permissioned private overlay' },
  'tor-onion': { execution: 'future-adapter', purpose: 'authenticated onion application endpoint' },
  i2p: { execution: 'future-adapter', purpose: 'I2P internal application service' },
  yggdrasil: { execution: 'future-adapter', purpose: 'encrypted IPv6 overlay; not anonymous' },
  reticulum: { execution: 'future-adapter', purpose: 'low-bandwidth store-and-forward' },
  briar: { execution: 'human-only', purpose: 'opt-in human contact and offline message continuity' },
};

export interface RoadAttempt {
  road_id: string;
  result: 'failed' | 'transport-ack';
  reason?: 'DELIVERY_ERROR' | 'INVALID_ACK';
}

export interface RoadDelivery {
  crossing_id: string;
  transport_id: string;
  road_id: string;
  attempts: RoadAttempt[];
  semantic_effect: 'none';
}

export interface RoadSendResult {
  frame_id: string;
  ack: unknown;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateTransportAck(ack: unknown, frameId: string, crossingId: string): boolean {
  return isRecord(ack)
    && ack.schema === 'relatte.transport-ack/v0'
    && ack.transport_id === frameId
    && ack.crossing_id === crossingId
    && ack.accepted_for_delivery === true
    && ack.semantic_effect === 'none';
}

/**
 * Execute *only* fully allowlisted lab roads. The caller owns the actual carrier.
 * This is a transport ACK only: receiver RECEIVE/HOLD/ADMIT must be checked elsewhere.
 * The policy never widens itself when a chosen road fails.
 */
export async function dispatchRoadworks(
  crossingId: string,
  roads: readonly RoadDescriptor[],
  policy: RoadPolicy,
  send: (road: RoadDescriptor) => Promise<RoadSendResult>,
): Promise<RoadDelivery> {
  if (!validId(crossingId)) throw new Error('ROADWORKS_INVALID_CROSSING_ID');
  if (!Array.isArray(policy.allowedRoadIds) || !Array.isArray(policy.allowedKinds)
    || policy.allowedRoadIds.length === 0 || policy.allowedKinds.length === 0
    || !Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1
    || policy.allowedRoadIds.some((v) => !validId(v))
    || new Set(policy.allowedRoadIds).size !== policy.allowedRoadIds.length
    || new Set(policy.allowedKinds).size !== policy.allowedKinds.length
    || policy.allowedKinds.some((v) => !Object.prototype.hasOwnProperty.call(ROAD_CAPABILITIES, v))) {
    throw new Error('ROADWORKS_INVALID_POLICY');
  }
  if (roads.some((road) => !validId(road.id)
    || !Object.prototype.hasOwnProperty.call(ROAD_CAPABILITIES, road.kind))
    || new Set(roads.map((road) => road.id)).size !== roads.length) {
    throw new Error('ROADWORKS_INVALID_ROADS');
  }

  // Reject disallowed kinds in the allowlist rather than silently ignoring them.
  const selected = policy.allowedRoadIds.map((id) => {
    const road = roads.find((candidate) => candidate.id === id);
    if (!road) throw new Error('ROADWORKS_UNKNOWN_ALLOWED_ROAD');
    if (!policy.allowedKinds.includes(road.kind)) throw new Error('ROADWORKS_KIND_NOT_ALLOWED');
    if (ROAD_CAPABILITIES[road.kind].execution !== 'lab-adapter') {
      throw new Error('ROADWORKS_NOT_AN_AUTOMATED_ADAPTER');
    }
    return road;
  });

  const attempts: RoadAttempt[] = [];
  for (const road of selected.slice(0, policy.maxAttempts)) {
    let result: RoadSendResult;
    try {
      result = await send(road);
    } catch {
      attempts.push({ road_id: road.id, result: 'failed', reason: 'DELIVERY_ERROR' });
      continue;
    }
    if (!validId(result?.frame_id)
      || !validateTransportAck(result.ack, result.frame_id, crossingId)) {
      attempts.push({ road_id: road.id, result: 'failed', reason: 'INVALID_ACK' });
      continue;
    }
    attempts.push({ road_id: road.id, result: 'transport-ack' });
    return {
      crossing_id: crossingId,
      transport_id: result.frame_id,
      road_id: road.id,
      attempts,
      semantic_effect: 'none',
    };
  }
  throw new Error('ROADWORKS_DELIVERY_EXHAUSTED:' + attempts.map((a) => a.road_id).join(','));
}
