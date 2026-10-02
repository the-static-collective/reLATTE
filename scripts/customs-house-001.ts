import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openCarryTransportBundle,
  sealCarryCardForRecipient,
  type LocalCarryCard,
} from '../src/carry-card.ts';
import {
  buildCustomsArrivalView,
  buildCustomsDepartureView,
  buildCustomsReleasedPreview,
} from '../src/customs-house.ts';
import {
  generateP256KeyPair,
} from '../src/protocol.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';

const workspace = await mkdtemp(join(tmpdir(), 'relatte-customs-house-001-'));
const secret = 'CUSTOMS-HOUSE-LOCAL-ONLY-SECRET';

try {
  const destination = await ReLatteRuntime.create({
    root: join(workspace, 'destination'),
    manifest: createWorldManifest({
      world_id: 'world:customs-house:destination',
      receiver_particular: 'particular:customs-house:destination',
      receiver_contract_ref: 'relatte:customs-house-001/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T04:10:00.000Z',
  });

  const senderKeys = await generateP256KeyPair();
  const capability =
    await destination.capabilityKernel.issueReceiveCapability({
      holder_public_key: senderKeys.publicKeyJwk,
      declared_kind: 'CARRY_PARCEL',
      not_before: '2026-10-02T04:10:00.000Z',
      expires_at: '2026-10-02T05:10:00.000Z',
      created_at: '2026-10-02T04:10:01.000Z',
    });

  const card: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'help storyboard a bounded creative project',
    offered_context: [
      'The video should feel handmade rather than synthetic.',
      'Keep the visual grammar simple enough to reproduce.',
      'The destination may ask one follow-up question.',
      secret,
    ],
    admitted_context: [
      'The video should feel handmade rather than synthetic.',
      'Keep the visual grammar simple enough to reproduce.',
      'The destination may ask one follow-up question.',
    ],
    open_questions: [
      'Which limitation should become part of the visual language?',
    ],
    expires_at: '2026-10-02T05:10:00.000Z',
  };

  const draftView = buildCustomsDepartureView({
    card,
  });
  assert.equal(draftView.staying_home_count, 1);
  assert.equal(draftView.transmittable, false);

  const released = await sealCarryCardForRecipient({
    card,
    decision: 'RELEASE',
    created_at: '2026-10-02T04:10:02.000Z',
    sender_keys: senderKeys,
    source_particular: 'particular:customs-house:source',
    source_world: 'world:customs-house:source',
    target_world: destination.manifest.world_id,
    capability_id: capability.capability_id,
    recipient_public_key: destination.encryption.public_key_jwk,
    return_address: 'world:customs-house:source',
  });

  const releasedView = buildCustomsDepartureView({
    card,
    decision: 'RELEASE',
    released_parcel_id: released.parcel.parcel_id,
  });
  const safePreview = buildCustomsReleasedPreview(released.parcel);

  const wire = JSON.stringify(released.transport_bundle);
  assert.equal(wire.includes(secret), false);
  assert.equal(JSON.stringify(safePreview).includes(secret), false);

  await destination.enqueueForeignCrossing({
    crossing: released.transport_bundle.crossing,
    enqueued_at: '2026-10-02T04:10:03.000Z',
    source: 'world:customs-house:source',
  });

  const pulse = await destination.pulseOne({
    claimed_at: '2026-10-02T04:10:04.000Z',
    received_at: '2026-10-02T04:10:05.000Z',
    committed_at: '2026-10-02T04:10:06.000Z',
  });
  assert.equal(pulse.status, 'processed');

  const openedParcel = await openCarryTransportBundle({
    bundle: released.transport_bundle,
    encryption: destination.encryption,
  });

  const beforeDecision = buildCustomsArrivalView({
    parcel: openedParcel,
    crossing_id: released.transport_bundle.crossing.crossing_id,
    received: true,
    decrypted: true,
    receive_receipt_id: pulse.receive_receipt_id,
  });

  assert.equal(beforeDecision.decision, 'UNDECIDED');
  assert.equal(beforeDecision.admitted, false);
  assert.equal(
    JSON.stringify(beforeDecision).includes(secret),
    false,
  );

  const holdReceipt = await destination.receiver.dispose(
    released.transport_bundle.crossing.crossing_id,
    'HOLD',
    '2026-10-02T04:10:07.000Z',
    {
      note: 'customs arrival desk holds the parcel for local consideration',
    },
  );

  const afterDecision = buildCustomsArrivalView({
    parcel: openedParcel,
    crossing_id: released.transport_bundle.crossing.crossing_id,
    received: true,
    decrypted: true,
    disposition: 'HOLD',
    receive_receipt_id: pulse.receive_receipt_id,
    disposition_receipt_id: holdReceipt.receipt_id,
  });

  const destinationSnapshot = await destination.snapshot();
  assert.deepEqual(destinationSnapshot.receiver.admitted, []);
  assert.deepEqual(destinationSnapshot.receiver.held, [
    released.transport_bundle.crossing.crossing_id,
  ]);

  console.log(JSON.stringify({
    schema: 'relatte.customs-house-witness/v0',
    departure: {
      locality: draftView.locality,
      decision_before_release: draftView.decision,
      offered_count: draftView.items.length,
      carrying_count:
        draftView.items.filter((item) => item.selected_to_carry).length,
      staying_home_count: draftView.staying_home_count,
      source_local_secret_visible_locally:
        draftView.items.some((item) => item.text === secret),
      transmittable: draftView.transmittable,
      release_decision: releasedView.decision,
      released_parcel_id: releasedView.released_parcel_id,
    },
    road: {
      crossing_id: released.transport_bundle.crossing.crossing_id,
      capability_id: capability.capability_id,
      encrypted_payload_id:
        released.transport_bundle.encrypted_payload.envelope_id,
      withheld_secret_present_on_wire: wire.includes(secret),
      released_preview_contains_withheld_secret:
        JSON.stringify(safePreview).includes(secret),
    },
    arrival: {
      receive_receipt_id: beforeDecision.receive_receipt_id,
      decrypted: beforeDecision.decrypted,
      source_withheld_count: beforeDecision.source_withheld_count,
      source_withheld_text_available:
        beforeDecision.source_withheld_text_available,
      decision_before_local_cut: beforeDecision.decision,
      decision_after_local_cut: afterDecision.decision,
      disposition_receipt_id:
        afterDecision.disposition_receipt_id,
      admitted_after_decision: afterDecision.admitted,
      held_after_decision: afterDecision.held,
    },
    final_receiver: {
      admitted: destinationSnapshot.receiver.admitted,
      held: destinationSnapshot.receiver.held,
    },
    laws: [
      'DEPARTURE VIEW != TRANSPORT BUNDLE',
      'RELEASE != RECEIVE',
      'RECEIVE != ADMIT',
      'SOURCE RELEASE != DESTINATION DECISION',
      'WITHHELD COUNT != WITHHELD CONTENT',
      'PROJECTION != AUTHORITY',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
