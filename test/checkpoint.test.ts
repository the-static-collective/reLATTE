import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  commitReceiptSetToGit,
  createReceiptSetCommitment,
  generateP256KeyPair,
  initializeGitCheckpointWitness,
  readCommittedCheckpointObject,
  sealCrossingEnvelope,
  verifyGitCheckpointWitness,
  verifyReceipt,
  verifyReceiptSetAgainstReceipts,
  verifyReceiptSetCommitmentShape,
} from '../src/index.ts';

async function crossing(index: number): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: `particular:r11-source-${index}`,
    source_world: 'world:r11-source',
    source_history_head: null,
    parents: [],
    declared_kind: 'R11_CHECKPOINT_EVENT',
    payload_refs: [{
      address: 'sha256:' + index.toString(16).padStart(64, '0'),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r11',
    created_at: `2026-10-01T23:${String(index).padStart(2, '0')}:00.000Z`,
    extensions: {},
  }, keys);
}

async function localHistory(base: string): Promise<{
  receiver: LocalReceiver;
  receipts: any[];
}> {
  const receiver = await LocalReceiver.create(join(base, 'receiver'), {
    world_id: 'world:r11-local',
    receiver_particular: 'particular:r11-local',
    contract_ref: 'contract:r11-local/v0',
  });

  const a = await crossing(1);
  const b = await crossing(2);

  const receiveA = await receiver.receive(a, '2026-10-01T23:11:00.000Z');
  const admitA = await receiver.dispose(
    a.crossing_id,
    'ADMIT',
    '2026-10-01T23:12:00.000Z',
    {
      admit_effect: 'r11-local-consequence',
      descendant_refs: ['artifact:r11-descendant-001'],
    },
  );

  const receiveB = await receiver.receive(b, '2026-10-01T23:13:00.000Z');
  const refuseB = await receiver.dispose(
    b.crossing_id,
    'REFUSE',
    '2026-10-01T23:14:00.000Z',
  );

  return {
    receiver,
    receipts: [receiveA, admitA, receiveB, refuseB],
  };
}

