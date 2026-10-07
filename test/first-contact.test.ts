import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  buildSovereignResponseBundle,
  createHttpRelayServer,
  generateP256KeyPair,
  makeTransportFrame,
  postHttpTransport,
  sealCrossingEnvelope,
  verifySovereignResponseBundle,
} from '../src/index.ts';

// Bounded, loopback-only integration witness. No public discovery, TLS, or human field claim.
async function listenLocal(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return 'http://127.0.0.1:' + port;
}

async function stop(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function responseServer(receiver: LocalReceiver): Server {
  // Private loopback-only test endpoint, NOT a public bearer-capability API.
  return createServer((request, response) => {
    const prefix = '/first-contact/response/';
    if (request.method !== 'GET' || !request.url?.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const crossingId = decodeURIComponent(request.url.slice(prefix.length));
    try {
      const bundle = buildSovereignResponseBundle(receiver, crossingId);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(bundle));
    } catch {
      response.writeHead(404).end();
    }
  });
}

async function crossing() {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:first-contact-visitor-b',
    source_world: 'world:first-contact-visitor',
    source_history_head: null,
    parents: [],
    declared_kind: 'FIRST_CONTACT_001_CONTRIBUTION',
    payload_refs: [{
      // Opaque synthetic address, NOT bytes of a real person's contribution.
      address: 'sha256:' + 'a'.repeat(64),
      role: 'proposed-contribution',
      media_type: 'text/plain',
    }],
    requested_effect: { kind: 'storyship-candidate', authority: 'owner-local' },
    capability_ref: null,
    privacy_policy: { publication: 'not-granted' },
    audience_policy: null,
    return_address: 'relatte:return:first-contact-visitor',
    created_at: '2026-10-06T20:10:00.000Z',
    extensions: { specimen: 'FIRST-CONTACT-001', payload_is_synthetic: true },
  }, keys);
}

test('FIRST CONTACT 001: actual HTTP delivery, no auto-admission, divergent local choices, network return and cold replay', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-first-contact-'));
  const servers: Server[] = [];
  try {
    const rootB = join(base, 'porch-b');
    const rootC = join(base, 'porch-c');
    const ownerB = await LocalReceiver.create(rootB, {
      world_id: 'world:storyship-b',
      receiver_particular: 'particular:storyship-b',
      contract_ref: 'contract:first-contact-owner-b/v0',
    });
    const ownerC = await LocalReceiver.create(rootC, {
      world_id: 'world:storyship-c',
      receiver_particular: 'particular:storyship-c',
      contract_ref: 'contract:first-contact-owner-c/v0',
    });
    const crossingFromVisitor = await crossing();

    // Separate TCP sockets, independent receiver roots, no shared mutable journal.
    const httpB = createHttpRelayServer(async (envelope) => {
      await ownerB.receive(envelope, '2026-10-06T20:12:00.000Z');
    });
    const httpC = createHttpRelayServer(async (envelope) => {
      await ownerC.receive(envelope, '2026-10-06T20:12:01.000Z');
    });
    servers.push(httpB, httpC);
    const urlB = await listenLocal(httpB) + '/relatte/v0/crossings';
    const urlC = await listenLocal(httpC) + '/relatte/v0/crossings';
    const frame = await makeTransportFrame(
      crossingFromVisitor, 'http-relay',
      '2026-10-06T20:11:00.000Z', 'first-contact synthetic proposal',
    );

    const ackB = await postHttpTransport(urlB, frame);
    const ackC = await postHttpTransport(urlC, frame);
    assert.equal(ackB.crossing_id, crossingFromVisitor.crossing_id);
    assert.equal(ackC.crossing_id, crossingFromVisitor.crossing_id);
    assert.equal(ackB.semantic_effect, 'none');
    assert.equal(ackB.accepted_for_delivery, true);
    assert.deepEqual(ownerB.snapshot().admitted, []);
    assert.deepEqual(ownerC.snapshot().admitted, []);
    assert.equal(ownerB.journalLength(), 1);
    assert.equal(ownerC.journalLength(), 1);

    // A transport ACK cannot be converted into an owner decision.
    const badFrame = { ...frame, route_note: 'tampered after signing' };
    const hostileResponse = await fetch(urlB, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(badFrame),
    });
    assert.equal(hostileResponse.status, 400);
    assert.equal(ownerB.journalLength(), 1);

    // Simulate two explicit DIFFERENT owner decisions; the HTTP relay makes neither.
    await ownerB.dispose(crossingFromVisitor.crossing_id, 'ADMIT',
      '2026-10-06T20:15:00.000Z', {
        admit_effect: 'storyship-local-candidate-admitted',
        descendant_refs: ['artifact:storyship-b-visible-trace-001'],
      });
    await ownerC.dispose(crossingFromVisitor.crossing_id, 'REFUSE',
      '2026-10-06T20:16:00.000Z');

    // Actual network RETURN via separate HTTP endpoints, verified by the source.
    const returnB = responseServer(ownerB);
    const returnC = responseServer(ownerC);
    servers.push(returnB, returnC);
    const returnUrlB = await listenLocal(returnB);
    const returnUrlC = await listenLocal(returnC);
    const path = '/first-contact/response/' + encodeURIComponent(crossingFromVisitor.crossing_id);
    const responseB = await (await fetch(returnUrlB + path)).json();
    const responseC = await (await fetch(returnUrlC + path)).json();
    assert.equal(await verifySovereignResponseBundle(responseB, crossingFromVisitor.crossing_id), true);
    assert.equal(await verifySovereignResponseBundle(responseC, crossingFromVisitor.crossing_id), true);
    assert.equal(responseB.disposition_receipt.kind, 'R3_ADMIT');
    assert.equal(responseC.disposition_receipt.kind, 'R3_REFUSE');
    assert.equal(responseC.disposition_receipt.semantic_effect, 'none');
    assert.notEqual(responseB.bundle_id, responseC.bundle_id);

    // Cross-wire / forged world claims fail independent verification.
    assert.equal(await verifySovereignResponseBundle({
      ...responseB, world_id: responseC.world_id,
    }, crossingFromVisitor.crossing_id), false);

    // Re-delivery does not mint fresh history or overwrite the owner's decision.
    const duplicateAck = await postHttpTransport(urlB, frame);
    assert.equal(duplicateAck.crossing_id, crossingFromVisitor.crossing_id);
    assert.equal(ownerB.journalLength(), 2);
    const replayB = await LocalReceiver.open(rootB);
    const replayC = await LocalReceiver.open(rootC);
    assert.deepEqual(replayB.snapshot(), ownerB.snapshot());
    assert.deepEqual(replayC.snapshot(), ownerC.snapshot());
    assert.equal(buildSovereignResponseBundle(replayB, crossingFromVisitor.crossing_id).bundle_id,
      responseB.bundle_id);
    assert.equal(buildSovereignResponseBundle(replayC, crossingFromVisitor.crossing_id).bundle_id,
      responseC.bundle_id);
  } finally {
    await Promise.allSettled(servers.map(stop));
    await rm(base, { recursive: true, force: true });
  }
});
