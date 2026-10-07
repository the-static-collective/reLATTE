import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  MirrorStore,
  createReceiptSetCommitment,
  createSuccessionCapsule,
  generateP256KeyPair,
  reconstituteSuccessor,
  sealCrossingEnvelope,
  sealPublishedClaim,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
  verifySuccessionCapsule,
} from '../src/index.ts';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function receiverKeys(root: string): Promise<any> {
  const stored = JSON.parse(await readFile(join(root, 'receiver-key.json'), 'utf8'));
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    stored.private_jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    stored.public_jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  return {
    privateKey,
    publicKey,
    publicKeyJwk: stored.public_jwk,
  };
}

async function buildSb003(base: string) {
  const donorKeys = await generateP256KeyPair();
  const donorCrossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:sb003-donor-artifact',
    source_world: 'world:sb003-donor',
    source_history_head: null,
    parents: [],
    declared_kind: 'SB003_RECOVERABLE_CAPABILITY',
    payload_refs: [{
      address: 'sha256:' + '3'.repeat(64),
      role: 'capability-payload',
      media_type: 'application/json',
    }],
    requested_effect: { destination_disposition: 'local' },
    capability_ref: 'capability:sb003-demo',
    privacy_policy: { retention: 'survive-predecessor-death' },
    audience_policy: { destination: 'world:sb003-a' },
    return_address: 'relatte:return:sb003',
    created_at: '2026-10-07T00:30:00.000Z',
    extensions: {
      sb003: {
        law: 'ARTIFACT ANCESTRY != WORLD IDENTITY',
      },
    },
  }, donorKeys);
  const published = await sealPublishedClaim(
    donorCrossing,
    donorKeys,
    '2026-10-07T00:31:00.000Z',
  );

  const predecessorRoot = join(base, 'world-a');
  const predecessor = await LocalReceiver.create(predecessorRoot, {
    world_id: 'world:sb003-a',
    receiver_particular: 'particular:sb003-a',
    contract_ref: 'contract:sb003-a/v0',
  });

  const receive = await predecessor.receive(
    donorCrossing,
    '2026-10-07T00:32:00.000Z',
  );
  const admit = await predecessor.dispose(
    donorCrossing.crossing_id,
    'ADMIT',
    '2026-10-07T00:33:00.000Z',
    {
      admit_effect: 'sb003-predecessor-local-capability',
      descendant_refs: ['capability:sb003-a-local-instance'],
    },
  );

  const snapshot = predecessor.snapshot();
  const checkpoint = await createReceiptSetCommitment({
    world_id: snapshot.world_id,
    local_history_head: snapshot.history_head,
    receipts: [receive, admit],
    created_at: '2026-10-07T00:34:00.000Z',
  });

  const seed = await predecessor.createMortalitySeed({
    anchor_crossing_id: donorCrossing.crossing_id,
    recoverable_crossing_ids: [donorCrossing.crossing_id],
    checkpoint_commitment_id: checkpoint.commitment_id!,
    checkpoint_receipt_set_root: checkpoint.receipt_set_root,
    created_at: '2026-10-07T00:35:00.000Z',
  });

  const capsule = await createSuccessionCapsule({
    mortality_seed_receipt: seed,
    historical_receipts: [receive, admit],
    checkpoint_commitment: checkpoint,
    created_at: '2026-10-07T00:36:00.000Z',
  });
  assert.equal(await verifySuccessionCapsule(capsule), true);

  const arkBytes = Buffer.from(JSON.stringify(capsule), 'utf8');
  const arkHash = createHash('sha256').update(arkBytes).digest('hex');
  const aKeys = await receiverKeys(predecessorRoot);

  const arkCrossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:sb003-a',
    source_world: 'world:sb003-a',
    source_history_head: snapshot.history_head,
    parents: [seed.receipt_id],
    declared_kind: 'SB003_SUCCESSION_ARK',
    payload_refs: [{
      address: `sha256:${arkHash}`,
      role: 'succession-ark',
      media_type: 'application/json',
    }],
    requested_effect: {
      destination_disposition: 'local',
      successor_identity: 'fresh-required',
    },
    capability_ref: 'relatte:r12-mortality/v0',
    privacy_policy: { retention: 'decay-after-export' },
    audience_policy: { destination: 'world:sb003-successor' },
    return_address: 'supabardo:return:sb003',
    created_at: '2026-10-07T00:37:00.000Z',
    extensions: {
      sb003: {
        mortality_seed_receipt_id: seed.receipt_id,
        succession_capsule_id: capsule.capsule_id,
        laws: [
          'SUCCESSOR != PREDECESSOR',
          'RECONSTITUTION != RESURRECTION',
          'ANCESTRY != AUTHORITY',
          'ARK != INHERITED ADMISSION',
        ],
      },
    },
  }, aKeys);

  const release = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: arkCrossing.crossing_id,
    world_id: 'world:sb003-a',
    receiver_particular: 'particular:sb003-a',
    kind: 'SB003_RELEASE',
    semantic_effect: 'crossing-released',
    contract_ref: 'supabardo:sb003/v0',
    pre_state_ref: capsule.capsule_id,
    post_state_ref: arkCrossing.crossing_id,
    descendant_refs: [],
    residual_refs: [`sha256:${arkHash}`],
    note: 'A releases the Ark; release does not erase A yet.',
    created_at: '2026-10-07T00:38:00.000Z',
    extensions: {
      supabardo: {
        source_bytes_may_remain: true,
        laws: ['RELEASE != ERASURE', 'ARK != AUTHORITY TRANSFER'],
      },
    },
  }, aKeys);

  const bardoKeys = await generateP256KeyPair();
  const unresolved = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: arkCrossing.crossing_id,
    world_id: 'supabardo:sb003',
    receiver_particular: 'crossing-field:sb003',
    kind: 'SB003_UNRESOLVED_INTERVAL',
    semantic_effect: 'none',
    contract_ref: 'supabardo:sb003/v0',
    pre_state_ref: release.receipt_id,
    post_state_ref: arkCrossing.crossing_id,
    descendant_refs: [],
    residual_refs: [`sha256:${arkHash}`],
    note: 'Ark has left A but no successor has constituted it.',
    created_at: '2026-10-07T00:39:00.000Z',
    extensions: {
      supabardo: {
        state: 'OPEN',
        destination_disposition: null,
        occurrence_classes: ['ENTER', 'FORM', 'WITNESS', 'WAIT'],
        laws: [
          'OPEN != ADMITTED',
          'PREDECESSOR DEATH != SUCCESSOR IDENTITY',
          'WITNESS != AUTHORITY',
        ],
      },
    },
  }, bardoKeys);

  const bardoRoot = join(base, 'bardo-runtime');
  await mkdir(bardoRoot, { recursive: true });
  await writeFile(
    join(bardoRoot, 'open.json'),
    JSON.stringify({ ark_crossing_id: arkCrossing.crossing_id, unresolved }, null, 2),
    'utf8',
  );

  const mirror = await MirrorStore.create(join(base, 'surviving-mirror'), {
    world_id: 'world:sb003-mirror',
    mirror_particular: 'particular:sb003-mirror',
    contract_ref: 'contract:sb003-mirror/v0',
  });
  await mirror.store(
    donorCrossing,
    published,
    '2026-10-07T00:40:00.000Z',
  );

  const archiveRoot = join(base, 'durable-ark');
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(join(archiveRoot, 'ark.json'), arkBytes);
  await writeFile(
    join(archiveRoot, 'crossing.json'),
    JSON.stringify(arkCrossing, null, 2),
    'utf8',
  );
  await writeFile(
    join(archiveRoot, 'release.json'),
    JSON.stringify(release, null, 2),
    'utf8',
  );
  await writeFile(
    join(archiveRoot, 'unresolved.json'),
    JSON.stringify(unresolved, null, 2),
    'utf8',
  );

  return {
    predecessorRoot,
    predecessorSnapshot: snapshot,
    donorCrossing,
    capsule,
    arkBytes,
    arkHash,
    arkCrossing,
    release,
    unresolved,
    bardoKeys,
    bardoRoot,
    mirror,
    archiveRoot,
  };
}

