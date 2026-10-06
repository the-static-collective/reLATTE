import {
  canonicalize,
  validateForCanonicalization,
} from './canonical.ts';
import type {
  CarryParcel,
  LocalCarryCard,
} from './carry-card.ts';

export type DoorPostDoorKind = 'selection' | 'branch' | 'return';

export interface DoorPacketV0 {
  schema: 'static.door-packet/0.1';
  packetRef: string;
  source: {
    system: 'upper-room';
    sourceRef: string;
    doorKind: DoorPostDoorKind;
  };
  anchor: {
    translationId: string;
    book: string;
    chapter: number;
    startVerse: number;
    endVerse: number;
  };
  disclosure: {
    includesPrivateText: false;
    includesHumanNote: false;
    includesParticipantIdentity: false;
  };
  authority: null;
  requestedEffect: null;
}

export interface DoorPostReplyV0 {
  schema: 'static.door-post-reply/0.1';
  packetRef: string;
  receiverSystem: string;
  receiverResult: unknown;
  authority: null;
}

const PACKET_KEYS = [
  'schema',
  'packetRef',
  'source',
  'anchor',
  'disclosure',
  'authority',
  'requestedEffect',
] as const;
const SOURCE_KEYS = ['system', 'sourceRef', 'doorKind'] as const;
const ANCHOR_KEYS = [
  'translationId',
  'book',
  'chapter',
  'startVerse',
  'endVerse',
] as const;
const DISCLOSURE_KEYS = [
  'includesPrivateText',
  'includesHumanNote',
  'includesParticipantIdentity',
] as const;
const REPLY_KEYS = [
  'schema',
  'packetRef',
  'receiverSystem',
  'receiverResult',
  'authority',
] as const;

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function exactKeys(
  value: Record<string, any>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.join('|') !== wanted.join('|')) throw new Error(code);
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(code);
  return value as number;
}

export function normalizeDoorPacketV0(value: unknown): DoorPacketV0 {
  const packet = asRecord(value, 'INVALID_DOOR_PACKET');
  exactKeys(packet, PACKET_KEYS, 'UNEXPECTED_DOOR_PACKET_FIELD');
  if (packet.schema !== 'static.door-packet/0.1') {
    throw new Error('INVALID_DOOR_PACKET_SCHEMA');
  }
  const packetRef = nonEmpty(packet.packetRef, 'INVALID_DOOR_PACKET_REF');
  if (packet.authority !== null) throw new Error('DOOR_PACKET_AUTHORITY_MUST_BE_NULL');
  if (packet.requestedEffect !== null) {
    throw new Error('DOOR_PACKET_REQUESTED_EFFECT_MUST_BE_NULL');
  }

  const source = asRecord(packet.source, 'INVALID_DOOR_PACKET_SOURCE');
  exactKeys(source, SOURCE_KEYS, 'UNEXPECTED_DOOR_PACKET_SOURCE_FIELD');
  if (source.system !== 'upper-room') throw new Error('INVALID_DOOR_PACKET_SOURCE_SYSTEM');
  const sourceRef = nonEmpty(source.sourceRef, 'INVALID_DOOR_PACKET_SOURCE_REF');
  if (!['selection', 'branch', 'return'].includes(source.doorKind)) {
    throw new Error('INVALID_DOOR_PACKET_KIND');
  }

  const anchor = asRecord(packet.anchor, 'INVALID_DOOR_PACKET_ANCHOR');
  exactKeys(anchor, ANCHOR_KEYS, 'UNEXPECTED_DOOR_PACKET_ANCHOR_FIELD');
  const chapter = positiveInteger(anchor.chapter, 'INVALID_DOOR_PACKET_CHAPTER');
  const startVerse = positiveInteger(anchor.startVerse, 'INVALID_DOOR_PACKET_START_VERSE');
  const endVerse = positiveInteger(anchor.endVerse, 'INVALID_DOOR_PACKET_END_VERSE');
  if (endVerse < startVerse) throw new Error('INVALID_DOOR_PACKET_VERSE_RANGE');

  const disclosure = asRecord(
    packet.disclosure,
    'INVALID_DOOR_PACKET_DISCLOSURE',
  );
  exactKeys(
    disclosure,
    DISCLOSURE_KEYS,
    'UNEXPECTED_DOOR_PACKET_DISCLOSURE_FIELD',
  );
  if (
    disclosure.includesPrivateText !== false ||
    disclosure.includesHumanNote !== false ||
    disclosure.includesParticipantIdentity !== false
  ) {
    throw new Error('DOOR_PACKET_PRIVATE_DISCLOSURE_FORBIDDEN');
  }

  return {
    schema: 'static.door-packet/0.1',
    packetRef,
    source: {
      system: 'upper-room',
      sourceRef,
      doorKind: source.doorKind as DoorPostDoorKind,
    },
    anchor: {
      translationId: nonEmpty(
        anchor.translationId,
        'INVALID_DOOR_PACKET_TRANSLATION',
      ),
      book: nonEmpty(anchor.book, 'INVALID_DOOR_PACKET_BOOK'),
      chapter,
      startVerse,
      endVerse,
    },
    disclosure: {
      includesPrivateText: false,
      includesHumanNote: false,
      includesParticipantIdentity: false,
    },
    authority: null,
    requestedEffect: null,
  };
}

