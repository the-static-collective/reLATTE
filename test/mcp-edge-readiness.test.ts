import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateEdgeReadiness } from '../src/mcp-edge-readiness.ts';
import { handleMcpVercelRequest } from '../src/mcp-vercel.ts';

const contract = {
  resource: 'https://mcp.relatte-test.net/mcp',
  issuer: 'https://login.relatte-test.net/',
  jwksUri: 'https://login.relatte-test.net/.well-known/jwks.json',
  introspectionUri: 'https://login.relatte-test.net/introspect',
  scope: 'relatte:verify',
};
const resource = {
  resource: contract.resource,
  authorization_servers: [contract.issuer],
  scopes_supported: [contract.scope],
};
const auth = {
  issuer: contract.issuer,
  authorization_endpoint: 'https://login.relatte-test.net/authorize',
  token_endpoint: 'https://login.relatte-test.net/token',
  jwks_uri: contract.jwksUri,
  introspection_endpoint: contract.introspectionUri,
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: [contract.scope],
  token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
};

const check = (c: typeof contract, r: unknown, a: unknown) =>
  evaluateEdgeReadiness(c, r, a);

test('synthetic OAuth metadata passes contract inspection; green is not domain ownership', () => {
  const result = check(contract, resource, auth);
  assert.equal(result.readyForLiveOAuthTest, true);
  assert.deepEqual(result.holds, []);
  assert.equal(result.clientRegistration, 'cimd');
});

test('metadata evaluator refuses issuer substitution, missing PKCE, wrong audience and no registration', () => {
  const failures: Array<[typeof contract, unknown, unknown, string]> = [
    [contract, { ...resource, resource: 'https://attacker.net/mcp' }, auth,
      'RFC9728 protected resource'],
    [contract, resource, { ...auth, issuer: 'https://attacker.net/' },
      'authorization issuer exact match'],
    [contract, resource, { ...auth, code_challenge_methods_supported: ['plain'] },
      'OAuth authorization code and PKCE S256'],
    [contract, resource, { ...auth, token_endpoint: 'http://login.relatte-test.net/token' },
      'bound authorization endpoints'],
    [contract, resource, { ...auth, jwks_uri: 'https://evil.net/jwks' },
      'authorization JWKS matches configured signer'],
    [contract, resource, { ...auth, introspection_endpoint: 'https://evil.net/introspect' },
      'issuer live introspection advertised'],
    [contract, resource, { ...auth, client_id_metadata_document_supported: false },
      'ChatGPT client registration'],
    [{ ...contract, resource: 'https://pretend.example/mcp' }, resource, auth,
      'canonical HTTPS resource'],
    [{ ...contract, issuer: 'https://evil.net/' }, resource, auth,
      'authorization issuer exact match'],
  ];
  for (const [candidate, r, a, blocked] of failures) {
    const result = check(candidate, r, a);
    assert.equal(result.readyForLiveOAuthTest, false, blocked);
    assert.ok(result.holds.includes(blocked), 'expected failed gate: ' + blocked);
  }
});

test('DCR fallback accepted only when registered HTTPS endpoint and compatible token method', () => {
  const dcr = check(contract, resource, {
    ...auth,
    client_id_metadata_document_supported: false,
    registration_endpoint: 'https://login.relatte-test.net/register',
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
  });
  assert.equal(dcr.readyForLiveOAuthTest, true);
  assert.equal(dcr.clientRegistration, 'dcr');
  assert.equal(check(contract, resource, {
    ...auth, client_id_metadata_document_supported: false,
    registration_endpoint: 'https://untrusted.net/register',
  }).readyForLiveOAuthTest, false);
});

test('checked-in edge rewrites have only exact MCP and RFC9728 paths', () => {
  const config: any = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/mcp', destination: '/api/mcp' },
    { source: '/.well-known/oauth-protected-resource', destination: '/api/protected-resource' },
  ]);
  assert.ok(!JSON.stringify(config).includes('proxy'));
  assert.ok(!JSON.stringify(config).includes('http://'));
});

test('public Vercel boundary refuses deployment without live revocation credentials', async () => {
  const env = {
    RELATTE_MCP_RESOURCE: contract.resource,
    RELATTE_OAUTH_ISSUER: contract.issuer,
    RELATTE_OAUTH_JWKS_URI: contract.jwksUri,
    RELATTE_OAUTH_SCOPE: contract.scope,
  };
  for (const endpoint of ['mcp', 'metadata'] as const) {
    const result = await handleMcpVercelRequest(new Request(
      endpoint === 'mcp' ? contract.resource :
        'https://mcp.relatte-test.net/.well-known/oauth-protected-resource',
    ), endpoint, env);
    assert.equal(result.status, 503, endpoint);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
});

test('edge path origin mismatch and anonymous calls fail closed even with synthetic config', async () => {
  const env = {
    RELATTE_MCP_RESOURCE: contract.resource,
    RELATTE_OAUTH_ISSUER: contract.issuer,
    RELATTE_OAUTH_JWKS_URI: contract.jwksUri,
    RELATTE_OAUTH_SCOPE: contract.scope,
    RELATTE_OAUTH_INTROSPECTION_URI: contract.introspectionUri,
    RELATTE_OAUTH_INTROSPECTION_CLIENT_ID: 'fixture-client',
    RELATTE_OAUTH_INTROSPECTION_CLIENT_SECRET: 'synthetic-only',
  };
  assert.equal((await handleMcpVercelRequest(
    new Request('https://attacker.net/api/mcp', { method: 'POST' }),
    'mcp', env)).status, 403);
  const response = await handleMcpVercelRequest(
    new Request(contract.resource, { method: 'POST' }), 'mcp', env);
  assert.equal(response.status, 401);
  assert.ok(response.headers.get('www-authenticate')?.includes('resource_metadata='));
});
