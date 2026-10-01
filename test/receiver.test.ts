import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  generateP256KeyPair,
  sealCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

async function makeRoot(): Promise<{ base: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r3-'));
  return { base, root: join(base, 'node') };
}

async function signedCrossing(index: number): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: `particular:source-${index}`,
    source_world: 'world:r3-source',
    source_history_head: null,
    parents: [],
    declared_kind: 'R3_TEST',
    payload_refs: [{
      address: 'sha256:' + index.toString(16).padStart(64, '0'),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r3-test',
    created_at: `2026-10-01T20:${String(index).padStart(2, '0')}:00.000Z`,
    extensions: {},
  }, keys);
}

test('RECEIVE produces a signed receipt but no admission', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-beta',
      receiver_particular: 'particular:r3-beta',
      contract_ref: 'contract:r3-local/v0',
    });
    const crossing = await signedCrossing(1);

    const receipt = await receiver.receive(crossing, '2026-10-01T21:01:00.000Z');

    assert.equal(await verifyReceipt(receipt), true);
    assert.equal(receipt.kind, 'RECEIVED');
    assert.equal(receipt.semantic_effect, 'none');
    assert.equal(receipt.pre_state_ref, receipt.post_state_ref);

    const snapshot = receiver.snapshot();
    assert.deepEqual(snapshot.received, [crossing.crossing_id]);
    assert.deepEqual(snapshot.admitted, []);
    assert.deepEqual(snapshot.held, []);
    assert.deepEqual(snapshot.refused, []);
    assert.deepEqual(snapshot.returned, []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('duplicate delivery is idempotent and returns the original RECEIVE receipt', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-beta',
      receiver_particular: 'particular:r3-beta',
      contract_ref: 'contract:r3-local/v0',
    });
    const crossing = await signedCrossing(2);

    const first = await receiver.receive(crossing, '2026-10-01T21:02:00.000Z');
    const length = receiver.journalLength();
    const duplicate = await receiver.receive(crossing, '2026-10-01T21:02:30.000Z');

    assert.equal(duplicate.receipt_id, first.receipt_id);
    assert.equal(receiver.journalLength(), length);
    assert.equal(receiver.snapshot().received.length, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('all four R3 dispositions remain distinct and REFUSE has no protected semantic effect', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-beta',
      receiver_particular: 'particular:r3-beta',
      contract_ref: 'contract:r3-local/v0',
    });

    const hold = await signedCrossing(3);
    const admit = await signedCrossing(4);
    const refuse = await signedCrossing(5);
    const returned = await signedCrossing(6);

    for (const [crossing, minute] of [[hold, 3], [admit, 4], [refuse, 5], [returned, 6]] as const) {
      await receiver.receive(crossing, `2026-10-01T21:${String(minute).padStart(2, '0')}:00.000Z`);
    }

    const holdReceipt = await receiver.dispose(hold.crossing_id, 'HOLD', '2026-10-01T22:03:00.000Z');
    const admitReceipt = await receiver.dispose(admit.crossing_id, 'ADMIT', '2026-10-01T22:04:00.000Z', {
      admit_effect: 'descendant-created',
      descendant_refs: ['artifact:r3-descendant-001'],
    });
    const refuseReceipt = await receiver.dispose(refuse.crossing_id, 'REFUSE', '2026-10-01T22:05:00.000Z');
    const returnReceipt = await receiver.dispose(returned.crossing_id, 'RETURN', '2026-10-01T22:06:00.000Z');

    for (const receipt of [holdReceipt, admitReceipt, refuseReceipt, returnReceipt]) {
      assert.equal(await verifyReceipt(receipt), true);
    }

    assert.equal(holdReceipt.kind, 'R3_HOLD');
    assert.equal(holdReceipt.semantic_effect, 'none');
    assert.equal(admitReceipt.kind, 'R3_ADMIT');
    assert.equal(admitReceipt.semantic_effect, 'descendant-created');
    assert.deepEqual(admitReceipt.descendant_refs, ['artifact:r3-descendant-001']);
    assert.equal(refuseReceipt.kind, 'R3_REFUSE');
    assert.equal(refuseReceipt.semantic_effect, 'none');
    assert.equal(refuseReceipt.extensions.local_receiver.protected_payload_effect, false);
    assert.equal(returnReceipt.kind, 'R3_RETURN');
    assert.equal(returnReceipt.semantic_effect, 'return-created');
    assert.equal(returnReceipt.extensions.local_receiver.protected_payload_effect, false);

    const snapshot = receiver.snapshot();
    assert.deepEqual(snapshot.held, [hold.crossing_id]);
    assert.deepEqual(snapshot.admitted, [admit.crossing_id]);
    assert.deepEqual(snapshot.refused, [refuse.crossing_id]);
    assert.deepEqual(snapshot.returned, [returned.crossing_id]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('receiver reconstructs the same local state and identity after restart', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-restart',
      receiver_particular: 'particular:r3-restart',
      contract_ref: 'contract:r3-local/v0',
    });
    const admitted = await signedCrossing(7);
    const refused = await signedCrossing(8);

    const receiveA = await receiver.receive(admitted, '2026-10-01T21:07:00.000Z');
    await receiver.dispose(admitted.crossing_id, 'ADMIT', '2026-10-01T22:07:00.000Z');
    await receiver.receive(refused, '2026-10-01T21:08:00.000Z');
    const refuseReceipt = await receiver.dispose(refused.crossing_id, 'REFUSE', '2026-10-01T22:08:00.000Z');

    const before = receiver.snapshot();
    const beforeLength = receiver.journalLength();

    const reopened = await LocalReceiver.open(root);
    const after = reopened.snapshot();

    assert.deepEqual(after, before);
    assert.equal(reopened.journalLength(), beforeLength);

    const duplicateReceive = await reopened.receive(admitted, '2026-10-01T23:07:00.000Z');
    assert.equal(duplicateReceive.receipt_id, receiveA.receipt_id);
    assert.equal(reopened.journalLength(), beforeLength);

    const duplicateDisposition = await reopened.dispose(
      refused.crossing_id,
      'REFUSE',
      '2026-10-01T23:08:00.000Z',
    );
    assert.equal(duplicateDisposition.receipt_id, refuseReceipt.receipt_id);
    assert.equal(reopened.journalLength(), beforeLength);

    await assert.rejects(
      () => reopened.dispose(refused.crossing_id, 'ADMIT', '2026-10-01T23:09:00.000Z'),
      /CROSSING_ALREADY_DISPOSED/,
    );

    assert.deepEqual(
      reopened.getReceiveReceipt(admitted.crossing_id)?.signing.public_key,
      receiveA.signing.public_key,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('hash-chained journal detects local history tampering on restart', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-tamper',
      receiver_particular: 'particular:r3-tamper',
      contract_ref: 'contract:r3-local/v0',
    });
    const crossing = await signedCrossing(9);
    await receiver.receive(crossing, '2026-10-01T21:09:00.000Z');
    await receiver.dispose(crossing.crossing_id, 'REFUSE', '2026-10-01T22:09:00.000Z');

    const journalPath = join(root, 'journal.jsonl');
    const lines = (await readFile(journalPath, 'utf8')).trim().split('\n');
    const event = JSON.parse(lines[1]);
    event.receipt.note = 'tampered after the fact';
    lines[1] = JSON.stringify(event);
    await writeFile(journalPath, lines.join('\n') + '\n', 'utf8');

    await assert.rejects(() => LocalReceiver.open(root), /INVALID_RECEIVER_EVENT_HASH|INVALID_RECEIVER_RECEIPT/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('invalid crossing is rejected before it enters local history', async () => {
  const { base, root } = await makeRoot();
  try {
    const receiver = await LocalReceiver.create(root, {
      world_id: 'world:r3-invalid',
      receiver_particular: 'particular:r3-invalid',
      contract_ref: 'contract:r3-local/v0',
    });
    const crossing = await signedCrossing(10);
    const invalid = { ...crossing, source_world: 'world:tampered' };

    await assert.rejects(
      () => receiver.receive(invalid, '2026-10-01T21:10:00.000Z'),
      /INVALID_CROSSING/,
    );
    assert.equal(receiver.journalLength(), 0);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
