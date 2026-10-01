import type { EnterableParticularPacket } from './enterable.ts';
import { buildEnterableParticular } from './enterable.ts';
import {
  openVerifiedNeighbor,
  type VerifiedTraversalStep,
} from './traversal.ts';

type UnknownRecord = Record<string, unknown>;

export interface RoomNavigationRequestV0 {
  format: 'roroomom.relatte-navigation-request/v0';
  version: 0;
  source_subject: string;
  requested_subject: string;
  source_door: 'COMPOST' | 'COMPOSE' | 'COMPUTE' | 'COMMUTE' | 'COMMUNE';
  encounter_id: string;
  authority: 'none';
  requested_action: 'recenter-if-verified-neighbor';
  boundary: readonly string[];
}

export interface FollowedRoomNavigationRequest {
  request: RoomNavigationRequestV0;
  step: VerifiedTraversalStep;
  destination: EnterableParticularPacket;
}

const REQUIRED_BOUNDARY = [
  'ROOM REQUEST != VERIFIED ROAD',
  'REQUESTED SUBJECT != AUTHORIZED SUBJECT',
  'reLATTE MUST REVERIFY NEIGHBOR',
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requiredText(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`INVALID_ROOM_NAVIGATION_${key.toUpperCase()}`);
  }
  return value;
}

function parseRoomNavigationRequest(value: unknown): RoomNavigationRequestV0 {
  const record = asRecord(value);
  if (record === null) throw new Error('INVALID_ROOM_NAVIGATION_REQUEST');

  if (
    record.format !== 'roroomom.relatte-navigation-request/v0'
    || record.version !== 0
    || record.authority !== 'none'
    || record.requested_action !== 'recenter-if-verified-neighbor'
  ) {
    throw new Error('INVALID_ROOM_NAVIGATION_REQUEST');
  }

  const sourceDoor = record.source_door;
  if (
    sourceDoor !== 'COMPOST'
    && sourceDoor !== 'COMPOSE'
    && sourceDoor !== 'COMPUTE'
    && sourceDoor !== 'COMMUTE'
    && sourceDoor !== 'COMMUNE'
  ) {
    throw new Error('INVALID_ROOM_NAVIGATION_SOURCE_DOOR');
  }

  if (!Array.isArray(record.boundary)) {
    throw new Error('INVALID_ROOM_NAVIGATION_BOUNDARY');
  }

  const boundary = record.boundary.filter(
    (item): item is string => typeof item === 'string',
  );

  for (const required of REQUIRED_BOUNDARY) {
    if (!boundary.includes(required)) {
      throw new Error('INVALID_ROOM_NAVIGATION_BOUNDARY');
    }
  }

  return {
    format: 'roroomom.relatte-navigation-request/v0',
    version: 0,
    source_subject: requiredText(record, 'source_subject'),
    requested_subject: requiredText(record, 'requested_subject'),
    source_door: sourceDoor,
    encounter_id: requiredText(record, 'encounter_id'),
    authority: 'none',
    requested_action: 'recenter-if-verified-neighbor',
    boundary,
  };
}

/**
 * Re-verify a ROroomOM navigation request against the supplied reLATTE history
 * cut, then emit a fresh enterable particular for the verified destination.
 *
 * The Room request is treated as a user/navigation intention only. It does not
 * carry or inherit authority over reLATTE traversal.
 */
export async function followRoomNavigationRequest(
  value: unknown,
  records: readonly unknown[],
): Promise<FollowedRoomNavigationRequest> {
  const request = parseRoomNavigationRequest(value);

  const step = await openVerifiedNeighbor(
    request.source_subject,
    request.requested_subject,
    records,
  );

  const destination = await buildEnterableParticular(
    request.requested_subject,
    records,
    [request.source_subject, request.requested_subject],
  );

  return {
    request,
    step,
    destination,
  };
}
