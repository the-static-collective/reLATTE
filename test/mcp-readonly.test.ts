import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
} from '../src/protocol.ts';
import { callReadOnlyMcpTool, dispatchReadOnlyMcpRequest } from '../src/mcp-readonly.ts';
import { createLocalReadOnlyMcpServer } from '../src/mcp-local-http.ts';

async function crossing(id: string) {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:demo-' + id,
    source_world: 'world:demo',
    source_history_head: null,
    parents: [],
    declared_kind: 'MCP_READONLY_TEST',
    payload_refs: [],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-09T12:00:00.000Z',
    extensions: {},
  }, await generateP256KeyPair());
}

async function receipt(crossingId: string, kind: string, keys: Awaited<ReturnType<typeof generateP256KeyPair>>) {
  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossingId,
    world_id: 'world:receiver',
    receiver_particular: 'particular:receiver',
    kind,
    semantic_effect: kind === 'R3_ADMIT' ? 'admitted-claim' : 'none',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: null,
    created_at: '2026-10-09T12:01:00.000Z',
    extensions: {},
  }, keys);
}

function data(result: Record<string, unknown>): any {
  return result.structuredContent;
}

test('real native signed crossing checks; altered data fails closed', async () => {
  const signed = await crossing('a');
  const valid = data(await callReadOnlyMcpTool('verify_crossing', { crossing: signed }));
  assert.equal(valid.verified, true);
  assert.equal(valid.crossing_id, signed.crossing_id);
  assert.equal(valid.authority_verified, undefined);
  const altered = data(await callReadOnlyMcpTool('verify_crossing', {
    crossing: { ...signed, source_world: 'world:impersonator' },
  }));
  assert.equal(altered.verified, false);
  assert.equal(altered.crossing_id, null);
});

test('native receipt signatures do not silently establish authority', async () => {
  const signed = await crossing('b');
  const keys = await generateP256KeyPair();
  const claimed = await receipt(signed.crossing_id, 'R3_ADMIT', keys);
  const verified = data(await callReadOnlyMcpTool('verify_receipt', { receipt: claimed }));
  assert.equal(verified.verified, true);
  assert.equal(verified.kind, 'R3_ADMIT');
  assert.match(verified.limitation, /does not authenticate/);
});

test('inspect requires the same crossing, one receive, and at most one disposition', async () => {
  const signed = await crossing('c');
  const other = await crossing('d');
  const keys = await generateP256KeyPair();
  const received = await receipt(signed.crossing_id, 'RECEIVED', keys);
  const held = await receipt(signed.crossing_id, 'R3_HOLD', keys);
  const good = data(await callReadOnlyMcpTool('inspect_crossing_evidence', {
    crossing: signed, receipts: [received, held],
  }));
  assert.equal(good.verified, true);
  assert.equal(good.disposition_claim, 'HOLD');
  assert.equal(good.authority_verified, false);

  const mismatch = data(await callReadOnlyMcpTool('inspect_crossing_evidence', {
    crossing: other, receipts: [received, held],
  }));
  assert.equal(mismatch.code, 'CROSSING_RECEIPT_MISMATCH');

  const incompatible = data(await callReadOnlyMcpTool('inspect_crossing_evidence', {
    crossing: signed, receipts: [received, await receipt(signed.crossing_id, 'R3_ADMIT', keys), held],
  }));
  assert.equal(incompatible.code, 'INCONSISTENT_RECEIPT_SEQUENCE');
});

test('unknown tools and malformed arguments cannot perform a disposition', async () => {
  assert.equal(data(await callReadOnlyMcpTool('review_crossing', {
    crossing_id: 'any', disposition: 'ADMIT',
  })).code, 'UNKNOWN_TOOL');
  assert.equal(data(await callReadOnlyMcpTool('verify_crossing', {
    crossing: {}, receiver_root: '/tmp/secret',
  })).code, 'INVALID_TOOL_ARGUMENTS');
  const listing: any = await dispatchReadOnlyMcpRequest({
    jsonrpc: '2.0', id: 1, method: 'tools/list', params: {},
  });
  assert.equal(listing.result.tools.length, 3);
  assert.equal(listing.result.tools.every((tool: any) => tool.annotations.readOnlyHint), true);
});

test('loopback HTTP uses matching 2026-07-28 routing headers and rejects unsafe browser origins', async () => {
  const server = createLocalReadOnlyMcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('INVALID_TEST_SERVER_ADDRESS');
    const url = 'http://127.0.0.1:' + address.port + '/mcp';
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 'tools', method: 'tools/list', params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'relatte-test-client', version: '1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    } });
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/list',
    };
    const good = await fetch(url, { method: 'POST', headers, body: payload });
    assert.equal(good.status, 200);
    assert.equal(((await good.json()) as any).result.tools.length, 3);
    const invalidHeader = await fetch(url, {
      method: 'POST', headers: { ...headers, 'mcp-method': 'tools/call' }, body: payload,
    });
    assert.equal(invalidHeader.status, 400);
    const origin = await fetch(url, {
      method: 'POST', headers: { ...headers, origin: 'https://untrusted.example' }, body: payload,
    });
    assert.equal(origin.status, 403);
    const get = await fetch(url);
    assert.equal(get.status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