test('receipt-set commitment is deterministic, order-independent, and locally verifiable', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r11-root-'));
  try {
    const { receiver, receipts } = await localHistory(base);
    const snapshot = receiver.snapshot();

    const one = await createReceiptSetCommitment({
      world_id: snapshot.world_id,
      local_history_head: snapshot.history_head,
      receipts,
      created_at: '2026-10-01T23:15:00.000Z',
    });

    const two = await createReceiptSetCommitment({
      world_id: snapshot.world_id,
      local_history_head: snapshot.history_head,
      receipts: [...receipts].reverse(),
      created_at: '2026-10-01T23:15:00.000Z',
    });

    assert.equal(verifyReceiptSetCommitmentShape(one), true);
    assert.equal(one.receipt_set_root, two.receipt_set_root);
    assert.equal(one.commitment_id, two.commitment_id);
    assert.equal(one.receipt_count, 4);
    assert.equal(
      await verifyReceiptSetAgainstReceipts(one, receipts),
      true,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('Git witnesses one exact commitment without becoming history authority', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r11-git-'));
  try {
    const { receiver, receipts } = await localHistory(base);
    const snapshot = receiver.snapshot();

    const commitment = await createReceiptSetCommitment({
      world_id: snapshot.world_id,
      local_history_head: snapshot.history_head,
      receipts,
      created_at: '2026-10-01T23:16:00.000Z',
    });

    const gitRoot = join(base, 'foreign-git');
    await initializeGitCheckpointWitness(gitRoot);

    const witness = await commitReceiptSetToGit({
      repo_path: gitRoot,
      commitment,
      witnessed_at: '2026-10-01T23:17:00.000Z',
    });

    assert.match(witness.commit_sha, /^[0-9a-f]{40,64}$/);
    assert.equal(witness.receipt_set_root, commitment.receipt_set_root);
    assert.equal(witness.commitment_id, commitment.commitment_id);
    assert.equal(witness.semantic_effect, 'none');
    assert.equal(witness.authority, null);
    assert.equal(
      await verifyGitCheckpointWitness({
        repo_path: gitRoot,
        commitment,
        witness,
      }),
      true,
    );

    const committed = await readCommittedCheckpointObject({
      repo_path: gitRoot,
      witness,
    });
    assert.deepEqual(committed, commitment);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('foreign checkpoint verifies the declared hash, not the truth of receipt history', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r11-scope-'));
  try {
    const { receiver, receipts } = await localHistory(base);
    const commitment = await createReceiptSetCommitment({
      world_id: receiver.snapshot().world_id,
      local_history_head: receiver.snapshot().history_head,
      receipts,
      created_at: '2026-10-01T23:18:00.000Z',
    });

    const gitRoot = join(base, 'foreign-git');
    await initializeGitCheckpointWitness(gitRoot);
    const witness = await commitReceiptSetToGit({
      repo_path: gitRoot,
      commitment,
      witnessed_at: '2026-10-01T23:19:00.000Z',
    });

    const tamperedReceipts = structuredClone(receipts);
    tamperedReceipts[1].semantic_effect = 'forged-global-authority';

    assert.equal(await verifyReceipt(tamperedReceipts[1]), false);
    assert.equal(
      await verifyReceiptSetAgainstReceipts(
        commitment,
        tamperedReceipts,
      ),
      false,
    );

    // Git still truthfully proves only that this exact commitment existed.
    assert.equal(
      await verifyGitCheckpointWitness({
        repo_path: gitRoot,
        commitment,
        witness,
      }),
      true,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('foreign witness tampering or commitment substitution fails', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r11-tamper-'));
  try {
    const { receiver, receipts } = await localHistory(base);
    const commitment = await createReceiptSetCommitment({
      world_id: receiver.snapshot().world_id,
      local_history_head: receiver.snapshot().history_head,
      receipts,
      created_at: '2026-10-01T23:20:00.000Z',
    });

    const gitRoot = join(base, 'foreign-git');
    await initializeGitCheckpointWitness(gitRoot);
    const witness = await commitReceiptSetToGit({
      repo_path: gitRoot,
      commitment,
      witnessed_at: '2026-10-01T23:21:00.000Z',
    });

    const alteredWitness = structuredClone(witness);
    alteredWitness.receipt_set_root =
      'relatte-receipt-set-v0:' + '0'.repeat(64);
    assert.equal(
      await verifyGitCheckpointWitness({
        repo_path: gitRoot,
        commitment,
        witness: alteredWitness,
      }),
      false,
    );

    const smallerCommitment = await createReceiptSetCommitment({
      world_id: receiver.snapshot().world_id,
      local_history_head: receiver.snapshot().history_head,
      receipts: receipts.slice(0, 2),
      created_at: '2026-10-01T23:20:00.000Z',
    });
    assert.equal(
      await verifyGitCheckpointWitness({
        repo_path: gitRoot,
        commitment: smallerCommitment,
        witness,
      }),
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('deleting the foreign witness does not halt or invalidate local operation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r11-dead-witness-'));
  try {
    const { receiver, receipts } = await localHistory(base);
    const beforeCheckpoint = receiver.snapshot();

    const commitment = await createReceiptSetCommitment({
      world_id: beforeCheckpoint.world_id,
      local_history_head: beforeCheckpoint.history_head,
      receipts,
      created_at: '2026-10-01T23:22:00.000Z',
    });

    const gitRoot = join(base, 'foreign-git');
    await initializeGitCheckpointWitness(gitRoot);
    const witness = await commitReceiptSetToGit({
      repo_path: gitRoot,
      commitment,
      witnessed_at: '2026-10-01T23:23:00.000Z',
    });
    assert.equal(
      await verifyGitCheckpointWitness({
        repo_path: gitRoot,
        commitment,
        witness,
      }),
      true,
    );

    await rm(gitRoot, { recursive: true, force: true });

    // Local history still verifies independently after the foreign witness dies.
    assert.equal(
      await verifyReceiptSetAgainstReceipts(commitment, receipts),
      true,
    );

    const reopened = await LocalReceiver.open(join(base, 'receiver'));
    assert.deepEqual(reopened.snapshot(), beforeCheckpoint);

    // Local operation continues and grows new history with no checkpoint service.
    const c = await crossing(3);
    const receiveC = await reopened.receive(
      c,
      '2026-10-01T23:24:00.000Z',
    );
    const admitC = await reopened.dispose(
      c.crossing_id,
      'ADMIT',
      '2026-10-01T23:25:00.000Z',
    );

    assert.equal(await verifyReceipt(receiveC), true);
    assert.equal(await verifyReceipt(admitC), true);
    assert.notEqual(
      reopened.snapshot().history_head,
      beforeCheckpoint.history_head,
    );

    await assert.rejects(
      () => readCommittedCheckpointObject({
        repo_path: gitRoot,
        witness,
      }),
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
