/**
 * MCP-003: authenticated, stateless resource-server boundary.
 *
 * Deployment-agnostic Fetch handler. TLS, DNS and rate limiting are the
 * responsibility of an explicitly configured trusted HTTPS ingress; no
 * public listener is constructed here. The OAuth authorization server is
 * external and is NEVER implemented by ChatGPT or by reLATTE.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { callReadOnlyMcpTool } from './mcp-readonly.ts';

const MAX_BYTES = 256 * 1024;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const evidence = z.record(z.string(), z.unknown());

export interface McpOAuthConfig {
  resource: string;             // EXACT, public HTTPS MCP resource URI including /mcp
  issuer: string;               // OAuth authorization-server issuer (external)
  jwksUri: string;              // HTTPS JWKS owned by the authorization server
  scope: string;                // least-privileged read-only scope
}
export interface McpPrincipal {
  subject: string;
  issuer: string;
  scopes: string[];
  expiresAt: number;
}
type VerifyKey = Parameters<typeof jwtVerify>[1];

export function validateMcpOAuthConfig(config: McpOAuthConfig): McpOAuthConfig {
  const resource = new URL(config.resource);
  const issuer = new URL(config.issuer);
  const jwks = new URL(config.jwksUri);
  if (resource.protocol !== 'https:' || resource.pathname !== '/mcp' ||
      resource.search || resource.hash || resource.username || resource.password ||
      issuer.protocol !== 'https:' || issuer.search || issuer.hash ||
      issuer.username || issuer.password ||
      jwks.protocol !== 'https:' || jwks.search || jwks.hash ||
      jwks.username || jwks.password ||
      jwks.origin !== issuer.origin ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(config.scope)) {
    throw new Error('INVALID_OAUTH_RESOURCE_CONFIG');
  }
  return { resource: resource.href, issuer: config.issuer, jwksUri: jwks.href, scope: config.scope };
}

function toolResult(value: Record<string, unknown>) {
  const structured = value.structuredContent as Record<string, unknown> | undefined;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured ?? { code: 'TOOL_ERROR' }) }],
    structuredContent: structured ?? { code: 'TOOL_ERROR' },
    isError: value.isError === true,
  };
}

function makeServer(scope: string): McpServer {
  // Fresh server per request; never reuse across principals.
  const server = new McpServer(
    { name: 'relatte-sovereign-crossings', version: '0.0.3' },
    { instructions: 'Read-only verifier of user-supplied signed reLATTE evidence. SIGNED != TRUE. RECEIVED != ADMITTED. No signatures, transfers, local effects or user data stores.' },
  );
  server.registerTool('verify_crossing', {
    title: 'Verify crossing signature',
    description: 'Verify a supplied reLATTE crossing using its embedded P-256 public key and canonical ID. Does not establish owner identity or authority.',
    inputSchema: { crossing: evidence },
    annotations: readOnly,
  }, async ({ crossing }) => toolResult(await callReadOnlyMcpTool('verify_crossing', { crossing })));

  server.registerTool('verify_receipt', {
    title: 'Verify receipt signature',
    description: 'Verify a supplied signed reLATTE receipt; do not infer actual delivery, sender identity or lawful authority.',
    inputSchema: { receipt: evidence },
    annotations: readOnly,
  }, async ({ receipt }) => toolResult(await callReadOnlyMcpTool('verify_receipt', { receipt })));

  server.registerTool('inspect_crossing_evidence', {
    title: 'Inspect supplied crossing evidence',
    description: 'Verify one crossing and 1–16 signed receipts for internal consistency; reports a disposition CLAIM only, not a confirmed receiver journal.',
    inputSchema: {
      crossing: evidence,
      receipts: z.array(evidence).min(1).max(16),
    },
    annotations: readOnly,
  }, async ({ crossing, receipts }) => toolResult(
    await callReadOnlyMcpTool('inspect_crossing_evidence', { crossing, receipts }),
  ));
  return server;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  } });
}

async function boundedBody(request: Request): Promise<Request | null> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return new Request(request.url, {
    method: request.method, headers: request.headers, body: result, signal: request.signal,
  });
}

export function createOAuthMcpResource(configValue: McpOAuthConfig, verificationKey?: VerifyKey) {
  const config = validateMcpOAuthConfig(configValue);
  const resource = new URL(config.resource);
  const metadataUrl = new URL('/.well-known/oauth-protected-resource', config.resource);
  // jose fetches keys ONLY from the operator-configured issuer-owned HTTPS URI.
  const key = verificationKey ?? createRemoteJWKSet(new URL(config.jwksUri));
  const mcp = createMcpHandler(() => makeServer(config.scope), { responseMode: 'json' });

  // The upstream SDK currently does not declare ChatGPT's extension field
  // securitySchemes in its registerTool() API. Add the extension only to the
  // authenticated tools/list wire result, without claiming SDK-native support.
  async function withAuthSchemes(request: Request, response: Response): Promise<Response> {
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
    let callMethod: string | undefined;
    try { callMethod = (await request.clone().json() as { method?: string }).method; }
    catch { return response; }
    if (callMethod !== 'tools/list') return response;
    const payload: any = await response.json();
    if (Array.isArray(payload?.result?.tools)) {
      payload.result.tools = payload.result.tools.map((tool: Record<string, unknown>) => ({
        ...tool, securitySchemes: [{ type: 'oauth2', scopes: [config.scope] }],
      }));
    }
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  }


  const challenge = (error = 'invalid_token', description = 'OAuth access token required') =>
    'Bearer resource_metadata="' + metadataUrl.href +
    '", scope="' + config.scope + '", error="' + error +
    '", error_description="' + description + '"';

  const authenticate = async (request: Request): Promise<McpPrincipal | { error: string }> => {
    const authorization = request.headers.get('authorization');
    if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) {
      return { error: 'invalid_token' };
    }
    try {
      const token = authorization.slice(7);
      const verified = await jwtVerify(token, key, {
        issuer: config.issuer,
        audience: config.resource,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: '5s',
      });
      const claims = verified.payload;
      if (typeof claims.sub !== 'string' || claims.sub.length === 0 ||
          typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp)) {
        return { error: 'invalid_token' };
      }
      const scopes = typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [];
      if (!scopes.includes(config.scope)) return { error: 'insufficient_scope' };
      return { subject: claims.sub, issuer: config.issuer, scopes, expiresAt: claims.exp };
    } catch {
      // Never echo token contents or verification exception to clients/logs.
      return { error: 'invalid_token' };
    }
  };

  return {
    metadataUrl: metadataUrl.href,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.origin !== resource.origin || request.headers.get('origin') ||
          (request.headers.get('host') && request.headers.get('host') !== resource.host)) {
        return json({ error: 'UNTRUSTED_HOST_OR_ORIGIN' }, 403);
      }
      if (url.search || url.hash) return json({ error: 'NO_QUERY_PARAMETERS' }, 400);
      if (url.pathname === metadataUrl.pathname && request.method === 'GET') {
        return json({
          resource: config.resource,
          authorization_servers: [config.issuer],
          scopes_supported: [config.scope],
          bearer_methods_supported: ['header'],
        });
      }
      if (url.pathname !== resource.pathname) return json({ error: 'NOT_FOUND' }, 404);
      if (request.method !== 'POST' && request.method !== 'GET') {
        return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET, POST' });
      }
      const principal = await authenticate(request);
      if ('error' in principal) {
        const insufficient = principal.error === 'insufficient_scope';
        const description = insufficient ? 'Required read-only permission is missing' : 'Missing or invalid bearer token';
        return json({ error: principal.error }, insufficient ? 403 : 401, {
          'www-authenticate': challenge(principal.error, description),
        });
      }
      if (request.method === 'POST') {
        const length = request.headers.get('content-length');
        if (length && Number(length) > MAX_BYTES) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
        let bounded: Request | null;
        try {
          bounded = await boundedBody(request);
        } catch {
          return json({ error: 'INVALID_BODY' }, 400);
        }
        if (!bounded) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
        const wireCopy = bounded.clone();
        const answer = await mcp.fetch(bounded);
        return withAuthSchemes(wireCopy, answer);
      }
      return mcp.fetch(request);
    },
    close: () => mcp.close(),
  };
}
