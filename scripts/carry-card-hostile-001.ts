import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openCarryTransportBundle,
  sealCarryCardForRecipient,
  type LocalCarryCard,
} from '../src/carry-card.ts';
import { generateP256KeyPair } from '../src/protocol.ts';
import { createWorldManifest } from '../src/runtime-manifest.ts';
import { ReLatteRuntime } from '../src/runtime.ts';

const workspace = await mkdtemp(join(tmpdir(), 'relatte-carry-card-hostile-001-'));
const secret = 'WITHHELD-CONTEXT-MUST-NEVER-CROSS';

try {
  const destination = await ReLatteRuntime.create({
    root: join(workspace, 'destination'),
    manifest: createWorldManifest({
      world_id: 'world:carry-card:destination',
      receiver_particular: 'particular:carry-card:destination',
      receiver_contract_ref: 'relatte:carry-card-hostile/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T02:10:00.000Z',
  });

  const senderKeys = await generateP256KeyPair();
  const capability = await destination.capabilityKernel.issueReceiveCapability({
    holder_public_key: senderKeys.publicKeyJwk,
    declared_kind: 'CARRY_PARCEL',
    not_before: '2026-10-02T02:10:00.000Z',
    expires_at: '2026-10-02T03:10:00.000Z',
    created_at: '2026-10-02T02:10:01.000Z',
  });

  const card: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'carry only approved context to another assistant',
    offered_context: [
      'Budget under $400',
      'Hands-on controls preferred',
      secret,
    ],
    admitted_context: [
      'Budget under $400',
      'Hands-on controls preferred',
    ],
    open_questions: [
      'Warm sound or clean preamps?',
    ],
    expires_at: '2026-10-02T03:10:00.000Z',
  };

  const released = await sealCarryCardForRecipient({
    card,
    decision: 'RELEASE',
    created_at: '2026-10-02T02:10:02.000Z',
    sender_keys: senderKeys,
    source_particular: 'particular:carry-card:source',
    source_world: 'world:carry-card:source',
    target_world: destination.manifest.world_id,
    capability_id: capability.capability_id,
    recipient_public_key: destination.encryption.public_key_jwk,
    return_address: 'world:carry-card:source',
  });

  const wire = JSON.stringify(released.transport_bundle);
  assert.equal(wire.includes(secret), false);
  assert.equal(wire.includes('offered_context'), false);
  assert.equal(wire.includes('admitted_context'), false);
  assert.equal(wire.includes('Budget under $400'), false);

  await destination.enqueueForeignCrossing({
    crossing: released.transport_bundle.crossing,
    enqueued_at: '2026-10-02T02:10:03.000Z',
    source: 'world:carry-card:source',
  });

  const pulse = await destination.pulseOne({
    claimed_at: '2026-10-02T02:10:04.000Z',
    received_at: '2026-10-02T02:10:05.000Z',
    committed_at: '2026-10-02T02:10:06.000Z',
  });

  const beforeDecision = await destination.snapshot();
  assert.deepEqual(beforeDecision.receiver.admitted, []);
  assert.deepEqual(beforeDecision.receiver.held, []);

  const opened = await openCarryTransportBundle({
    bundle: released.transport_bundle,
    encryption: destination.encryption,
  });

  assert.deepEqual(opened.admitted_context, card.admitted_context);
  assert.equal(JSON.stringify(opened).includes(secret), false);

  const destinationDecision = await destination.receiver.dispose(
    released.transport_bundle.crossing.crossing_id,
    'HOLD',
    '2026-10-02T02:10:07.000Z',
    {
      note: 'destination holds released carry parcel; release did not admit',
    },
  );

  const afterDecision = await destination.snapshot();
  assert.deepEqual(afterDecision.receiver.admitted, []);
  assert.deepEqual(afterDecision.receiver.held, [
    released.transport_bundle.crossing.crossing_id,
  ]);

  console.log(JSON.stringify({
    schema: 'relatte.carry-card-hostile-witness/v0',
    source: {
      decision: 'RELEASE',
      offered_context_count: card.offered_context.length,
      admitted_context_count: card.admitted_context.length,
      withheld_count: released.parcel.withheld_count,
      parcel_id: released.parcel.parcel_id,
    },
    transport: {
      crossing_id: released.transport_bundle.crossing.crossing_id,
      declared_kind: released.transport_bundle.crossing.declared_kind,
      capability_id: capability.capability_id,
      encrypted_payload_id:
        released.transport_bundle.encrypted_payload.envelope_id,
      plaintext_embedded: false,
      withheld_secret_present: wire.includes(secret),
      admitted_plaintext_present: wire.includes(card.admitted_context[0]),
    },
    destination: {
      receive_status: pulse.status,
      received_before_decision:
        beforeDecision.receiver.received.includes(
          released.transport_bundle.crossing.crossing_id,
        ),
      admitted_before_decision:
        beforeDecision.receiver.admitted.includes(
          released.transport_bundle.crossing.crossing_id,
        ),
      opened_parcel_id: opened.parcel_id,
      decision: 'HOLD',
      decision_receipt_id: destinationDecision.receipt_id,
      admitted_after_decision:
        afterDecision.receiver.admitted.includes(
          released.transport_bundle.crossing.crossing_id,
        ),
      held_after_decision:
        afterDecision.receiver.held.includes(
          released.transport_bundle.crossing.crossing_id,
        ),
    },
    laws: [
      'RELEASE != ADMISSION',
      'DEPARTURE != ENTRY',
      'OFFERED CONTEXT != ADMITTED CONTEXT',
      'WITHHELD CONTEXT != TRANSMITTED CONTEXT',
      'CAPABILITY != ADMISSION',
      'DECRYPTABLE != ADMITTED',
      'TRANSPORT != AUTHORITY',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
