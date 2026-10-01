import {
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import {
  buildCom5Room,
  type Com5RoomView,
} from './room.ts';
import type { Com5Observation } from './com5.ts';

const CROSSING_SCHEMA = 'relatte.crossing-envelope/v0';
const RECEIPT_SCHEMA = 'relatte.receipt/v0';

type UnknownRecord = Record<string, unknown>;

export interface RejectedHistoryRecord {
  index: number;
  schema: string | null;
  reason:
    | 'UNKNOWN_SCHEMA'
    | 'INVALID_SIGNATURE_OR_ID'
    | 'ORPHAN_RECEIPT';
}

export interface VerifiedMetabolicNeighborhood {
  focal_subject: string;
  room: Com5RoomView;
  observations: readonly Com5Observation[];
  neighbor_refs: readonly string[];
  accepted_record_count: number;
  rejected_records: readonly RejectedHistoryRecord[];
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function stringValue(record: UnknownRecord, key: string): string | null {
  return typeof record[key] === 'string' && record[key] !== ''
    ? record[key] as string
    : null;
}

function stringArray(record: UnknownRecord, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function payloadAddresses(record: UnknownRecord): string[] {
  const refs = record.payload_refs;
  if (!Array.isArray(refs)) return [];

  const addresses: string[] = [];
  for (const ref of refs) {
    const object = asRecord(ref);
    const address = object === null ? null : stringValue(object, 'address');
    if (address !== null) addresses.push(address);
  }
  return addresses;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function crossingObservations(crossing: UnknownRecord): Com5Observation[] {
  const crossingId = stringValue(crossing, 'crossing_id');
  const sourceParticular = stringValue(crossing, 'source_particular');
  const sourceWorld = stringValue(crossing, 'source_world');
  if (crossingId === null || sourceParticular === null || sourceWorld === null) return [];

  const parentRefs = stringArray(crossing, 'parents');
  const payloadRefs = payloadAddresses(crossing);
  const historyHead = stringValue(crossing, 'source_history_head');

  const evidence = unique([
    sourceParticular,
    sourceWorld,
    ...(historyHead === null ? [] : [historyHead]),
    ...parentRefs,
    ...payloadRefs,
  ]);

  const observations: Com5Observation[] = [
    {
      role: 'COMPOSE',
      subject: crossingId,
      relation: 'declared-relation',
      evidence_refs: evidence,
      note: 'Derived from a cryptographically verified CrossingEnvelopeV0.',
    },
    {
      role: 'COMPOSE',
      subject: sourceParticular,
      relation: 'source-of-crossing',
      evidence_refs: [crossingId],
    },
  ];

  for (const parent of parentRefs) {
    observations.push({
      role: 'COMPOSE',
      subject: parent,
      relation: 'parent-of-crossing',
      evidence_refs: [crossingId],
    });
  }

  for (const payload of payloadRefs) {
    observations.push({
      role: 'COMPOSE',
      subject: payload,
      relation: 'payload-of-crossing',
      evidence_refs: [crossingId],
    });
  }

  return observations;
}

function receiptObservations(receipt: UnknownRecord): Com5Observation[] {
  const receiptId = stringValue(receipt, 'receipt_id');
  const crossingId = stringValue(receipt, 'crossing_id');
  const worldId = stringValue(receipt, 'world_id');
  const receiver = stringValue(receipt, 'receiver_particular');
  const kind = stringValue(receipt, 'kind');
  const effect = stringValue(receipt, 'semantic_effect');

  if (
    receiptId === null
    || crossingId === null
    || worldId === null
    || receiver === null
    || kind === null
    || effect === null
  ) return [];

  const descendants = stringArray(receipt, 'descendant_refs');
  const residuals = stringArray(receipt, 'residual_refs');
  const contractRef = stringValue(receipt, 'contract_ref');
  const preStateRef = stringValue(receipt, 'pre_state_ref');
  const postStateRef = stringValue(receipt, 'post_state_ref');

  const consequenceRefs = unique([
    receiptId,
    worldId,
    receiver,
    ...(contractRef === null ? [] : [contractRef]),
    ...(preStateRef === null ? [] : [preStateRef]),
    ...(postStateRef === null ? [] : [postStateRef]),
    ...descendants,
    ...residuals,
  ]);

  const observations: Com5Observation[] = [
    {
      role: 'COMPUTE',
      subject: crossingId,
      relation: `receiver-receipt:${kind}`,
      evidence_refs: consequenceRefs,
      note: `semantic_effect=${effect}`,
    },
    {
      role: 'COMMUTE',
      subject: crossingId,
      relation: 'receiver-signed-receipt-at',
      evidence_refs: [worldId, receiver, receiptId],
      note: 'Verified crossing plus verified receiver receipt establishes an attributable road to this receiver.',
    },
    {
      role: 'COMPUTE',
      subject: receiver,
      relation: `issued-receipt:${kind}`,
      evidence_refs: [crossingId, receiptId, worldId],
      note: `semantic_effect=${effect}`,
    },
  ];

  if (descendants.length > 0) {
    observations.push({
      role: 'COMPOSE',
      subject: crossingId,
      relation: 'has-descendant',
      evidence_refs: descendants,
    });
  }

  if (residuals.length > 0) {
    observations.push({
      role: 'COMPOST',
      subject: crossingId,
      relation: 'left-residual',
      evidence_refs: residuals,
    });

    for (const residual of residuals) {
      observations.push({
        role: 'COMPOST',
        subject: residual,
        relation: 'residual-of-crossing',
        evidence_refs: [crossingId, receiptId],
      });
    }
  }

  return observations;
}

function directNeighborRefs(
  focalSubject: string,
  observations: readonly Com5Observation[],
): string[] {
  const refs: string[] = [];

  for (const observation of observations) {
    if (observation.subject !== focalSubject) continue;
    for (const ref of observation.evidence_refs ?? []) {
      if (ref !== focalSubject) refs.push(ref);
    }
  }

  return unique(refs);
}

/**
 * Build one-hop COM⁵ neighborhood from supplied, cryptographically verified
 * reLATTE CrossingEnvelopeV0 + ReceiptV0 records.
 *
 * Receipt-derived road/consequence observations require the referenced
 * crossing to be present and verified in the same supplied history cut.
 */
export async function buildVerifiedMetabolicNeighborhood(
  focalSubject: string,
  records: readonly unknown[],
): Promise<VerifiedMetabolicNeighborhood> {
  const verifiedCrossings: UnknownRecord[] = [];
  const candidateReceipts: Array<{ index: number; record: UnknownRecord }> = [];
  const rejected: RejectedHistoryRecord[] = [];

  for (const [index, value] of records.entries()) {
    const record = asRecord(value);
    const schema = record === null ? null : stringValue(record, 'schema');

    if (record === null || schema === null) {
      rejected.push({ index, schema, reason: 'UNKNOWN_SCHEMA' });
      continue;
    }

    if (schema === CROSSING_SCHEMA) {
      if (await verifyCrossingEnvelope(record)) {
        verifiedCrossings.push(record);
      } else {
        rejected.push({ index, schema, reason: 'INVALID_SIGNATURE_OR_ID' });
      }
      continue;
    }

    if (schema === RECEIPT_SCHEMA) {
      if (await verifyReceipt(record)) {
        candidateReceipts.push({ index, record });
      } else {
        rejected.push({ index, schema, reason: 'INVALID_SIGNATURE_OR_ID' });
      }
      continue;
    }

    rejected.push({ index, schema, reason: 'UNKNOWN_SCHEMA' });
  }

  const verifiedCrossingIds = new Set(
    verifiedCrossings
      .map((crossing) => stringValue(crossing, 'crossing_id'))
      .filter((id): id is string => id !== null),
  );

  const verifiedReceipts: UnknownRecord[] = [];
  for (const candidate of candidateReceipts) {
    const crossingId = stringValue(candidate.record, 'crossing_id');
    if (crossingId === null || !verifiedCrossingIds.has(crossingId)) {
      rejected.push({
        index: candidate.index,
        schema: RECEIPT_SCHEMA,
        reason: 'ORPHAN_RECEIPT',
      });
      continue;
    }
    verifiedReceipts.push(candidate.record);
  }

  const observations = [
    ...verifiedCrossings.flatMap(crossingObservations),
    ...verifiedReceipts.flatMap(receiptObservations),
  ];

  return {
    focal_subject: focalSubject,
    room: buildCom5Room(focalSubject, observations),
    observations,
    neighbor_refs: directNeighborRefs(focalSubject, observations),
    accepted_record_count: verifiedCrossings.length + verifiedReceipts.length,
    rejected_records: rejected.sort((a, b) => a.index - b.index),
  };
}

export async function renderVerifiedMetabolicNeighborhood(
  focalSubject: string,
  records: readonly unknown[],
): Promise<string> {
  const neighborhood = await buildVerifiedMetabolicNeighborhood(focalSubject, records);
  const lines = [`COM⁵ verified neighborhood: ${focalSubject}`];

  for (const door of neighborhood.room.doors) {
    lines.push('', `[${door.role}]`);

    if (door.observations.length === 0) {
      lines.push('  (no verified direct observation)');
      continue;
    }

    for (const observation of door.observations) {
      const refs = observation.evidence_refs?.length
        ? ` [${observation.evidence_refs.join(', ')}]`
        : '';
      const note = observation.note ? ` — ${observation.note}` : '';
      lines.push(`  ${observation.relation ?? 'observed'}${refs}${note}`);
    }
  }

  lines.push(
    '',
    `neighbors: ${neighborhood.neighbor_refs.length === 0 ? '(none)' : neighborhood.neighbor_refs.join(', ')}`,
    `accepted records: ${neighborhood.accepted_record_count}`,
    `rejected records: ${neighborhood.rejected_records.length}`,
  );

  return lines.join('\n');
}
