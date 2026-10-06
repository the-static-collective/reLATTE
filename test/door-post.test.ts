import assert from 'node:assert/strict';
import test from 'node:test';

import type { CarryParcel } from '../src/carry-card.ts';
import {
  buildDoorPostCard,
  buildDoorPostReplyCard,
  openDoorPostParcel,
  openDoorPostReplyParcel,
} from '../src/door-post.ts';

const packet = {
  schema: 'static.door-packet/0.1',
  packetRef: 'door:upper-room:001',
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

test('Door Post card releases the door packet while source-local context stays home', () => {
  const card = buildDoorPostCard({
    packet,
    sourceLocalContext: ['Paula said something private', 'room-presence:lu,paula,ron'],
  });

  assert.equal(card.schema, 'relatte.local-carry-card/v0');
  assert.equal(card.admitted_context.length, 1);
  assert.equal(card.admitted_context[0]?.includes(packet.packetRef), true);
  assert.equal(card.admitted_context.some((entry) => entry.includes('Paula said')), false);
  assert.equal(card.admitted_context.some((entry) => entry.includes('room-presence')), false);
  assert.equal(card.offered_context.length, 3);
});

test('Door Post opens only a single valid authority-free door packet', () => {
  const card = buildDoorPostCard({ packet, sourceLocalContext: ['private'] });
  const parcel: CarryParcel = {
    schema: 'relatte.carry-parcel/v0',
    parcel_id: 'relatte-carry-parcel-v0:test',
    human_intent: card.human_intent,
    admitted_context: [...card.admitted_context],
    open_questions: [],
    withheld_count: 1,
    expires_at: null,
    created_at: '2026-10-06T02:00:00.000Z',
    laws: [],
  };

  assert.deepEqual(openDoorPostParcel(parcel), packet);

  const smuggled = structuredClone(packet) as any;
  smuggled.authority = 'upper-room';
  const badParcel = {
    ...parcel,
    admitted_context: [JSON.stringify(smuggled)],
  };
  assert.throws(() => openDoorPostParcel(badParcel), /authority/i);
});

test('Door Post reply wrapper correlates a return without interpreting receiver semantics', () => {
  const reply = {
    schema: 'static.door-post-reply/0.1',
    packetRef: packet.packetRef,
    receiverSystem: 'revival',
    receiverResult: {
      schema: 'revival.external-door-candidate/0.1',
      status: 'held',
      revivalAddress: null,
      authority: null,
    },
    authority: null,
  } as const;

  const card = buildDoorPostReplyCard(reply);
  const parcel: CarryParcel = {
    schema: 'relatte.carry-parcel/v0',
    parcel_id: 'relatte-carry-parcel-v0:reply',
    human_intent: card.human_intent,
    admitted_context: [...card.admitted_context],
    open_questions: [],
    withheld_count: 0,
    expires_at: null,
    created_at: '2026-10-06T02:01:00.000Z',
    laws: [],
  };

  assert.deepEqual(openDoorPostReplyParcel(parcel), reply);
});
