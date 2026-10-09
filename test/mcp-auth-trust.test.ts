import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  calculateJwkThumbprint, createLocalJWKSet, exportJWK, generateKeyPair,
  SignJWT, createRemoteJWKSet, customFetch,
} from 'jose';

import { createOAuthMcpResource } from '../src/mcp-oauth-resource.ts';
import {
  checkAccessTrust, checkDpopProof, createIssuerIntrospection,
  validateAccessTrustPolicy,
} from '../src/mcp-auth-trust.ts';

const config = {
  resource: 'https://relatte-test.example/mcp',
  issuer: 'https://issuer.relatte-test.example/',
  jwksUri: 'https://issuer.relatte-test.example/jwks',
  scope: 'relatte:verify',
};

const pair = await generateKeyPair('RS256');
const key = await exportJWK(pair.publicKey);
const local = createLocalJWKSet({ keys: [{ ...key, kid: 'first-issuer-key', alg: 'RS256', use: 'sig' }] });

async function signedToken(opts: {
  id?: string; subject?: string; aud?: string; expiry?: string; lifetime?: number; cnf?: unknown;
} = {}) {
  const jwt = new SignJWT({ scope: config.scope, ...(opts.cnf ? { cnf: opts.cnf } : {}) })
    .setProtectedHeader({ typ: 'at+jwt', alg: 'RS256', kid: 'first-issuer-key' })
    .setSubject(opts.subject ?? 'human:alice')
    .setIssuer(config.issuer)
    .setAudience(opts.aud ?? config.resource)
    .setJti(opts.id ?? 'token-fixture-001')
    .setIssuedAt();
  if (opts.lifetime) jwt.setExpirationTime(Math.floor(Date.now() / 1000) + opts.lifetime);
  else jwt.setExpirationTime(opts.expiry ?? '2m');
  return jwt.sign(pair.privateKey);
}

function req(token: string, method = 'server/discover') {
  return new Request(config.resource, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'trust-gate', method,
      params: { _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'trust-fixture', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      } },
    }),
  });
}

test('strict revocation requires live authority; revoked token immediately denied', async () => {
  assert.throws(() => validateAccessTrustPolicy({ requireLiveStatus: true }), /LIVE_REVOCATION_GATE_REQUIRED/);
  let live = true;
  let checks = 0;
  const resource = createOAuthMcpResource(config, local, {
    requireLiveStatus: true,
    revocation: {
      async checkActive(token, facts) {
        checks++;
        assert.equal(facts.subject, 'human:alice');
        assert.equal(facts.audience, config.resource);
        assert.equal(facts.tokenId, 'token-fixture-001');
        assert.ok(token.length > 40);
        return live;
      },
    },
  });
  try {
    const jwt = await signedToken();
    assert.equal((await resource.fetch(req(jwt))).status, 200);
    live = false;
    const revoked = await resource.fetch(req(jwt));
    assert.equal(revoked.status, 401);
    assert.equal((await revoked.json() as any).error, 'invalid_token');
    assert.equal(checks, 2, 'must check every request, not cache allow decisions');
  } finally { await resource.close(); }
});

test('issuer status outage and overlong bearer lifetime fail closed', async () => {
  const resource = createOAuthMcpResource(config, local, {
    requireLiveStatus: true,
    revocation: { checkActive: async () => { throw Error('issuer unavailable'); } },
  });
  try { assert.equal((await resource.fetch(req(await signedToken()))).status, 401); }
  finally { await resource.close(); }

  const jwt = await signedToken({ lifetime: 7200 });
  const long = createOAuthMcpResource(config, local);
  try { assert.equal((await long.fetch(req(jwt))).status, 401); }
  finally { await long.close(); }
  assert.equal(await checkAccessTrust('opaque',
    { subject: 'a', issuer: 'i', audience: 'r', scopes: [], expiresAt: 15, issuedAt: 0, tokenId: 'token-12345' },
    {}), true);
});

