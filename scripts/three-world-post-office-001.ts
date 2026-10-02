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
  type PortableCarryArtifact,
} from '../src/portable-carry.ts';
import {
  acceptReturnResponse,
  createReturnEnvelope,
  openReturnEnvelope,
} from '../src/return-envelope.ts';
import {
  buildStaticPostCompositorDraft,
  buildStaticPostStamp,
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

const workspace = await mkdtemp(join(tmpdir(), 'relatte-three-world-post-office-001-'));

const sourceRoot = join(workspace, 'source');
const cedarRoot = join(workspace, 'cedar');
const riverRoot = join(workspace, 'river');
const emberRoot = join(workspace, 'ember');
const horizonRoot = join(workspace, 'horizon');

async function makeRuntime(args: {
  root: string;
  world: string;
  particular: string;
}): Promise<ReLatteRuntime> {
  return ReLatteRuntime.create({
    root: args.root,
    manifest: createWorldManifest({
      world_id: args.world,
      receiver_particular: args.particular,
      receiver_contract_ref: 'relatte:three-world-post-office-001/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T06:00:00.000Z',
  });
}

type RecipientSpec = {
  name: 'cedar' | 'river' | 'ember';
  runtime: ReLatteRuntime;
  road: 'file' | 'carry-text' | 'copy';
  response: string[];
};

async function crossDumbRoad(args: {
  artifact: PortableCarryArtifact;
  road: RecipientSpec['road'];
  name: string;
}): Promise<PortableCarryArtifact> {
  if (args.road === 'file') {
    const path = join(workspace, `${args.name}.carry`);
    await writeFile(path, serializePortableCarry(args.artifact), 'utf8');
    return deserializePortableCarry(await readFile(path, 'utf8'));
  }

  if (args.road === 'carry-text') {
    return dearmorPortableCarry(armorPortableCarry(args.artifact));
  }

  return deserializePortableCarry(
    JSON.stringify(JSON.parse(serializePortableCarry(args.artifact))),
  );
}

try {
  const source = await makeRuntime({
    root: sourceRoot,
    world: 'world:post-office:source',
    particular: 'particular:post-office:source',
  });
  const cedar = await makeRuntime({
    root: cedarRoot,
    world: 'world:post-office:cedar',
    particular: 'particular:post-office:cedar',
  });
  const river = await makeRuntime({
    root: riverRoot,
    world: 'world:post-office:river',
    particular: 'particular:post-office:river',
  });
  const ember = await makeRuntime({
    root: emberRoot,
    world: 'world:post-office:ember',
    particular: 'particular:post-office:ember',
  });
  const horizon = await makeRuntime({
    root: horizonRoot,
    world: 'world:post-office:horizon',
    particular: 'particular:post-office:horizon',
  });

  const sourceOutbound = await generateP256KeyPair();
  const letterCard: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent:
      'invent one reproducible visual limitation for a handmade-feeling video',
    offered_context: [
      'The video should feel handmade rather than synthetic.',
      'The limitation must be simple enough to reproduce.',
      'Repetition is allowed to become part of the visual language.',
      'Do not optimize toward a winner; preserve useful divergence.',
      'SOURCE-ONLY-NOTE-MUST-STAY-HOME',
    ],
    admitted_context: [
      'The video should feel handmade rather than synthetic.',
      'The limitation must be simple enough to reproduce.',
      'Repetition is allowed to become part of the visual language.',
      'Do not optimize toward a winner; preserve useful divergence.',
    ],
    open_questions: [
      'Which limitation should become the visual grammar?',
    ],
    expires_at: '2026-10-03T06:00:00.000Z',
  };

  const recipients: RecipientSpec[] = [
    {
      name: 'cedar',
      runtime: cedar,
      road: 'file',
      response: [
        'Let repetition become the visible frame rule.',
        'Change content inside the frame, not the frame itself.',
      ],
    },
    {
      name: 'river',
      runtime: river,
      road: 'carry-text',
      response: [
        'Use a restricted palette so movement carries complexity.',
        'Let the limitation be obvious enough to feel intentional.',
      ],
    },
    {
      name: 'ember',
      runtime: ember,
      road: 'copy',
      response: [
        'Fix the shot count and mutate density inside each shot.',
        'Preserve one unresolved contradiction instead of smoothing it.',
      ],
    },
  ];

  const outboundArtifacts: Array<{
    recipient_world: string;
    artifact: PortableCarryArtifact;
  }> = [];

  const outboundByWorld = new Map<string, {
    artifact: PortableCarryArtifact;
    receivedArtifact: PortableCarryArtifact;
    replyEnvelopeId: string;
    crossingId: string;
  }>();

  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index];
    const capability =
      await recipient.runtime.capabilityKernel.issueReceiveCapability({
        holder_public_key: sourceOutbound.publicKeyJwk,
        declared_kind: 'CARRY_PARCEL',
        not_before: '2026-10-02T06:00:00.000Z',
        expires_at: '2026-10-03T06:00:00.000Z',
        created_at: `2026-10-02T06:00:0${index + 1}.000Z`,
      });

    const release = await sealCarryCardForRecipient({
      card: letterCard,
      decision: 'RELEASE',
      created_at: '2026-10-02T06:00:10.000Z',
      sender_keys: sourceOutbound,
      source_particular: 'particular:post-office:source:mail-key',
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
      created_at: `2026-10-02T06:00:1${index + 1}.000Z`,
      expires_at: '2026-10-03T06:00:00.000Z',
    });

    const artifact = await createPortableCarry({
      transport_bundle: release.transport_bundle,
      return_envelope: returnEnvelope,
      created_at: `2026-10-02T06:00:2${index + 1}.000Z`,
    });

    const receivedArtifact = await crossDumbRoad({
      artifact,
      road: recipient.road,
      name: recipient.name,
    });

    assert.equal(receivedArtifact.portable_id, artifact.portable_id);

    outboundArtifacts.push({
      recipient_world: recipient.runtime.manifest.world_id,
      artifact,
    });
    outboundByWorld.set(recipient.runtime.manifest.world_id, {
      artifact,
      receivedArtifact,
      replyEnvelopeId: returnEnvelope.return_envelope_id,
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
    created_at: '2026-10-02T06:00:30.000Z',
  });

  const distinctCrossings = new Set(
    dispatch.recipients.map((cover) => cover.crossing_id),
  );
  assert.equal(distinctCrossings.size, 3);
  assert.equal(
    new Set(dispatch.recipients.map((cover) => cover.parcel_id)).size,
    1,
  );

  const outboundStamps = dispatch.recipients.map((cover, index) =>
    buildStaticPostStamp({
      direction: 'OUTBOUND',
      world_id: cover.recipient_world,
      crossing_id: cover.crossing_id,
      parcel_id: cover.parcel_id,
      disposition: 'RELEASED',
      stamped_at: `2026-10-02T06:00:3${index + 1}.000Z`,
    })
  );

  const returns: StaticPostReturn[] = [];
  const returnStamps = [];

  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index];
    const outbound = outboundByWorld.get(
      recipient.runtime.manifest.world_id,
    );
    if (!outbound) throw new Error('OUTBOUND_ARTIFACT_NOT_FOUND');

    await recipient.runtime.enqueueForeignCrossing({
      crossing: outbound.receivedArtifact.transport_bundle.crossing,
      enqueued_at: `2026-10-02T06:01:0${index}.000Z`,
      source: `static-post:${recipient.road}`,
    });

    const incomingPulse = await recipient.runtime.pulseOne({
      claimed_at: `2026-10-02T06:01:1${index}.000Z`,
      received_at: `2026-10-02T06:01:2${index}.000Z`,
      committed_at: `2026-10-02T06:01:3${index}.000Z`,
    });
    assert.equal(incomingPulse.status, 'processed');

    const openedLetter = await openCarryTransportBundle({
      bundle: outbound.receivedArtifact.transport_bundle,
      encryption: recipient.runtime.encryption,
    });
    assert.equal(openedLetter.parcel_id, dispatch.parcel_id);

    const recipientHold = await recipient.runtime.receiver.dispose(
      outbound.crossingId,
      'HOLD',
      `2026-10-02T06:01:4${index}.000Z`,
      {
        note: 'hold the common letter while composing one bounded reply',
      },
    );

    const openedReturn = await openReturnEnvelope({
      envelope: outbound.receivedArtifact.return_envelope,
      encryption: recipient.runtime.encryption,
      observed_at: `2026-10-02T06:01:5${index}.000Z`,
    });

    const replyCard: LocalCarryCard = {
      schema: 'relatte.local-carry-card/v0',
      human_intent:
        'return one bounded interpretation of the common letter',
      offered_context: [...recipient.response],
      admitted_context: [...recipient.response],
      open_questions: [],
      expires_at: null,
    };

    const replyRelease = await sealCarryCardForRecipient({
      card: replyCard,
      decision: 'RELEASE',
      created_at: `2026-10-02T06:02:0${index}.000Z`,
      sender_keys: openedReturn.reply_keys,
      source_particular:
        `particular:post-office:${recipient.name}:return-mail-key`,
      source_world: recipient.runtime.manifest.world_id,
      target_world: source.manifest.world_id,
      capability_id:
        openedReturn.envelope.reply_capability_id,
      recipient_public_key:
        openedReturn.envelope.source_encryption_public_key,
      return_address: recipient.runtime.manifest.world_id,
      parents: [outbound.crossingId],
    });

    const replyPortable = await createPortableCarry({
      transport_bundle: replyRelease.transport_bundle,
      created_at: `2026-10-02T06:02:1${index}.000Z`,
    });

    const returnedArtifact = await crossDumbRoad({
      artifact: replyPortable,
      road:
        recipient.road === 'file'
          ? 'carry-text'
          : recipient.road === 'carry-text'
            ? 'copy'
            : 'file',
      name: `${recipient.name}-return`,
    });

    const accepted = await acceptReturnResponse({
      source_runtime: source,
      envelope: openedReturn.envelope,
      response_crossing:
        returnedArtifact.transport_bundle.crossing,
      observed_at: `2026-10-02T06:02:2${index}.000Z`,
      committed_at: `2026-10-02T06:02:3${index}.000Z`,
    });

    const openedReply = await openCarryTransportBundle({
      bundle: returnedArtifact.transport_bundle,
      encryption: source.encryption,
    });

    const sourceHold = await source.receiver.dispose(
      returnedArtifact.transport_bundle.crossing.crossing_id,
      'HOLD',
      `2026-10-02T06:02:4${index}.000Z`,
      {
        note: 'hold each returned letter without ranking or merger',
      },
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
      carried_context: [...openedReply.admitted_context],
      open_questions: [...openedReply.open_questions],
    });

    returnStamps.push(buildStaticPostStamp({
      direction: 'RETURN',
      world_id: recipient.runtime.manifest.world_id,
      crossing_id:
        returnedArtifact.transport_bundle.crossing.crossing_id,
      parcel_id: openedReply.parcel_id,
      receipt_id: sourceHold.receipt_id,
      disposition: 'HOLD',
      stamped_at: `2026-10-02T06:02:5${index}.000Z`,
    }));

    assert.equal(recipientHold.semantic_effect, 'none');
  }

  const postbag = buildStaticPostbag({
    dispatch,
    returns: returns as [
      StaticPostReturn,
      StaticPostReturn,
      StaticPostReturn,
    ],
  });

  const compositor = buildStaticPostCompositorDraft({
    postbag,
    carried_forward: [
      'Let repetition become the visible frame rule.',
      'Use a restricted palette so movement carries complexity.',
      'Preserve one unresolved contradiction instead of smoothing it.',
    ],
    left_home: [
      'Change content inside the frame, not the frame itself.',
      'Let the limitation be obvious enough to feel intentional.',
      'Fix the shot count and mutate density inside each shot.',
    ],
    open_tensions: [
      'Can frame repetition and palette restriction coexist without becoming decorative?',
      'How much contradiction should remain visible in the descendant?',
    ],
    human_intent:
      'carry three selected tensions into a fourth creative world',
    expires_at: '2026-10-03T06:10:00.000Z',
  });

  const horizonKeys = await generateP256KeyPair();
  const horizonCapability =
    await horizon.capabilityKernel.issueReceiveCapability({
      holder_public_key: horizonKeys.publicKeyJwk,
      declared_kind: 'CARRY_PARCEL',
      not_before: '2026-10-02T06:03:00.000Z',
      expires_at: '2026-10-03T06:03:00.000Z',
      created_at: '2026-10-02T06:03:00.000Z',
    });

  const descendant = await sealCarryCardForRecipient({
    card: compositor.descendant_card,
    decision: 'RELEASE',
    created_at: '2026-10-02T06:03:01.000Z',
    sender_keys: horizonKeys,
    source_particular: 'particular:post-office:source:descendant-key',
    source_world: source.manifest.world_id,
    target_world: horizon.manifest.world_id,
    capability_id: horizonCapability.capability_id,
    recipient_public_key: horizon.encryption.public_key_jwk,
    return_address: source.manifest.world_id,
    parents: returns.map((returned) => returned.crossing_id),
  });

  assert.equal(descendant.transport_bundle.crossing.parents.length, 3);
  assert.equal(
    new Set(descendant.transport_bundle.crossing.parents).size,
    3,
  );

  const descendantPortable = await createPortableCarry({
    transport_bundle: descendant.transport_bundle,
    created_at: '2026-10-02T06:03:02.000Z',
  });
  const horizonRoad = await dearmorPortableCarry(
    armorPortableCarry(descendantPortable),
  );

  await horizon.enqueueForeignCrossing({
    crossing: horizonRoad.transport_bundle.crossing,
    enqueued_at: '2026-10-02T06:03:03.000Z',
    source: 'static-post:descendant',
  });
  const horizonPulse = await horizon.pulseOne({
    claimed_at: '2026-10-02T06:03:04.000Z',
    received_at: '2026-10-02T06:03:05.000Z',
    committed_at: '2026-10-02T06:03:06.000Z',
  });
  const openedDescendant = await openCarryTransportBundle({
    bundle: horizonRoad.transport_bundle,
    encryption: horizon.encryption,
  });
  const horizonHold = await horizon.receiver.dispose(
    horizonRoad.transport_bundle.crossing.crossing_id,
    'HOLD',
    '2026-10-02T06:03:07.000Z',
    {
      note: 'fourth world receives composed descendant as a fresh candidate',
    },
  );

  const horizonStamp = buildStaticPostStamp({
    direction: 'OUTBOUND',
    world_id: horizon.manifest.world_id,
    crossing_id:
      horizonRoad.transport_bundle.crossing.crossing_id,
    parcel_id: openedDescendant.parcel_id,
    receipt_id: horizonHold.receipt_id,
    disposition: 'HOLD',
    stamped_at: '2026-10-02T06:03:08.000Z',
  });

  const sourceSnapshot = await source.snapshot();
  const horizonSnapshot = await horizon.snapshot();

  assert.equal(sourceSnapshot.receiver.held.length, 3);
  assert.deepEqual(horizonSnapshot.receiver.admitted, []);
  assert.deepEqual(horizonSnapshot.receiver.held, [
    horizonRoad.transport_bundle.crossing.crossing_id,
  ]);

  console.log(JSON.stringify({
    schema: 'relatte.three-world-post-office-witness/v0',
    dispatch: {
      dispatch_id: dispatch.dispatch_id,
      common_parcel_id: dispatch.parcel_id,
      recipient_worlds:
        dispatch.recipients.map((entry) => entry.recipient_world),
      portable_ids:
        dispatch.recipients.map((entry) => entry.portable_id),
      crossing_ids:
        dispatch.recipients.map((entry) => entry.crossing_id),
      one_letter_body: true,
      recipient_specific_covers: true,
      distinct_crossing_count: distinctCrossings.size,
      roads: recipients.map((entry) => ({
        world_id: entry.runtime.manifest.world_id,
        road: entry.road,
      })),
    },
    returns: {
      postbag_id: postbag.postbag_id,
      count: postbag.returns.length,
      worlds: postbag.returns.map((entry) => entry.world_id),
      crossings: postbag.returns.map((entry) => entry.crossing_id),
      all_held_without_ranking: true,
      source_admitted: sourceSnapshot.receiver.admitted,
      source_held: sourceSnapshot.receiver.held,
    },
    compositor: {
      source_postbag_id: compositor.source_postbag_id,
      available_context_count:
        compositor.available_context.length,
      carried_forward: compositor.carried_forward,
      left_home: compositor.left_home,
      open_tensions: compositor.open_tensions,
      selection_is_explicit: true,
      ranking_performed: false,
    },
    descendant: {
      world_id: horizon.manifest.world_id,
      portable_id: descendantPortable.portable_id,
      crossing_id:
        horizonRoad.transport_bundle.crossing.crossing_id,
      parent_crossing_ids:
        horizonRoad.transport_bundle.crossing.parents,
      parent_count:
        horizonRoad.transport_bundle.crossing.parents.length,
      carried_context: openedDescendant.admitted_context,
      withheld_count: openedDescendant.withheld_count,
      receive_receipt_id: horizonPulse.receive_receipt_id,
      disposition: 'HOLD',
      admitted: horizonSnapshot.receiver.admitted,
    },
    stamps: {
      outbound: outboundStamps,
      returns: returnStamps,
      descendant: horizonStamp,
    },
    laws: [
      'LETTER BODY != COVER',
      'SAME PARCEL != SAME CIPHERTEXT',
      'SAME QUESTION != SHARED WORLD',
      'PARALLEL DELIVERY != CONSENSUS',
      'POSTBAG != MERGER',
      'THREE RETURNS != AGREEMENT',
      'RETURN ORDER != RANKING',
      'SELECTION != RANKING',
      'DESCENDANT != SUMMARY',
      'STAMP != AUTHORITY',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
