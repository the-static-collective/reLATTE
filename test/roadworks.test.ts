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
  sealCrossingEnvelope,
} from '../src/index.ts';
import { dispatchRoadworks } from '../src/roadworks.ts';

async function listen(server: ReturnType<typeof createHttpRelayServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/relatte/v0/crossings';
}

async function close(server: ReturnType<typeof createHttpRelayServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}

test('real localhost socket failover preserves one crossing and one receiver history', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-roadworks-'));
  const receiver = await LocalReceiver.create(join(base, 'receiver'), {
    world_id: 'world:roadworks',
    receiver_particular: 'particular:roadworks',
    contract_ref: 'contract:roadworks-lab/v0',
  });
  const signer = await generateP256KeyPair();
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:roadworks-source',
    source_world: 'world:roadworks-source',
    source_history_head: 'local:roadworks:head-001',
    parents: [],
    declared_kind: 'ROADWORKS_TEST',
    payload_refs: [{
      address: 'sha256:' + '7'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: { kind: 'candidate-local-adaptation', authority: 'receiver-local' },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:roadworks',
    created_at: '2026-10-13T15:00:00.000Z',
    extensions: { specimen: 'ROADWORKS-001' },
  }, signer);

  // Route A reaches the receiver but loses its acknowledgment.
  const first = createHttpRelayServer(async (incoming) => {
    await receiver.receive(incoming, '2026-10-13T15:01:00.000Z');
    throw new Error('simulated-ack-loss');
  });
  const second = createHttpRelayServer(async (incoming) => {
    await receiver.receive(incoming, '2026-10-13T15:02:00.000Z');
  });

  try {
    const firstUrl = await listen(first);
    const secondUrl = await listen(second);
    const urls: Record<string, string> = { 'lab-one': firstUrl, 'lab-two': secondUrl };

    const delivery = await dispatchRoadworks(crossing.crossing_id, [
      { id: 'lab-one', kind: 'loopback-http' },
      { id: 'lab-two', kind: 'loopback-http' },
    ], {
      allowedRoadIds: ['lab-one', 'lab-two'],
      allowedKinds: ['loopback-http'],
      maxAttempts: 2,
    }, async (road) => {
      const frame = await makeTransportFrame(
        crossing,
        'http-relay',
        '2026-10-13T15:03:00.000Z',
        'ROADWORKS-001 ' + road.id,
      );
      const transportAck = await postHttpTransport(urls[road.id], frame);
      return { frame_id: frame.transport_id!, ack: transportAck };
    });

    assert.equal(delivery.crossing_id, crossing.crossing_id);
    assert.equal(delivery.road_id, 'lab-two');
    assert.deepEqual(delivery.attempts.map((a) => a.result), ['failed', 'transport-ack']);
    assert.equal(delivery.semantic_effect, 'none');
    assert.equal(receiver.journalLength(), 1);
    assert.deepEqual(receiver.snapshot().received, [crossing.crossing_id]);
    assert.deepEqual(receiver.snapshot().admitted, []);
    assert.ok(receiver.getReceiveReceipt(crossing.crossing_id));
  } finally {
    await close(first);
    await close(second);
    await rm(base, { recursive: true, force: true });
  }
});
