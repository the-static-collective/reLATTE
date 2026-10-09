import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createOAuthMcpResource, validateMcpOAuthConfig } from '../src/mcp-oauth-resource.ts';
import { generateP256KeyPair, sealCrossingEnvelope } from '../src/protocol.ts';

const config = {
  resource: 'https://mcp.static-collective.example/mcp',
  issuer: 'https://identity.static-collective.example/',
  jwksUri: 'https://identity.static-collective.example/.well-known/jwks.json',
  scope: 'relatte:verify',
};
const fixture = await generateKeyPair('RS256');
const jwk = await exportJWK(fixture.publicKey);
const localKeys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'jwt-fixture', alg: 'RS256', use: 'sig' }] });

async function mint(options: {
  aud?: string, issuer?: string, scope?: string, subject?: string, expiry?: string,
} = {}): Promise<string> {
  return new SignJWT({ scope: options.scope ?? config.scope })
    .setProtectedHeader({ alg: 'RS256', kid: 'jwt-fixture', typ: 'at+jwt' })
    .setIssuer(options.issuer ?? config.issuer)
    .setAudience(options.aud ?? config.resource)
    .setSubject(options.subject ?? 'fixture-subject-001')
    .setIssuedAt()
    .setExpirationTime(options.expiry ?? '2m')
    .sign(fixture.privateKey);
}

function post(token?: string, method: string = 'server/discover') {
  return new Request(config.resource, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'fixture', method,
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {} } } }),
  });
}

async function signedCrossing() {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0', protocol_version: '0',
    source_particular: 'particular:fixture', source_world: 'world:fixture',
    source_history_head: null, parents: [], declared_kind: 'MCP_OFFICIAL_SDK',
    payload_refs: [], requested_effect: null, capability_ref: null,
    privacy_policy: null, audience_policy: null, return_address: null,
    created_at: '2026-10-09T18:00:00.000Z', extensions: {},
  }, await generateP256KeyPair());
}

test('OAuth config refuses insecure issuer/JWKS/resource, or colliding JWKS authority', () => {
  assert.throws(() => validateMcpOAuthConfig({ ...config, resource: 'http://example.com/mcp' }));
  assert.throws(() => validateMcpOAuthConfig({ ...config, issuer: 'http://identity.example/' }));
  assert.throws(() => validateMcpOAuthConfig({ ...config, jwksUri: 'http://identity.example/jwks' }));
  assert.throws(() => validateMcpOAuthConfig({ ...config, jwksUri: 'https://other.example/jwks' }));
  assert.throws(() => validateMcpOAuthConfig({ ...config, scope: 'bad scope' }));
});

test('protected resource metadata is public but content stays protected', async () => {
  const resource = createOAuthMcpResource(config, localKeys);
  try {
    const metadata = await resource.fetch(new Request(
      'https://mcp.static-collective.example/.well-known/oauth-protected-resource'));
    assert.equal(metadata.status, 200);
    const data: any = await metadata.json();
    assert.equal(data.resource, config.resource);
    assert.deepEqual(data.authorization_servers, [config.issuer]);
    assert.deepEqual(data.scopes_supported, [config.scope]);

    const denied = await resource.fetch(post());
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get('www-authenticate') ?? '', /oauth-protected-resource/);
    assert.equal((await denied.json() as any).error, 'invalid_token');
    const badHost = await resource.fetch(new Request('https://evil.example/mcp',
      { method: 'POST', headers: { authorization: 'Bearer '+await mint() }}));
    assert.equal(badHost.status, 403);
    const wrongOrigin = await resource.fetch(new Request(config.resource,
      { method: 'POST', headers: { origin: 'https://evil.example' }}));
    assert.equal(wrongOrigin.status, 403);
  } finally { await resource.close(); }
});

test('token issuer, audience, expiry and scope each fail independently', async () => {
  const resource = createOAuthMcpResource(config, localKeys);
  try {
    for (const token of [
      await mint({ aud: 'https://another.example/mcp' }),
      await mint({ issuer: 'https://another.example/' }),
      await mint({ expiry: '-10m' }),
    ]) {
      assert.equal((await resource.fetch(post(token))).status, 401);
    }
    const noScope = await resource.fetch(post(await mint({ scope: 'other:read' })));
    assert.equal(noScope.status, 403);
    assert.match(noScope.headers.get('www-authenticate') ?? '', /insufficient_scope/);
  } finally { await resource.close(); }
});

test('official MCP v2 client negotiates with authenticated SDK server and verifies native crossing', async () => {
  const resource = createOAuthMcpResource(config, localKeys);
  const token = await mint();
  const client = new Client({ name: 'relatte-sdk-client-test', version: '1.0.0' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  });
  const transport = new StreamableHTTPClientTransport(new URL(config.resource), {
    requestInit: { headers: { Authorization: 'Bearer ' + token } },
    fetch: (url, init) => resource.fetch(new Request(url, init)),
  });
  try {
    await client.connect(transport);
    assert.equal(client.getProtocolEra(), 'modern');
    const list = await client.listTools();
    assert.deepEqual(list.tools.map(t => t.name), [
      'verify_crossing', 'verify_receipt', 'inspect_crossing_evidence',
    ]);
    assert.equal(list.tools.every(t => t.annotations?.readOnlyHint), true);
    const crossing = await signedCrossing();
    const valid = await client.callTool({ name: 'verify_crossing', arguments: { crossing } });
    assert.equal((valid.structuredContent as any)?.verified, true);
    assert.equal((valid.structuredContent as any)?.crossing_id, crossing.crossing_id);

    const altered = await client.callTool({ name: 'verify_crossing',
      arguments: { crossing: { ...crossing, source_world: 'world:tampered' } } });
    assert.equal((altered.structuredContent as any)?.verified, false);
  } finally {
    await client.close();
    await resource.close();
  }
});

test('raw MCP tool discovery advertises OpenAI OAuth requirements on every tool', async () => {
  const resource = createOAuthMcpResource(config, localKeys);
  const token = await mint();
  try {
    const response = await resource.fetch(new Request(config.resource, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'schemas', method: 'tools/list',
        params: { _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'raw-schema-test', version: '1.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        } },
      }),
    }));
    assert.equal(response.status, 200);
    const result: any = await response.json();
    assert.equal(result.result.tools.length, 3);
    assert.equal(result.result.tools.every((tool: any) =>
      Array.isArray(tool.securitySchemes) &&
      tool.securitySchemes.some((scheme: any) =>
        scheme.type === 'oauth2' && scheme.scopes.includes(config.scope))), true);
  } finally { await resource.close(); }
});
