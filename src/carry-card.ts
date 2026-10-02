import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  encryptPayloadForRecipient,
  type EncryptedPayloadEnvelope,
  type EncryptionOrgan,
} from './encrypted-payload.ts';
import {
  sealCrossingEnvelope,
  verifyCrossingEnvelope,
  type P256KeyMaterial,
} from './protocol.ts';

export const CARRY_PARCEL_ID_DOMAIN = 'reLATTE-CarryParcel-v0|';
export const CARRY_PARCEL_MEDIA_TYPE =
  'application/vnd.relatte.carry-parcel+json';
export const CARRY_ENCRYPTED_MEDIA_TYPE =
  'application/vnd.relatte.encrypted-payload+json';
export const CARRY_DECLARED_KIND = 'CARRY_PARCEL';

export type CarrySourceDecision = 'RELEASE' | 'CANCEL';

export interface LocalCarryCard {
  schema: 'relatte.local-carry-card/v0';
  human_intent: string;
  offered_context: string[];
  admitted_context: string[];
  open_questions: string[];
  expires_at: string | null;
}

export interface CarryParcel {
  schema: 'relatte.carry-parcel/v0';
  parcel_id: string;
  human_intent: string;
  admitted_context: string[];
  open_questions: string[];
  withheld_count: number;
  expires_at: string | null;
  created_at: string;
  laws: string[];
}

export interface CarryTransportBundle {
  schema: 'relatte.carry-transport-bundle/v0';
  crossing: Record<string, any>;
  encrypted_payload: EncryptedPayloadEnvelope;
  laws: string[];
}

export interface SealedCarryRelease {
  parcel: CarryParcel;
  transport_bundle: CarryTransportBundle;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function stringArray(value: unknown, code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(code);
  }
  return [...value];
}

function normalizeLocalCard(value: LocalCarryCard): LocalCarryCard {
  if (value.schema !== 'relatte.local-carry-card/v0') {
    throw new Error('INVALID_CARRY_CARD_SCHEMA');
  }
  const expiresAt = value.expires_at;
  if (expiresAt !== null) validateTimestamp(expiresAt);
  return {
    schema: 'relatte.local-carry-card/v0',
    human_intent: nonEmpty(value.human_intent, 'INVALID_CARRY_INTENT'),
    offered_context: stringArray(
      value.offered_context,
      'INVALID_CARRY_OFFERED_CONTEXT',
    ),
    admitted_context: stringArray(
      value.admitted_context,
      'INVALID_CARRY_ADMITTED_CONTEXT',
    ),
    open_questions: stringArray(
      value.open_questions,
      'INVALID_CARRY_OPEN_QUESTIONS',
    ),
    expires_at: expiresAt,
  };
}

function parcelIdentityBody(
  value: Omit<CarryParcel, 'parcel_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    human_intent: value.human_intent,
    admitted_context: [...value.admitted_context],
    open_questions: [...value.open_questions],
    withheld_count: value.withheld_count,
    expires_at: value.expires_at,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

function parcelId(value: Omit<CarryParcel, 'parcel_id'>): string {
  return `relatte-carry-parcel-v0:${sha256Hex(
    canonicalizeDomainValue(CARRY_PARCEL_ID_DOMAIN, parcelIdentityBody(value)),
  )}`;
}

function verifyCarryParcel(value: unknown): CarryParcel {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_CARRY_PARCEL');
  }
  const parcel = value as Record<string, unknown>;
  if (parcel.schema !== 'relatte.carry-parcel/v0') {
    throw new Error('INVALID_CARRY_PARCEL_SCHEMA');
  }
  const createdAt = nonEmpty(
    parcel.created_at,
    'INVALID_CARRY_PARCEL_CREATED_AT',
  );
  validateTimestamp(createdAt);
  const expiresAt =
    parcel.expires_at === null
      ? null
      : nonEmpty(parcel.expires_at, 'INVALID_CARRY_PARCEL_EXPIRES_AT');
  if (expiresAt !== null) validateTimestamp(expiresAt);
  if (
    typeof parcel.withheld_count !== 'number' ||
    !Number.isSafeInteger(parcel.withheld_count) ||
    parcel.withheld_count < 0
  ) {
    throw new Error('INVALID_CARRY_WITHHELD_COUNT');
  }

  const body: Omit<CarryParcel, 'parcel_id'> = {
    schema: 'relatte.carry-parcel/v0',
    human_intent: nonEmpty(parcel.human_intent, 'INVALID_CARRY_INTENT'),
    admitted_context: stringArray(
      parcel.admitted_context,
      'INVALID_CARRY_ADMITTED_CONTEXT',
    ),
    open_questions: stringArray(
      parcel.open_questions,
      'INVALID_CARRY_OPEN_QUESTIONS',
    ),
    withheld_count: parcel.withheld_count,
    expires_at: expiresAt,
    created_at: createdAt,
    laws: stringArray(parcel.laws, 'INVALID_CARRY_LAWS'),
  };

  const expected = parcelId(body);
  if (parcel.parcel_id !== expected) throw new Error('CARRY_PARCEL_ID_MISMATCH');
  return {
    ...body,
    parcel_id: expected,
  };
}

