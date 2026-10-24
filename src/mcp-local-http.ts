import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { dispatchReadOnlyMcpRequest } from './mcp-readonly.ts';

const MAX_BODY_BYTES = 256 * 1024;

// Development-only transport. Deliberately no OAuth, no external binding,
// no persistent state, no filesystem input, and no write tools.
export function createLocalReadOnlyMcpServer() {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, payload: unknown) => {
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(JSON.stringify(payload));
    };

    const host = request.headers.host ?? '';
    const peer = request.socket.remoteAddress ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ||
        request.headers.origin !== undefined) {
      send(403, { error: 'LOCAL_CLIENT_ONLY' });
      return;
    }
    if (request.url !== '/mcp') {
      send(404, { error: 'NOT_FOUND' });
      return;
    }
    if (request.method !== 'POST') {
      send(405, { error: 'POST_ONLY' });
      return;
    }
    if (!(request.headers['content-type'] ?? '').startsWith('application/json') ||
        request.headers['mcp-protocol-version'] !== '2026-07-28') {
      send(400, { error: 'UNSUPPORTED_CONTENT_TYPE_OR_PROTOCOL_VERSION' });
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
      if (data === null || Array.isArray(data) || typeof data !== 'object') {
        send(400, { error: 'INVALID_MCP_REQUEST' });
        return;
      }
      const rpc = data as Record<string, unknown>;
      const method = rpc.method;
      const params = rpc.params && typeof rpc.params === 'object' && !Array.isArray(rpc.params)
        ? rpc.params as Record<string, unknown> : null;
      if (request.headers['mcp-method'] !== method ||
          (method === 'tools/call'
            ? request.headers['mcp-name'] !== params?.name
            : request.headers['mcp-name'] !== undefined)) {
        send(400, { error: 'MCP_HEADER_BODY_MISMATCH' });
        return;
      }

      const answer = await dispatchReadOnlyMcpRequest(data);
      send(200, answer);
    } catch {
      send(400, { error: 'INVALID_JSON_OR_REQUEST' });
    }
  });
}