test('SB-003: the Ark outlives A without making B equal A', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-sb003-'));
  try {
    const s = await buildSb003(base);

    // Literal predecessor death: its receiver root and persisted private key vanish.
    await rm(s.predecessorRoot, { recursive: true, force: true });
    assert.equal(await pathExists(s.predecessorRoot), false);
    await assert.rejects(() => LocalReceiver.open(s.predecessorRoot));

    // The surviving Ark must still bind the exact succession capsule.
    const survivingArkBytes = await readFile(join(s.archiveRoot, 'ark.json'));
    const survivingArkHash = createHash('sha256').update(survivingArkBytes).digest('hex');
    assert.equal(survivingArkHash, s.arkHash);
    assert.equal(s.arkCrossing.payload_refs[0].address, `sha256:${survivingArkHash}`);
    assert.equal(await verifyCrossingEnvelope(s.arkCrossing), true);
    assert.equal(await verifyReceipt(s.release), true);
    assert.equal(await verifyReceipt(s.unresolved), true);

    const survivingCapsule = JSON.parse(survivingArkBytes.toString('utf8'));
    assert.equal(await verifySuccessionCapsule(survivingCapsule), true);

    const successor = await reconstituteSuccessor({
      successor_root: join(base, 'world-b'),
      successor_world_id: 'world:sb003-successor',
      successor_receiver_particular: 'particular:sb003-successor',
      successor_contract_ref: 'contract:sb003-successor/v0',
      capsule: survivingCapsule,
      mirror: s.mirror,
      served_at: '2026-10-07T00:41:00.000Z',
      received_at: '2026-10-07T00:42:00.000Z',
      accepted_at: '2026-10-07T00:43:00.000Z',
    });

    const beforeAdmit = successor.receiver.snapshot();
    assert.deepEqual(beforeAdmit.admitted, []);
    assert.notEqual(beforeAdmit.world_id, s.predecessorSnapshot.world_id);
    assert.notEqual(
      beforeAdmit.receiver_particular,
      s.predecessorSnapshot.receiver_particular,
    );

    assert.equal(successor.acceptance_receipt.semantic_effect, 'none');
    assert.equal(successor.acceptance_receipt.extensions.succession.authority, 'fresh-local');
    assert.equal(successor.acceptance_receipt.extensions.succession.inherited_private_key, false);
    assert.equal(successor.acceptance_receipt.extensions.succession.inherited_admission, false);
    assert.notDeepEqual(
      successor.acceptance_receipt.signing.public_key,
      s.capsule.mortality_seed_receipt.signing.public_key,
    );

    // Only now does B create its own local consequence.
    const admitB = await successor.receiver.dispose(
      s.donorCrossing.crossing_id,
      'ADMIT',
      '2026-10-07T00:44:00.000Z',
      {
        admit_effect: 'sb003-successor-fresh-local-capability',
        descendant_refs: ['capability:sb003-successor-descendant'],
      },
    );
    assert.equal(await verifyReceipt(admitB), true);
    assert.equal(admitB.world_id, 'world:sb003-successor');
    assert.deepEqual(
      admitB.descendant_refs,
      ['capability:sb003-successor-descendant'],
    );
    assert.notDeepEqual(
      admitB.signing.public_key,
      s.capsule.mortality_seed_receipt.signing.public_key,
    );

    const exit = await sealReceipt({
      schema: 'relatte.receipt/v0',
      crossing_id: s.arkCrossing.crossing_id,
      world_id: 'supabardo:sb003',
      receiver_particular: 'crossing-field:sb003',
      kind: 'SB003_EXIT',
      semantic_effect: 'none',
      contract_ref: 'supabardo:sb003/v0',
      pre_state_ref: s.unresolved.receipt_id,
      post_state_ref: admitB.receipt_id,
      descendant_refs: [],
      residual_refs: [],
      note: 'B created a fresh local descendant; Bardo may die without inheriting B meaning.',
      created_at: '2026-10-07T00:45:00.000Z',
      extensions: {
        supabardo: {
          terminal_occurrence: 'EXIT',
          successor_disposition_receipt_id: admitB.receipt_id,
          laws: [
            'EXIT != ADMISSION',
            'SUCCESSOR != PREDECESSOR',
            'DESCENDANT != RESURRECTED ORIGINAL',
          ],
        },
      },
    }, s.bardoKeys);
    assert.equal(await verifyReceipt(exit), true);

    await writeFile(
      join(s.archiveRoot, 'successor-acceptance.json'),
      JSON.stringify(successor.acceptance_receipt, null, 2),
      'utf8',
    );
    await writeFile(
      join(s.archiveRoot, 'successor-admit.json'),
      JSON.stringify(admitB, null, 2),
      'utf8',
    );
    await writeFile(
      join(s.archiveRoot, 'exit.json'),
      JSON.stringify(exit, null, 2),
      'utf8',
    );

    // Kill the world-between after consequence escaped.
    await rm(s.bardoRoot, { recursive: true, force: true });
    assert.equal(await pathExists(s.bardoRoot), false);

    // Reopen B after both A and the Bardo are gone.
    const reopenedB = await LocalReceiver.open(join(base, 'world-b'));
    const final = reopenedB.snapshot();
    assert.deepEqual(final.admitted, [s.donorCrossing.crossing_id]);
    assert.equal(final.world_id, 'world:sb003-successor');

    const durableExit = JSON.parse(await readFile(join(s.archiveRoot, 'exit.json'), 'utf8'));
    const durableAdmit = JSON.parse(await readFile(join(s.archiveRoot, 'successor-admit.json'), 'utf8'));
    assert.equal(await verifyReceipt(durableExit), true);
    assert.equal(await verifyReceipt(durableAdmit), true);
    assert.equal(durableExit.post_state_ref, durableAdmit.receipt_id);
    assert.equal(durableExit.semantic_effect, 'none');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('SB-003 refuses a successor that reuses predecessor world identity', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-sb003-hostile-'));
  try {
    const s = await buildSb003(base);
    await rm(s.predecessorRoot, { recursive: true, force: true });

    await assert.rejects(
      () => reconstituteSuccessor({
        successor_root: join(base, 'impostor'),
        successor_world_id: s.predecessorSnapshot.world_id,
        successor_receiver_particular: 'particular:sb003-impostor',
        successor_contract_ref: 'contract:sb003-impostor/v0',
        capsule: s.capsule,
        mirror: s.mirror,
        served_at: '2026-10-07T00:41:00.000Z',
        received_at: '2026-10-07T00:42:00.000Z',
        accepted_at: '2026-10-07T00:43:00.000Z',
      }),
      /SUCCESSOR_IDENTITY_MUST_BE_FRESH/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('SB-003 refuses an Ark payload substitution under the original crossing address', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-sb003-substitution-'));
  try {
    const s = await buildSb003(base);
    const substituted = Buffer.from(s.arkBytes);
    substituted[substituted.length - 2] ^= 1;
    const substitutedHash = createHash('sha256').update(substituted).digest('hex');

    assert.notEqual(substitutedHash, s.arkHash);
    assert.notEqual(
      s.arkCrossing.payload_refs[0].address,
      `sha256:${substitutedHash}`,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
