import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginRecoveryCeremony,
  createFatherHandGenesis,
  createFounderNode,
  createOperationalKey,
  delegateOperationalKey,
  issueRecoverySet,
  trustPeerFounder,
  verifyFatherHandSuccession,
  verifyFatherHandSuccessionSet,
  verifyOperationalDelegation,
  verifyPeerTrust,
} from '../src/fatherhand.ts';

const VALID_WORLD = 'webz:the-static-collective/sanctuary';
const REMOTE_WORLD = 'webz:the-static-collective/orchard-022100';

test('FatherHand can issue only one recovery set and remains able to sign after its key is hardened non-extractable', async () => {
  const father = await createFatherHandGenesis();
  const first = await issueRecoverySet(father, 5, 3);
  assert.equal(first.shares.length, 5);

  await assert.rejects(
    () => issueRecoverySet(father, 5, 3),
    /FATHERHAND_RECOVERY_SET_ALREADY_ISSUED/,
  );

  const founder = await createFounderNode(
    father,
    'webz:the-static-collective/post-hardening',
    ['webz-world-identity'],
  );
  assert.equal(founder.founding_statement.fatherhand_fingerprint, father.fingerprint);
});

test('world identity rejects display-confusable, control, URL-ish and noncanonical spellings', async () => {
  const father = await createFatherHandGenesis();
  for (const world of [
    'WEBZ:the-static-collective/sanctuary',
    ' webz:the-static-collective/sanctuary',
    'webz:the-static-collective/sanctuary ',
    'webz:the-static-collective/../orchard',
    'webz:the-static-collective/%2e%2e/orchard',
    'webz:the-static-collective/sanctuary?admin=true',
    'webz:the-static-collective/sanctuary#trusted',
    'webz:the-static-collective/sanctuary\ntrusted',
    'webz:the-static-collective/sanctuary\u0000',
    'webz:the-static-collective/sаnctuary', // Cyrillic a
    'https://example.com/world',
  ]) {
    await assert.rejects(
      () => createFounderNode(father, world, ['webz-world-identity']),
      /INVALID_WORLD_ID/,
      world,
    );
  }
});

test('every FounderNode must actually carry world-identity authority', async () => {
  const father = await createFatherHandGenesis();
  await assert.rejects(
    () => createFounderNode(
      father,
      VALID_WORLD,
      ['delegate-operational-peer-keys'],
    ),
    /FOUNDER_WORLD_IDENTITY_SCOPE_REQUIRED/,
  );
});

test('authority scopes are closed allowlists, not arbitrary typo-compatible strings', async () => {
  const father = await createFatherHandGenesis();
  await assert.rejects(
    () => createFounderNode(father, VALID_WORLD, ['webz-world-identity', 'delegate-operational-peer-keyz']),
    /INVALID_FOUNDER_SCOPES/,
  );

  const remoteRoot = await createFatherHandGenesis();
  const remote = await createFounderNode(remoteRoot, REMOTE_WORLD, ['webz-world-identity']);
  await assert.rejects(
    () => trustPeerFounder(
      father,
      REMOTE_WORLD,
      remote.public_key,
      ['webz-peer-auth', 'artifact-admission'],
      { expires_at: '2099-01-01T00:00:00.000Z', invitation_id: null },
    ),
    /INVALID_PEER_SCOPES/,
  );
});

test('peer invitations reject control characters and ambiguous identifiers', async () => {
  const local = await createFatherHandGenesis();
  const remoteRoot = await createFatherHandGenesis();
  const remote = await createFounderNode(remoteRoot, REMOTE_WORLD, ['webz-world-identity']);
  for (const invitation_id of ['invite:ok\nTRUST', ' invite:leading', 'invite:trailing ', 'invite:☃']) {
    await assert.rejects(
      () => trustPeerFounder(
        local,
        REMOTE_WORLD,
        remote.public_key,
        ['webz-peer-auth'],
        { expires_at: '2099-01-01T00:00:00.000Z', invitation_id },
      ),
      /INVALID_INVITATION_ID/,
    );
  }
});

