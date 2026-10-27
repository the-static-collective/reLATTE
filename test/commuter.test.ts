import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import {
  commuteChange, commuterEventId, pollCommuterOnce,
} from '../src/commuter.ts';
import type {
  CommuterChange, CommuterRoute, CommuterCursorStore,
} from '../src/commuter.ts';

const hash = 'sha256:' + 'a'.repeat(64);
const evidence = 'sha256:' + 'b'.repeat(64);

function event(overrides: Partial<CommuterChange> = {}): CommuterChange {
  return {
    schema: 'relatte.commuter-change/v0',
    source_system: 'farm-store',
    source_event_id: 'event-001',
    source_world: 'world:farm-store',
    source_particular: 'particular:farm-store',
    subject_ref: 'customer:opaque-001',
    kind: 'contact.sync',
    payload_ref: hash,
    purpose: 'operational',
    consent: { state: 'unknown', evidence_ref: null },
    occurred_at: '2026-10-27T07:00:00.000Z',
    ...overrides,
  };
}

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'relatte-commuter-'));
  const receiver = await LocalReceiver.create(join(base, 'mailroom'), {
    world_id: 'world:farm-communications',
    receiver_particular: 'particular:farm-mailroom',
    contract_ref: 'contract:communications-owner-rules/v0',
  });
  const sourceKeys = await generateP256KeyPair();
  const deliveries = new Set<string>();
  const route: CommuterRoute = {
    destination: 'farm-email-system',
    capability_ref: 'capability:demo-only',
    source_keys: sourceKeys,
    receiver,
    received_at: () => '2026-10-27T07:05:00.000Z',
    evaluate: async () => ({ disposition: 'ADMIT', reason: 'local receiver allowed this demo event' }),
    apply: async (_change, context) => {
      if (deliveries.has(context.idempotency_key)) return { status: 'already-applied' };
      deliveries.add(context.idempotency_key);
      return { status: 'applied', destination_ref: 'mock:message-001' };
    },
  };
  return { base, route, deliveries };
}

test('without receiver-owned policy, event is signed, received, and held; no send', async () => {
  const { base, route, deliveries } = await setup();
  try {
    delete route.evaluate;
    const output = await commuteChange(event(), route);
    assert.equal(output.status, 'HELD');
    assert.equal(deliveries.size, 0);
    assert.equal(route.receiver.snapshot().received.length, 1);
    assert.equal(route.receiver.snapshot().held.length, 1);
    assert.equal(await verifyReceipt(route.receiver.getReceiveReceipt(output.crossing_id)), true);
    assert.equal(await verifyReceipt(route.receiver.getDispositionReceipt(output.crossing_id)), true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('marketing is held without evidence even if local policy mistakenly admits', async () => {
  const { base, route, deliveries } = await setup();
  try {
    const output = await commuteChange(event({
      purpose: 'marketing',
      kind: 'newsletter.send',
      consent: { state: 'unknown', evidence_ref: null },
    }), route);
    assert.equal(output.status, 'HELD');
    assert.equal(deliveries.size, 0);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('authorized communication receives independent ADMIT and idempotent sink replay', async () => {
  const { base, route, deliveries } = await setup();
  try {
    const change = event();
    const first = await commuteChange(change, route);
    assert.equal(first.status, 'APPLIED');
    assert.equal(deliveries.size, 1);
    assert.equal(route.receiver.snapshot().admitted.length, 1);
    const journalLength = route.receiver.journalLength();
    const reopened = await LocalReceiver.open(join(base, 'mailroom'));
    route.receiver = reopened;
    const again = await commuteChange(change, route);
    assert.equal(again.status, 'ALREADY_APPLIED');
    assert.equal(again.crossing_id, first.crossing_id);
    assert.equal(again.receive_receipt_id, first.receive_receipt_id);
    assert.equal(again.disposition_receipt_id, first.disposition_receipt_id);
    assert.equal(reopened.journalLength(), journalLength);
    assert.equal(deliveries.size, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('rechecking receiver policy blocks later attempts despite prior admission', async () => {
  const { base, route, deliveries } = await setup();
  try {
    const change = event({
      purpose: 'marketing',
      kind: 'newsletter.send',
      consent: { state: 'granted', evidence_ref: evidence },
    });
    const first = await commuteChange(change, route);
    assert.equal(first.status, 'APPLIED');
    route.evaluate = async () => ({ disposition: 'HOLD', reason: 'receiver now sees revoked permission' });
    const second = await commuteChange(change, route);
    assert.equal(second.status, 'BLOCKED');
    assert.equal(deliveries.size, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('poll retries a failed delivery without moving the source cursor', async () => {
  const { base, route, deliveries } = await setup();
  try {
    let checkpoint: string | null = null;
    let attempts = 0;
    const cursor: CommuterCursorStore = {
      read: async () => checkpoint,
      write: async (next) => { checkpoint = next; },
    };
    const source = {
      poll: async (current: string | null) => {
        assert.equal(current, null);
        return { changes: [event()], next_cursor: 'after-001' };
      },
    };
    const actualApply = route.apply!;
    route.apply = async (change, ctx) => {
      attempts++;
      if (attempts === 1) throw new Error('mock mail provider outage');
      return actualApply(change, ctx);
    };
    await assert.rejects(() => pollCommuterOnce(source, cursor, route), /mock mail provider outage/);
    assert.equal(checkpoint, null);
    const results = await pollCommuterOnce(source, cursor, route);
    assert.equal(results[0].status, 'APPLIED');
    assert.equal(checkpoint, 'after-001');
    assert.equal(deliveries.size, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('source event identity is stable and opaque input validation prevents bare emails', () => {
  const first = event();
  assert.equal(commuterEventId(first), commuterEventId({ ...first }));
  assert.notEqual(commuterEventId(first), commuterEventId(event({ source_event_id: 'event-002' })));
  assert.throws(() => commuterEventId(event({ subject_ref: 'person@example.test' })), /COMMUTER_SUBJECT_MUST_BE_OPAQUE/);
  assert.throws(() => commuterEventId(event({ payload_ref: 'https://example.test/customer' })), /INVALID_COMMUTER_PAYLOAD_REF/);
  assert.throws(() => commuterEventId(event({
    purpose: 'suppression',
    consent: { state: 'granted', evidence_ref: evidence },
  })), /INVALID_COMMUTER_SUPPRESSION/);
});
