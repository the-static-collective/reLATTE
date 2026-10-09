import assert from 'node:assert/strict';
import test from 'node:test';
import { createOAuthMcpResource } from '../src/mcp-oauth-resource.ts';

const config = {
  resource: 'https://mcp-gate.example.org/mcp',
  issuer: 'https://login-gate.example.org/',
  jwksUri: 'https://login-gate.example.org/jwks.json',
  scope: 'relatte:verify',
};
const request = (name: string, token?: string) => new Request(config.resource, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(token ? { authorization: 'Bearer ' + token } : {}),
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 'auth-link', method: 'tools/call',
    params: {
      name,
      arguments: { crossing: { id: 'untrusted-fixture' } },
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'link-fixture', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }),
});

test('ChatGPT missing-login challenge includes tool-level OAuth metadata only for allowed read-only tools', async () => {
  const resource = createOAuthMcpResource(config);
  try {
    for (const name of ['verify_crossing','verify_receipt','inspect_crossing_evidence']) {
      const result = await resource.fetch(request(name));
      assert.equal(result.status, 200);
      const parsed: any = await result.json();
      assert.equal(parsed.id, 'auth-link');
      assert.equal(parsed.result.isError, true);
      const challenge = parsed.result._meta['mcp/www_authenticate'];
      assert.equal(challenge.length, 1);
      assert.match(challenge[0], /error="invalid_token"/);
      assert.match(challenge[0], /error_description=/);
      assert.match(challenge[0], /resource_metadata=/);
      assert.equal(result.headers.get('www-authenticate'), challenge[0]);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(parsed.result.structuredContent, undefined);
    }

    // A fake receiver operation must NEVER trigger linking or get to SDK.
    const forbidden = await resource.fetch(request('admit_crossing'));
    assert.equal(forbidden.status, 401);
    const denied: any = await forbidden.json();
    assert.equal(denied.error, 'invalid_token');
    assert.equal(denied.result, undefined);
    const huge = await resource.fetch(new Request(config.resource, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(270000),
    }));
    assert.equal(huge.status, 413);
  } finally { await resource.close(); }
});

test('MCP server/discover without bearer retains RFC9728 WWW challenge', async () => {
  const resource = createOAuthMcpResource(config);
  try {
    const response = await resource.fetch(new Request(config.resource, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({jsonrpc:'2.0', id:1, method:'server/discover',params:{}}),
    }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate') ?? '', /resource_metadata=/);
    const result: any = await response.json();
    assert.equal(result.error, 'invalid_token');
  } finally { await resource.close(); }
});
