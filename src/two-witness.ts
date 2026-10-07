import {
  canonicalizeDomainValue,
  sha256Hex,
} from './canonical.ts';
import {
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';

export type TwoWitnessStatus = 'CLAIMED' | 'CORROBORATED' | 'HOLD';

export interface TwoWitnessAssessment {
  schema: 'relatte.two-witness-assessment/v0';
  status: TwoWitnessStatus;
  crossing_id: string | null;
  handoff_id: string | null;
  reasons: string[];
  independence_basis: 'NONE' | 'DISTINCT_SIGNING_KEYS_ONLY';
  laws: string[];
}

const LAWS = [
  'ONE WITNESS = CLAIM',
  'TWO MATCHING WITNESSES = CORROBORATED',
  'WITNESS DISAGREEMENT = HOLD',
  'SAME KEY != TWO WITNESSES',
  'DISTINCT KEYS != INDEPENDENT CUSTODY',
  'CORROBORATION != TRUTH',
  'CORROBORATION != ADMISSION',
  'RECEIPT != AUTHORITY',
] as const;

function record(value: unknown): Record<string, any> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, any>;
}

function publicKeyFingerprint(value: unknown): string | null {
  try {
    const signing = record(value);
    const jwk = record(signing?.public_key);
    if (!jwk) return null;
    return sha256Hex(
      canonicalizeDomainValue(
        'reLATTE-TwoWitnessPublicKey-v0|',
        jwk,
      ),
    );
  } catch {
    return null;
  }
}

function hold(
  crossingId: string | null,
  handoffId: string | null,
  reasons: string[],
  independence: TwoWitnessAssessment['independence_basis'] = 'NONE',
): TwoWitnessAssessment {
  return {
    schema: 'relatte.two-witness-assessment/v0',
    status: 'HOLD',
    crossing_id: crossingId,
    handoff_id: handoffId,
    reasons,
    independence_basis: independence,
    laws: [...LAWS],
  };
}

export async function assessTwoWitnessHandoff(args: {
  crossing: unknown;
  receiver_receipt?: unknown | null;
}): Promise<TwoWitnessAssessment> {
  if (!(await verifyCrossingEnvelope(args.crossing))) {
    return hold(null, null, ['INVALID_SOURCE_WITNESS']);
  }

  const crossing = record(args.crossing)!;
  const extensions = record(crossing.extensions);
  const binding = record(extensions?.two_witness_handoff);
  const payloadRefs = Array.isArray(crossing.payload_refs)
    ? crossing.payload_refs
    : [];

  const crossingId =
    typeof crossing.crossing_id === 'string' ? crossing.crossing_id : null;
  const handoffId =
    typeof binding?.handoff_id === 'string' ? binding.handoff_id : null;

  if (
    binding?.schema !== 'relatte.two-witness-handoff/v0' ||
    typeof binding.handoff_id !== 'string' ||
    typeof binding.receiver_world !== 'string' ||
    typeof binding.receiver_particular !== 'string' ||
    typeof binding.thing_ref !== 'string'
  ) {
    return hold(crossingId, handoffId, ['INVALID_HANDOFF_BINDING']);
  }

  const payloadMatches = payloadRefs.some((payload) => {
    const candidate = record(payload);
    return (
      candidate?.role === 'payload' &&
      candidate?.address === binding.thing_ref
    );
  });
  if (!payloadMatches) {
    return hold(crossingId, handoffId, ['HANDOFF_THING_NOT_IN_CROSSING']);
  }

  if (args.receiver_receipt === undefined || args.receiver_receipt === null) {
    return {
      schema: 'relatte.two-witness-assessment/v0',
      status: 'CLAIMED',
      crossing_id: crossingId,
      handoff_id: handoffId,
      reasons: ['SOURCE_WITNESS_ONLY'],
      independence_basis: 'NONE',
      laws: [...LAWS],
    };
  }

  if (!(await verifyReceipt(args.receiver_receipt))) {
    return hold(crossingId, handoffId, ['INVALID_RECEIVER_WITNESS']);
  }

  const receipt = record(args.receiver_receipt)!;
  const receiptExtensions = record(receipt.extensions);
  const receiptBinding = record(receiptExtensions?.two_witness_handoff);

  const sourceKey = publicKeyFingerprint(record(crossing.signing));
  const receiverKey = publicKeyFingerprint(record(receipt.signing));
  if (!sourceKey || !receiverKey) {
    return hold(crossingId, handoffId, ['MISSING_WITNESS_KEY']);
  }
  if (sourceKey === receiverKey) {
    return hold(crossingId, handoffId, ['WITNESS_KEYS_NOT_DISTINCT']);
  }

  const independence = 'DISTINCT_SIGNING_KEYS_ONLY' as const;
  const disagreements: string[] = [];

  if (receipt.crossing_id !== crossing.crossing_id) {
    disagreements.push('CROSSING_ID_DISAGREEMENT');
  }
  if (receipt.world_id !== binding.receiver_world) {
    disagreements.push('RECEIVER_WORLD_DISAGREEMENT');
  }
  if (receipt.receiver_particular !== binding.receiver_particular) {
    disagreements.push('RECEIVER_PARTICULAR_DISAGREEMENT');
  }
  if (receipt.kind !== 'RECEIVED' && receipt.kind !== 'R3_ADMIT') {
    disagreements.push('RECEIVER_DID_NOT_POSITIVELY_RECEIVE');
  }

  if (
    receiptBinding?.schema !== 'relatte.two-witness-handoff/v0' ||
    receiptBinding?.handoff_id !== binding.handoff_id ||
    receiptBinding?.source_particular !== crossing.source_particular ||
    receiptBinding?.receiver_particular !== binding.receiver_particular ||
    receiptBinding?.receiver_world !== binding.receiver_world ||
    receiptBinding?.thing_ref !== binding.thing_ref
  ) {
    disagreements.push('HANDOFF_BINDING_DISAGREEMENT');
  }

  if (disagreements.length > 0) {
    return hold(crossingId, handoffId, disagreements, independence);
  }

  return {
    schema: 'relatte.two-witness-assessment/v0',
    status: 'CORROBORATED',
    crossing_id: crossingId,
    handoff_id: handoffId,
    reasons: ['MATCHING_SIGNED_SOURCE_AND_RECEIVER_WITNESSES'],
    independence_basis: independence,
    laws: [...LAWS],
  };
}
