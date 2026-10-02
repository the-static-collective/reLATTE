import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openCarryTransportBundle,
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
  acceptReturnResponse,
  createReturnEnvelope,
  openReturnEnvelope,
} from '../src/return-envelope.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  generateP256KeyPair,
} from '../src/protocol.ts';

const workspace = await mkdtemp(join(tmpdir(), 'relatte-mail-slot-static-post-001-'));
const sourceRoot = join(workspace, 'source');
const destinationRoot = join(workspace, 'destination');
const outboundFile = join(workspace, 'outbound.carry');
const replyFile = join(workspace, 'reply.carry');
const secret = 'STATIC-POST-SOURCE-LOCAL-SECRET-MUST-NOT-TRAVEL';

try {
  const source = await ReLatteRuntime.create({
    root: sourceRoot,
    manifest: createWorldManifest({
      world_id: 'world:static-post:source',
      receiver_particular: 'particular:static-post:source',
      receiver_contract_ref: 'relatte:static-post-001/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T05:30:00.000Z',
  });

  const destination = await ReLatteRuntime.create({
    root: destinationRoot,
    manifest: createWorldManifest({
      world_id: 'world:static-post:destination',
      receiver_particular: 'particular:static-post:destination',
      receiver_contract_ref: 'relatte:static-post-001/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T05:30:00.000Z',
  });

  const outboundKeys = await generateP256KeyPair();
  const destinationCapability =
    await destination.capabilityKernel.issueReceiveCapability({
      holder_public_key: outboundKeys.publicKeyJwk,
      declared_kind: 'CARRY_PARCEL',
      not_before: '2026-10-02T05:30:00.000Z',
      expires_at: '2026-10-03T05:30:00.000Z',
      created_at: '2026-10-02T05:30:01.000Z',
    });

  const outboundCard: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'send one bounded creative question by ordinary transport',
    offered_context: [
      'Keep the visual grammar handmade.',
      'Use one repeatable limitation as a compositional rule.',
      secret,
    ],
    admitted_context: [
      'Keep the visual grammar handmade.',
      'Use one repeatable limitation as a compositional rule.',
    ],
    open_questions: [
      'Which limitation should become the visual grammar?',
    ],
    expires_at: '2026-10-03T05:30:00.000Z',
  };

  const outboundRelease = await sealCarryCardForRecipient({
    card: outboundCard,
    decision: 'RELEASE',
    created_at: '2026-10-02T05:30:02.000Z',
    sender_keys: outboundKeys,
    source_particular: 'particular:static-post:source:mail-key',
    source_world: source.manifest.world_id,
    target_world: destination.manifest.world_id,
    capability_id: destinationCapability.capability_id,
    recipient_public_key: destination.encryption.public_key_jwk,
    return_address: source.manifest.world_id,
  });

  const returnEnvelope = await createReturnEnvelope({
    source_runtime: source,
    parent_crossing_id:
      outboundRelease.transport_bundle.crossing.crossing_id,
    recipient_world: destination.manifest.world_id,
    recipient_encryption_public_key:
      destination.encryption.public_key_jwk,
    reply_kind: 'CARRY_PARCEL',
    created_at: '2026-10-02T05:30:03.000Z',
    expires_at: '2026-10-03T05:30:03.000Z',
  });

  const outboundPortable = await createPortableCarry({
    transport_bundle: outboundRelease.transport_bundle,
    return_envelope: returnEnvelope,
    created_at: '2026-10-02T05:30:04.000Z',
  });

  const outboundBytes = serializePortableCarry(outboundPortable);
  assert.equal(outboundBytes.includes(secret), false);

  await writeFile(outboundFile, outboundBytes, 'utf8');
  const afterFileRoad = await deserializePortableCarry(
    await readFile(outboundFile, 'utf8'),
  );

  const carryText = armorPortableCarry(afterFileRoad);
  assert.equal(carryText.includes(secret), false);
  const afterClipboardRoad = await dearmorPortableCarry(carryText);

  assert.equal(
    afterClipboardRoad.portable_id,
    outboundPortable.portable_id,
  );
  assert.equal(
    afterClipboardRoad.transport_bundle.crossing.crossing_id,
    outboundRelease.transport_bundle.crossing.crossing_id,
  );

  const destinationQueue = await destination.enqueueForeignCrossing({
    crossing: afterClipboardRoad.transport_bundle.crossing,
    enqueued_at: '2026-10-02T05:30:05.000Z',
    source: 'carry-text:clipboard',
  });

  const destinationPulse = await destination.pulseOne({
    claimed_at: '2026-10-02T05:30:06.000Z',
    received_at: '2026-10-02T05:30:07.000Z',
    committed_at: '2026-10-02T05:30:08.000Z',
  });
  assert.equal(destinationPulse.status, 'processed');

  const openedOutbound = await openCarryTransportBundle({
    bundle: afterClipboardRoad.transport_bundle,
    encryption: destination.encryption,
  });
  assert.equal(
    JSON.stringify(openedOutbound).includes(secret),
    false,
  );

  const destinationHold = await destination.receiver.dispose(
    afterClipboardRoad.transport_bundle.crossing.crossing_id,
    'HOLD',
    '2026-10-02T05:30:09.000Z',
    {
      note: 'ordinary transport delivered a parcel; destination still decides locally',
    },
  );
  assert.equal(destinationHold.semantic_effect, 'none');

  const openedReturn = await openReturnEnvelope({
    envelope: afterClipboardRoad.return_envelope,
    encryption: destination.encryption,
    observed_at: '2026-10-02T05:31:00.000Z',
  });

  const replyCard: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'return one bounded answer through the supplied envelope',
    offered_context: [
      'Use visible frame repetition as the limitation.',
      'Do not add a second visual system.',
    ],
    admitted_context: [
      'Use visible frame repetition as the limitation.',
      'Do not add a second visual system.',
    ],
    open_questions: [],
    expires_at: null,
  };

  const replyRelease = await sealCarryCardForRecipient({
    card: replyCard,
    decision: 'RELEASE',
    created_at: '2026-10-02T05:31:01.000Z',
    sender_keys: openedReturn.reply_keys,
    source_particular: 'particular:static-post:return-mail-key',
    source_world: destination.manifest.world_id,
    target_world: source.manifest.world_id,
    capability_id: returnEnvelope.reply_capability_id,
    recipient_public_key: returnEnvelope.source_encryption_public_key,
    return_address: destination.manifest.world_id,
    parents: [
      outboundRelease.transport_bundle.crossing.crossing_id,
    ],
  });

  const replyPortable = await createPortableCarry({
    transport_bundle: replyRelease.transport_bundle,
    created_at: '2026-10-02T05:31:02.000Z',
  });
  await writeFile(
    replyFile,
    serializePortableCarry(replyPortable),
    'utf8',
  );
  const replyText = armorPortableCarry(
    await deserializePortableCarry(
      await readFile(replyFile, 'utf8'),
    ),
  );
  const receivedReplyPortable =
    await dearmorPortableCarry(replyText);

  const acceptedReply = await acceptReturnResponse({
    source_runtime: source,
    envelope: returnEnvelope,
    response_crossing:
      receivedReplyPortable.transport_bundle.crossing,
    observed_at: '2026-10-02T05:31:03.000Z',
    committed_at: '2026-10-02T05:31:04.000Z',
  });

  const openedReply = await openCarryTransportBundle({
    bundle: receivedReplyPortable.transport_bundle,
    encryption: source.encryption,
  });
  assert.deepEqual(openedReply.admitted_context, replyCard.admitted_context);

  const sourceHold = await source.receiver.dispose(
    receivedReplyPortable.transport_bundle.crossing.crossing_id,
    'HOLD',
    '2026-10-02T05:31:05.000Z',
    {
      note: 'reply arrival remains a source-local decision',
    },
  );
  assert.equal(sourceHold.semantic_effect, 'none');

  const secondReply = await sealCarryCardForRecipient({
    card: replyCard,
    decision: 'RELEASE',
    created_at: '2026-10-02T05:31:06.000Z',
    sender_keys: openedReturn.reply_keys,
    source_particular: 'particular:static-post:return-mail-key',
    source_world: destination.manifest.world_id,
    target_world: source.manifest.world_id,
    capability_id: returnEnvelope.reply_capability_id,
    recipient_public_key: returnEnvelope.source_encryption_public_key,
    parents: [
      outboundRelease.transport_bundle.crossing.crossing_id,
    ],
  });

  let secondReplyRejected = false;
  let secondReplyError = '';
  try {
    await acceptReturnResponse({
      source_runtime: source,
      envelope: returnEnvelope,
      response_crossing: secondReply.transport_bundle.crossing,
      observed_at: '2026-10-02T05:31:07.000Z',
      committed_at: '2026-10-02T05:31:08.000Z',
    });
  } catch (error) {
    secondReplyError =
      error instanceof Error ? error.message : String(error);
    secondReplyRejected =
      secondReplyError.includes('CAPABILITY_REVOKED');
  }
  assert.equal(secondReplyRejected, true);

  const sourceSnapshot = await source.snapshot();
  const destinationSnapshot = await destination.snapshot();

  console.log(JSON.stringify({
    schema: 'relatte.mail-slot-static-post-witness/v0',
    outbound: {
      portable_id: outboundPortable.portable_id,
      crossing_id:
        outboundRelease.transport_bundle.crossing.crossing_id,
      parcel_id: outboundRelease.parcel.parcel_id,
      file_extension: '.carry',
      file_roundtrip_preserved:
        afterFileRoad.portable_id === outboundPortable.portable_id,
      carry_text_roundtrip_preserved:
        afterClipboardRoad.portable_id === outboundPortable.portable_id,
      source_secret_present_in_portable_bytes:
        outboundBytes.includes(secret),
      source_secret_present_in_carry_text:
        carryText.includes(secret),
      destination_queue_item_id: destinationQueue.queue_item_id,
      destination_receive_receipt_id:
        destinationPulse.receive_receipt_id,
      destination_disposition: 'HOLD',
    },
    return_envelope: {
      return_envelope_id: returnEnvelope.return_envelope_id,
      reply_capability_id: returnEnvelope.reply_capability_id,
      max_replies: returnEnvelope.max_replies,
      delegated_reply_key_is_destination_identity: false,
      shared_session_created: false,
    },
    reply: {
      portable_id: replyPortable.portable_id,
      crossing_id:
        replyRelease.transport_bundle.crossing.crossing_id,
      parent_crossing_id:
        outboundRelease.transport_bundle.crossing.crossing_id,
      parent_preserved:
        replyRelease.transport_bundle.crossing.parents.includes(
          outboundRelease.transport_bundle.crossing.crossing_id,
        ),
      source_receive_receipt_id:
        acceptedReply.receive_receipt_id,
      return_capability_revocation_id:
        acceptedReply.revocation_id,
      source_disposition: 'HOLD',
      second_reply_rejected: secondReplyRejected,
      second_reply_error: secondReplyError,
    },
    final: {
      source_admitted: sourceSnapshot.receiver.admitted,
      source_held: sourceSnapshot.receiver.held,
      destination_admitted: destinationSnapshot.receiver.admitted,
      destination_held: destinationSnapshot.receiver.held,
    },
    laws: [
      'ROAD != PARCEL',
      'FILE != AUTHORITY',
      'ARMOR != AUTHORITY',
      'COPY != NEW CROSSING',
      'PORTABLE != ADMITTED',
      'ONE REPLY DOOR != SHARED SESSION',
      'RETURN INVITATION != ADMISSION',
      'DELEGATED REPLY KEY != HUMAN IDENTITY',
      'REPLY RECEIVED != REPLY ADMITTED',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
