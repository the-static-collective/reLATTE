import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import {
  LocalReceiver,
  createHttpRelayServer,
  generateP256KeyPair,
  makeTransportFrame,
  postHttpTransport,
  readFileBundle,
  sealCrossingEnvelope,
  verifyAndExtractTransportFrame,
  verifyCrossingEnvelope,
  writeFileBundle,
} from '../src/index.ts';

async function crossing(): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r6-source',
    source_world: 'world:r6-source',
    source_history_head: 'local:r6-source:head-001',
    parents: [],
    declared_kind: 'R6_TEST',
    payload_refs: [{
      address: 'sha256:' + '6'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: {
      kind: 'candidate-local-adaptation',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r6-source',
    created_at: '2026-10-01T21:10:00.000Z',
    extensions: {
      specimen: 'REPLACEABLE-TRANSPORT-001',
    },
  }, keys);
}

test('file and HTTP roads carry the exact same canonical crossing body', async () => {
  const signed = await crossing();

  const fileFrame = await makeTransportFrame(
    signed,
    'file-bundle',
    '2026-10-01T21:11:00.000Z',
    'filesystem road',
  );
  const httpFrame = await makeTransportFrame(
    signed,
    'http-relay',
    '2026-10-01T21:12:00.000Z',
    'localhost HTTP road',
  );

  assert.notEqual(fileFrame.transport_id, httpFrame.transport_id);
  assert.equal(fileFrame.crossing_id, signed.crossing_id);
  assert.equal(httpFrame.crossing_id, signed.crossing_id);
  assert.equal(fileFrame.canonical_body_sha256, httpFrame.canonical_body_sha256);
  assert.equal(fileFrame.body, httpFrame.body);

  const fromFileFrame = await verifyAndExtractTransportFrame(fileFrame);
  const fromHttpFrame = await verifyAndExtractTransportFrame(httpFrame);

  assert.equal(fromFileFrame.crossing_id, signed.crossing_id);
  assert.equal(fromHttpFrame.crossing_id, signed.crossing_id);
  assert.equal(await verifyCrossingEnvelope(fromFileFrame), true);
  assert.equal(await verifyCrossingEnvelope(fromHttpFrame), true);
});

test('same durable receiver accepts file delivery then HTTP duplicate without new history', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r6-'));
  const server = createHttpRelayServer(async () => {});
  try {
    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:r6-receiver',
      receiver_particular: 'particular:r6-receiver',
      contract_ref: 'contract:r6-local-law/v0',
    });
    const signed = await crossing();

    const fileFrame = await makeTransportFrame(
      signed,
      'file-bundle',
      '2026-10-01T21:13:00.000Z',
      'removable-style file handoff',
    );
    const bundlePath = join(base, 'crossing.bundle.json');
    await writeFileBundle(bundlePath, fileFrame);
    const fileDelivery = await readFileBundle(bundlePath);

    const firstReceive = await receiver.receive(
      fileDelivery.crossing,
      '2026-10-01T21:14:00.000Z',
    );
    assert.equal(receiver.journalLength(), 1);

    server.removeAllListeners('request');
    server.on('request', async (request, response) => {
      try {
        if (request.method !== 'POST' || request.url !== '/relatte/v0/crossings') {
          response.statusCode = 404;
          response.end();
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const frame = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const delivered = await verifyAndExtractTransportFrame(frame);
        const duplicateReceive = await receiver.receive(
          delivered,
          '2026-10-01T21:16:00.000Z',
        );

        response.statusCode = 202;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          schema: 'relatte.transport-ack/v0',
          transport_id: frame.transport_id,
          crossing_id: delivered.crossing_id,
          accepted_for_delivery: true,
          semantic_effect: 'none',
          laws: ['ACK != RECEIVE RECEIPT', 'DELIVERED != ADMITTED'],
          receive_receipt_id: duplicateReceive.receipt_id,
        }));
      } catch (error) {
        response.statusCode = 400;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'invalid_transport',
        }));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    const httpFrame = await makeTransportFrame(
      signed,
      'http-relay',
      '2026-10-01T21:15:00.000Z',
      'actual localhost HTTP relay',
    );
    const ack = await postHttpTransport(
      `http://127.0.0.1:${address.port}/relatte/v0/crossings`,
      httpFrame,
    );

    assert.equal(ack.crossing_id, signed.crossing_id);
    assert.equal(ack.semantic_effect, 'none');
    assert.equal(receiver.journalLength(), 1);
    assert.equal(
      receiver.getReceiveReceipt(signed.crossing_id)?.receipt_id,
      firstReceive.receipt_id,
    );
  } finally {
    await new Promise<void>((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
    await rm(base, { recursive: true, force: true });
  }
});

