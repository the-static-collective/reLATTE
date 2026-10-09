/**
 * RELATTE-MCP-TRUST-GAUNTLET-006
 *
 * Two independently listening loopback HTTP services exercise the actual
 * MCP client wire protocol and issuer-status wire request. HTTPS issuer and
 * resource identifiers are synthetic; a test-only fetch bridge maps them to
 * loopback ports. This is NOT a test of real TLS, external hosting or DNS.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  createRemoteJWKSet, customFetch, exportJWK, generateKeyPair, SignJWT,
} from 'jose';

import { createIssuerIntrospection } from '../src/mcp-auth-trust.ts';
import { createOAuthMcpResource } from '../src/mcp-oauth-resource.ts';
import { generateP256KeyPair, sealCrossingEnvelope } from '../src/protocol.ts';

const config = {
  resource: 'https://mcp-gauntlet.example/mcp',
  issuer: 'https://identity-gauntlet.example/',
  jwksUri: 'https://identity-gauntlet.example/.well-known/jwks.json',
  scope: 'relatte:verify',
};
const credentials = { clientId: 'fixture-resource', clientSecret: 'synthetic-only-not-a-real-secret' };

type Key = Awaited<ReturnType<typeof generateKeyPair>>;
const keys = new Map<string, Key>();
const live = new Map<string, boolean>();
let advertised = '';
let requestsToIssuer = 0;
let issuedStatusChecks = 0;
let issuerOffline = false;

async function makeKey(kid: string) {
  const pair = await generateKeyPair('RS256');
  keys.set(kid, pair);
  return pair;
}
const original = await makeKey('old-kid');

async function jwks() {
  const pair = keys.get(advertised);
  if (!pair) throw new Error('TEST_KEY_MISSING');
  return { keys: [{ ...await exportJWK(pair.publicKey), kid: advertised, alg: 'RS256', use: 'sig' }] };
}

async function mint(kid: string, subject = 'human:gauntlet', audience = config.resource) {
  const pair = keys.get(kid);
  if (!pair) throw new Error('UNKNOWN_TEST_ISSUER_KEY');
  const jwt = await new SignJWT({ scope: config.scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid })
    .setIssuer(config.issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setJti('gauntlet-token-' + kid)
    .setSubject(subject)
    .setExpirationTime('2m')
    .sign(pair.privateKey);
  live.set(jwt, true);
  return jwt;
}

async function onWireBody(request: import('node:http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > 262144) throw Error('TEST_BODY_TOO_LARGE');
    chunks.push(data);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function listen(server: ReturnType<typeof createServer>) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('TEST_BAD_SOCKET');
  return 'http://127.0.0.1:' + address.port;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()));
}

async function signedCrossing() {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0', protocol_version: '0',
    source_particular: 'particular:gauntlet', source_world: 'world:gauntlet',
    source_history_head: null, parents: [], declared_kind: 'TRUST_GAUNTLET_006',
    payload_refs: [], requested_effect: null, capability_ref: null,
    privacy_policy: null, audience_policy: null, return_address: null,
    created_at: '2026-10-09T20:00:00.000Z', extensions: {},
  }, await generateP256KeyPair());
}

test('cross-socket issuer-resource-client trust gauntlet: authenticate → revoke → rotate → refuse effects', {
  timeout: 30000,
}, async () => {
  advertised = 'old-kid';
  live.clear();
  requestsToIssuer = 0;
  issuedStatusChecks = 0;
  issuerOffline = false;

  const issuer = createServer(async (request, response) => {
    try {
      requestsToIssuer++;
      if (issuerOffline) { response.writeHead(503); response.end(); return; }
      if (request.url === '/.well-known/jwks.json' && request.method === 'GET') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(await jwks()));
        return;
      }
      if (request.url === '/introspect' && request.method === 'POST') {
        issuedStatusChecks++;
        const basic = 'Basic ' + Buffer.from(credentials.clientId + ':' +
          credentials.clientSecret).toString('base64');
        if (request.headers.authorization !== basic) {
          response.writeHead(401); response.end(); return;
        }
        const params = new URLSearchParams(await onWireBody(request));
        const token = params.get('token') ?? '';
        if (!live.get(token)) {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ active: false }));
          return;
        }
        // The local fixture decodes claims only because THIS TEST signed
        // the tokens. Production trusts the issuer's authenticated response.
        const body = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          active: true, iss: body.iss, sub: body.sub, aud: body.aud,
          iat: body.iat, exp: body.exp, jti: body.jti, scope: body.scope,
        }));
        return;
      }
      response.writeHead(404); response.end();
    } catch {
      response.writeHead(500); response.end();
    }
  });
  const issuerAddress = await listen(issuer);
  const issuerFetch: typeof fetch = (input, init) => {
    const canonical = String(input);
    assert.equal(new URL(canonical).origin, new URL(config.issuer).origin);
    return fetch(issuerAddress + new URL(canonical).pathname, { ...init, redirect: 'error' });
  };
  const keyResolver = createRemoteJWKSet(new URL(config.jwksUri), {
    cooldownDuration: 0, cacheMaxAge: 0, timeoutDuration: 1000,
    [customFetch]: issuerFetch,
  });
  const introspection = createIssuerIntrospection({
    endpoint: config.issuer + 'introspect',
    issuer: config.issuer, resource: config.resource, scope: config.scope, ...credentials,
  }, issuerFetch);
  const resource = createOAuthMcpResource(config, keyResolver, {
    requireLiveStatus: true, maxTokenLifetimeSeconds: 900, revocation: introspection,
  });

  const resourceListener = createServer(async (incoming, outgoing) => {
    try {
      // This test-only bridge emulates trusted HTTPS ingress's canonical
      // origin mapping. NEVER copy it as a production reverse proxy.
      const path = incoming.url || '/mcp';
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (key !== 'host' && typeof value === 'string') headers.set(key, value);
      }
      const body = incoming.method === 'POST' ? await onWireBody(incoming) : undefined;
      const request = new Request(new URL(path, config.resource), {
        method: incoming.method, headers, body,
      });
      const reply = await resource.fetch(request);
      outgoing.writeHead(reply.status, Object.fromEntries(reply.headers));
      outgoing.end(Buffer.from(await reply.arrayBuffer()));
    } catch {
      outgoing.writeHead(500); outgoing.end();
    }
  });
  let resourceAddress = '';
  const clients: Client[] = [];
  try {
    resourceAddress = await listen(resourceListener);
    const wireFetch: typeof fetch = (url, init) =>
      fetch(resourceAddress + new URL(String(url)).pathname, init);
    const connect = async (token: string) => {
      const client = new Client({ name: 'relatte-trust-gauntlet', version: '1.0' }, {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
      });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), {
        requestInit: { headers: { Authorization: 'Bearer ' + token } },
        fetch: wireFetch,
      }));
      return client;
    };

    // Two sockets: authenticated ChatGPT-style MCP client -> resource ->
    // issuer; checks happen across independent HTTP service boundaries.
    const firstToken = await mint('old-kid');
    const first = await connect(firstToken);
    assert.deepEqual((await first.listTools()).tools.map(x => x.name),
      ['verify_crossing', 'verify_receipt', 'inspect_crossing_evidence']);

    const crossing = await signedCrossing();
    const valid = await first.callTool({
      name: 'verify_crossing', arguments: { crossing },
    });
    assert.equal((valid.structuredContent as any)?.verified, true);
    assert.equal((valid.structuredContent as any)?.crossing_id, crossing.crossing_id);

    // Revocation is visible at the NEXT MCP request, not a cached success.
    const priorChecks = issuedStatusChecks;
    live.set(firstToken, false);
    await assert.rejects(() => first.listTools());
    assert.ok(issuedStatusChecks > priorChecks);

    // Fresh key appears; resource fetches issuer-hosted JWKS over its own
    // issuer transport. Old signing key is removed from the published set.
    const next = await makeKey('new-kid');
    assert.ok(next.privateKey);
    advertised = 'new-kid';
    const secondToken = await mint('new-kid');
    const second = await connect(secondToken);
    assert.equal((await second.listTools()).tools.length, 3);

    // A stolen token minted for another MCP resource is never admitted.
    const wrongAudience = await mint('new-kid', 'human:gauntlet',
      'https://another-resource.example/mcp');
    await assert.rejects(() => connect(wrongAudience));
    // Even active tokens fail closed when the issuer status service fails.
    issuerOffline = true;
    await assert.rejects(() => second.listTools());
    issuerOffline = false;

    // The identity 'claimed-world-owner' cannot add a disposition tool.
    const ownerNameToken = await mint('new-kid', 'human:claimed-world-owner');
    const assertedOwner = await connect(ownerNameToken);
    const response = await wireFetch(config.resource, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + ownerNameToken,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call',
        'mcp-name': 'admit_crossing',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 42, method: 'tools/call',
        params: { name: 'admit_crossing', arguments: { crossing_id: crossing.crossing_id },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as any).error.code, -32602);
    assert.equal((await assertedOwner.listTools()).tools.length, 3);
    assert.ok(requestsToIssuer >= 5, 'must use issuer over network, not local trust shortcuts');
  } finally {
    for (const client of clients) await client.close().catch(() => {});
    await resource.close();
    if (resourceAddress) await closeServer(resourceListener);
    await closeServer(issuer);
  }
});
