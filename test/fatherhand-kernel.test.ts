import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPublicArtifactSafe,
  createFatherHandGenesis,
  createFounderNode,
  verifyFatherHandFounding,
  createOperationalKey,
  delegateOperationalKey,
  verifyOperationalDelegation,
  trustPeerFounder,
  verifyPeerTrust,
  issueRecoverySet,
  reconstructFatherHand,
  retireFatherHand,
  createKidBackupSet,
  recoverKidShare,
  beginRecoveryCeremony,
  verifyFatherHandSuccession,
} from '../src/fatherhand.ts';

test('FatherHand handle exposes no private-key property and can be explicitly retired before recovery', async () => {
  const father = await createFatherHandGenesis();
  assert.equal(Object.hasOwn(father, 'private_key'), false);
  assert.equal(Object.hasOwn(father, 'privateKey'), false);
  assert.doesNotThrow(() => assertPublicArtifactSafe(father));

  const recovery = await issueRecoverySet(father, 5, 3);
  retireFatherHand(father);
  await assert.rejects(
    () => issueRecoverySet(father, 5, 3),
    /FATHERHAND_PRIVATE_KEY_UNAVAILABLE/,
  );
  await assert.rejects(
    () => createFounderNode(father, 'webz:retired/world', ['webz-world-identity']),
    /FATHERHAND_PRIVATE_KEY_UNAVAILABLE/,
  );

  const recovered = await reconstructFatherHand(recovery.shares.slice(0, 3), father.fingerprint);
  assert.equal(recovered.fingerprint, father.fingerprint);
  recovered.close();
});

test('cold-root and FounderNode handles refuse public-field mutation instead of signing contradictory identities', async () => {
  const father = await createFatherHandGenesis();
  father.generation = 99;
  await assert.rejects(
    () => issueRecoverySet(father, 5, 3),
    /FATHERHAND_HANDLE_IDENTITY_MISMATCH/,
  );

  const cleanFather = await createFatherHandGenesis();
  const founder = await createFounderNode(
    cleanFather,
    'webz:the-static-collective/mutation-test',
    ['webz-world-identity', 'delegate-operational-peer-keys'],
  );
  const op = await createOperationalKey();
  founder.fingerprint = 'foundernode-v0:' + '0'.repeat(64);
  await assert.rejects(
    () => delegateOperationalKey(
      founder,
      op.public_key,
      'webz-peer-https',
      {
        serial: 1,
        not_before: '2026-10-07T00:00:00.000Z',
        not_after: '2027-10-07T00:00:00.000Z',
        endpoint_constraints: [],
        replaces_fingerprint: null,
      },
    ),
    /FOUNDERNODE_HANDLE_IDENTITY_MISMATCH/,
  );
});

test('FatherHand founds an independently generated FounderNode without parent-key derivation', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    'webz:the-static-collective/sanctuary',
    ['webz-world-identity', 'delegate-operational-peer-keys', 'delegate-relatte-receiver-key'],
  );
  assert.equal(await verifyFatherHandFounding(founder.founding_statement), true);
  assert.equal(founder.founding_statement.fatherhand_fingerprint, father.fingerprint);
  assert.equal(founder.founding_statement.founder_fingerprint, founder.fingerprint);
  assert.notDeepEqual(founder.public_key, father.public_key);
  assert.equal(Object.hasOwn(founder, 'private_key'), false);
  assertPublicArtifactSafe(founder);
  assertPublicArtifactSafe(founder.founding_statement);

  const changed = structuredClone(founder.founding_statement);
  changed.founder_world_id = 'webz:evil/world';
  assert.equal(await verifyFatherHandFounding(changed), false);

  const changedScope = structuredClone(founder.founding_statement);
  changedScope.scopes = ['webz-world-identity'];
  assert.equal(await verifyFatherHandFounding(changedScope), false);
});

