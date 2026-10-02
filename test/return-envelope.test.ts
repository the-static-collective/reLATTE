import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openCarryTransportBundle,
  sealCarryCardForRecipient,
  type LocalCarryCard,
} from '../src/carry-card.ts';
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

test('one return envelope carries one reply door, not a shared session', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-return-envelope-'));
  try {
    const source = await ReLatteRuntime.create({
      root: join(workspace, 'source'),
      manifest: createWorldManifest({
        world_id: 'world:return:source',
        receiver_particular: 'particular:return:source',
        receiver_contract_ref: 'relatte:return-envelope-unit/v0',
      }),
      created_at: '2026-10-02T05:10:00.000Z',
    });
    const destination = await ReLatteRuntime.create({
      root: join(workspace, 'destination'),
      manifest: createWorldManifest({
        world_id: 'world:return:destination',
        receiver_particular: 'particular:return:destination',
        receiver_contract_ref: 'relatte:return-envelope-unit/v0',
      }),
      created_at: '2026-10-02T05:10:00.000Z',
    });

    const sourceOutbound = await generateP256KeyPair();
    const destinationGrant =
      await destination.capabilityKernel.issueReceiveCapability({
        holder_public_key: sourceOutbound.publicKeyJwk,
        declared_kind: 'CARRY_PARCEL',
        not_before: '2026-10-02T05:10:00.000Z',
        expires_at: '2026-10-03T05:10:00.000Z',
        created_at: '2026-10-02T05:10:01.000Z',
      });

    const outboundCard: LocalCarryCard = {
      schema: 'relatte.local-carry-card/v0',
      human_intent: 'ask for one bounded response',
      offered_context: ['question context'],
      admitted_context: ['question context'],
      open_questions: ['what should return?'],
      expires_at: null,
    };

    const outbound = await sealCarryCardForRecipient({
      card: outboundCard,
      decision: 'RELEASE',
      created_at: '2026-10-02T05:10:02.000Z',
      sender_keys: sourceOutbound,
      source_particular: 'particular:return:source:outbound',
      source_world: source.manifest.world_id,
      target_world: destination.manifest.world_id,
      capability_id: destinationGrant.capability_id,
      recipient_public_key: destination.encryption.public_key_jwk,
      return_address: source.manifest.world_id,
    });

    const returnEnvelope = await createReturnEnvelope({
      source_runtime: source,
      parent_crossing_id: outbound.transport_bundle.crossing.crossing_id,
      recipient_world: destination.manifest.world_id,
      recipient_encryption_public_key: destination.encryption.public_key_jwk,
      reply_kind: 'CARRY_PARCEL',
      created_at: '2026-10-02T05:10:03.000Z',
      expires_at: '2026-10-03T05:10:03.000Z',
    });

    const openedReturn = await openReturnEnvelope({
      envelope: returnEnvelope,
      encryption: destination.encryption,
      observed_at: '2026-10-02T05:11:00.000Z',
    });

    const replyCard: LocalCarryCard = {
      schema: 'relatte.local-carry-card/v0',
      human_intent: 'return one bounded answer',
      offered_context: ['the answer'],
      admitted_context: ['the answer'],
      open_questions: [],
      expires_at: null,
    };

    const reply = await sealCarryCardForRecipient({
      card: replyCard,
      decision: 'RELEASE',
      created_at: '2026-10-02T05:11:01.000Z',
      sender_keys: openedReturn.reply_keys,
      source_particular: 'particular:return:delegated-mail-key',
      source_world: destination.manifest.world_id,
      target_world: source.manifest.world_id,
      capability_id: returnEnvelope.reply_capability_id,
      recipient_public_key: returnEnvelope.source_encryption_public_key,
      return_address: destination.manifest.world_id,
      parents: [outbound.transport_bundle.crossing.crossing_id],
    });

    const accepted = await acceptReturnResponse({
      source_runtime: source,
      envelope: returnEnvelope,
      response_crossing: reply.transport_bundle.crossing,
      observed_at: '2026-10-02T05:11:02.000Z',
      committed_at: '2026-10-02T05:11:03.000Z',
    });

    assert.equal(accepted.response_crossing_id, reply.transport_bundle.crossing.crossing_id);
    assert.equal(accepted.pulse.status, 'processed');
    assert.equal(
      await source.capabilityKernel.isRevoked(
        returnEnvelope.reply_capability_id,
        '2026-10-02T05:11:04.000Z',
      ),
      true,
    );

    const openedReply = await openCarryTransportBundle({
      bundle: reply.transport_bundle,
      encryption: source.encryption,
    });
    assert.deepEqual(openedReply.admitted_context, ['the answer']);

    const secondReply = await sealCarryCardForRecipient({
      card: replyCard,
      decision: 'RELEASE',
      created_at: '2026-10-02T05:11:05.000Z',
      sender_keys: openedReturn.reply_keys,
      source_particular: 'particular:return:delegated-mail-key',
      source_world: destination.manifest.world_id,
      target_world: source.manifest.world_id,
      capability_id: returnEnvelope.reply_capability_id,
      recipient_public_key: returnEnvelope.source_encryption_public_key,
      parents: [outbound.transport_bundle.crossing.crossing_id],
    });

    await assert.rejects(
      () => acceptReturnResponse({
        source_runtime: source,
        envelope: returnEnvelope,
        response_crossing: secondReply.transport_bundle.crossing,
        observed_at: '2026-10-02T05:11:06.000Z',
        committed_at: '2026-10-02T05:11:07.000Z',
      }),
      /CAPABILITY_REVOKED/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
