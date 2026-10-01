import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';

export const DWN_ROAD_CANDIDATE_ID_DOMAIN = 'reLATTE-DwnRoadCandidate-v0|';
export const DWN_ROAD_SELECTION_ID_DOMAIN = 'reLATTE-DwnRoadSelection-v0|';
export const DWN_SERVICE_TYPE = 'DecentralizedWebNode';

export interface DidResolverLike {
  resolve(didUri: string): Promise<{
    didDocument?: unknown;
    didResolutionMetadata?: {
      error?: unknown;
      errorMessage?: unknown;
    };
  }>;
}

export interface DwnRoadCandidate {
  schema: 'relatte.dwn-road-candidate/v0';
  candidate_id: string;
  discovered_from_did: string;
  service_id: string;
  service_type: 'DecentralizedWebNode';
  endpoint: string;
  protocol: 'http:' | 'https:';
  transport_security: 'cleartext' | 'tls';
  executable: false;
  semantic_effect: 'none';
  laws: string[];
}

export interface DwnRoadDiscoveryIgnored {
  service_id: string | null;
  endpoint: unknown;
  reason:
    | 'INVALID_SERVICE_ID'
    | 'UNSUPPORTED_ENDPOINT_SHAPE'
    | 'INVALID_ENDPOINT_URL'
    | 'UNSUPPORTED_ENDPOINT_PROTOCOL'
    | 'ENDPOINT_CREDENTIALS_FORBIDDEN';
}

export interface DwnRoadDiscoveryReport {
  schema: 'relatte.dwn-road-discovery/v0';
  did_uri: string;
  resolution_status: 'resolved' | 'unavailable';
  road_observation: 'candidate-observed' | 'no-candidate-observed' | 'unknown';
  candidates: DwnRoadCandidate[];
  ignored: DwnRoadDiscoveryIgnored[];
  resolver_error: string | null;
  semantic_effect: 'none';
  laws: string[];
}

function asRecord(value: unknown, code = 'INVALID_DID_DOCUMENT'): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function normalizeServiceId(didUri: string, value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (value.startsWith('#')) return didUri + value;
  if (!value.includes(':') && !value.includes('#')) return `${didUri}#${value}`;
  return value;
}

function endpointStrings(value: unknown): { endpoints: string[]; unsupported: unknown[] } {
  if (typeof value === 'string') return { endpoints: [value], unsupported: [] };
  if (Array.isArray(value)) {
    const endpoints = value.filter((item): item is string => typeof item === 'string');
    const unsupported = value.filter((item) => typeof item !== 'string');
    return { endpoints, unsupported };
  }
  return { endpoints: [], unsupported: [value] };
}

function candidateIdentityBody(value: Omit<DwnRoadCandidate, 'candidate_id'>): Record<string, unknown> {
  return {
    schema: value.schema,
    discovered_from_did: value.discovered_from_did,
    service_id: value.service_id,
    service_type: value.service_type,
    endpoint: value.endpoint,
    protocol: value.protocol,
    transport_security: value.transport_security,
    executable: false,
    semantic_effect: 'none',
    laws: [...value.laws],
  };
}

function computeCandidateId(value: Omit<DwnRoadCandidate, 'candidate_id'>): string {
  const bytes = canonicalizeDomainValue(
    DWN_ROAD_CANDIDATE_ID_DOMAIN,
    candidateIdentityBody(value),
  );
  return `relatte-dwn-road-candidate-v0:${sha256Hex(bytes)}`;
}

function makeCandidate(args: {
  did_uri: string;
  service_id: string;
  endpoint: string;
}): DwnRoadCandidate | DwnRoadDiscoveryIgnored {
  let url: URL;
  try {
    url = new URL(args.endpoint);
  } catch {
    return {
      service_id: args.service_id,
      endpoint: args.endpoint,
      reason: 'INVALID_ENDPOINT_URL',
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      service_id: args.service_id,
      endpoint: args.endpoint,
      reason: 'UNSUPPORTED_ENDPOINT_PROTOCOL',
    };
  }

  if (url.username !== '' || url.password !== '') {
    return {
      service_id: args.service_id,
      endpoint: args.endpoint,
      reason: 'ENDPOINT_CREDENTIALS_FORBIDDEN',
    };
  }

  const body: Omit<DwnRoadCandidate, 'candidate_id'> = {
    schema: 'relatte.dwn-road-candidate/v0',
    discovered_from_did: args.did_uri,
    service_id: args.service_id,
    service_type: DWN_SERVICE_TYPE,
    endpoint: url.toString(),
    protocol: url.protocol as 'http:' | 'https:',
    transport_security: url.protocol === 'https:' ? 'tls' : 'cleartext',
    executable: false,
    semantic_effect: 'none',
    laws: [
      'DISCOVERED != SELECTED',
      'SELECTED != DELIVERED',
      'ENDPOINT != AUTHORITY',
      'RESOLUTION != ADMISSION',
      'SERVICE ADVERTISEMENT != TRUST',
    ],
  };

  return {
    ...body,
    candidate_id: computeCandidateId(body),
  };
}

function isCandidate(value: DwnRoadCandidate | DwnRoadDiscoveryIgnored): value is DwnRoadCandidate {
  return 'candidate_id' in value;
}

