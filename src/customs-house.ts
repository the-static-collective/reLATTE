import type {
  CarryParcel,
  LocalCarryCard,
} from './carry-card.ts';

export type CustomsDepartureDecision =
  | 'DRAFT'
  | 'RELEASE'
  | 'CANCEL';

export type CustomsArrivalDecision =
  | 'UNDECIDED'
  | 'ADMIT'
  | 'HOLD'
  | 'REFUSE'
  | 'RETURN';

export interface CustomsDepartureItem {
  text: string;
  selected_to_carry: boolean;
}

export interface CustomsDepartureView {
  schema: 'relatte.customs-departure-view/v0';
  locality: 'source-local-only';
  transmittable: false;
  human_intent: string;
  items: CustomsDepartureItem[];
  open_questions: string[];
  staying_home_count: number;
  expires_at: string | null;
  decision: CustomsDepartureDecision;
  released_parcel_id: string | null;
  laws: string[];
}

export interface CustomsReleasedPreview {
  schema: 'relatte.customs-released-preview/v0';
  locality: 'safe-release-preview';
  human_intent: string;
  carrying: string[];
  open_questions: string[];
  staying_home_count: number;
  expires_at: string | null;
  parcel_id: string;
  laws: string[];
}

export interface CustomsArrivalView {
  schema: 'relatte.customs-arrival-view/v0';
  locality: 'destination-local-only';
  crossing_id: string;
  parcel_id: string;
  human_intent: string;
  carrying: string[];
  open_questions: string[];
  source_withheld_count: number;
  source_withheld_text_available: false;
  received: boolean;
  decrypted: boolean;
  admitted: boolean;
  held: boolean;
  refused: boolean;
  returned: boolean;
  decision: CustomsArrivalDecision;
  receive_receipt_id: string | null;
  disposition_receipt_id: string | null;
  laws: string[];
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function uniqueStrings(value: string[]): string[] {
  return [...new Set(value)];
}

function validateLocalCard(card: LocalCarryCard): void {
  if (card.schema !== 'relatte.local-carry-card/v0') {
    throw new Error('INVALID_CUSTOMS_LOCAL_CARD');
  }
  nonEmpty(card.human_intent, 'INVALID_CUSTOMS_HUMAN_INTENT');
  if (
    !Array.isArray(card.offered_context) ||
    !Array.isArray(card.admitted_context) ||
    !Array.isArray(card.open_questions)
  ) {
    throw new Error('INVALID_CUSTOMS_LOCAL_CARD_LISTS');
  }
  const offered = new Set(card.offered_context);
  for (const admitted of card.admitted_context) {
    if (!offered.has(admitted)) {
      throw new Error('CUSTOMS_ADMITTED_CONTEXT_NOT_OFFERED');
    }
  }
}

export function buildCustomsDepartureView(args: {
  card: LocalCarryCard;
  decision?: CustomsDepartureDecision;
  released_parcel_id?: string | null;
}): CustomsDepartureView {
  validateLocalCard(args.card);
  const decision = args.decision ?? 'DRAFT';
  const admitted = new Set(args.card.admitted_context);
  const offered = uniqueStrings(args.card.offered_context);
  const releasedParcelId =
    args.released_parcel_id == null
      ? null
      : nonEmpty(
          args.released_parcel_id,
          'INVALID_CUSTOMS_RELEASED_PARCEL_ID',
        );

  if (decision === 'RELEASE' && releasedParcelId === null) {
    throw new Error('CUSTOMS_RELEASE_REQUIRES_PARCEL_ID');
  }
  if (decision !== 'RELEASE' && releasedParcelId !== null) {
    throw new Error('CUSTOMS_PARCEL_ID_WITHOUT_RELEASE');
  }

  return {
    schema: 'relatte.customs-departure-view/v0',
    locality: 'source-local-only',
    transmittable: false,
    human_intent: args.card.human_intent,
    items: offered.map((text) => ({
      text,
      selected_to_carry: admitted.has(text),
    })),
    open_questions: [...args.card.open_questions],
    staying_home_count: offered.filter((text) => !admitted.has(text)).length,
    expires_at: args.card.expires_at,
    decision,
    released_parcel_id: releasedParcelId,
    laws: [
      'DEPARTURE VIEW != TRANSPORT BUNDLE',
      'PROJECTION != AUTHORITY',
      'AMEND != RELEASE',
      'RELEASE != ADMISSION',
      'WITHHELD CONTEXT != TRANSMITTED CONTEXT',
    ],
  };
}

export function buildCustomsReleasedPreview(
  parcel: CarryParcel,
): CustomsReleasedPreview {
  if (parcel.schema !== 'relatte.carry-parcel/v0') {
    throw new Error('INVALID_CUSTOMS_CARRY_PARCEL');
  }
  return {
    schema: 'relatte.customs-released-preview/v0',
    locality: 'safe-release-preview',
    human_intent: parcel.human_intent,
    carrying: [...parcel.admitted_context],
    open_questions: [...parcel.open_questions],
    staying_home_count: parcel.withheld_count,
    expires_at: parcel.expires_at,
    parcel_id: parcel.parcel_id,
    laws: [
      'PREVIEW != PARCEL',
      'WITHHELD COUNT != WITHHELD CONTENT',
      'RELEASE != RECEIVE',
      'RELEASE != ADMISSION',
    ],
  };
}

export function buildCustomsArrivalView(args: {
  parcel: CarryParcel;
  crossing_id: string;
  received: boolean;
  decrypted: boolean;
  disposition?: CustomsArrivalDecision;
  receive_receipt_id?: string | null;
  disposition_receipt_id?: string | null;
}): CustomsArrivalView {
  if (args.parcel.schema !== 'relatte.carry-parcel/v0') {
    throw new Error('INVALID_CUSTOMS_CARRY_PARCEL');
  }
  const crossingId = nonEmpty(
    args.crossing_id,
    'INVALID_CUSTOMS_CROSSING_ID',
  );
  const decision = args.disposition ?? 'UNDECIDED';
  const receiveReceiptId =
    args.receive_receipt_id == null
      ? null
      : nonEmpty(
          args.receive_receipt_id,
          'INVALID_CUSTOMS_RECEIVE_RECEIPT_ID',
        );
  const dispositionReceiptId =
    args.disposition_receipt_id == null
      ? null
      : nonEmpty(
          args.disposition_receipt_id,
          'INVALID_CUSTOMS_DISPOSITION_RECEIPT_ID',
        );

  if (!args.received && receiveReceiptId !== null) {
    throw new Error('CUSTOMS_RECEIPT_WITHOUT_RECEIVE');
  }
  if (!args.received && args.decrypted) {
    throw new Error('CUSTOMS_DECRYPT_WITHOUT_RECEIVE');
  }
  if (decision !== 'UNDECIDED' && !args.received) {
    throw new Error('CUSTOMS_DISPOSITION_WITHOUT_RECEIVE');
  }
  if (decision === 'UNDECIDED' && dispositionReceiptId !== null) {
    throw new Error('CUSTOMS_DISPOSITION_RECEIPT_WITHOUT_DECISION');
  }
  if (decision !== 'UNDECIDED' && dispositionReceiptId === null) {
    throw new Error('CUSTOMS_DECISION_REQUIRES_RECEIPT');
  }

  return {
    schema: 'relatte.customs-arrival-view/v0',
    locality: 'destination-local-only',
    crossing_id: crossingId,
    parcel_id: args.parcel.parcel_id,
    human_intent: args.parcel.human_intent,
    carrying: [...args.parcel.admitted_context],
    open_questions: [...args.parcel.open_questions],
    source_withheld_count: args.parcel.withheld_count,
    source_withheld_text_available: false,
    received: args.received,
    decrypted: args.decrypted,
    admitted: decision === 'ADMIT',
    held: decision === 'HOLD',
    refused: decision === 'REFUSE',
    returned: decision === 'RETURN',
    decision,
    receive_receipt_id: receiveReceiptId,
    disposition_receipt_id: dispositionReceiptId,
    laws: [
      'ARRIVAL VIEW != RECEIVER AUTHORITY',
      'PROJECTION != AUTHORITY',
      'RECEIVE != ADMIT',
      'DECRYPTABLE != ADMITTED',
      'SOURCE RELEASE != DESTINATION DECISION',
      'WITHHELD COUNT != WITHHELD CONTENT',
    ],
  };
}
