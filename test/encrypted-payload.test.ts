import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EncryptionOrgan,
  encryptPayloadForRecipient,
} from '../src/encrypted-payload.ts';

test('encrypted payload is recipient-bound and context-bound', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-encrypted-payload-'));
  try {
    const worldB = await EncryptionOrgan.create({
      root: join(workspace, 'b'),
      world_id: 'world:b',
    });
    const worldA = await EncryptionOrgan.create({
      root: join(workspace, 'a'),
      world_id: 'world:a',
    });

    const plaintext = new TextEncoder().encode('hello from A to B');
    const envelope = await encryptPayloadForRecipient({
      plaintext,
      recipient_public_key: worldB.public_key_jwk,
      context: {
        target_world: 'world:b',
        capability_id: 'relatte-capability-v0:test',
        declared_kind: 'SEALED_MESSAGE',
        media_type: 'text/plain',
      },
    });

    const decrypted = await worldB.decrypt(envelope);
    assert.equal(new TextDecoder().decode(decrypted.plaintext), 'hello from A to B');
    assert.equal(envelope.recipient_key_id, worldB.key_id);
    assert.ok(envelope.laws.includes('DECRYPTABLE != ADMITTED'));

    await assert.rejects(
      () => worldA.decrypt(envelope),
      /ENCRYPTED_PAYLOAD_WRONG_RECIPIENT/,
    );

    await assert.rejects(
      () => worldB.decrypt({
        ...envelope,
        context: {
          ...envelope.context,
          target_world: 'world:other',
        },
      }),
      /ENCRYPTED_PAYLOAD_ID_MISMATCH/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
