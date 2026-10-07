import { createServer } from 'node:http';

import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from './common.ts';

export async function observeHttp(bytes: Uint8Array): Promise<{
  observation: AdapterObservation;
  cleanup: () => Promise<void>;
}> {
  const source = Buffer.from(bytes);
  const etag = `"sha256-${sha256Hex(source)}"`;
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/artifact') {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.statusCode = 200;
    response.setHeader('content-type', 'application/octet-stream');
    response.setHeader('etag', etag);
    response.end(source);
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('HTTP_ADAPTER_NO_ADDRESS');
  }

  const url = `http://127.0.0.1:${address.port}/artifact`;
  const response = await fetch(url);
  if (!response.ok) {
    server.close();
    throw new Error('HTTP_ADAPTER_FETCH_FAILED');
  }
  const observed = Buffer.from(await response.arrayBuffer());
  const responseEtag = response.headers.get('etag');
  if (responseEtag !== etag) {
    server.close();
    throw new Error('HTTP_ADAPTER_ETAG_CHANGED');
  }

  return {
    observation: makeObservation(
      'http',
      `http-resource:${url}:etag:${etag}`,
      observed,
      response.headers.get('content-type') ?? 'application/octet-stream',
      {
        method: 'GET',
        url,
        etag,
        status: response.status,
        identity_model: 'HTTP resource representation',
      },
    ),
    cleanup: async () => {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => error ? reject(error) : resolvePromise());
      });
    },
  };
}