export function releaseCarryCard(args: {
  card: LocalCarryCard;
  decision: CarrySourceDecision;
  created_at: string;
}): CarryParcel {
  validateTimestamp(args.created_at);
  if (args.decision !== 'RELEASE') {
    throw new Error('CARRY_NOT_RELEASED');
  }

  const card = normalizeLocalCard(args.card);
  const admittedSet = new Set(card.admitted_context);
  const withheldCount = card.offered_context.filter(
    (entry) => !admittedSet.has(entry),
  ).length;

  const body: Omit<CarryParcel, 'parcel_id'> = {
    schema: 'relatte.carry-parcel/v0',
    human_intent: card.human_intent,
    admitted_context: [...card.admitted_context],
    open_questions: [...card.open_questions],
    withheld_count: withheldCount,
    expires_at: card.expires_at,
    created_at: args.created_at,
    laws: [
      'RELEASE != ADMISSION',
      'OFFERED CONTEXT != ADMITTED CONTEXT',
      'WITHHELD CONTEXT != TRANSMITTED CONTEXT',
      'PROPOSAL != HUMAN DECISION',
    ],
  };

  return {
    ...body,
    parcel_id: parcelId(body),
  };
}

export async function sealCarryCardForRecipient(args: {
  card: LocalCarryCard;
  decision: CarrySourceDecision;
  created_at: string;
  sender_keys: P256KeyMaterial;
  source_particular: string;
  source_world: string;
  target_world: string;
  capability_id: string;
  recipient_public_key: JsonWebKey;
  return_address?: string | null;
}): Promise<SealedCarryRelease> {
  const parcel = releaseCarryCard({
    card: args.card,
    decision: args.decision,
    created_at: args.created_at,
  });

  const plaintext = new TextEncoder().encode(canonicalize(parcel));
  const encryptedPayload = await encryptPayloadForRecipient({
    plaintext,
    recipient_public_key: args.recipient_public_key,
    context: {
      target_world: nonEmpty(args.target_world, 'INVALID_CARRY_TARGET_WORLD'),
      capability_id: nonEmpty(
        args.capability_id,
        'INVALID_CARRY_CAPABILITY_ID',
      ),
      declared_kind: CARRY_DECLARED_KIND,
      media_type: CARRY_PARCEL_MEDIA_TYPE,
    },
  });

  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: nonEmpty(
      args.source_particular,
      'INVALID_CARRY_SOURCE_PARTICULAR',
    ),
    source_world: nonEmpty(args.source_world, 'INVALID_CARRY_SOURCE_WORLD'),
    source_history_head: null,
    parents: [],
    declared_kind: CARRY_DECLARED_KIND,
    payload_refs: [{
      address: encryptedPayload.envelope_id,
      role: 'sealed-carry-parcel',
      media_type: CARRY_ENCRYPTED_MEDIA_TYPE,
    }],
    requested_effect: {
      requested: 'consider-carry-parcel',
      automatic_admission: false,
    },
    capability_ref: args.capability_id,
    privacy_policy: {
      profile: encryptedPayload.profile,
      plaintext_embedded: false,
    },
    audience_policy: {
      target_world: args.target_world,
    },
    return_address: args.return_address ?? null,
    created_at: args.created_at,
    extensions: {
      carry_card: {
        profile: 'relatte.carry-card/v0',
        parcel_id: parcel.parcel_id,
        source_decision: 'RELEASE',
        plaintext_embedded: false,
        laws: [
          'RELEASE != ADMISSION',
          'WITHHELD CONTEXT != TRANSMITTED CONTEXT',
        ],
      },
    },
  }, args.sender_keys);

  return {
    parcel,
    transport_bundle: {
      schema: 'relatte.carry-transport-bundle/v0',
      crossing,
      encrypted_payload: encryptedPayload,
      laws: [
        'TRANSPORT != AUTHORITY',
        'RELEASE != ADMISSION',
        'CIPHERTEXT != AUTHORITY',
        'WITHHELD CONTEXT != TRANSMITTED CONTEXT',
      ],
    },
  };
}

export async function openCarryTransportBundle(args: {
  bundle: CarryTransportBundle;
  encryption: EncryptionOrgan;
}): Promise<CarryParcel> {
  if (args.bundle.schema !== 'relatte.carry-transport-bundle/v0') {
    throw new Error('INVALID_CARRY_BUNDLE_SCHEMA');
  }
  if (!(await verifyCrossingEnvelope(args.bundle.crossing))) {
    throw new Error('INVALID_CARRY_CROSSING');
  }

  const crossing = args.bundle.crossing;
  if (crossing.declared_kind !== CARRY_DECLARED_KIND) {
    throw new Error('INVALID_CARRY_CROSSING_KIND');
  }
  if (
    !Array.isArray(crossing.payload_refs) ||
    crossing.payload_refs.length !== 1 ||
    crossing.payload_refs[0]?.address !==
      args.bundle.encrypted_payload.envelope_id ||
    crossing.payload_refs[0]?.role !== 'sealed-carry-parcel'
  ) {
    throw new Error('CARRY_PAYLOAD_REF_MISMATCH');
  }

  const encrypted = args.bundle.encrypted_payload;
  if (encrypted.context.target_world !== args.encryption.world_id) {
    throw new Error('CARRY_TARGET_WORLD_MISMATCH');
  }
  if (encrypted.context.capability_id !== crossing.capability_ref) {
    throw new Error('CARRY_CAPABILITY_CONTEXT_MISMATCH');
  }
  if (encrypted.context.declared_kind !== CARRY_DECLARED_KIND) {
    throw new Error('CARRY_KIND_CONTEXT_MISMATCH');
  }
  if (encrypted.context.media_type !== CARRY_PARCEL_MEDIA_TYPE) {
    throw new Error('CARRY_MEDIA_TYPE_MISMATCH');
  }

  const opened = await args.encryption.decrypt(encrypted);
  const parcel = verifyCarryParcel(
    JSON.parse(new TextDecoder().decode(opened.plaintext)),
  );

  const extensionParcelId = crossing.extensions?.carry_card?.parcel_id;
  if (extensionParcelId !== parcel.parcel_id) {
    throw new Error('CARRY_EXTENSION_PARCEL_ID_MISMATCH');
  }
  return parcel;
}
