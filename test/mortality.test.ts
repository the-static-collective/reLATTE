import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  MirrorStore,
  commitReceiptSetToGit,
  createReceiptSetCommitment,
  createSuccessionCapsule,
  generateP256KeyPair,
  initializeGitCheckpointWitness,
  readSuccessionCapsule,
  reconstituteSuccessor,
  sealCrossingEnvelope,
  sealPublishedClaim,
  storeSuccessionCapsule,
  verifyGitCheckpointWitness,
  verifyReceipt,
  verifySuccessionCapsule,
} from '../src/index.ts';

async function sourceArtifact(index: number): Promise<{
  crossing: any;
  published: any;
}> {
  const keys = await generateP256KeyPair();
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: `particular:r12-source-${index}`,
    source_world: `world:r12-source-${index}`,
    source_history_head: null,
    parents: [],
    declared_kind: 'R12_RECOVERABLE_ARTIFACT',
    payload_refs: [{
      address: 'sha256:' + index.toString(16).padStart(64, '0'),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r12',
    created_at: `2026-10-02T00:0${index}:00.000Z`,
    extensions: {
      specimen: 'MORTALITY-TEST-001',
    },
  }, keys);
  const published = await sealPublishedClaim(
    crossing,
    keys,
    `2026-10-02T00:1${index}:00.000Z`,
  );
  return { crossing, published };
}

async function buildPredecessor(base: string): Promise<{
  nodeRoot: string;
  node: LocalReceiver;
  artifacts: Array<{ crossing: any; published: any }>;
  historicalReceipts: any[];
  checkpoint: any;
  gitRoot: string;
  seed: any;
  capsule: any;
  mirrorBRoot: string;
  mirrorCRoot: string;
  archiveBRoot: string;
  archiveCRoot: string;
}> {
  const nodeRoot = join(base, 'dead-node');
  const node = await LocalReceiver.create(nodeRoot, {
    world_id: 'world:r12-predecessor',
    receiver_particular: 'particular:r12-predecessor',
    contract_ref: 'contract:r12-predecessor/v0',
  });

  const artifacts = [await sourceArtifact(1), await sourceArtifact(2)];
  const [a, b] = artifacts;

  const receiveA = await node.receive(a.crossing, '2026-10-02T00:21:00.000Z');
  const admitA = await node.dispose(
    a.crossing.crossing_id,
    'ADMIT',
    '2026-10-02T00:22:00.000Z',
    {
      admit_effect: 'predecessor-local-use',
      descendant_refs: ['artifact:r12-predecessor-descendant'],
    },
  );
  const receiveB = await node.receive(b.crossing, '2026-10-02T00:23:00.000Z');
  const refuseB = await node.dispose(
    b.crossing.crossing_id,
    'REFUSE',
    '2026-10-02T00:24:00.000Z',
  );

  const historicalReceipts = [receiveA, admitA, receiveB, refuseB];
  const snapshot = node.snapshot();

  const checkpoint = await createReceiptSetCommitment({
    world_id: snapshot.world_id,
    local_history_head: snapshot.history_head,
    receipts: historicalReceipts,
    created_at: '2026-10-02T00:25:00.000Z',
  });

  const gitRoot = join(base, 'foreign-git');
  await initializeGitCheckpointWitness(gitRoot);
  const witness = await commitReceiptSetToGit({
    repo_path: gitRoot,
    commitment: checkpoint,
    witnessed_at: '2026-10-02T00:26:00.000Z',
  });
  assert.equal(
    await verifyGitCheckpointWitness({
      repo_path: gitRoot,
      commitment: checkpoint,
      witness,
    }),
    true,
  );

  const seed = await node.createMortalitySeed({
    anchor_crossing_id: a.crossing.crossing_id,
    recoverable_crossing_ids: [
      a.crossing.crossing_id,
      b.crossing.crossing_id,
    ],
    checkpoint_commitment_id: checkpoint.commitment_id!,
    checkpoint_receipt_set_root: checkpoint.receipt_set_root,
    created_at: '2026-10-02T00:27:00.000Z',
  });
  assert.equal(await verifyReceipt(seed), true);

  const capsule = await createSuccessionCapsule({
    mortality_seed_receipt: seed,
    historical_receipts: historicalReceipts,
    checkpoint_commitment: checkpoint,
    created_at: '2026-10-02T00:28:00.000Z',
  });
  assert.equal(await verifySuccessionCapsule(capsule), true);

  const mirrorBRoot = join(base, 'mirror-b');
  const mirrorCRoot = join(base, 'mirror-c');
  const mirrorB = await MirrorStore.create(mirrorBRoot, {
    world_id: 'world:r12-mirror-b',
    mirror_particular: 'particular:r12-mirror-b',
    contract_ref: 'contract:r12-mirror-b/v0',
  });
  const mirrorC = await MirrorStore.create(mirrorCRoot, {
    world_id: 'world:r12-mirror-c',
    mirror_particular: 'particular:r12-mirror-c',
    contract_ref: 'contract:r12-mirror-c/v0',
  });

  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    await mirrorB.store(
      artifact.crossing,
      artifact.published,
      `2026-10-02T00:3${i}:00.000Z`,
    );
    await mirrorC.store(
      artifact.crossing,
      artifact.published,
      `2026-10-02T00:4${i}:00.000Z`,
    );
  }

  const archiveBRoot = join(base, 'peer-archive-b');
  const archiveCRoot = join(base, 'peer-archive-c');
  await storeSuccessionCapsule(archiveBRoot, capsule);
  await storeSuccessionCapsule(archiveCRoot, capsule);

  return {
    nodeRoot,
    node,
    artifacts,
    historicalReceipts,
    checkpoint,
    gitRoot,
    seed,
    capsule,
    mirrorBRoot,
    mirrorCRoot,
    archiveBRoot,
    archiveCRoot,
  };
}

