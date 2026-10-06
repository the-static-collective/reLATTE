import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { equal, instant } from '../audit_clock/wire.ts';
import { inspectPublication, recheckService } from './commitment.ts';
import type { ServiceContext } from './commitment.ts';
import { answerServiceChallenge, inspectServiceChallenge, inspectServiceResponse } from './exchange.ts';
import { observeService } from './receipt.ts';
import type { Wire } from './wire.ts';

export const MAX_SERVICE_HTTP_BYTES = 1_000_000;
/** The server has an artifact and its own host key; it never needs the worker's key or algorithm. */
export function serviceHttpServer(context: () => Promise<ServiceContext>, artifact: Buffer, hostKeys: P256KeyMaterial): Server {
  return createServer(async (req, res) => {
    try {
      const s = await recheckService(await context()), url = new URL(s.declaration.endpoint);
      if (req.method !== 'POST' || req.url !== url.pathname + url.search) { res.writeHead(404).end(); return; }
      if (Number(req.headers['content-length'] ?? 0) > MAX_SERVICE_HTTP_BYTES) { res.writeHead(413).end(); return; }
      let length = 0; const buffers: Buffer[] = [];
      for await (const value of req) {
        const b = Buffer.from(value); length += b.length;
        if (length > MAX_SERVICE_HTTP_BYTES) { res.writeHead(413).end(); return; } buffers.push(b);
      }
      const body = record(JSON.parse(Buffer.concat(buffers).toString('utf8')), 'INVALID_SERVICE_HTTP_REQUEST');
      exactKeys(body, ['publication', 'event', 'challenge'], 'INVALID_SERVICE_HTTP_REQUEST');
      const response = await answerServiceChallenge(s, body.publication, body.event, body.challenge, artifact, hostKeys, new Date().toISOString());
      res.writeHead(200, { 'content-type': 'application/json' }).end(canonicalBytes(response));
    } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
  });
}
/** Network errors are attributed attempts, never evidence of absent storage or a dead host. */
export async function requestService(s: ServiceContext, publication: unknown, event: unknown, challenge: unknown, observerKeys: P256KeyMaterial, timeoutMs = 1000) {
  s = await recheckService(s); await inspectPublication(s, publication);
  await inspectServiceChallenge(s, publication, event, challenge);
  if (!equal(observerKeys.publicKeyJwk, s.plan.policy.observer.public_key)) throw new Error('SERVICE_OBSERVER_KEY_MISMATCH');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('INVALID_SERVICE_TIMEOUT');
  const sent_at = new Date().toISOString(); let candidate: unknown, candidateReceived = false;
  let response: Wire | null = null, transport_error: string | null = null;
  try {
    const reply = await fetch(s.declaration.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json' }, body: canonicalBytes({ publication, event, challenge }).toString('utf8') });
    if (!reply.ok || !reply.body) { await reply.body?.cancel(); throw new Error('SERVICE_HTTP_STATUS'); }
    const reader = reply.body.getReader(), chunks: Buffer[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > MAX_SERVICE_HTTP_BYTES) throw new Error('SERVICE_HTTP_SIZE_LIMIT'); chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    candidateReceived = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SERVICE_HTTP_ERROR';
    transport_error = message;
  }
  const observed_at = new Date().toISOString();
  // Authentication/context failures are protocol errors, not negative receipts against an unbound host.
  if (candidateReceived) response = (await inspectServiceResponse(s, (challenge as Wire).crossing_id, candidate)).crossing;
  if (instant(sent_at) < instant((challenge as Wire).created_at)) throw new Error('SERVICE_REQUEST_BEFORE_CHALLENGE_CLAIM');
  const receipt = await observeService(s, publication, event, challenge, response,
    { endpoint: s.declaration.endpoint, sent_at, observed_at }, observerKeys);
  return { response, receipt, transport_error };
}