test('built-in HTTP relay transports a verified crossing but does not make a local decision', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r6-http-'));
  let deliveredCrossing: any = null;
  let deliveredTransportId: string | null = null;

  const receiver = await LocalReceiver.create(join(base, 'receiver'), {
    world_id: 'world:r6-http-receiver',
    receiver_particular: 'particular:r6-http-receiver',
    contract_ref: 'contract:r6-http-local-law/v0',
  });

  const server = createHttpRelayServer(async (incoming, frame) => {
    deliveredCrossing = incoming;
    deliveredTransportId = frame.transport_id ?? null;
    await receiver.receive(incoming, '2026-10-01T21:20:00.000Z');
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;

    const signed = await crossing();
    const frame = await makeTransportFrame(
      signed,
      'http-relay',
      '2026-10-01T21:19:00.000Z',
      'built-in relay',
    );

    const ack = await postHttpTransport(
      `http://127.0.0.1:${address.port}/relatte/v0/crossings`,
      frame,
    );

    assert.equal(ack.transport_id, frame.transport_id);
    assert.equal(ack.crossing_id, signed.crossing_id);
    assert.equal(ack.accepted_for_delivery, true);
    assert.equal(ack.semantic_effect, 'none');
    assert.ok(ack.laws.includes('ACK != RECEIVE RECEIPT'));

    assert.equal(deliveredTransportId, frame.transport_id);
    assert.equal(deliveredCrossing.crossing_id, signed.crossing_id);
    assert.deepEqual(receiver.snapshot().received, [signed.crossing_id]);
    assert.deepEqual(receiver.snapshot().admitted, []);
    assert.deepEqual(receiver.snapshot().refused, []);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(base, { recursive: true, force: true });
  }
});

test('transport metadata changes frame identity but never crossing identity', async () => {
  const signed = await crossing();

  const one = await makeTransportFrame(
    signed,
    'file-bundle',
    '2026-10-01T21:21:00.000Z',
    'road one',
  );
  const two = await makeTransportFrame(
    signed,
    'file-bundle',
    '2026-10-01T21:22:00.000Z',
    'road two',
  );

  assert.notEqual(one.transport_id, two.transport_id);
  assert.equal(one.crossing_id, two.crossing_id);
  assert.equal(one.canonical_body_sha256, two.canonical_body_sha256);
  assert.equal(one.body, two.body);
});

test('transport frame rejects sidecars, route tampering, body tampering, and kind mismatch', async () => {
  const signed = await crossing();
  const frame = await makeTransportFrame(
    signed,
    'file-bundle',
    '2026-10-01T21:23:00.000Z',
    'hostile fixture',
  );

  const sidecar = { ...frame, unsigned_hint: 'smuggle me' };
  await assert.rejects(
    () => verifyAndExtractTransportFrame(sidecar),
    /UNEXPECTED_TRANSPORT_FRAME_FIELD/,
  );

  const routeTamper = { ...frame, route_note: 'changed after framing' };
  await assert.rejects(
    () => verifyAndExtractTransportFrame(routeTamper),
    /INVALID_TRANSPORT_FRAME_ID/,
  );

  const bodyTamper = { ...frame, body: frame.body.replace('R6_TEST', 'R6_EVIL') };
  await assert.rejects(
    () => verifyAndExtractTransportFrame(bodyTamper),
    /TRANSPORT_BODY_HASH_MISMATCH/,
  );

  const wrongKind = { ...frame, transport: 'http-relay' as const };
  await assert.rejects(
    () => verifyAndExtractTransportFrame(wrongKind),
    /INVALID_TRANSPORT_FRAME_ID/,
  );
});
