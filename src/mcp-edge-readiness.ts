/**
 * MCP-007: a read-only release gate over public metadata.
 *
 * This is a static contract check. It does NOT authenticate a human, validate
 * TLS chains, introspect a token, prove domain ownership or authorize deploy.
 */
export interface EdgeIdentityContract {
  resource: string;
  issuer: string;
  jwksUri: string;
  introspectionUri: string;
  scope: string;
}

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : null;
const strings = (v: unknown): string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? v : [];
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function strictHttpsUrl(value: unknown, baseOrigin?: string): string | null {
  if (!nonempty(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search ||
        u.hostname === 'localhost' || u.hostname.endsWith('.localhost') ||
        u.hostname.endsWith('.example') || u.hostname.endsWith('.invalid') ||
        /^127\./.test(u.hostname) || u.hostname === '0.0.0.0' ||
        u.hostname === '::1' || (baseOrigin && u.origin !== baseOrigin)) return null;
    return u.href;
  } catch { return null; }
}

export interface EdgeReadinessResult {
  readyForLiveOAuthTest: boolean;
  gates: { gate: string; passed: boolean; reason: string }[];
  holds: string[];
  clientRegistration: 'cimd' | 'dcr' | 'unavailable';
}

/** Only public issuer/resource metadata may be supplied. Never provide tokens. */
export function evaluateEdgeReadiness(
  config: EdgeIdentityContract,
  resourceDocument: unknown,
  authorizationDocument: unknown,
): EdgeReadinessResult {
  const gates: EdgeReadinessResult['gates'] = [];
  const gate = (name: string, ok: boolean, reason: string) =>
    gates.push({ gate: name, passed: ok, reason });
  const resource = strictHttpsUrl(config.resource);
  const issuer = strictHttpsUrl(config.issuer);
  const issuerOrigin = issuer ? new URL(issuer).origin : undefined;
  const jwks = strictHttpsUrl(config.jwksUri, issuerOrigin);
  const introspection = strictHttpsUrl(config.introspectionUri, issuerOrigin);
  const r = record(resourceDocument), a = record(authorizationDocument);

  gate('canonical HTTPS resource', Boolean(resource && new URL(resource).pathname === '/mcp'),
    'Stable owned URL must end exactly in /mcp; no example or loopback domains');
  gate('issuer HTTPS identity', Boolean(issuer), 'Issuer must be a real HTTPS URL');
  gate('JWKS pinned to issuer origin', Boolean(jwks), 'Signing keys must be published by the configured issuer origin');
  gate('introspection pinned to issuer origin', Boolean(introspection),
    'Revocation endpoint must be HTTPS on the configured issuer origin');
  gate('least-privileged scope', /^[A-Za-z0-9._:-]{1,128}$/.test(config.scope),
    'Choose a bounded read-only scope');

  gate('RFC9728 protected resource', Boolean(r && resource && r.resource === resource &&
      strings(r.authorization_servers).includes(config.issuer) &&
      strings(r.scopes_supported).includes(config.scope)),
    'Metadata must identify the exact resource, issuer and read-only scope');

  gate('authorization issuer exact match', Boolean(a && a.issuer === config.issuer),
    'Authorization metadata issuer MUST match exactly, including trailing slash');

  const endpoints = a && issuerOrigin
    ? ['authorization_endpoint', 'token_endpoint'].every(k =>
      Boolean(strictHttpsUrl(a[k], issuerOrigin))) : false;
  gate('bound authorization endpoints', Boolean(endpoints),
    'Authorization and token endpoints must use reviewed same-origin HTTPS URLs');

  gate('OAuth authorization code and PKCE S256', Boolean(a &&
    strings(a.response_types_supported).includes('code') &&
    strings(a.code_challenge_methods_supported).includes('S256')),
    'ChatGPT requires authorization-code OAuth 2.1 with S256 PKCE');

  gate('OAuth scope discovery', Boolean(a && strings(a.scopes_supported).includes(config.scope)),
    'Authorization server must advertise the same read-only scope');

  const claimedJwks = a && strictHttpsUrl(a.jwks_uri, issuerOrigin);
  gate('authorization JWKS matches configured signer', Boolean(jwks && claimedJwks === jwks),
    'JWKS discovery must match the pinned signer URL');

  // Public metadata can offer more than one revocation strategy. Our current
  // adapter requires strict issuer-owned RFC7662 and specific JWT claim echo.
  gate('issuer live introspection advertised', Boolean(a && introspection &&
    strictHttpsUrl(a.introspection_endpoint, issuerOrigin) === introspection),
    'Introspection must be published at the configured issuer URL');

  const methods = a ? strings(a.token_endpoint_auth_methods_supported) : [];
  const cimd = Boolean(a && a.client_id_metadata_document_supported === true &&
    methods.some(m => m === 'none' || m === 'private_key_jwt'));
  const dcr = Boolean(a && issuerOrigin && strictHttpsUrl(a.registration_endpoint, issuerOrigin) &&
    methods.some(m => ['none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt'].includes(m)));
  gate('ChatGPT client registration', cimd || dcr,
    'Require CIMD with none/private_key_jwt or a reviewable DCR registration endpoint');

  const clientRegistration: EdgeReadinessResult['clientRegistration'] =
    cimd ? 'cimd' : dcr ? 'dcr' : 'unavailable';
  // Do not label metadata-only green as ready to deploy.
  return {
    readyForLiveOAuthTest: gates.every(g => g.passed),
    gates,
    holds: gates.filter(g => !g.passed).map(g => g.gate),
    clientRegistration,
  };
}
