import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { dispatchReadOnlyMcpRequest } from './mcp-readonly.ts';

const PROTOCOL = '2026-07-28';
const MAX_BODY_BYTES = 256 * 1024;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject : null;
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function headerValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value;
  const data = value.slice('=?base64?'.length, -2);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length === 0 || data.length % 4 !== 0) return null;
  const decoded = Buffer.from(data, 'base64');
  if (decoded.toString('base64') !== data || !Buffer.from(decoded.toString('utf8'), 'utf8').equals(decoded)) return null;
  return decoded.toString('utf8');
}

// Development-only adapter, deliberately loopback-only, no reverse-proxy trust.
export function createLocalReadOnlyMcpServer(options: { stagingBearerToken?: string } = {}) {
  const token = options.stagingBearerToken;
  if (token !== undefined && Buffer.byteLength(token, 'utf8') < 32) {
    throw new Error('STAGING_TOKEN_TOO_SHORT');
  }
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, payload?: unknown) => {
      response.writeHead(status, {
        'content-type': payload === undefined ? undefined : 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(payload === undefined ? undefined : JSON.stringify(payload));
    };

    const host = request.headers.host ?? '';
    const peer = request.socket.remoteAddress ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ||
      request.headers.origin !== undefined) {
      send(403, { error: 'LOCAL_CLIENT_ONLY' });
      return;
    }
    // Optional loopback staging gateway: deny by default when configured.
    // A shared secret is not user OAuth and is never sufficient for public submission.
    if (token !== undefined) {
      const actual = request.headers.authorization ?? '';
      const expected = 'Bearer ' + token;
      const actualBytes = Buffer.from(actual, 'utf8');
      const expectedBytes = Buffer.from(expected, 'utf8');
      if (actualBytes.length !== expectedBytes.length ||
          !timingSafeEqual(actualBytes, expectedBytes)) {
        response.setHeader('www-authenticate', 'Bearer realm="relatte-staging"');
        send(401, { error: 'STAGING_AUTH_REQUIRED' });
        return;
      }
    }
    if (request.url !== '/mcp') {
      send(404, { error: 'NOT_FOUND' });
      return;
    }
    if (request.method !== 'POST') {
      send(405, { error: 'POST_ONLY' });
      return;
    }
    const accept = String(request.headers.accept ?? '').toLowerCase();
    if (!(request.headers['content-type'] ?? '').startsWith('application/json') ||
      !accept.includes('application/json') || !accept.includes('text/event-stream')) {
      send(406, { error: 'REQUIRES_MCP_ACCEPT_AND_JSON_BODY' });
      return;
    }

    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_BODY_BYTES) {
          send(413, { error: 'REQUEST_TOO_LARGE' });
          return;
        }
        chunks.push(bytes);
      }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const rpc = object(data);
      const rawId = rpc?.id;
      const id = typeof rawId === 'string' || (typeof rawId === 'number' && Number.isFinite(rawId))
        ? rawId : null;
      if (!rpc || rpc.jsonrpc !== '2.0' || id === null || typeof rpc.method !== 'string') {
        send(400, rpcError(id, -32600, 'Invalid Request'));
        return;
      }
      const params = object(rpc.params);
      const meta = object(params?._meta);
      const declaredVersion = meta?.['io.modelcontextprotocol/protocolVersion'];
      if (!request.headers['mcp-protocol-version'] ||
          !request.headers['mcp-method'] ||
          request.headers['mcp-protocol-version'] !== declaredVersion ||
          request.headers['mcp-method'] !== rpc.method ||
          (rpc.method === 'tools/call'
            ? headerValue(request.headers['mcp-name']) !== params?.name
            : request.headers['mcp-name'] !== undefined)) {
        send(400, rpcError(id, -32020, 'HeaderMismatch'));
        return;
      }
      if (declaredVersion !== PROTOCOL) {
        send(400, rpcError(id, -32022, 'Unsupported protocol version', {
          supported: [PROTOCOL], requested: declaredVersion,
        }));
        return;
      }
      const info = object(meta?.['io.modelcontextprotocol/clientInfo']);
      const capabilities = object(meta?.['io.modelcontextprotocol/clientCapabilities']);
      if (!info || typeof info.name !== 'string' || info.name.length === 0 ||
          typeof info.version !== 'string' || info.version.length === 0 || !capabilities) {
        send(400, rpcError(id, -32602, 'Required MCP client metadata missing'));
        return;
      }

      const answer = await dispatchReadOnlyMcpRequest(data);
      const returnedError = object(answer.error);
      // Unknown RPC methods need HTTP 404 in v2026-07-28.
      send(returnedError?.code === -32601 ? 404 : 200, answer);
    } catch {
      send(400, rpcError(null, -32700, 'Parse error or invalid request'));
    }
  });
}
