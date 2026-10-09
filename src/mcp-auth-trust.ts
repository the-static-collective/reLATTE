/**
 * OAuth trust boundary for reLATTE MCP — separate from reLATTE receiver authority.
 * A JWT signature alone cannot tell the resource server whether that token was
 * revoked after issuance. Production MUST use a live issuer-owned status source.
 */
import { createHash } from 'node:crypto';
import { calculateJwkThumbprint, importJWK, jwtVerify } from 'jose';

export interface AccessTokenFacts {
  subject: string;
  issuer: string;
  audience: string;
  scopes: string[];
  expiresAt: number;
  tokenId: string;
  issuedAt: number;
}

export interface RevocationPolicy {
  /** Must query a trusted issuer status source. No in-memory allowlist is authoritative. */
  checkActive(token: string, facts: AccessTokenFacts): Promise<boolean>;
}

export interface DpopReplayStore {
  /** Atomic shared claim; false when proof ID is already used; TTL expiresAt is Unix seconds. */
  claim(id: string, expiresAt: number): Promise<boolean>;
}

export interface DpopPolicy {
  mode: 'required';
  replayStore: DpopReplayStore;
}

export interface AccessTrustPolicy {
  revocation?: RevocationPolicy;
  requireLiveStatus?: boolean;
  maxTokenLifetimeSeconds?: number;
  dpop?: DpopPolicy;
}

export function validateAccessTrustPolicy(policy: AccessTrustPolicy): void {
  if (policy.requireLiveStatus === true && !policy.revocation) {
    throw new Error('LIVE_REVOCATION_GATE_REQUIRED');
  }
  if (policy.maxTokenLifetimeSeconds !== undefined &&
      (!Number.isInteger(policy.maxTokenLifetimeSeconds) ||
       policy.maxTokenLifetimeSeconds < 60 ||
       policy.maxTokenLifetimeSeconds > 3600)) {
    throw new Error('UNSAFE_ACCESS_TOKEN_LIFETIME');
  }
  if (policy.dpop && (!policy.dpop.replayStore ||
      typeof policy.dpop.replayStore.claim !== 'function')) {
    throw new Error('DPOP_REPLAY_STORE_REQUIRED');
  }
}

/**
 * A revocation callback is invoked for EVERY resource request, after signature
 * validation but before any handler can read input. Errors fail closed.
 */
export async function checkAccessTrust(
  token: string,
  facts: AccessTokenFacts,
  policy: AccessTrustPolicy,
): Promise<boolean> {
  if (!Number.isSafeInteger(facts.issuedAt) || !Number.isSafeInteger(facts.expiresAt) ||
      !facts.tokenId || facts.expiresAt <= facts.issuedAt ||
      facts.expiresAt - facts.issuedAt > (policy.maxTokenLifetimeSeconds ?? 900)) {
    return false;
  }
  if (policy.requireLiveStatus && !policy.revocation) return false;
  if (policy.revocation) {
    try { return await policy.revocation.checkActive(token, facts) === true; }
    catch { return false; }
  }
  return true;
}

/**
 * Optional sender-constrained DPoP for clients that can actually supply it.
 * Bearer-only clients cannot claim replay resistance: do not enable required
 * mode before verified client support and an atomic shared replay store exist.
 */
export async function checkDpopProof(
  proof: string | null,
  token: string,
  confirmation: unknown,
  request: Request,
  replayStore: DpopReplayStore,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!proof || proof.length > 8192 || !/^[-_A-Za-z0-9.]+$/.test(proof)) return false;
  try {
    const headerPart = proof.split('.')[0];
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    if (!header || typeof header !== 'object' || Array.isArray(header) ||
        header.typ !== 'dpop+jwt' || header.alg !== 'ES256' ||
        typeof header.jwk !== 'object' || header.jwk === null ||
        header.jwk.kty !== 'EC' || header.jwk.crv !== 'P-256' ||
        !header.jwk.x || !header.jwk.y || header.jwk.d !== undefined ||
        header.jwk.kid !== undefined) return false;

    const expectedThumbprint = typeof confirmation === 'object' && confirmation !== null &&
      !Array.isArray(confirmation)
      ? (confirmation as Record<string, unknown>).jkt : null;
    if (typeof expectedThumbprint !== 'string' || !expectedThumbprint) return false;
    if (await calculateJwkThumbprint(header.jwk) !== expectedThumbprint) return false;

    const key = await importJWK(header.jwk, 'ES256');
    const { payload } = await jwtVerify(proof, key, {
      typ: 'dpop+jwt',
      algorithms: ['ES256'],
      clockTolerance: '0s',
    });
    const htm = request.method.toUpperCase();
    const url = new URL(request.url);
    // DPoP htu excludes query and fragment per RFC9449.
    const htu = url.origin + url.pathname;
    const ath = createHash('sha256').update(token).digest('base64url');
    if (payload.htm !== htm || payload.htu !== htu ||
        payload.ath !== ath || typeof payload.jti !== 'string' ||
        payload.jti.length < 16 || payload.jti.length > 256 ||
        !Number.isSafeInteger(payload.iat) ||
        Math.abs((payload.iat as number) - now) > 60 ||
        payload.exp !== undefined || payload.nbf !== undefined) return false;

    const fingerprint = createHash('sha256').update(expectedThumbprint + ':' + payload.jti)
      .digest('hex');
    // A durable, atomic store is required across ALL replicas and restarts.
    return await replayStore.claim(fingerprint, now + 120) === true;
  } catch { return false; }
}

export interface IntrospectionConfig {
  endpoint: string;
  issuer: string;
  resource: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}
type Fetcher = typeof fetch;

/** OAuth RFC7662 introspection: only the operator-configured issuer receives the JWT. */
export function createIssuerIntrospection(
  config: IntrospectionConfig,
  fetcher: Fetcher = fetch,
): RevocationPolicy {
  const endpoint = new URL(config.endpoint);
  const issuer = new URL(config.issuer);
  if (endpoint.protocol !== 'https:' || endpoint.origin !== issuer.origin ||
      endpoint.username || endpoint.password || endpoint.hash || endpoint.search ||
      !config.clientId || !config.clientSecret ||
      /[\r\n]/.test(config.clientId + config.clientSecret)) {
    throw new Error('UNSAFE_INTROSPECTION_CONFIG');
  }
  const auth = 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64');
  return {
    async checkActive(token, facts) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            authorization: auth,
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
            'cache-control': 'no-store',
          },
          body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
        });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return false;
        const text = await response.text();
        if (text.length > 8192) return false;
        const body: unknown = JSON.parse(text);
        if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
        const claim = body as Record<string, unknown>;
        const audiences = typeof claim.aud === 'string' ? [claim.aud] :
          Array.isArray(claim.aud) ? claim.aud : [];
        const scopes = typeof claim.scope === 'string' ? claim.scope.split(' ') : [];
        return claim.active === true && claim.iss === facts.issuer &&
          audiences.includes(facts.audience) &&
          claim.sub === facts.subject &&
          claim.exp === facts.expiresAt &&
          claim.iat === facts.issuedAt &&
          claim.jti === facts.tokenId &&
          scopes.includes(config.scope);
      } catch { return false; }
      finally { clearTimeout(deadline); }
    },
  };
}