export function discoverDwnRoadCandidatesFromDidDocument(
  didDocumentValue: unknown,
): DwnRoadDiscoveryReport {
  const document = asRecord(didDocumentValue);
  const didUri = nonEmpty(document.id, 'INVALID_DID_DOCUMENT_ID');
  if (!didUri.startsWith('did:')) throw new Error('INVALID_DID_DOCUMENT_ID');

  const candidatesById = new Map<string, DwnRoadCandidate>();
  const ignored: DwnRoadDiscoveryIgnored[] = [];
  const services = Array.isArray(document.service) ? document.service : [];

  for (const serviceValue of services) {
    if (typeof serviceValue !== 'object' || serviceValue === null || Array.isArray(serviceValue)) continue;
    const service = serviceValue as Record<string, unknown>;
    if (service.type !== DWN_SERVICE_TYPE) continue;

    const serviceId = normalizeServiceId(didUri, service.id);
    if (serviceId === null) {
      ignored.push({
        service_id: null,
        endpoint: service.serviceEndpoint,
        reason: 'INVALID_SERVICE_ID',
      });
      continue;
    }

    const { endpoints, unsupported } = endpointStrings(service.serviceEndpoint);
    for (const endpoint of unsupported) {
      ignored.push({
        service_id: serviceId,
        endpoint,
        reason: 'UNSUPPORTED_ENDPOINT_SHAPE',
      });
    }

    for (const endpoint of endpoints) {
      const result = makeCandidate({ did_uri: didUri, service_id: serviceId, endpoint });
      if (isCandidate(result)) {
        candidatesById.set(result.candidate_id, result);
      } else {
        ignored.push(result);
      }
    }
  }

  const candidates = [...candidatesById.values()].sort((a, b) =>
    a.candidate_id.localeCompare(b.candidate_id)
  );

  return {
    schema: 'relatte.dwn-road-discovery/v0',
    did_uri: didUri,
    resolution_status: 'resolved',
    road_observation: candidates.length > 0 ? 'candidate-observed' : 'no-candidate-observed',
    candidates,
    ignored,
    resolver_error: null,
    semantic_effect: 'none',
    laws: [
      'DISCOVERY != AUTHORIZATION',
      'DISCOVERED != SELECTED',
      'NO CANDIDATE OBSERVED != NO ROAD EXISTS',
      'RESOLUTION FAILURE != ROAD ABSENCE',
      'ENDPOINT != AUTHORITY',
    ],
  };
}

export async function resolveDwnRoadCandidates(
  didUriValue: unknown,
  resolver: DidResolverLike,
): Promise<DwnRoadDiscoveryReport> {
  const didUri = nonEmpty(didUriValue, 'INVALID_DID_URI');
  if (!didUri.startsWith('did:')) throw new Error('INVALID_DID_URI');

  try {
    const result = await resolver.resolve(didUri);
    const error = result.didResolutionMetadata?.error;
    if (error !== undefined && error !== null && error !== '') {
      return unavailableReport(
        didUri,
        String(result.didResolutionMetadata?.errorMessage ?? error),
      );
    }
    if (result.didDocument === undefined || result.didDocument === null) {
      return unavailableReport(didUri, 'DID_DOCUMENT_UNAVAILABLE');
    }

    const report = discoverDwnRoadCandidatesFromDidDocument(result.didDocument);
    if (report.did_uri !== didUri) {
      return unavailableReport(didUri, 'RESOLVED_DID_MISMATCH');
    }
    return report;
  } catch (error) {
    return unavailableReport(
      didUri,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function unavailableReport(didUri: string, error: string): DwnRoadDiscoveryReport {
  return {
    schema: 'relatte.dwn-road-discovery/v0',
    did_uri: didUri,
    resolution_status: 'unavailable',
    road_observation: 'unknown',
    candidates: [],
    ignored: [],
    resolver_error: error,
    semantic_effect: 'none',
    laws: [
      'RESOLUTION FAILURE != ROAD ABSENCE',
      'UNKNOWN != NONE',
      'DISCOVERY != AUTHORIZATION',
      'ENDPOINT != AUTHORITY',
    ],
  };
}

export interface DwnRoadSelection {
  schema: 'relatte.dwn-road-selection/v0';
  selection_id: string;
  candidate_id: string;
  did_uri: string;
  endpoint: string;
  selected_at: string;
  authorized: false;
  delivered: false;
  semantic_effect: 'none';
  laws: string[];
}

export function selectDwnRoadCandidate(
  report: DwnRoadDiscoveryReport,
  candidateIdValue: unknown,
  selectedAtValue: unknown,
): DwnRoadSelection {
  if (report.resolution_status !== 'resolved') throw new Error('DISCOVERY_UNAVAILABLE');
  const candidateId = nonEmpty(candidateIdValue, 'INVALID_CANDIDATE_ID');
  const selectedAt = nonEmpty(selectedAtValue, 'INVALID_SELECTION_TIMESTAMP');
  validateTimestamp(selectedAt);

  const candidate = report.candidates.find((entry) => entry.candidate_id === candidateId);
  if (!candidate) throw new Error('UNKNOWN_DWN_ROAD_CANDIDATE');

  const body = {
    schema: 'relatte.dwn-road-selection/v0' as const,
    candidate_id: candidate.candidate_id,
    did_uri: report.did_uri,
    endpoint: candidate.endpoint,
    selected_at: selectedAt,
    authorized: false as const,
    delivered: false as const,
    semantic_effect: 'none' as const,
    laws: [
      'DISCOVERED != SELECTED',
      'SELECTED != AUTHORIZED',
      'AUTHORIZED != DELIVERED',
      'DELIVERED != ADMITTED',
      'ENDPOINT != AUTHORITY',
    ],
  };

  const selectionId = `relatte-dwn-road-selection-v0:${sha256Hex(
    canonicalizeDomainValue(DWN_ROAD_SELECTION_ID_DOMAIN, body)
  )}`;

  return {
    ...body,
    selection_id: selectionId,
  };
}
