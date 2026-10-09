import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpVercelRequest } from '../src/mcp-vercel.ts';

const environment = {
  RELATTE_MCP_RESOURCE: 'https://plugin.example.org/mcp',
  RELATTE_OAUTH_ISSUER: 'https://auth.example.org/',
  RELATTE_OAUTH_JWKS_URI: 'https://auth.example.org/.well-known/jwks.json',
  RELATTE_OAUTH_SCOPE: 'relatte:verify',
  RELATTE_OAUTH_INTROSPECTION_URI: 'https://auth.example.org/introspect',
  RELATTE_OAUTH_INTROSPECTION_CLIENT_ID: 'test-client',
  RELATTE_OAUTH_INTROSPECTION_CLIENT_SECRET: 'synthetic-only-test-secret',
};

test('Vercel boundary never downgrades to anonymous when OAuth is unconfigured', async () => {
  const result = await handleMcpVercelRequest(
    new Request('https://plugin.example.org/mcp', { method: 'POST' }), 'mcp', {});
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { error: 'OAUTH_RESOURCE_UNCONFIGURED' });
});

test('Vercel metadata rewrite and protected MCP route remain distinct', async () => {
  const metadata = await handleMcpVercelRequest(
    new Request('https://plugin.example.org/api/protected-resource'),
    'metadata', environment);
  assert.equal(metadata.status, 200);
  const data: any = await metadata.json();
  assert.equal(data.resource, environment.RELATTE_MCP_RESOURCE);
  const direct = await handleMcpVercelRequest(
    new Request('https://plugin.example.org/api/mcp', { method: 'POST' }),
    'mcp', environment);
  assert.equal(direct.status, 401);
  assert.match(direct.headers.get('www-authenticate') ?? '', /oauth-protected-resource/);
  const wrongPath = await handleMcpVercelRequest(
    new Request('https://plugin.example.org/api/other'),
    'mcp', environment);
  assert.equal(wrongPath.status, 404);
  const hostile = await handleMcpVercelRequest(
    new Request('https://evil.example/api/mcp'),
    'mcp', environment);
  assert.equal(hostile.status, 403);
});