test('peer trust cannot be replayed under a different remote world label', async () => {
  const local = await createFatherHandGenesis();
  const remoteRoot = await createFatherHandGenesis();
  const remote = await createFounderNode(remoteRoot, REMOTE_WORLD, ['webz-world-identity']);
  const mark = await trustPeerFounder(
    local,
    REMOTE_WORLD,
    remote.public_key,
    ['webz-peer-auth'],
    { expires_at: '2099-01-01T00:00:00.000Z', invitation_id: 'invite:remote:1' },
  );

  assert.equal(
    await verifyPeerTrust(
      mark,
      local.public_key,
      remote.public_key,
      REMOTE_WORLD,
      'webz-peer-auth',
      mark.created_at,
    ),
    true,
  );
  assert.equal(
    await verifyPeerTrust(
      mark,
      local.public_key,
      remote.public_key,
      'webz:the-static-collective/not-orchard',
      'webz-peer-auth',
      mark.created_at,
    ),
    false,
  );
});

test('peer trust is temporally bounded on both sides of creation', async () => {
  const local = await createFatherHandGenesis();
  const remoteRoot = await createFatherHandGenesis();
  const remote = await createFounderNode(remoteRoot, REMOTE_WORLD, ['webz-world-identity']);

  await assert.rejects(
    () => trustPeerFounder(
      local,
      REMOTE_WORLD,
      remote.public_key,
      ['webz-peer-auth'],
      { expires_at: '2000-01-01T00:00:00.000Z', invitation_id: null },
    ),
    /INVALID_PEER_TRUST_WINDOW/,
  );

  const mark = await trustPeerFounder(
    local,
    REMOTE_WORLD,
    remote.public_key,
    ['webz-peer-auth'],
    { expires_at: '2099-01-01T00:00:00.000Z', invitation_id: null },
  );

  assert.equal(
    await verifyPeerTrust(
      mark,
      local.public_key,
      remote.public_key,
      REMOTE_WORLD,
      'webz-peer-auth',
      '2000-01-01T00:00:00.000Z',
    ),
    false,
  );
});

test('operational delegations cannot be valid before they were signed or be born already expired', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    VALID_WORLD,
    ['webz-world-identity', 'delegate-operational-peer-keys'],
  );
  const op = await createOperationalKey();

  await assert.rejects(
    () => delegateOperationalKey(
      founder,
      op.public_key,
      'webz-peer-https',
      {
        serial: 1,
        not_before: '1999-01-01T00:00:00.000Z',
        not_after: '2000-01-01T00:00:00.000Z',
        endpoint_constraints: ['https://sanctuary.example.invalid'],
        replaces_fingerprint: null,
      },
    ),
    /INVALID_DELEGATION_CREATION_WINDOW/,
  );

  const delegation = await delegateOperationalKey(
    founder,
    op.public_key,
    'webz-peer-https',
    {
      serial: 2,
      not_before: '1999-01-01T00:00:00.000Z',
      not_after: '2099-01-01T00:00:00.000Z',
      endpoint_constraints: ['https://sanctuary.example.invalid'],
      replaces_fingerprint: null,
    },
  );

  assert.equal(
    await verifyOperationalDelegation(
      delegation,
      founder.fingerprint,
      'webz-peer-https',
      '2000-01-01T00:00:00.000Z',
      founder.founding_statement,
    ),
    false,
  );
});

test('HTTPS delegation endpoint constraints reject downgrade, credentials, fragments and control tricks', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    VALID_WORLD,
    ['webz-world-identity', 'delegate-operational-peer-keys'],
  );
  const op = await createOperationalKey();

  for (const endpoint of [
    'http://sanctuary.example.invalid',
    'https://user:password@sanctuary.example.invalid',
    'https://sanctuary.example.invalid/#confused',
    'https://sanctuary.example.invalid/?admin=true',
    'https://sanctuary.example.invalid/\nattack',
    'https://',
  ]) {
    await assert.rejects(
      () => delegateOperationalKey(
        founder,
        op.public_key,
        'webz-peer-https',
        {
          serial: 1,
          not_before: '2026-10-07T00:00:00.000Z',
          not_after: '2027-10-07T00:00:00.000Z',
          endpoint_constraints: [endpoint],
          replaces_fingerprint: null,
        },
      ),
      /INVALID_ENDPOINT_CONSTRAINTS/,
      endpoint,
    );
  }
});