export function buildDoorPostCard(args: {
  packet: unknown;
  sourceLocalContext?: string[];
  expires_at?: string | null;
}): LocalCarryCard {
  const packet = normalizeDoorPacketV0(args.packet);
  const encoded = canonicalize(packet);
  const local = args.sourceLocalContext ?? [];
  if (
    local.some(
      (entry) => typeof entry !== 'string' || entry.trim() === '',
    )
  ) {
    throw new Error('INVALID_DOOR_POST_LOCAL_CONTEXT');
  }
  return {
    schema: 'relatte.local-carry-card/v0',
    human_intent: `carry one portable Scripture door: ${packet.packetRef}`,
    offered_context: [encoded, ...local],
    admitted_context: [encoded],
    open_questions: [],
    expires_at: args.expires_at ?? null,
  };
}

export function openDoorPostParcel(parcel: CarryParcel): DoorPacketV0 {
  if (parcel.schema !== 'relatte.carry-parcel/v0') {
    throw new Error('INVALID_DOOR_POST_PARCEL');
  }
  if (parcel.admitted_context.length !== 1) {
    throw new Error('DOOR_POST_REQUIRES_ONE_PACKET');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(parcel.admitted_context[0]!);
  } catch {
    throw new Error('INVALID_DOOR_POST_PACKET_JSON');
  }
  return normalizeDoorPacketV0(decoded);
}

export function normalizeDoorPostReplyV0(value: unknown): DoorPostReplyV0 {
  const reply = asRecord(value, 'INVALID_DOOR_POST_REPLY');
  exactKeys(reply, REPLY_KEYS, 'UNEXPECTED_DOOR_POST_REPLY_FIELD');
  if (reply.schema !== 'static.door-post-reply/0.1') {
    throw new Error('INVALID_DOOR_POST_REPLY_SCHEMA');
  }
  if (reply.authority !== null) throw new Error('DOOR_POST_REPLY_AUTHORITY_MUST_BE_NULL');
  validateForCanonicalization(reply.receiverResult);
  return {
    schema: 'static.door-post-reply/0.1',
    packetRef: nonEmpty(reply.packetRef, 'INVALID_DOOR_POST_REPLY_PACKET_REF'),
    receiverSystem: nonEmpty(
      reply.receiverSystem,
      'INVALID_DOOR_POST_REPLY_RECEIVER',
    ),
    receiverResult: structuredClone(reply.receiverResult),
    authority: null,
  };
}

export function buildDoorPostReplyCard(
  value: unknown,
  expires_at: string | null = null,
): LocalCarryCard {
  const reply = normalizeDoorPostReplyV0(value);
  const encoded = canonicalize(reply);
  return {
    schema: 'relatte.local-carry-card/v0',
    human_intent: `return one bounded door result: ${reply.packetRef}`,
    offered_context: [encoded],
    admitted_context: [encoded],
    open_questions: [],
    expires_at,
  };
}

export function openDoorPostReplyParcel(
  parcel: CarryParcel,
): DoorPostReplyV0 {
  if (parcel.schema !== 'relatte.carry-parcel/v0') {
    throw new Error('INVALID_DOOR_POST_REPLY_PARCEL');
  }
  if (parcel.admitted_context.length !== 1) {
    throw new Error('DOOR_POST_REPLY_REQUIRES_ONE_RESULT');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(parcel.admitted_context[0]!);
  } catch {
    throw new Error('INVALID_DOOR_POST_REPLY_JSON');
  }
  return normalizeDoorPostReplyV0(decoded);
}
