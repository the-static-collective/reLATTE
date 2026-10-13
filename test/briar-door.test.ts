import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import {
  prepareBriarInvitation,
  briarSendConfirmation,
  listVerifiedBriarContacts,
  submitBriarInvitation,
} from '../src/briar-door.ts';

const crossingId = 'relatte-crossing-v0:' + 'a'.repeat(64);
const invitation = prepareBriarInvitation(crossingId, 'Please review this candidate crossing.');

async function withMockBriar(
  contacts: unknown,
  act: (origin: string, posted: object[]) => Promise<void>,
): Promise<void> {
  const posted: object[] = [];
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer TEST_TOKEN') {
      response.writeHead(401); response.end(); return;
    }
    if (request.method === 'GET' && request.url === '/v1/contacts') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(contacts)); return;
    }
    if (request.method === 'POST' && request.url === '/v1/messages/7') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      posted.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}'); return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = (server.address() as AddressInfo).port;
    await act('http://127.0.0.1:' + port, posted);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
}

test('human preview contains crossing id, never actual signed payload bytes', () => {
  assert.equal(invitation.crossing_id, crossingId);
  assert.match(invitation.text, /Invitation only/);
  assert.doesNotMatch(invitation.text, /private_jwk|signing|payload_refs/);
  assert.throws(() => prepareBriarInvitation('fake'), /BRIAR_INVALID_CROSSING_ID/);
  assert.throws(() => prepareBriarInvitation(crossingId, 'oops\nmalicious'), /BRIAR_INVALID_NOTE/);
  assert.throws(() => briarSendConfirmation(7, { ...invitation, text: 'substituted' }), /BRIAR_INVITATION_TAMPERED/);
});

test('requires explicit per-recipient send confirmation before any HTTP request', async () => {
  await withMockBriar([{ contactId: 7, verified: true }], async (origin, posted) => {
    await assert.rejects(submitBriarInvitation({
      config: { origin, token: 'TEST_TOKEN' },
      contactId: 7, invitation, confirmation: 'not-confirmed',
    }), /BRIAR_EXPLICIT_CONFIRMATION_REQUIRED/);
    assert.equal(posted.length, 0);
  });
});

test('rejects remote API origins and unverified contacts', async () => {
  await assert.rejects(listVerifiedBriarContacts({
    origin: 'http://example.com:7000', token: 'TEST_TOKEN',
  }), /BRIAR_LOOPBACK_ONLY/);
  await assert.rejects(listVerifiedBriarContacts({
    origin: 'http://127.0.0.1:7000@evil.example', token: 'TEST_TOKEN',
  }), /BRIAR_LOOPBACK_ONLY/);

  await withMockBriar([{ contactId: 7, verified: false }], async (origin, posted) => {
    await assert.rejects(submitBriarInvitation({
      config: { origin, token: 'TEST_TOKEN' },
      contactId: 7, invitation, confirmation: briarSendConfirmation(7, invitation),
    }), /BRIAR_VERIFIED_CONTACT_REQUIRED/);
    assert.equal(posted.length, 0);
  });
});

test('single explicit send uses upstream HEADLESS API and claims no remote delivery', async () => {
  await withMockBriar([
    { contactId: 7, verified: true, alias: 'Private, not a receipt' },
    { contactId: 8, verified: false },
  ], async (origin, posted) => {
    const config = { origin, token: 'TEST_TOKEN' };
    const listed = await listVerifiedBriarContacts(config);
    assert.deepEqual(listed, [{ contactId: 7, verified: true }]);
    const result = await submitBriarInvitation({
      config, contactId: 7, invitation,
      confirmation: briarSendConfirmation(7, invitation),
    });
    assert.deepEqual(posted, [{ text: invitation.text }]);
    assert.equal(result.status, 'submitted-to-local-briar');
    assert.equal(result.remote_delivery, 'unknown');
    assert.equal(result.receive_receipt, 'not-established');
    assert.equal(JSON.stringify(result).includes('Private'), false);
  });
});

test('a rejected local API response does not become a fabricated delivery receipt', async () => {
  await withMockBriar([{ contactId: 7, verified: true }], async (origin) => {
    await assert.rejects(submitBriarInvitation({
      config: { origin, token: 'INCORRECT' },
      contactId: 7, invitation,
      confirmation: briarSendConfirmation(7, invitation),
    }), /BRIAR_LOCAL_API_REJECTED/);
  });
});