test('kill predecessor and reconstitute a fresh successor from surviving peers only', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-death-'));
  try {
    const fixture = await buildPredecessor(base);
    const deadSnapshot = fixture.node.snapshot();

    // Literal mortality: remove predecessor root/private key, one mirror,
    // one succession archive, and the foreign checkpoint service.
    await rm(fixture.nodeRoot, { recursive: true, force: true });
    await rm(fixture.mirrorBRoot, { recursive: true, force: true });
    await rm(fixture.archiveBRoot, { recursive: true, force: true });
    await rm(fixture.gitRoot, { recursive: true, force: true });

    await assert.rejects(() => LocalReceiver.open(fixture.nodeRoot));

    const survivingCapsule = await readSuccessionCapsule(
      fixture.archiveCRoot,
    );
    const survivingMirror = await MirrorStore.open(
      fixture.mirrorCRoot,
    );

    const result = await reconstituteSuccessor({
      successor_root: join(base, 'successor'),
      successor_world_id: 'world:r12-successor',
      successor_receiver_particular: 'particular:r12-successor',
      successor_contract_ref: 'contract:r12-successor/v0',
      capsule: survivingCapsule,
      mirror: survivingMirror,
      served_at: '2026-10-02T00:50:00.000Z',
      received_at: '2026-10-02T00:51:00.000Z',
      accepted_at: '2026-10-02T00:52:00.000Z',
    });

    const successorSnapshot = result.receiver.snapshot();
    assert.equal(successorSnapshot.world_id, 'world:r12-successor');
    assert.equal(
      successorSnapshot.receiver_particular,
      'particular:r12-successor',
    );
    assert.notEqual(successorSnapshot.world_id, deadSnapshot.world_id);
    assert.notEqual(
      successorSnapshot.receiver_particular,
      deadSnapshot.receiver_particular,
    );

    assert.deepEqual(
      new Set(successorSnapshot.received),
      new Set(survivingCapsule.recoverable_crossing_ids),
    );
    assert.deepEqual(successorSnapshot.admitted, []);
    assert.deepEqual(successorSnapshot.refused, []);

    assert.equal(result.acceptance_receipt.kind, 'R12_SUCCESSOR_ACCEPTANCE');
    assert.equal(result.acceptance_receipt.semantic_effect, 'none');
    assert.equal(
      result.acceptance_receipt.extensions.succession.authority,
      'fresh-local',
    );
    assert.equal(
      result.acceptance_receipt.extensions.succession.inherited_private_key,
      false,
    );
    assert.equal(
      result.acceptance_receipt.extensions.succession.inherited_admission,
      false,
    );
    assert.notDeepEqual(
      result.acceptance_receipt.signing.public_key,
      survivingCapsule.mortality_seed_receipt.signing.public_key,
    );

    // The successor can now make a fresh local authority decision.
    const freshAdmit = await result.receiver.dispose(
      survivingCapsule.recoverable_crossing_ids[0],
      'ADMIT',
      '2026-10-02T00:53:00.000Z',
      {
        admit_effect: 'successor-fresh-local-use',
      },
    );
    assert.equal(await verifyReceipt(freshAdmit), true);
    assert.equal(freshAdmit.world_id, 'world:r12-successor');
    assert.equal(freshAdmit.kind, 'R3_ADMIT');
    assert.notDeepEqual(
      freshAdmit.signing.public_key,
      survivingCapsule.mortality_seed_receipt.signing.public_key,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('historical receipts remain attributable to the dead node after succession', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-attribution-'));
  try {
    const fixture = await buildPredecessor(base);
    await rm(fixture.nodeRoot, { recursive: true, force: true });

    const capsule = await readSuccessionCapsule(fixture.archiveCRoot);
    assert.equal(await verifySuccessionCapsule(capsule), true);

    for (const receipt of capsule.historical_receipts) {
      assert.equal(await verifyReceipt(receipt), true);
      assert.equal(receipt.world_id, 'world:r12-predecessor');
      assert.equal(
        receipt.receiver_particular,
        'particular:r12-predecessor',
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(receipt.signing.public_key, 'd'),
        false,
      );
    }

    assert.equal(
      capsule.mortality_seed_receipt.world_id,
      'world:r12-predecessor',
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        capsule.mortality_seed_receipt.signing.public_key,
        'd',
      ),
      false,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('surviving mirrors retain source attribution rather than rewriting it to the successor', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-source-attribution-'));
  try {
    const fixture = await buildPredecessor(base);
    await rm(fixture.nodeRoot, { recursive: true, force: true });
    await rm(fixture.mirrorBRoot, { recursive: true, force: true });

    const mirror = await MirrorStore.open(fixture.mirrorCRoot);
    const capsule = await readSuccessionCapsule(fixture.archiveCRoot);

    for (const crossingId of capsule.recoverable_crossing_ids) {
      const served = await mirror.serve(
        crossingId,
        '2026-10-02T00:54:00.000Z',
      );
      assert.equal(served.crossing.crossing_id, crossingId);
      assert.match(served.crossing.source_world, /^world:r12-source-/);
      assert.notEqual(served.crossing.source_world, 'world:r12-successor');
      assert.notEqual(
        served.served_receipt.world_id,
        served.crossing.source_world,
      );
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('successor cannot reuse predecessor world or receiver identity', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-no-impersonation-'));
  try {
    const fixture = await buildPredecessor(base);
    await rm(fixture.nodeRoot, { recursive: true, force: true });

    const mirror = await MirrorStore.open(fixture.mirrorCRoot);
    const capsule = await readSuccessionCapsule(fixture.archiveCRoot);

    await assert.rejects(
      () => reconstituteSuccessor({
        successor_root: join(base, 'fake-successor-world'),
        successor_world_id: 'world:r12-predecessor',
        successor_receiver_particular: 'particular:r12-new',
        successor_contract_ref: 'contract:r12-successor/v0',
        capsule,
        mirror,
        served_at: '2026-10-02T00:55:00.000Z',
        received_at: '2026-10-02T00:56:00.000Z',
        accepted_at: '2026-10-02T00:57:00.000Z',
      }),
      /SUCCESSOR_IDENTITY_MUST_BE_FRESH/,
    );

    await assert.rejects(
      () => reconstituteSuccessor({
        successor_root: join(base, 'fake-successor-particular'),
        successor_world_id: 'world:r12-new',
        successor_receiver_particular: 'particular:r12-predecessor',
        successor_contract_ref: 'contract:r12-successor/v0',
        capsule,
        mirror,
        served_at: '2026-10-02T00:58:00.000Z',
        received_at: '2026-10-02T00:59:00.000Z',
        accepted_at: '2026-10-02T01:00:00.000Z',
      }),
      /SUCCESSOR_IDENTITY_MUST_BE_FRESH/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('succession capsule rejects retcon, key substitution, and unreal recoverability claims', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-hostile-'));
  try {
    const fixture = await buildPredecessor(base);

    const retcon = structuredClone(fixture.capsule);
    retcon.historical_receipts[1].note = 'cleaned up after death';
    assert.equal(await verifySuccessionCapsule(retcon), false);

    const fakeRecoverable = structuredClone(fixture.capsule);
    fakeRecoverable.mortality_seed_receipt.extensions.mortality
      .recoverable_crossing_ids.push(
        'relatte-crossing-v0:' + '0'.repeat(64),
      );
    assert.equal(await verifySuccessionCapsule(fakeRecoverable), false);

    const wrongKeyHistory = structuredClone(fixture.capsule);
    wrongKeyHistory.historical_receipts[0] =
      structuredClone(fixture.capsule.historical_receipts[0]);
    wrongKeyHistory.historical_receipts[0].signing.public_key =
      structuredClone(fixture.capsule.mortality_seed_receipt.signing.public_key);
    wrongKeyHistory.historical_receipts[0].signing.public_key.x =
      wrongKeyHistory.historical_receipts[0].signing.public_key.x
        .replace(/^./, (c: string) => c === 'A' ? 'B' : 'A');
    assert.equal(await verifySuccessionCapsule(wrongKeyHistory), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('surviving peer archives are redundant and independently readable', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r12-peer-archives-'));
  try {
    const fixture = await buildPredecessor(base);

    const b = await readSuccessionCapsule(fixture.archiveBRoot);
    const c = await readSuccessionCapsule(fixture.archiveCRoot);
    assert.equal(b.capsule_id, c.capsule_id);

    await rm(fixture.archiveBRoot, { recursive: true, force: true });
    await assert.rejects(() => access(fixture.archiveBRoot));

    const survivor = await readSuccessionCapsule(fixture.archiveCRoot);
    assert.equal(survivor.capsule_id, c.capsule_id);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