test('recovery parsing refuses candidate floods and oversized private share encodings before interpolation', async () => {
  const father = await createFatherHandGenesis();
  const set = await issueRecoverySet(father, 5, 3);

  await assert.rejects(
    () => import('../src/fatherhand.ts').then(({ reconstructFatherHand }) =>
      reconstructFatherHand(Array.from({ length: 256 }, () => set.shares[0]), father.fingerprint)),
    /RECOVERY_CANDIDATE_LIMIT/,
  );

  const oversized = structuredClone(set.shares[0]);
  oversized.share_bytes = 'A'.repeat(4096);
  await assert.rejects(
    () => import('../src/fatherhand.ts').then(({ reconstructFatherHand }) =>
      reconstructFatherHand([oversized, set.shares[1], set.shares[2]], father.fingerprint)),
    /INVALID_RECOVERY_SHARE_BYTES/,
  );
});

test('same recovery set can cryptographically fork offline; set verifier must detect ambiguity', async () => {
  const father = await createFatherHandGenesis();
  const set = await issueRecoverySet(father, 5, 3);

  const a = await beginRecoveryCeremony(
    { fingerprint: father.fingerprint, generation: father.generation, public_key: father.public_key },
    set.shares.slice(0, 3),
  );
  const b = await beginRecoveryCeremony(
    { fingerprint: father.fingerprint, generation: father.generation, public_key: father.public_key },
    set.shares.slice(0, 3),
  );

  const first = await a.createSuccessor({
    reason: 'red-team-fork-a',
    retained_founder_fingerprints: [],
    revoked_founder_fingerprints: [],
    previous_lineage_head: null,
  });
  const second = await b.createSuccessor({
    reason: 'red-team-fork-b',
    retained_founder_fingerprints: [],
    revoked_founder_fingerprints: [],
    previous_lineage_head: null,
  });

  assert.notEqual(first.successor.fingerprint, second.successor.fingerprint);
  assert.equal(await verifyFatherHandSuccession(first.statement), true);
  assert.equal(await verifyFatherHandSuccession(second.statement), true);
  assert.equal(first.statement.recovery_set_id, set.recovery_set_id);
  assert.equal(second.statement.recovery_set_id, set.recovery_set_id);

  const aggregate = await verifyFatherHandSuccessionSet([first.statement, second.statement]);
  assert.deepEqual(aggregate, {
    valid: false,
    code: 'FATHERHAND_SUCCESSION_FORK',
    old_fatherhand_fingerprint: father.fingerprint,
    old_generation: father.generation,
    recovery_set_id: set.recovery_set_id,
    previous_lineage_head: null,
  });
});

test('a single coherent succession set yields one current FatherHand and rejects signature mutation', async () => {
  const father = await createFatherHandGenesis();
  const set = await issueRecoverySet(father, 5, 3);
  const ceremony = await beginRecoveryCeremony(
    { fingerprint: father.fingerprint, generation: father.generation, public_key: father.public_key },
    set.shares.slice(0, 3),
  );
  const succession = await ceremony.createSuccessor({
    reason: 'red-team-coherent',
    retained_founder_fingerprints: [],
    revoked_founder_fingerprints: [],
    previous_lineage_head: null,
  });

  const aggregate = await verifyFatherHandSuccessionSet([succession.statement]);
  assert.equal(aggregate.valid, true);
  assert.equal(aggregate.current_fatherhand_fingerprint, succession.successor.fingerprint);

  const forged = structuredClone(succession.statement);
  forged.recovery_set_id = 'fatherhand-recovery-v0:' + 'f'.repeat(32);
  assert.equal(await verifyFatherHandSuccession(forged), false);
});

test('operational delegation cannot verify under a different founding world even with same FounderNode key', async () => {
  const father = await createFatherHandGenesis();
  const founder = await createFounderNode(
    father,
    VALID_WORLD,
    ['webz-world-identity', 'delegate-operational-peer-keys'],
  );
  const op = await createOperationalKey();
  const delegation = await delegateOperationalKey(
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

  const alteredFounding = structuredClone(founder.founding_statement);
  alteredFounding.founder_world_id = REMOTE_WORLD;
  assert.equal(
    await verifyOperationalDelegation(
      delegation,
      founder.fingerprint,
      'webz-peer-https',
      '2026-10-08T00:00:00.000Z',
      alteredFounding,
    ),
    false,
  );
});
