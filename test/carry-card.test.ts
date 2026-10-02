import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  openCarryTransportBundle,
  releaseCarryCard,
  sealCarryCardForRecipient,
  type LocalCarryCard,
} from '../src/carry-card.ts';
import { generateP256KeyPair } from '../src/protocol.ts';
import { createWorldManifest } from '../src/runtime-manifest.ts';
import { ReLatteRuntime } from '../src/runtime.ts';

const SECRET = 'SECRET_NEVER_CROSSES_7f2f';

function card(): LocalCarryCard {
  return {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'continue bounded work with another assistant',
    offered_context: [
      'Budget under $400',
      'Hands-on controls preferred',
      SECRET,
    ],
    admitted_context: [
      'Budget under $400',
      'Hands-on controls preferred',
    ],
    open_questions: [
      'Warm sound or clean preamps?',
    ],
    expires_at: '2026-10-02T03:00:00.000Z',
  };
}

test('CANCEL cannot create a released parcel', () => {
  assert.throws(
    () => releaseCarryCard({
      card: card(),
      decision: 'CANCEL',
      created_at: '2026-10-02T02:00:00.000Z',
    }),
    /CARRY_NOT_RELEASED/,
  );
});

test('withheld context never enters the transport bundle', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-carry-private-'));
  try {
    const destination = await ReLatteRuntime.create({
      root: join(workspace, 'world-b'),
      manifest: createWorldManifest({
        world_id: 'world:carry:b',
        receiver_particular: 'particular:carry:b',
        receiver_contract_ref: 'relatte:carry-card-hostile/v0',
        pulse_interval_ms: 25,
      }),
      created_at: '2026-10-02T02:00:00.000Z',
    });

    const senderKeys = await generateP256KeyPair();
    const capability = await destination.capabilityKernel.issueReceiveCapability({
      holder_public_key: senderKeys.publicKeyJwk,
      declared_kind: 'CARRY_PARCEL',
      not_before: '2026-10-02T02:00:00.000Z',
      expires_at: '2026-10-02T03:00:00.000Z',
      created_at: '2026-10-02T02:00:01.000Z',
    });

    const released = await sealCarryCardForRecipient({
      card: card(),
      decision: 'RELEASE',
      created_at: '2026-10-02T02:00:02.000Z',
      sender_keys: senderKeys,
      source_particular: 'particular:carry:a:human-agent',
      source_world: 'world:carry:a',
      target_world: destination.manifest.world_id,
      capability_id: capability.capability_id,
      recipient_public_key: destination.encryption.public_key_jwk,
      return_address: 'world:carry:a',
    });

    assert.equal(released.parcel.withheld_count, 1);
    assert.deepEqual(released.parcel.admitted_context, [
      'Budget under $400',
      'Hands-on controls preferred',
    ]);

    const wire = JSON.stringify(released.transport_bundle);
    assert.equal(wire.includes(SECRET), false);
    assert.equal(wire.includes('offered_context'), false);
    assert.equal(wire.includes('admitted_context'), false);
    assert.equal(wire.includes('Budget under $400'), false);
    assert.equal(
      released.transport_bundle.crossing.extensions.carry_card.plaintext_embedded,
      false,
    );

    await destination.enqueueForeignCrossing({
      crossing: released.transport_bundle.crossing,
      enqueued_at: '2026-10-02T02:00:03.000Z',
      source: 'world:carry:a',
    });

    const pulse = await destination.pulseOne({
      claimed_at: '2026-10-02T02:00:04.000Z',
      received_at: '2026-10-02T02:00:05.000Z',
      committed_at: '2026-10-02T02:00:06.000Z',
    });

    assert.equal(pulse.status, 'processed');

    const beforeDecision = await destination.snapshot();
    assert.deepEqual(beforeDecision.receiver.received, [
      released.transport_bundle.crossing.crossing_id,
    ]);
    assert.deepEqual(beforeDecision.receiver.admitted, []);
    assert.deepEqual(beforeDecision.receiver.held, []);

    const opened = await openCarryTransportBundle({
      bundle: released.transport_bundle,
      encryption: destination.encryption,
    });

    assert.deepEqual(opened.admitted_context, released.parcel.admitted_context);
    assert.equal(JSON.stringify(opened).includes(SECRET), false);

    const holdReceipt = await destination.receiver.dispose(
      released.transport_bundle.crossing.crossing_id,
      'HOLD',
      '2026-10-02T02:00:07.000Z',
      {
        note: 'destination human/owner holds the released parcel',
      },
    );

    assert.equal(holdReceipt.semantic_effect, 'none');

    const afterDecision = await destination.snapshot();
    assert.deepEqual(afterDecision.receiver.admitted, []);
    assert.deepEqual(afterDecision.receiver.held, [
      released.transport_bundle.crossing.crossing_id,
    ]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
