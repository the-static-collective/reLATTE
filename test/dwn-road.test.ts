import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import { DidKey, UniversalResolver } from '@web5/dids';
import {
  DataStoreLevel,
  Dwn,
  EventLogLevel,
  Jws,
  MessageStoreLevel,
  ResumableTaskStoreLevel,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';

import {
  LocalReceiver,
  createHttpRelayServer,
  generateP256KeyPair,
  makeTransportFrame,
  postHttpTransport,
  readFileBundle,
  sealCrossingEnvelope,
  writeFileBundle,
} from '../src/index.ts';
import {
  readCrossingFromDwn,
  writeCrossingToDwn,
} from '../src/dwn-road.ts';

async function crossing(): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:dwn-road-source',
    source_world: 'world:dwn-road-source',
    source_history_head: 'local:dwn-road-source:head-001',
    parents: [],
    declared_kind: 'DWN_ROAD_001',
    payload_refs: [{
      address: 'sha256:' + 'd'.repeat(64),
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
    return_address: 'relatte:return:dwn-road-source',
    created_at: '2026-10-01T22:40:00.000Z',
    extensions: {
      specimen: 'DWN-ROAD-001',
    },
  }, keys);
}

async function openDwn(base: string): Promise<Dwn> {
  const didResolver = new UniversalResolver({ didResolvers: [DidKey] });
  return Dwn.create({
    didResolver,
    messageStore: new MessageStoreLevel({
      blockstoreLocation: join(base, 'messages'),
      indexLocation: join(base, 'index'),
    }),
    dataStore: new DataStoreLevel({
      blockstoreLocation: join(base, 'data'),
    }),
    eventLog: new EventLogLevel({
      location: join(base, 'events'),
    }),
    resumableTaskStore: new ResumableTaskStoreLevel({
      location: join(base, 'tasks'),
    }),
  });
}

test('actual in-process DWN RecordsWrite/RecordsRead preserves the signed reLATTE traveler', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-dwn-road-'));
  const dwn = await openDwn(base);

  try {
    const tenant = await TestDataGenerator.generateDidKeyPersona();
    const signer = Jws.createSigner(tenant);
    const signed = await crossing();

    const road = await writeCrossingToDwn({
      dwn,
      tenant_did: tenant.did,
      signer,
      crossing: signed,
    });

    assert.equal(road.dwn_status, 202);
    assert.equal(road.semantic_effect, 'none');
    assert.equal(road.crossing_id, signed.crossing_id);
    assert.notEqual(road.dwn_record_id, signed.crossing_id);
    assert.ok(road.laws.includes('DWN ACCEPTED != RELATTE ADMITTED'));

    const recovered = await readCrossingFromDwn({
      dwn,
      tenant_did: tenant.did,
      signer,
      record_id: road.dwn_record_id,
    });

    assert.deepEqual(recovered, signed);
    assert.equal(recovered.crossing_id, signed.crossing_id);
  } finally {
    await dwn.close();
    await rm(base, { recursive: true, force: true });
  }
});

test('file, HTTP, and DWN roads converge on one receiver history while DWN acceptance grants no admission', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-dwn-three-road-'));
  const dwn = await openDwn(join(base, 'dwn'));
  let server: ReturnType<typeof createHttpRelayServer> | null = null;

  try {
    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:dwn-road-receiver',
      receiver_particular: 'particular:dwn-road-receiver',
      contract_ref: 'contract:dwn-road-local-law/v0',
    });
    const signed = await crossing();

    const fileFrame = await makeTransportFrame(
      signed,
      'file-bundle',
      '2026-10-01T22:41:00.000Z',
      'file road before DWN',
    );
    const bundlePath = join(base, 'crossing.bundle.json');
    await writeFileBundle(bundlePath, fileFrame);
    const fileDelivery = await readFileBundle(bundlePath);
    const firstReceipt = await receiver.receive(
      fileDelivery.crossing,
      '2026-10-01T22:42:00.000Z',
    );
    assert.equal(receiver.journalLength(), 1);

    server = createHttpRelayServer(async (incoming) => {
      await receiver.receive(incoming, '2026-10-01T22:44:00.000Z');
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;

    const httpFrame = await makeTransportFrame(
      signed,
      'http-relay',
      '2026-10-01T22:43:00.000Z',
      'HTTP road before DWN',
    );
    const ack = await postHttpTransport(
      `http://127.0.0.1:${address.port}/relatte/v0/crossings`,
      httpFrame,
    );
    assert.equal(ack.crossing_id, signed.crossing_id);
    assert.equal(receiver.journalLength(), 1);

    const tenant = await TestDataGenerator.generateDidKeyPersona();
    const signer = Jws.createSigner(tenant);
    const dwnRoad = await writeCrossingToDwn({
      dwn,
      tenant_did: tenant.did,
      signer,
      crossing: signed,
    });
    assert.equal(dwnRoad.semantic_effect, 'none');

    const fromDwn = await readCrossingFromDwn({
      dwn,
      tenant_did: tenant.did,
      signer,
      record_id: dwnRoad.dwn_record_id,
    });
    const duplicateReceipt = await receiver.receive(
      fromDwn,
      '2026-10-01T22:45:00.000Z',
    );

    assert.equal(duplicateReceipt.receipt_id, firstReceipt.receipt_id);
    assert.equal(receiver.journalLength(), 1);
    assert.deepEqual(receiver.snapshot().admitted, []);
    assert.deepEqual(receiver.snapshot().refused, []);

    const refused = await receiver.dispose(
      signed.crossing_id,
      'REFUSE',
      '2026-10-01T22:46:00.000Z',
      { note: 'DWN storage succeeded; receiver still refuses semantic effect' },
    );

    assert.equal(refused.semantic_effect, 'none');
    assert.deepEqual(receiver.snapshot().admitted, []);
    assert.deepEqual(receiver.snapshot().refused, [signed.crossing_id]);
    assert.equal(receiver.journalLength(), 2);
  } finally {
    await new Promise<void>((resolve) => {
      if (!server?.listening) return resolve();
      server.close(() => resolve());
    });
    await dwn.close();
    await rm(base, { recursive: true, force: true });
  }
});