test('3-of-5 FatherKids recover exact FatherHand; 1/2 shares, duplicates, mixed sets and corruption refuse', async () => {
  const father = await createFatherHandGenesis();
  const set = await issueRecoverySet(father, 5, 3);
  assert.equal(set.shares.length, 5);
  assert.equal(set.threshold, 3);
  assert.equal(new Set(set.shares.map((x) => x.lineage_id)).size, 5);

  await assert.rejects(() => reconstructFatherHand(set.shares.slice(0, 1), father.fingerprint), /RECOVERY_QUORUM_NOT_MET/);
  await assert.rejects(() => reconstructFatherHand(set.shares.slice(0, 2), father.fingerprint), /RECOVERY_QUORUM_NOT_MET/);

  const recovered = await reconstructFatherHand(set.shares.slice(0, 3), father.fingerprint);
  assert.equal(recovered.fingerprint, father.fingerprint);
  recovered.close();

  await assert.rejects(
    () => reconstructFatherHand([set.shares[0], set.shares[0], set.shares[1]], father.fingerprint),
    /DUPLICATE_RECOVERY_LINEAGE/,
  );

  const relabeled = structuredClone(set.shares[0]);
  relabeled.lineage_id = 'fatherkid-v0:' + 'f'.repeat(32);
  await assert.rejects(
    () => reconstructFatherHand([relabeled, set.shares[1], set.shares[2]], father.fingerprint),
    /INVALID_RECOVERY_SHARE_SIGNATURE/,
  );

  const reindexed = structuredClone(set.shares[0]);
  reindexed.share_index = reindexed.share_index === 255 ? 254 : reindexed.share_index + 1;
  await assert.rejects(
    () => reconstructFatherHand([reindexed, set.shares[1], set.shares[2]], father.fingerprint),
    /RECOVERY_SHARE_COORDINATE_MISMATCH|INVALID_RECOVERY_SHARE_SIGNATURE/,
  );

  const other = await createFatherHandGenesis();
  const otherSet = await issueRecoverySet(other, 5, 3);
  await assert.rejects(
    () => reconstructFatherHand([set.shares[0], set.shares[1], otherSet.shares[2]], father.fingerprint),
    /MIXED_RECOVERY_SET|MIXED_FATHERHAND_IDENTITY/,
  );

  const corrupt = structuredClone(set.shares[2]);
  const bytes = Buffer.from(corrupt.share_bytes, 'base64url');
  bytes[bytes.length - 1] ^= 0xff;
  corrupt.share_bytes = bytes.toString('base64url');
  await assert.rejects(
    () => reconstructFatherHand([set.shares[0], set.shares[1], corrupt], father.fingerprint),
    /RECOVERY_SHARE_CHECKSUM_MISMATCH|RECOVERED_FATHERHAND_FINGERPRINT_MISMATCH/,
  );

  for (const share of set.shares) {
    assert.throws(() => assertPublicArtifactSafe(share), /PRIVATE_RECOVERY_MATERIAL/);
  }
});

test('FatherKid descendant redundancy reconstructs one parent lineage and never creates extra FatherHand votes', async () => {
  const father = await createFatherHandGenesis();
  const set = await issueRecoverySet(father, 5, 3);
  const aBackups = await createKidBackupSet(set.shares[0], 3, 2);
  const aRecovered = await recoverKidShare(aBackups.slice(0, 2));
  assert.equal(aRecovered.lineage_id, set.shares[0].lineage_id);
  assert.equal(aRecovered.share_bytes, set.shares[0].share_bytes);

  await assert.rejects(
    () => reconstructFatherHand([aRecovered, aRecovered, set.shares[1]], father.fingerprint),
    /DUPLICATE_RECOVERY_LINEAGE/,
  );

  const recovered = await reconstructFatherHand([aRecovered, set.shares[1], set.shares[2]], father.fingerprint);
  assert.equal(recovered.fingerprint, father.fingerprint);
  recovered.close();

  const mixed = structuredClone(aBackups[1]);
  mixed.parent_lineage_id = set.shares[1].lineage_id;
  await assert.rejects(
    () => recoverKidShare([aBackups[0], mixed]),
    /MIXED_KID_BACKUP_SET|MIXED_PARENT_LINEAGE/,
  );
});

test('recovery ceremony creates fresh FatherHand successor with old signature and new countersignature', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    'webz:the-static-collective/sanctuary',
    ['webz-world-identity'],
  );
  const set = await issueRecoverySet(father, 5, 3);
  const ceremony = await beginRecoveryCeremony(
    { fingerprint: father.fingerprint, generation: father.generation, public_key: father.public_key },
    set.shares.slice(0, 3),
  );
  const succession = await ceremony.createSuccessor({
    reason: 'planned-recovery-test',
    retained_founder_fingerprints: [founder.fingerprint],
    revoked_founder_fingerprints: [],
    previous_lineage_head: null,
  });
  assert.equal(succession.successor.generation, father.generation + 1);
  assert.notEqual(succession.successor.fingerprint, father.fingerprint);
  assert.equal(await verifyFatherHandSuccession(succession.statement), true);
  assertPublicArtifactSafe(succession.statement);
  ceremony.close();
  await assert.rejects(() => ceremony.createSuccessor({
    reason: 'should-fail',
    retained_founder_fingerprints: [],
    revoked_founder_fingerprints: [],
    previous_lineage_head: succession.statement.statement_id,
  }), /RECOVERY_CEREMONY_CLOSED/);

  const tampered = structuredClone(succession.statement);
  tampered.new_generation += 1;
  assert.equal(await verifyFatherHandSuccession(tampered), false);
});

