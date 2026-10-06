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
} from '../src/carry-card.ts';
import {
  buildDoorPostCard,
  buildDoorPostReplyCard,
  openDoorPostParcel,
  openDoorPostReplyParcel,
} from '../src/door-post.ts';
import {
  armorPortableCarry,
  createPortableCarry,
  dearmorPortableCarry,
  deserializePortableCarry,
  serializePortableCarry,
  type PortableCarryArtifact,
} from '../src/portable-carry.ts';
import {
  acceptReturnResponse,
  createReturnEnvelope,
  openReturnEnvelope,
} from '../src/return-envelope.ts';
import {
  buildStaticPostbag,
  buildThreeWorldDispatch,
  type StaticPostReturn,
} from '../src/static-post-office.ts';
import {
  generateP256KeyPair,
} from '../src/protocol.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';

const workspace = await mkdtemp(join(tmpdir(), 'relatte-door-post-001-'));

async function makeRuntime(
  name: string,
): Promise<ReLatteRuntime> {
  return ReLatteRuntime.create({
    root: join(workspace, name),
    manifest: createWorldManifest({
      world_id: `world:door-post:${name}`,
      receiver_particular: `particular:door-post:${name}`,
      receiver_contract_ref: 'relatte:door-post-001/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-06T02:10:00.000Z',
  });
}

type Road = 'file' | 'carry-text' | 'copy';

async function crossRoad(
  artifact: PortableCarryArtifact,
  road: Road,
  name: string,
): Promise<PortableCarryArtifact> {
  if (road === 'file') {
    const path = join(workspace, `${name}.carry`);
    await writeFile(path, serializePortableCarry(artifact), 'utf8');
    return deserializePortableCarry(await readFile(path, 'utf8'));
  }
  if (road === 'carry-text') {
    return dearmorPortableCarry(armorPortableCarry(artifact));
  }
  return deserializePortableCarry(
    JSON.stringify(JSON.parse(serializePortableCarry(artifact))),
  );
}

const packet = {
  schema: 'static.door-packet/0.1',
  packetRef: 'door:upper-room:john-1-5:001',
  source: {
    system: 'upper-room',
    sourceRef: 'selection:john-1-5',
    doorKind: 'selection',
  },
  anchor: {
    translationId: 'webp',
    book: 'JHN',
    chapter: 1,
    startVerse: 5,
    endVerse: 5,
  },
  disclosure: {
    includesPrivateText: false,
    includesHumanNote: false,
    includesParticipantIdentity: false,
  },
  authority: null,
  requestedEffect: null,
} as const;

const sourceOnlySecret =
  'UPPER-ROOM-PRIVATE-NOTE-MUST-NEVER-BOARD-THE-ROAD';

try {
  const source = await makeRuntime('upper-room');
  const revival = await makeRuntime('revival');
  const dvote = await makeRuntime('dvote');
  const gro = await makeRuntime('gro');

  const outboundKeys = await generateP256KeyPair();
  const card = buildDoorPostCard({
    packet,
    sourceLocalContext: [
      sourceOnlySecret,
      'room-presence:lu,paula,ron',
    ],
  });

  const recipients = [
    {
      system: 'revival',
      runtime: revival,
      road: 'file' as Road,
      receiverResult: {
        schema: 'revival.external-door-candidate/0.1',
        packetRef: packet.packetRef,
        status: 'held',
        revivalAddress: null,
        authority: null,
        claimBoundary: 'external door != source witness',
      },
    },
    {
      system: 'dvote',
      runtime: dvote,
      road: 'carry-text' as Road,
      receiverResult: {
        schema: 'dvote.external-door-candidate/0.1',
        packetRef: packet.packetRef,
        disposition: null,
        witnessReceipt: null,
        authority: null,
        law: 'IMPORT != CROSSING',
      },
    },
    {
      system: 'gro',
      runtime: gro,
      road: 'copy' as Road,
      receiverResult: {
        schema: 'gro.door-admission/0.1',
        packetRef: packet.packetRef,
        localityRef: 'room:gro:door-post-specimen',
        status: 'admitted',
        playable: true,
        localAffordanceRef: 'affordance:open-scripture-door',
        authority: null,
        law: 'ADMISSION IS LOCAL',
      },
    },
  ];

  const outboundArtifacts: Array<{
    recipient_world: string;
    artifact: PortableCarryArtifact;
  }> = [];
  const outboundByWorld = new Map<string, {
    artifact: PortableCarryArtifact;
    receivedArtifact: PortableCarryArtifact;
    crossingId: string;
  }>();

  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index]!;
    const capability =
      await recipient.runtime.capabilityKernel.issueReceiveCapability({
        holder_public_key: outboundKeys.publicKeyJwk,
        declared_kind: 'CARRY_PARCEL',
        not_before: '2026-10-06T02:10:00.000Z',
        expires_at: '2026-10-07T02:10:00.000Z',
        created_at: `2026-10-06T02:10:0${index + 1}.000Z`,
      });

    const release = await sealCarryCardForRecipient({
      card,
      decision: 'RELEASE',
      created_at: '2026-10-06T02:10:10.000Z',
      sender_keys: outboundKeys,
      source_particular: 'particular:door-post:upper-room:mail-key',
      source_world: source.manifest.world_id,
      target_world: recipient.runtime.manifest.world_id,
      capability_id: capability.capability_id,
      recipient_public_key:
        recipient.runtime.encryption.public_key_jwk,
      return_address: source.manifest.world_id,
    });

    const returnEnvelope = await createReturnEnvelope({
      source_runtime: source,
      parent_crossing_id:
        release.transport_bundle.crossing.crossing_id,
      recipient_world: recipient.runtime.manifest.world_id,
      recipient_encryption_public_key:
        recipient.runtime.encryption.public_key_jwk,
      reply_kind: 'CARRY_PARCEL',
      created_at: `2026-10-06T02:10:1${index + 1}.000Z`,
      expires_at: '2026-10-07T02:10:00.000Z',
    });

    const artifact = await createPortableCarry({
      transport_bundle: release.transport_bundle,
      return_envelope: returnEnvelope,
      created_at: `2026-10-06T02:10:2${index + 1}.000Z`,
    });
    const receivedArtifact = await crossRoad(
      artifact,
      recipient.road,
      recipient.system,
    );

    assert.equal(receivedArtifact.portable_id, artifact.portable_id);
    assert.equal(
      serializePortableCarry(receivedArtifact).includes(sourceOnlySecret),
      false,
    );
    assert.equal(
      serializePortableCarry(receivedArtifact).includes(
        'room-presence:lu,paula,ron',
      ),
      false,
    );

    outboundArtifacts.push({
      recipient_world: recipient.runtime.manifest.world_id,
      artifact,
    });
    outboundByWorld.set(recipient.runtime.manifest.world_id, {
      artifact,
      receivedArtifact,
      crossingId: release.transport_bundle.crossing.crossing_id,
    });
  }

  const dispatch = buildThreeWorldDispatch({
    source_world: source.manifest.world_id,
    artifacts: outboundArtifacts as [
      { recipient_world: string; artifact: PortableCarryArtifact },
      { recipient_world: string; artifact: PortableCarryArtifact },
      { recipient_world: string; artifact: PortableCarryArtifact },
    ],
    created_at: '2026-10-06T02:10:30.000Z',
  });

  assert.equal(
    new Set(dispatch.recipients.map((cover) => cover.parcel_id)).size,
    1,
  );
  assert.equal(
    new Set(dispatch.recipients.map((cover) => cover.crossing_id)).size,
    3,
  );

  const returns: StaticPostReturn[] = [];
  const openedReplies = [];

  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index]!;
    const outbound = outboundByWorld.get(
      recipient.runtime.manifest.world_id,
    );
    if (!outbound) throw new Error('DOOR_POST_OUTBOUND_NOT_FOUND');

    await recipient.runtime.enqueueForeignCrossing({
      crossing: outbound.receivedArtifact.transport_bundle.crossing,
      enqueued_at: `2026-10-06T02:11:0${index}.000Z`,
      source: `door-post:${recipient.road}`,
    });
    const inboundPulse = await recipient.runtime.pulseOne({
      claimed_at: `2026-10-06T02:11:1${index}.000Z`,
      received_at: `2026-10-06T02:11:2${index}.000Z`,
      committed_at: `2026-10-06T02:11:3${index}.000Z`,
    });
    assert.equal(inboundPulse.status, 'processed');

    const openedParcel = await openCarryTransportBundle({
      bundle: outbound.receivedArtifact.transport_bundle,
      encryption: recipient.runtime.encryption,
    });
    assert.deepEqual(openDoorPostParcel(openedParcel), packet);

    const receiverHold = await recipient.runtime.receiver.dispose(
      outbound.crossingId,
      'HOLD',
      `2026-10-06T02:11:4${index}.000Z`,
      { note: 'hold shared door before composing receiver-local return' },
    );
    assert.equal(receiverHold.semantic_effect, 'none');

    if (outbound.receivedArtifact.return_envelope === null) {
      throw new Error('DOOR_POST_RETURN_ENVELOPE_MISSING');
    }
    const openedReturn = await openReturnEnvelope({
      envelope: outbound.receivedArtifact.return_envelope,
      encryption: recipient.runtime.encryption,
      observed_at: `2026-10-06T02:11:5${index}.000Z`,
    });

    const replyCard = buildDoorPostReplyCard({
      schema: 'static.door-post-reply/0.1',
      packetRef: packet.packetRef,
      receiverSystem: recipient.system,
      receiverResult: recipient.receiverResult,
      authority: null,
    });

    const replyRelease = await sealCarryCardForRecipient({
      card: replyCard,
      decision: 'RELEASE',
      created_at: `2026-10-06T02:12:0${index}.000Z`,
      sender_keys: openedReturn.reply_keys,
      source_particular:
        `particular:door-post:${recipient.system}:return-key`,
      source_world: recipient.runtime.manifest.world_id,
      target_world: source.manifest.world_id,
      capability_id: openedReturn.envelope.reply_capability_id,
      recipient_public_key:
        openedReturn.envelope.source_encryption_public_key,
      return_address: recipient.runtime.manifest.world_id,
      parents: [outbound.crossingId],
    });

    const replyPortable = await createPortableCarry({
      transport_bundle: replyRelease.transport_bundle,
      created_at: `2026-10-06T02:12:1${index}.000Z`,
    });
    const returnedArtifact = await crossRoad(
      replyPortable,
      recipient.road === 'file'
        ? 'carry-text'
        : recipient.road === 'carry-text'
          ? 'copy'
          : 'file',
      `${recipient.system}-return`,
    );

    const accepted = await acceptReturnResponse({
      source_runtime: source,
      envelope: openedReturn.envelope,
      response_crossing:
        returnedArtifact.transport_bundle.crossing,
      observed_at: `2026-10-06T02:12:2${index}.000Z`,
      committed_at: `2026-10-06T02:12:3${index}.000Z`,
    });

    const openedReplyParcel = await openCarryTransportBundle({
      bundle: returnedArtifact.transport_bundle,
      encryption: source.encryption,
    });
    const openedReply =
      openDoorPostReplyParcel(openedReplyParcel);
    openedReplies.push(openedReply);

    const sourceHold = await source.receiver.dispose(
      returnedArtifact.transport_bundle.crossing.crossing_id,
      'HOLD',
      `2026-10-06T02:12:4${index}.000Z`,
      { note: 'hold receiver return without ranking or merger' },
    );

    returns.push({
      world_id: recipient.runtime.manifest.world_id,
      portable_id: returnedArtifact.portable_id,
      crossing_id:
        returnedArtifact.transport_bundle.crossing.crossing_id,
      parent_crossing_id: outbound.crossingId,
      receive_receipt_id: accepted.receive_receipt_id,
      disposition: 'HOLD',
      disposition_receipt_id: sourceHold.receipt_id,
      carried_context: [...openedReplyParcel.admitted_context],
      open_questions: [],
    });
  }

  const postbag = buildStaticPostbag({
    dispatch,
    returns: returns as [
      StaticPostReturn,
      StaticPostReturn,
      StaticPostReturn,
    ],
  });
  const sourceSnapshot = await source.snapshot();

  assert.equal(postbag.returns.length, 3);
  assert.equal(sourceSnapshot.receiver.held.length, 3);
  assert.deepEqual(sourceSnapshot.receiver.admitted, []);
  assert.deepEqual(
    new Set(openedReplies.map((reply) => reply.receiverSystem)),
    new Set(['revival', 'dvote', 'gro']),
  );
  assert.equal(
    openedReplies.every(
      (reply) =>
        reply.packetRef === packet.packetRef &&
        reply.authority === null,
    ),
    true,
  );

  console.log(JSON.stringify({
    schema: 'relatte.door-post-001-witness/v0',
    packet: {
      packetRef: packet.packetRef,
      anchor: packet.anchor,
      authority: packet.authority,
      requestedEffect: packet.requestedEffect,
    },
    dispatch: {
      dispatch_id: dispatch.dispatch_id,
      common_parcel_id: dispatch.parcel_id,
      recipient_worlds:
        dispatch.recipients.map((entry) => entry.recipient_world),
      crossing_ids:
        dispatch.recipients.map((entry) => entry.crossing_id),
      portable_ids:
        dispatch.recipients.map((entry) => entry.portable_id),
      distinct_cover_count:
        new Set(dispatch.recipients.map((entry) => entry.crossing_id)).size,
      source_private_context_on_road: false,
    },
    returns: {
      postbag_id: postbag.postbag_id,
      count: postbag.returns.length,
      receiver_systems:
        openedReplies.map((reply) => reply.receiverSystem),
      receiver_results:
        openedReplies.map((reply) => reply.receiverResult),
      source_disposition: 'HOLD',
      source_admitted: sourceSnapshot.receiver.admitted,
      automatically_merged: false,
    },
    laws: [
      'DOOR PACKET != ROOM EXPORT',
      'ENVELOPE != LETTER',
      'RELEASE != ADMISSION',
      'SAME PARCEL != SAME CIPHERTEXT',
      'RECIPIENT COVER != GLOBAL BROADCAST',
      'ONE REPLY DOOR != SHARED SESSION',
      'THREE RETURNS != AGREEMENT',
      'POSTBAG != MERGER',
      'PACKET != AUTHORITY',
      'ADMISSION IS LOCAL',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
