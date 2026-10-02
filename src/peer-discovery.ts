import {
  canonicalizeDomainValue,
  sha256Hex,
} from './canonical.ts';

export const RELATTE_RUNTIME_SERVICE_TYPE = 'RelatteRuntime';
export const PEER_CANDIDATE_ID_DOMAIN = 'reLATTE-PeerCandidate-v0|';

export interface RelattePeerCandidate {
  schema: 'relatte.peer-candidate/v0';
  candidate_id: string;
  discovered_from_did: string;
  service_id: string;
  descriptor_endpoint: string;
  protocol: 'http:' | 'https:';
  executable: false;
  semantic_effect: 'none';
  laws: string[];
}

export interface RelattePeerDiscoveryReport {
  schema: 'relatte.peer-discovery/v0';
  did_uri: string;
  candidates: RelattePeerCandidate[];
  ignored: Array<{
    service_id: string | null;
    observation: unknown;
    reason: string;
  }>;
  semantic_effect: 'none';
  laws: string[];
}

export interface RelattePeerDescriptor {
  schema: 'relatte.peer-descriptor/v0';
  world_id: string;
  descriptor_endpoint: string;
  crossing_endpoint: string;
  capability_issuer_ref: string;
  capability_issuer_public_key: JsonWebKey;
  encryption_key_id: string;
  encryption_public_key: JsonWebKey;
  semantic_effect: 'none';
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function serviceId(didUri: string, value: unknown): string {
  const id = nonEmpty(value, 'INVALID_PEER_SERVICE_ID');
  if (id.startsWith('#')) return didUri + id;
  if (id.startsWith('did:')) return id;
  return `${didUri}#${id}`;
}

function endpointCandidate(args: {
  did_uri: string;
  service_id: string;
  endpoint: string;
}): RelattePeerCandidate {
  const url = new URL(args.endpoint);
  if (url.username !== '' || url.password !== '') {
    throw new Error('PEER_ENDPOINT_CREDENTIALS_FORBIDDEN');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('UNSUPPORTED_PEER_ENDPOINT_PROTOCOL');
  }
  const identity = {
    schema: 'relatte.peer-candidate/v0',
    discovered_from_did: args.did_uri,
    service_id: args.service_id,
    descriptor_endpoint: url.toString(),
    protocol: url.protocol,
    executable: false,
    semantic_effect: 'none',
    laws: [
      'DISCOVERY != TRUST',
      'DISCOVERED != AUTHORIZED',
      'PEER DESCRIPTOR != AUTHORITY',
      'ENDPOINT != WORLD',
    ],
  };
  return {
    ...identity,
    candidate_id: `relatte-peer-candidate-v0:${sha256Hex(
      canonicalizeDomainValue(PEER_CANDIDATE_ID_DOMAIN, identity)
    )}`,
  };
}

export function discoverRelatteRuntimePeersFromDidDocument(
  value: unknown,
): RelattePeerDiscoveryReport {
  const document = asRecord(value, 'INVALID_PEER_DID_DOCUMENT');
  const didUri = nonEmpty(document.id, 'INVALID_PEER_DID_URI');
  const services = Array.isArray(document.service) ? document.service : [];
  const candidates: RelattePeerCandidate[] = [];
  const ignored: RelattePeerDiscoveryReport['ignored'] = [];

  for (const rawService of services) {
    if (
      typeof rawService !== 'object' ||
      rawService === null ||
      Array.isArray(rawService)
    ) {
      continue;
    }
    const service = rawService as Record<string, any>;
    if (service.type !== RELATTE_RUNTIME_SERVICE_TYPE) continue;

    let id: string;
    try {
      id = serviceId(didUri, service.id);
    } catch {
      ignored.push({
        service_id: null,
        observation: service,
        reason: 'INVALID_SERVICE_ID',
      });
      continue;
    }

    const endpoints =
      typeof service.serviceEndpoint === 'string'
        ? [service.serviceEndpoint]
        : Array.isArray(service.serviceEndpoint)
          ? service.serviceEndpoint
          : null;

    if (!endpoints) {
      ignored.push({
        service_id: id,
        observation: service.serviceEndpoint,
        reason: 'UNSUPPORTED_ENDPOINT_SHAPE',
      });
      continue;
    }

    for (const endpoint of endpoints) {
      if (typeof endpoint !== 'string') {
        ignored.push({
          service_id: id,
          observation: endpoint,
          reason: 'UNSUPPORTED_ENDPOINT_SHAPE',
        });
        continue;
      }
      try {
        candidates.push(endpointCandidate({
          did_uri: didUri,
          service_id: id,
          endpoint,
        }));
      } catch (error) {
        ignored.push({
          service_id: id,
          observation: endpoint,
          reason:
            error instanceof Error
              ? error.message
              : 'INVALID_PEER_ENDPOINT',
        });
      }
    }
  }

  candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  return {
    schema: 'relatte.peer-discovery/v0',
    did_uri: didUri,
    candidates,
    ignored,
    semantic_effect: 'none',
    laws: [
      'DISCOVERY != TRUST',
      'DISCOVERED != AUTHORIZED',
      'PEER DESCRIPTOR != AUTHORITY',
      'ENDPOINT != WORLD',
      'NO PEER OBSERVED != NO PEER EXISTS',
    ],
  };
}

function normalizeP256PublicJwk(value: unknown, code: string): JsonWebKey {
  const jwk = asRecord(value, code);
  if (
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' ||
    typeof jwk.y !== 'string' ||
    Object.prototype.hasOwnProperty.call(jwk, 'd')
  ) {
    throw new Error(code);
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
  };
}

export async function fetchRelattePeerDescriptor(args: {
  candidate: RelattePeerCandidate;
  fetch_impl?: typeof fetch;
}): Promise<RelattePeerDescriptor> {
  const fetchImpl = args.fetch_impl ?? fetch;
  const response = await fetchImpl(args.candidate.descriptor_endpoint, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`PEER_DESCRIPTOR_HTTP_FAILED:${response.status}`);
  }
  const value = asRecord(
    await response.json(),
    'INVALID_PEER_DESCRIPTOR',
  );
  if (value.schema !== 'relatte.peer-descriptor/v0') {
    throw new Error('INVALID_PEER_DESCRIPTOR_SCHEMA');
  }
  const descriptorEndpoint = new URL(
    nonEmpty(value.descriptor_endpoint, 'INVALID_PEER_DESCRIPTOR_ENDPOINT'),
  ).toString();
  if (descriptorEndpoint !== args.candidate.descriptor_endpoint) {
    throw new Error('PEER_DESCRIPTOR_ENDPOINT_DRIFT');
  }
  const crossingEndpoint = new URL(
    nonEmpty(value.crossing_endpoint, 'INVALID_PEER_CROSSING_ENDPOINT'),
  );
  if (
    crossingEndpoint.protocol !== 'http:' &&
    crossingEndpoint.protocol !== 'https:'
  ) {
    throw new Error('UNSUPPORTED_PEER_CROSSING_PROTOCOL');
  }
  if (crossingEndpoint.username !== '' || crossingEndpoint.password !== '') {
    throw new Error('PEER_CROSSING_ENDPOINT_CREDENTIALS_FORBIDDEN');
  }

  return {
    schema: 'relatte.peer-descriptor/v0',
    world_id: nonEmpty(value.world_id, 'INVALID_PEER_WORLD_ID'),
    descriptor_endpoint: descriptorEndpoint,
    crossing_endpoint: crossingEndpoint.toString(),
    capability_issuer_ref: nonEmpty(
      value.capability_issuer_ref,
      'INVALID_PEER_CAPABILITY_ISSUER_REF',
    ),
    capability_issuer_public_key: normalizeP256PublicJwk(
      value.capability_issuer_public_key,
      'INVALID_PEER_CAPABILITY_ISSUER_KEY',
    ),
    encryption_key_id: nonEmpty(
      value.encryption_key_id,
      'INVALID_PEER_ENCRYPTION_KEY_ID',
    ),
    encryption_public_key: normalizeP256PublicJwk(
      value.encryption_public_key,
      'INVALID_PEER_ENCRYPTION_KEY',
    ),
    semantic_effect: 'none',
    laws: Array.isArray(value.laws) ? [...value.laws] : [],
  };
}
