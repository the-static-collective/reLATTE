import { DidDht } from '@web5/dids';

import { discoverDwnRoadCandidatesFromDidDocument } from './did-dht-discovery.ts';

export interface LiveDidDhtGatewayRoundTripReport {
  schema: 'relatte.live-dht-gateway-roundtrip/v0';
  gateway_uri: string;
  did_uri: string;
  publish_accepted: boolean;
  resolved: boolean;
  local_candidate_ids: string[];
  resolved_candidate_ids: string[];
  candidates_preserved: boolean;
  semantic_effect: 'none';
  claims: {
    gateway_round_trip: true;
    public_dht_propagation: false;
    endpoint_reachability: false;
    receiver_admission: false;
  };
  laws: string[];
}

function normalizeGatewayUri(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('INVALID_DID_DHT_GATEWAY_URI');
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_DID_DHT_GATEWAY_PROTOCOL');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('DID_DHT_GATEWAY_CREDENTIALS_FORBIDDEN');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export async function publishAndResolveDidDhtGateway(args: {
  did: any;
  gateway_uri: string;
}): Promise<LiveDidDhtGatewayRoundTripReport> {
  const gatewayUri = normalizeGatewayUri(args.gateway_uri);
  if (!args.did || typeof args.did.uri !== 'string' || !args.did.document) {
    throw new Error('INVALID_DID_DHT_SUBJECT');
  }
  if (!args.did.uri.startsWith('did:dht:')) throw new Error('DID_METHOD_MISMATCH');

  const localDiscovery = discoverDwnRoadCandidatesFromDidDocument(args.did.document);
  const registration = await DidDht.publish({
    did: args.did,
    gatewayUri,
  });

  const publishAccepted = registration.didDocumentMetadata?.published === true;
  if (!publishAccepted) throw new Error('DID_DHT_GATEWAY_PUBLISH_REJECTED');

  const resolved = await DidDht.resolve(args.did.uri, { gatewayUri });
  const resolverError = resolved.didResolutionMetadata?.error;
  if (resolverError || !resolved.didDocument) {
    throw new Error(
      `DID_DHT_GATEWAY_RESOLUTION_FAILED:${String(
        resolved.didResolutionMetadata?.errorMessage ?? resolverError ?? 'missing document'
      )}`,
    );
  }

  const resolvedDiscovery = discoverDwnRoadCandidatesFromDidDocument(resolved.didDocument);
  const localCandidateIds = sorted(localDiscovery.candidates.map((entry) => entry.candidate_id));
  const resolvedCandidateIds = sorted(resolvedDiscovery.candidates.map((entry) => entry.candidate_id));
  const candidatesPreserved =
    localCandidateIds.length === resolvedCandidateIds.length &&
    localCandidateIds.every((candidateId, index) => candidateId === resolvedCandidateIds[index]);

  if (!candidatesPreserved) throw new Error('DID_DHT_GATEWAY_DISCOVERY_DRIFT');

  return {
    schema: 'relatte.live-dht-gateway-roundtrip/v0',
    gateway_uri: gatewayUri,
    did_uri: args.did.uri,
    publish_accepted: true,
    resolved: true,
    local_candidate_ids: localCandidateIds,
    resolved_candidate_ids: resolvedCandidateIds,
    candidates_preserved: true,
    semantic_effect: 'none',
    claims: {
      gateway_round_trip: true,
      public_dht_propagation: false,
      endpoint_reachability: false,
      receiver_admission: false,
    },
    laws: [
      'GATEWAY ACCEPTED != PUBLIC DHT PROPAGATED',
      'GATEWAY RESOLVED != ENDPOINT REACHABLE',
      'RESOLVED != TRUSTED',
      'DISCOVERED != SELECTED',
      'DELIVERED != ADMITTED',
    ],
  };
}
