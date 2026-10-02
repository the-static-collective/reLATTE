import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  sealCarryCardForRecipient,
  type LocalCarryCard,
} from '../src/carry-card.ts';
import {
  armorPortableCarry,
  createPortableCarry,
  dearmorPortableCarry,
  deserializePortableCarry,
  serializePortableCarry,
} from '../src/portable-carry.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  generateP256KeyPair,
} from '../src/protocol.ts';

test('.carry file and CARRY TEXT preserve one portable identity across dumb roads', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-portable-carry-'));
  try {
    const destination = await ReLatteRuntime.create({
      root: join(workspace, 'destination'),
      manifest: createWorldManifest({
        world_id: 'world:portable:destination',
        receiver_particular: 'particular:portable:destination',
        receiver_contract_ref: 'relatte:portable-carry-unit/v0',
      }),
      created_at: '2026-10-02T05:00:00.000Z',
    });

    const sender = await generateP256KeyPair();
    const capability = await destination.capabilityKernel.issueReceiveCapability({
      holder_public_key: sender.publicKeyJwk,
      declared_kind: 'CARRY_PARCEL',
      not_before: '2026-10-02T05:00:00.000Z',
      expires_at: '2026-10-03T05:00:00.000Z',
      created_at: '2026-10-02T05:00:01.000Z',
    });

    const secret = 'THIS MUST STAY HOME';
    const card: LocalCarryCard = {
      schema: 'relatte.local-carry-card/v0',
      human_intent: 'continue one bounded task',
      offered_context: ['carry this', secret],
      admitted_context: ['carry this'],
      open_questions: ['what changes next?'],
      expires_at: null,
    };

    const release = await sealCarryCardForRecipient({
      card,
      decision: 'RELEASE',
      created_at: '2026-10-02T05:00:02.000Z',
      sender_keys: sender,
      source_particular: 'particular:portable:source',
      source_world: 'world:portable:source',
      target_world: destination.manifest.world_id,
      capability_id: capability.capability_id,
      recipient_public_key: destination.encryption.public_key_jwk,
    });

    const artifact = await createPortableCarry({
      transport_bundle: release.transport_bundle,
      created_at: '2026-10-02T05:00:03.000Z',
    });

    const filePath = join(workspace, 'parcel.carry');
    await writeFile(filePath, serializePortableCarry(artifact), 'utf8');
    const fromFile = await deserializePortableCarry(
      await readFile(filePath, 'utf8'),
    );

    const armored = armorPortableCarry(artifact);
    const fromText = await dearmorPortableCarry(armored);

    assert.equal(fromFile.portable_id, artifact.portable_id);
    assert.equal(fromText.portable_id, artifact.portable_id);
    assert.equal(
      fromText.transport_bundle.crossing.crossing_id,
      artifact.transport_bundle.crossing.crossing_id,
    );
    assert.equal(serializePortableCarry(fromText).includes(secret), false);
    assert.equal(armored.includes(secret), false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tampered CARRY TEXT cannot preserve the declared portable identity', async () => {
  const fake = [
    '-----BEGIN RELATTE CARRY-----',
    'Version: 0',
    'Portable-ID: relatte-portable-carry-v0:fake',
    '',
    Buffer.from(JSON.stringify({ schema: 'not-relatte' }), 'utf8').toString('base64url'),
    '-----END RELATTE CARRY-----',
  ].join('\n');

  await assert.rejects(
    () => dearmorPortableCarry(fake),
    /INVALID_PORTABLE_CARRY_SCHEMA/,
  );
});
