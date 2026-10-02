import { createServer } from 'node:http';

import { ReLatteRuntime } from '../src/runtime.ts';

const root = process.env.RELATTE_RUNTIME_ROOT;
const host = process.env.RELATTE_PEER_HOST ?? '127.0.0.1';
const port = Number(process.env.RELATTE_PEER_PORT ?? '4100');
const publicBase = process.env.RELATTE_PEER_PUBLIC_BASE_URL;

if (!root) throw new Error('RELATTE_RUNTIME_ROOT is required');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('RELATTE_PEER_PORT invalid');
}
if (!publicBase) throw new Error('RELATTE_PEER_PUBLIC_BASE_URL is required');

const base = new URL(publicBase);
if (base.protocol !== 'http:' && base.protocol !== 'https:') {
  throw new Error('RELATTE_PEER_PUBLIC_BASE_URL protocol invalid');
}
if (base.username !== '' || base.password !== '') {
  throw new Error('RELATTE_PEER_PUBLIC_BASE_URL credentials forbidden');
}

const runtime = await ReLatteRuntime.open({
  root,
  created_at: new Date().toISOString(),
});

function json(
  response: import('node:http').ServerResponse,
  status: number,
  value: unknown,
): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

async function readJson(
  request: import('node:http').IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 2_000_000) throw new Error('PEER_REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new Error('PEER_REQUEST_BODY_REQUIRED');
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const descriptorUrl = new URL('/relatte/peer/v0', base).toString();
const crossingUrl = new URL('/relatte/crossings/v0', base).toString();

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    );

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      json(response, 200, {
        ok: true,
        world_id: runtime.manifest.world_id,
      });
      return;
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/relatte/peer/v0'
    ) {
      json(response, 200, {
        schema: 'relatte.peer-descriptor/v0',
        world_id: runtime.manifest.world_id,
        descriptor_endpoint: descriptorUrl,
        crossing_endpoint: crossingUrl,
        capability_issuer_ref: runtime.capabilityKernel.issuer_ref,
        capability_issuer_public_key:
          runtime.capabilityKernel.public_key_jwk,
        encryption_key_id: runtime.encryption.key_id,
        encryption_public_key: runtime.encryption.public_key_jwk,
        semantic_effect: 'none',
        laws: [
          'PEER DESCRIPTOR != AUTHORITY',
          'DISCOVERY != TRUST',
          'ENDPOINT != WORLD',
          'ENCRYPTION KEY != IDENTITY',
        ],
      });
      return;
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/relatte/crossings/v0'
    ) {
      const body = await readJson(request);
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        !('crossing' in body)
      ) {
        throw new Error('PEER_CROSSING_BODY_INVALID');
      }
      const observedAt = new Date().toISOString();
      const item = await runtime.enqueueForeignCrossing({
        crossing: (body as Record<string, unknown>).crossing,
        enqueued_at: observedAt,
        source: 'peer-http',
      });
      const pulse = await runtime.pulseOne({
        claimed_at: observedAt,
        received_at: observedAt,
        committed_at: new Date().toISOString(),
      });
      json(response, 202, {
        schema: 'relatte.peer-crossing-acceptance/v0',
        queue_item_id: item.queue_item_id,
        crossing_id: item.crossing_id,
        receive_receipt_id: pulse.receive_receipt_id,
        semantic_effect: 'none',
        laws: [
          'HTTP ACCEPTED != ADMITTED',
          'CAPABILITY != ADMISSION',
        ],
      });
      return;
    }

    json(response, 404, {
      error: 'NOT_FOUND',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'PEER_SERVER_ERROR';
    const denied =
      message.startsWith('CAPABILITY_') ||
      message.startsWith('INVALID_INBOX') ||
      message.startsWith('INVALID_PENDING');
    json(response, denied ? 403 : 400, {
      error: message,
    });
  }
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => resolve());
});

console.log(JSON.stringify({
  schema: 'relatte.peer-server-ready/v0',
  world_id: runtime.manifest.world_id,
  descriptor_endpoint: descriptorUrl,
  crossing_endpoint: crossingUrl,
}));

const shutdown = async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
