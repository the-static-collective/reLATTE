import type { Signer } from '@tbd54566975/dwn-sdk-js';

import {
  readCrossingFromRemoteDwn,
  writeCrossingToRemoteDwn,
} from './remote-dwn-road.ts';

export interface MortalRoadReplicationResult {
  schema: 'relatte.mortal-road-replication/v0';
  crossing_id: string;
  source_endpoint: string;
  source_record_id: string;
  destination_endpoint: string;
  destination_record_id: string;
  source_read_status: number;
  destination_write_status: number;
  crossing_preserved: true;
  semantic_effect: 'none';
  laws: string[];
}

function normalizeEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('INVALID_MORTAL_ROAD_ENDPOINT');
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_MORTAL_ROAD_PROTOCOL');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('MORTAL_ROAD_ENDPOINT_CREDENTIALS_FORBIDDEN');
  }
  return url.toString();
}

export async function replicateCrossingBetweenRemoteDwns(args: {
  source_endpoint: string;
  source_record_id: string;
  destination_endpoint: string;
  tenant_did: string;
  signer: Signer;
  fetch_impl?: typeof fetch;
}): Promise<MortalRoadReplicationResult> {
  const sourceEndpoint = normalizeEndpoint(args.source_endpoint);
  const destinationEndpoint = normalizeEndpoint(args.destination_endpoint);
  if (sourceEndpoint === destinationEndpoint) {
    throw new Error('MORTAL_ROAD_REQUIRES_DISTINCT_NODES');
  }

  const sourceRead = await readCrossingFromRemoteDwn({
    endpoint: sourceEndpoint,
    tenant_did: args.tenant_did,
    signer: args.signer,
    record_id: args.source_record_id,
    fetch_impl: args.fetch_impl,
  });

  const destinationWrite = await writeCrossingToRemoteDwn({
    endpoint: destinationEndpoint,
    tenant_did: args.tenant_did,
    signer: args.signer,
    crossing: sourceRead.crossing,
    fetch_impl: args.fetch_impl,
  });

  if (destinationWrite.crossing_id !== sourceRead.crossing_id) {
    throw new Error('MORTAL_ROAD_CROSSING_ID_DRIFT');
  }

  return {
    schema: 'relatte.mortal-road-replication/v0',
    crossing_id: sourceRead.crossing_id,
    source_endpoint: sourceEndpoint,
    source_record_id: args.source_record_id,
    destination_endpoint: destinationEndpoint,
    destination_record_id: destinationWrite.dwn_record_id,
    source_read_status: sourceRead.dwn_status,
    destination_write_status: destinationWrite.dwn_status,
    crossing_preserved: true,
    semantic_effect: 'none',
    laws: [
      'REPLICATION != CONSENSUS',
      'REPLICATION != ADMISSION',
      'COPY != AUTHORITY',
      'NODE A != NODE B',
      'NODE DEATH != CROSSING DEATH',
      'DWN RECORD != CROSSING',
    ],
  };
}
