import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

import { generateP256KeyPair, sealCrossingEnvelope } from '../src/protocol.ts';

const version = '2026-07-28';
const metadata = {
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientInfo': { name: 'relatte-external-wire-client', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function startStandaloneServer() {
  // The server runs in its OWN Node process; the test talks only over HTTP.
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/mcp-local.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, RELATTE_MCP_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise<{ url: string; child: typeof child }>((resolve, reject) => {
    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('MCP_SERVER_START_TIMEOUT: ' + errors));
    }, 10000);
    const fail = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.stderr?.on('data', (data: Buffer) => { errors += String(data); });
    child.stdout?.on('data', (data: Buffer) => {
      output += String(data);
      const address = output.match(/http:\/\/127\.0\.0\.1:\d+\/mcp/);
      if (address) {
        clearTimeout(timer);
        resolve({ url: address[0], child });
      }
    });
    child.once('exit', (code) => {
      if (!output.includes('/mcp')) fail(new Error('MCP_SERVER_EXITED_' + code + ': ' + errors));
    });
  });
}

async function wire(url: string, method: string, params: Record<string, unknown> = {},
  headers: Record<string, string> = {}, versionHeader = version) {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 'wire-' + method, method,
    params: { ...params, _meta: metadata },
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': versionHeader,
      'mcp-method': method,
      ...(method === 'tools/call' && typeof params.name === 'string' ? { 'mcp-name': params.name } : {}),
      ...headers,
    },
    body,
  });
  return { status: response.status, response: await response.json() as any };
}

async function fixture() {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:wire-test',
    source_world: 'world:wire-test',
    source_history_head: null,
    parents: [],
    declared_kind: 'MCP_WIRE_TEST',
    payload_refs: [],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-09T15:00:00.000Z',
    extensions: {},
  }, await generateP256KeyPair());
}

test('independent Node process speaks strict MCP v2026, preserving signature != authority', { timeout: 25000 }, async () => {
  const { url, child } = await startStandaloneServer();
  try {
    const discovery = await wire(url, 'server/discover');
    assert.equal(discovery.status, 200);
    assert.deepEqual(discovery.response.result.supportedVersions, [version]);
    assert.equal(discovery.response.result.resultType, 'complete');
    assert.deepEqual(discovery.response.result.capabilities, { tools: {} });

    const listing = await wire(url, 'tools/list');
    assert.equal(listing.status, 200);
    assert.equal(listing.response.result.resultType, 'complete');
    assert.deepEqual(listing.response.result.tools.map((tool: any) => tool.name), [
      'verify_crossing', 'verify_receipt', 'inspect_crossing_evidence',
    ]);
    assert.equal(listing.response.result.tools.every((tool: any) => tool.annotations.readOnlyHint), true);

    const signed = await fixture();
    const valid = await wire(url, 'tools/call', { name: 'verify_crossing', arguments: { crossing: signed } });
    assert.equal(valid.status, 200);
    assert.equal(valid.response.result.resultType, 'complete');
    assert.equal(valid.response.result.structuredContent.verified, true);
    assert.equal(valid.response.result.structuredContent.crossing_id, signed.crossing_id);

    const altered = await wire(url, 'tools/call', {
      name: 'verify_crossing', arguments: { crossing: { ...signed, source_world: 'world:altered' } },
    });
    assert.equal(altered.response.result.structuredContent.verified, false);

    const forbidden = await wire(url, 'tools/call', {
      name: 'review_crossing', arguments: { crossing_id: signed.crossing_id, disposition: 'ADMIT' },
    });
    assert.equal(forbidden.response.error.code, -32602);

    const badHeader = await wire(url, 'tools/list', {}, { 'mcp-method': 'tools/call' });
    assert.equal(badHeader.status, 400);
    assert.equal(badHeader.response.error.code, -32020);

    const oldVersion = await wire(url, 'tools/list', {}, {}, '2025-11-25');
    assert.equal(oldVersion.status, 400);
    assert.equal(oldVersion.response.error.code, -32020);

    const unknownMethod = await wire(url, 'does/not-exist');
    assert.equal(unknownMethod.status, 404);
    assert.equal(unknownMethod.response.error.code, -32601);

    const browser = await wire(url, 'tools/list', {}, { origin: 'https://untrusted.example' });
    assert.equal(browser.status, 403);
  } finally {
    const done = once(child, 'exit');
    child.kill();
    await done;
  }
});
