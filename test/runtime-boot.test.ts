import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function makeCrossing() {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:runtime-boot-unit',
    source_world: 'world:runtime-boot-unit',
    source_history_head: 'local:runtime-boot-unit:head',
    parents: [],
    declared_kind: 'RUNTIME_BOOT_UNIT',
    payload_refs: [{
      address: 'sha256:' + 'f'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-02T01:05:00.000Z',
    extensions: {},
  }, keys);
}

test('runtime boots, processes one crossing, and reconstructs the same local history', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-runtime-boot-unit-'));
  const root = join(workspace, 'runtime');

  try {
    const manifest = createWorldManifest({
      world_id: 'world:runtime-boot-unit',
      receiver_particular: 'particular:runtime-boot-receiver',
      receiver_contract_ref: 'relatte:runtime-boot-unit/v0',
      road_memory_failure_threshold: 1,
      road_memory_cooldown_ms: 60_000,
      pulse_interval_ms: 25,
    });

    const runtime = await ReLatteRuntime.create({
      root,
      manifest,
      created_at: '2026-10-02T01:05:01.000Z',
    });

    const crossing = await makeCrossing();
    await runtime.enqueueCrossing({
      crossing,
      enqueued_at: '2026-10-02T01:05:02.000Z',
      source: 'unit-test',
    });

    const before = await runtime.snapshot();
    assert.equal(before.pending_inbox.length, 1);
    assert.equal(before.receiver.received.length, 0);

    const pulse = await runtime.pulseOne({
      claimed_at: '2026-10-02T01:05:03.000Z',
      received_at: '2026-10-02T01:05:04.000Z',
      committed_at: '2026-10-02T01:05:05.000Z',
    });

    assert.equal(pulse.status, 'processed');
    assert.equal(pulse.crossing_id, crossing.crossing_id);

    const after = await runtime.snapshot();
    assert.equal(after.pending_inbox.length, 0);
    assert.equal(after.processed_inbox.length, 1);
    assert.deepEqual(after.receiver.received, [crossing.crossing_id]);
    assert.deepEqual(after.receiver.admitted, []);
    assert.equal(after.published_receipt_ids.length, 1);

    const receiverState = after.receiver.state_ref;
    const receiptId = after.published_receipt_ids[0];

    const reopened = await ReLatteRuntime.open({
      root,
      created_at: '2026-10-02T01:05:06.000Z',
    });
    const replayed = await reopened.snapshot();

    assert.equal(replayed.receiver.state_ref, receiverState);
    assert.deepEqual(replayed.receiver.received, [crossing.crossing_id]);
    assert.deepEqual(replayed.receiver.admitted, []);
    assert.deepEqual(replayed.published_receipt_ids, [receiptId]);

    const idle = await reopened.pulseOne({
      claimed_at: '2026-10-02T01:05:07.000Z',
      received_at: '2026-10-02T01:05:07.000Z',
      committed_at: '2026-10-02T01:05:07.000Z',
    });
    assert.equal(idle.status, 'idle');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('manifest forbids runtime-level automatic disposition', async () => {
  const manifest = createWorldManifest({
    world_id: 'world:runtime-manifest-unit',
    receiver_particular: 'particular:runtime-manifest-unit',
    receiver_contract_ref: 'relatte:runtime-manifest-unit/v0',
  });

  assert.equal(manifest.runtime.automatic_disposition, null);
  assert.ok(manifest.laws.includes('RUNTIME != RECEIVER AUTHORITY'));
});
