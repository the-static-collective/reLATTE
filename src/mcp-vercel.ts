/**
 * Vercel adapter for the MCP-003 resource server.
 *
 * Not deployed by this file. Vercel's TLS edge must terminate HTTPS and
 * must bind the exact configured RELATTE_MCP_RESOURCE hostname.
 * No secrets or defaults are embedded.
 */
import { createOAuthMcpResource } from './mcp-oauth-resource.ts';
import { createIssuerIntrospection } from './mcp-auth-trust.ts';

type RuntimeEnv = NodeJS.ProcessEnv;
type Endpoint = 'mcp' | 'metadata';

const instances = new Map<string, ReturnType<typeof createOAuthMcpResource>>();

function configuration(env: RuntimeEnv) {
  const resource = env.RELATTE_MCP_RESOURCE;
  const issuer = env.RELATTE_OAUTH_ISSUER;
  const jwksUri = env.RELATTE_OAUTH_JWKS_URI;
  const scope = env.RELATTE_OAUTH_SCOPE;
  const introspectionUri = env.RELATTE_OAUTH_INTROSPECTION_URI;
  const introspectionClientId = env.RELATTE_OAUTH_INTROSPECTION_CLIENT_ID;
  const introspectionClientSecret = env.RELATTE_OAUTH_INTROSPECTION_CLIENT_SECRET;
  if (!resource || !issuer || !jwksUri || !scope ||
      !introspectionUri || !introspectionClientId || !introspectionClientSecret) {
    throw new Error('OAUTH_STATUS_GATE_UNCONFIGURED');
  }
  return { resource, issuer, jwksUri, scope,
    introspectionUri, introspectionClientId, introspectionClientSecret };
}

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export async function handleMcpVercelRequest(
  request: Request, endpoint: Endpoint, env: RuntimeEnv = process.env,
): Promise<Response> {
  let config: ReturnType<typeof configuration>;
  let server: ReturnType<typeof createOAuthMcpResource>;
  try {
    config = configuration(env);
    // Reusing one verifier/JWKS cache per isolate is fine: each MCP request
    // still receives an independent SDK server instance.
    const cacheKey = JSON.stringify(config);
    server = instances.get(cacheKey) ?? createOAuthMcpResource(config, undefined, {
      requireLiveStatus: true,
      maxTokenLifetimeSeconds: 900,
      revocation: createIssuerIntrospection({
        endpoint: config.introspectionUri, issuer: config.issuer, resource: config.resource,
        scope: config.scope,
        clientId: config.introspectionClientId, clientSecret: config.introspectionClientSecret,
      }),
    });
    instances.set(cacheKey, server);
  } catch {
    // Fail shut; never fall back to local noauth verifier or mock credentials.
    return errorResponse(503, 'OAUTH_RESOURCE_UNCONFIGURED');
  }

  const configured = new URL(config.resource);
  const received = new URL(request.url);
  if (received.protocol !== 'https:' || received.origin !== configured.origin ||
      request.headers.get('origin') || (request.headers.get('host') &&
       request.headers.get('host') !== configured.host)) {
    return errorResponse(403, 'UNTRUSTED_REQUEST_ORIGIN');
  }
  const expectedPath = endpoint === 'mcp' ? '/mcp' : '/.well-known/oauth-protected-resource';
  const internalPath = endpoint === 'mcp' ? '/api/mcp' : '/api/protected-resource';
  if (![expectedPath, internalPath].includes(received.pathname) ||
      received.search || received.hash) {
    return errorResponse(404, 'NO_ROUTE');
  }
  if (endpoint === 'metadata' && request.method !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED');
  }
  const target = new URL(expectedPath, config.resource);
  return server.fetch(new Request(target, request));
}
