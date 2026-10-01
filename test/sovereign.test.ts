import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  buildSovereignResponseBundle,
  generateP256KeyPair,
  sealCrossingEnvelope,
  summarizeSovereignResponse,
  verifyCrossingEnvelope,
  verifyReceipt,
  verifySovereignResponseBundle,
} from '../src/index.ts';

async function sourceCrossing(): Promise<any> {
  const sourceKeys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:node-a',
    source_world: 'world:node-a',
    source_history_head: 'local:node-a:head-001',
    parents: [],
    declared_kind: 'R4_R5_TEST',
    payload_refs: [{
      address: 'sha256:' + '4'.repeat(64),
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
    return_address: 'relatte:return:node-a',
    created_at: '2026-10-01T20:50:00.000Z',
    extensions: {
      specimen: 'SOVEREIGN-NODES-001',
    },
  }, sourceKeys);
}

test('A sends one signed crossing to sovereign B, which verifies and returns signed local receipts', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r4-'));
  try {
    const nodeB = await LocalReceiver.create(join(base, 'node-b'), {
      world_id: 'world:node-b',
      receiver_particular: 'particular:node-b',
      contract_ref: 'contract:node-b-local-law/v0',
    });
    const crossing = await sourceCrossing();
    assert.equal(await verifyCrossingEnvelope(crossing), true);

    const received = await nodeB.receive(crossing, '2026-10-01T20:51:00.000Z');
    const disposition = await nodeB.dispose(
      crossing.crossing_id,
      'ADMIT',
      '2026-10-01T20:52:00.000Z',
      {
        admit_effect: 'node-b-local-descendant',
        descendant_refs: ['artifact:node-b-descendant-001'],
      },
    );

    assert.equal(await verifyReceipt(received), true);
    assert.equal(await verifyReceipt(disposition), true);

    const returned = buildSovereignResponseBundle(nodeB, crossing.crossing_id);
    assert.equal(await verifySovereignResponseBundle(returned, crossing.crossing_id), true);

    const sourceView = summarizeSovereignResponse(returned);
    assert.equal(sourceView.world_id, 'world:node-b');
    assert.equal(sourceView.disposition, 'R3_ADMIT');
    assert.equal(sourceView.semantic_effect, 'node-b-local-descendant');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('same source crossing can produce B ADMIT and C REFUSE in independent durable histories', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r5-'));
  try {
    const nodeBRoot = join(base, 'node-b');
    const nodeCRoot = join(base, 'node-c');

    const nodeB = await LocalReceiver.create(nodeBRoot, {
      world_id: 'world:node-b',
      receiver_particular: 'particular:node-b',
      contract_ref: 'contract:node-b-local-law/v0',
    });
    const nodeC = await LocalReceiver.create(nodeCRoot, {
      world_id: 'world:node-c',
      receiver_particular: 'particular:node-c',
      contract_ref: 'contract:node-c-local-law/v0',
    });

    assert.notEqual(nodeB.root, nodeC.root);

    const crossing = await sourceCrossing();

    const receiveB = await nodeB.receive(crossing, '2026-10-01T20:53:00.000Z');
    const receiveC = await nodeC.receive(crossing, '2026-10-01T20:54:00.000Z');
    const admitB = await nodeB.dispose(
      crossing.crossing_id,
      'ADMIT',
      '2026-10-01T20:55:00.000Z',
      {
        admit_effect: 'node-b-local-descendant',
        descendant_refs: ['artifact:node-b-descendant-001'],
      },
    );
    const refuseC = await nodeC.dispose(
      crossing.crossing_id,
      'REFUSE',
      '2026-10-01T20:56:00.000Z',
      {
        note: 'node C local law refuses this requested relation',
      },
    );

    assert.equal(receiveB.crossing_id, receiveC.crossing_id);
    assert.equal(admitB.crossing_id, refuseC.crossing_id);
    assert.equal(admitB.crossing_id, crossing.crossing_id);
    assert.equal(admitB.kind, 'R3_ADMIT');
    assert.equal(refuseC.kind, 'R3_REFUSE');
    assert.equal(refuseC.semantic_effect, 'none');

    assert.notDeepEqual(receiveB.signing.public_key, receiveC.signing.public_key);
    assert.notDeepEqual(admitB.signing.public_key, refuseC.signing.public_key);

    const responseB = buildSovereignResponseBundle(nodeB, crossing.crossing_id);
    const responseC = buildSovereignResponseBundle(nodeC, crossing.crossing_id);

    assert.equal(await verifySovereignResponseBundle(responseB, crossing.crossing_id), true);
    assert.equal(await verifySovereignResponseBundle(responseC, crossing.crossing_id), true);
    assert.notEqual(responseB.bundle_id, responseC.bundle_id);

    const summaryB = summarizeSovereignResponse(responseB);
    const summaryC = summarizeSovereignResponse(responseC);
    assert.deepEqual(
      new Set([summaryB.disposition, summaryC.disposition]),
      new Set(['R3_ADMIT', 'R3_REFUSE']),
    );

    const snapshotB = nodeB.snapshot();
    const snapshotC = nodeC.snapshot();
    assert.notEqual(snapshotB.world_id, snapshotC.world_id);
    assert.notEqual(snapshotB.state_ref, snapshotC.state_ref);
    assert.notEqual(snapshotB.history_head, snapshotC.history_head);
    assert.deepEqual(snapshotB.admitted, [crossing.crossing_id]);
    assert.deepEqual(snapshotC.refused, [crossing.crossing_id]);

    const reopenedB = await LocalReceiver.open(nodeBRoot);
    const reopenedC = await LocalReceiver.open(nodeCRoot);
    assert.deepEqual(reopenedB.snapshot(), snapshotB);
    assert.deepEqual(reopenedC.snapshot(), snapshotC);

    const returnedBAfterRestart = buildSovereignResponseBundle(reopenedB, crossing.crossing_id);
    const returnedCAfterRestart = buildSovereignResponseBundle(reopenedC, crossing.crossing_id);
    assert.equal(returnedBAfterRestart.bundle_id, responseB.bundle_id);
    assert.equal(returnedCAfterRestart.bundle_id, responseC.bundle_id);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('source-side verification rejects tampered or cross-wired response bundles', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r4-tamper-'));
  try {
    const nodeB = await LocalReceiver.create(join(base, 'node-b'), {
      world_id: 'world:node-b',
      receiver_particular: 'particular:node-b',
      contract_ref: 'contract:node-b-local-law/v0',
    });
    const nodeC = await LocalReceiver.create(join(base, 'node-c'), {
      world_id: 'world:node-c',
      receiver_particular: 'particular:node-c',
      contract_ref: 'contract:node-c-local-law/v0',
    });
    const crossing = await sourceCrossing();

    await nodeB.receive(crossing, '2026-10-01T20:57:00.000Z');
    await nodeB.dispose(crossing.crossing_id, 'ADMIT', '2026-10-01T20:58:00.000Z');

    await nodeC.receive(crossing, '2026-10-01T20:59:00.000Z');
    await nodeC.dispose(crossing.crossing_id, 'REFUSE', '2026-10-01T21:00:00.000Z');

    const responseB = buildSovereignResponseBundle(nodeB, crossing.crossing_id);
    const responseC = buildSovereignResponseBundle(nodeC, crossing.crossing_id);

    const tamperedWorld = { ...responseB, world_id: 'world:node-c' };
    assert.equal(await verifySovereignResponseBundle(tamperedWorld, crossing.crossing_id), false);

    const crossWired = {
      ...responseB,
      disposition_receipt: responseC.disposition_receipt,
    };
    assert.equal(await verifySovereignResponseBundle(crossWired, crossing.crossing_id), false);

    const tamperedDisposition = structuredClone(responseB);
    (tamperedDisposition.disposition_receipt as any).semantic_effect = 'global-authority';
    assert.equal(await verifySovereignResponseBundle(tamperedDisposition, crossing.crossing_id), false);

    assert.equal(
      await verifySovereignResponseBundle(
        responseB,
        'relatte-crossing-v0:' + '0'.repeat(64),
      ),
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