test('issuer introspection compares signed identity and refuses token redirect or stale claims', async () => {
  const facts = {
    subject: 'human:alice', issuer: config.issuer, audience: config.resource,
    scopes: ['relatte:verify'], expiresAt: 300, issuedAt: 100, tokenId: 'issuer-token-001',
  };
  const opts = {
    endpoint: 'https://issuer.relatte-test.example/introspect',
    issuer: config.issuer, resource: config.resource,
    clientId: 'resource-001', clientSecret: 'synthetic-fixture-only',
    scope: config.scope,
  };
  assert.throws(() => createIssuerIntrospection({ ...opts,
    endpoint: 'https://attacker.example/introspect' }), /UNSAFE_INTROSPECTION_CONFIG/);
  assert.throws(() => createIssuerIntrospection({ ...opts,
    endpoint: 'http://issuer.relatte-test.example/introspect' }), /UNSAFE_INTROSPECTION_CONFIG/);

  let active = true;
  let outage = false;
  let claimedIssuer = facts.issuer;
  const checker = createIssuerIntrospection(opts, async (input, init) => {
    assert.equal(String(input), opts.endpoint);
    assert.equal(init?.redirect, 'error');
    assert.ok(String((init?.headers as Record<string, string>).authorization).startsWith('Basic '));
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('token'), 'exact-test-token');
    if (outage) throw Error('provider down');
    return new Response(JSON.stringify({
      active, iss: claimedIssuer, sub: facts.subject, aud: [facts.audience],
      exp: facts.expiresAt, iat: facts.issuedAt, jti: facts.tokenId, scope: config.scope,
    }), { headers: { 'content-type': 'application/json' } });
  });
  assert.equal(await checker.checkActive('exact-test-token', facts), true);
  active = false;
  assert.equal(await checker.checkActive('exact-test-token', facts), false);
  active = true; claimedIssuer = 'https://attacker.example/';
  assert.equal(await checker.checkActive('exact-test-token', facts), false);
  claimedIssuer = facts.issuer; outage = true;
  assert.equal(await checker.checkActive('exact-test-token', facts), false);
});

test('issuer signing key rollover invalidates retired kid without confusing JWT audience', async () => {
  const second = await generateKeyPair('RS256');
  const publicTwo = await exportJWK(second.publicKey);
  let advertised = [{ ...key, kid: 'first-issuer-key', alg: 'RS256', use: 'sig' }];
  let fetched = 0;
  const resolver = createRemoteJWKSet(new URL(config.jwksUri), {
    cooldownDuration: 0, cacheMaxAge: 0, timeoutDuration: 1000,
    [customFetch]: async (url) => {
      assert.equal(String(url), config.jwksUri);
      fetched++;
      return new Response(JSON.stringify({ keys: advertised }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const server = createOAuthMcpResource(config, resolver);
  try {
    const old = await signedToken();
    assert.equal((await server.fetch(req(old))).status, 200);
    advertised = [{ ...publicTwo, kid: 'second-issuer-key', alg: 'RS256', use: 'sig' }];
    const jwt = await new SignJWT({ scope: config.scope })
      .setProtectedHeader({ typ: 'at+jwt', alg: 'RS256', kid: 'second-issuer-key' })
      .setSubject('human:alice').setIssuer(config.issuer)
      .setAudience(config.resource).setJti('token-after-key-rotation')
      .setIssuedAt().setExpirationTime('2m').sign(second.privateKey);
    assert.equal((await server.fetch(req(jwt))).status, 200);
    // No stale trust in retired signer; cache refresh is bounded and active.
    assert.equal((await server.fetch(req(old))).status, 401);
    assert.ok(fetched >= 2);
  } finally { await server.close(); }
});

test('optional DPoP proof is token-bound, method+URL-bound, and replay claim is single-use', async () => {
  const dpopPair = await generateKeyPair('ES256');
  const jwk = await exportJWK(dpopPair.publicKey);
  const thumb = await calculateJwkThumbprint(jwk);
  const token = await signedToken({ cnf: { jkt: thumb } });
  const request = req(token);
  let claims = 0;
  const seen = new Set<string>();
  const store = { async claim(jti: string) { claims++; if (seen.has(jti)) return false; seen.add(jti); return true; } };
  const proof = await new SignJWT({
    htm: 'POST', htu: config.resource, ath: createHash('sha256').update(token).digest('base64url'),
  }).setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
    .setJti('dpop-unique-proof-000001').setIssuedAt().sign(dpopPair.privateKey);

  assert.equal(await checkDpopProof(proof, token, { jkt: thumb }, request, store), true);
  assert.equal(await checkDpopProof(proof, token, { jkt: thumb }, request, store), false);
  assert.equal(await checkDpopProof(proof, token + 'changed', { jkt: thumb }, request, store), false);
  assert.equal(await checkDpopProof(proof, token, { jkt: thumb },
    new Request('https://relatte-test.example/else', { method: 'POST' }), store), false);
  assert.equal(await checkDpopProof(proof, token, { jkt: 'wrong-thumbprint' }, request, store), false);
  assert.equal(claims, 2, 'bad cryptographic proofs cannot consume a replay-store entry');

  assert.throws(() => validateAccessTrustPolicy({
    dpop: { mode: 'required', replayStore: undefined as any },
  }), /DPOP_REPLAY_STORE_REQUIRED/);
});

test('authenticated subject has no sovereign ADMIT tool or synthetic owner authority', async () => {
  const server = createOAuthMcpResource(config, local);
  try {
    const token = await signedToken({ subject: 'human:claimed-world-owner' });
    const bad = await server.fetch(new Request(config.resource, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call',
        'mcp-name': 'admit_crossing',
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'forbidden-effect', method: 'tools/call',
        params: { name: 'admit_crossing', arguments: { crossing_id: 'any' },
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'hostile', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    }));
    assert.ok(bad.status >= 400 || (await bad.clone().text()).includes('Unknown tool'));
  } finally { await server.close(); }
});