test('FounderNode delegates bounded replaceable operational keys and scope is exact', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    'webz:the-static-collective/sanctuary',
    ['webz-world-identity', 'delegate-operational-peer-keys'],
  );
  const op = await createOperationalKey();
  const statement = await delegateOperationalKey(
    founder,
    op.public_key,
    'webz-peer-https',
    {
      serial: 1,
      not_before: '2026-10-07T00:00:00.000Z',
      not_after: '2027-10-07T00:00:00.000Z',
      endpoint_constraints: ['https://sanctuary.example.invalid'],
      replaces_fingerprint: null,
    },
  );
  assert.equal(
    await verifyOperationalDelegation(
      statement,
      founder.fingerprint,
      'webz-peer-https',
      '2026-10-08T00:00:00.000Z',
      founder.founding_statement,
    ),
    true,
  );
  assert.equal(
    await verifyOperationalDelegation(
      statement,
      founder.fingerprint,
      'relatte-receiver',
      '2026-10-08T00:00:00.000Z',
      founder.founding_statement,
    ),
    false,
  );
  assert.equal(
    await verifyOperationalDelegation(
      statement,
      founder.fingerprint,
      'webz-peer-https',
      '2028-01-01T00:00:00.000Z',
      founder.founding_statement,
    ),
    false,
  );

  const underAuthorized = await createFounderNode(
    father,
    'webz:the-static-collective/under-authorized',
    ['webz-world-identity'],
  );
  await assert.rejects(
    () => delegateOperationalKey(
      underAuthorized,
      op.public_key,
      'webz-peer-https',
      {
        serial: 1,
        not_before: '2026-10-07T00:00:00.000Z',
        not_after: '2027-10-07T00:00:00.000Z',
        endpoint_constraints: [],
        replaces_fingerprint: null,
      },
    ),
    /FOUNDER_SCOPE_NOT_AUTHORIZED/,
  );

  const strippedFounding = structuredClone(founder.founding_statement);
  strippedFounding.scopes = ['webz-world-identity'];
  assert.equal(
    await verifyOperationalDelegation(
      statement,
      founder.fingerprint,
      'webz-peer-https',
      '2026-10-08T00:00:00.000Z',
      strippedFounding,
    ),
    false,
  );
  assertPublicArtifactSafe(statement);
});

test('FatherHand peer trust pins exact remote FounderNode with no hostname/TOFU shortcut', async () => {
  const local = await createFatherHandGenesis();
  const remoteRoot = await createFatherHandGenesis();
  const remote = await createFounderNode(
    remoteRoot,
    'webz:the-static-collective/orchard-022100',
    ['webz-world-identity'],
  );
  const mark = await trustPeerFounder(
    local,
    remote.world_id,
    remote.public_key,
    ['webz-peer-auth', 'receive-relatte-crossing'],
    {expires_at: '2027-10-07T00:00:00.000Z', invitation_id: 'invite:webz005:orchard:001'},
  );
  assert.equal(
    await verifyPeerTrust(mark, local.public_key, remote.public_key, 'webz-peer-auth', '2026-10-08T00:00:00.000Z'),
    true,
  );

  const impostorRoot = await createFatherHandGenesis();
  const impostor = await createFounderNode(
    impostorRoot,
    remote.world_id,
    ['webz-world-identity'],
  );
  assert.equal(
    await verifyPeerTrust(mark, local.public_key, impostor.public_key, 'webz-peer-auth', '2026-10-08T00:00:00.000Z'),
    false,
  );
  assert.equal(
    await verifyPeerTrust(mark, local.public_key, remote.public_key, 'artifact-admission', '2026-10-08T00:00:00.000Z'),
    false,
  );
  assertPublicArtifactSafe(mark);
});

test('public artifact safety scanner rejects private JWK and recovery-shaped secrets', async () => {
  assert.throws(() => assertPublicArtifactSafe({signing: {public_key: {kty: 'EC', d: 'secret'}}}), /PRIVATE_KEY_MATERIAL/);
  assert.throws(() => assertPublicArtifactSafe({share_bytes: 'secret'}), /PRIVATE_RECOVERY_MATERIAL/);
  assert.throws(() => assertPublicArtifactSafe({seed_material: 'secret'}), /PRIVATE_RECOVERY_MATERIAL/);
  assert.doesNotThrow(() => assertPublicArtifactSafe({fingerprint: 'fh:' + 'a'.repeat(64)}));
});
