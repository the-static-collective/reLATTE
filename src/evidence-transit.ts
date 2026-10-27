import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealCrossingEnvelope } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import type { LocalReceiver } from './receiver.ts';

/**
 * EVIDENCE-TRANSIT-001: move source observations, not truth or authority.
 *
 * A source adapter makes a narrow, content-addressed claim. The sender signs
 * the crossing with a separately provisioned P-256 key. The destination
 * decides independently whether to HOLD, REFUSE, or ADMIT. Even ADMIT only
 * permits an observation to be stored, not a task to be closed.
 */
export const EVIDENCE_EVENT_DOMAIN = 'reLATTE-EvidenceObservation-v0|';
const HASH = /^sha256:[a-f0-9]{64}$/;

export interface EvidenceObservation {
  schema: 'relatte.evidence-observation/v0';
  source_system: string;
  source_world: string;
  source_particular: string;
  source_event_id: string;
  /** Opaque source-local reference; never an email address or person identifier. */
  subject_ref: string;
  /** Describes exactly the observed property (e.g. github.pull_request.state). */
  assertion_kind: string;
  /** Digest of an independently retrievable source record, not its unverified URL. */
  payload_ref: string;
  /** Domain-neutral epistemic state: never silently upgrade to field proof. */
  evidence_level: 'claim' | 'source_observed' | 'bytes_verified';
  occurred_at: string;
  observed_at: string;
}

export interface EvidenceDisposition {
  disposition: 'HOLD' | 'REFUSE' | 'ADMIT';
  reason: string;
}

export interface EvidenceSinkResult {
  status: 'stored' | 'already-stored';
  record_ref?: string;
}

export interface EvidenceRoute {
  destination: string;
  capability_ref: string | null;
  source_keys: P256KeyMaterial;
  receiver: LocalReceiver;
  received_at: () => string;
  /**
   * Owner-local policy checks source key binding, evidence, freshness, scope,
   * capability, and rights. Missing policy means HOLD.
   */
  evaluate?: (observation: Readonly<EvidenceObservation>, crossing: Readonly<Record<string, any>>) =>
    Promise<EvidenceDisposition>;
  /** Must atomically dedupe event_id, including after a network timeout. */
  store?: (observation: Readonly<EvidenceObservation>, context: {
    event_id: string;
    crossing_id: string;
  }) => Promise<EvidenceSinkResult>;
}

export interface EvidenceTransitResult {
  schema: 'relatte.evidence-transit-result/v0';
  event_id: string;
  crossing_id: string;
  receive_receipt_id: string;
  disposition_receipt_id: string | null;
  status: 'HELD' | 'REFUSED' | 'BLOCKED' | 'STORED' | 'ALREADY_STORED';
  reason: string;
  record_ref: string | null;
}

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new Error('INVALID_EVIDENCE_' + name);
  }
  if (value.includes('@') || /[\r\n\x00-\x1f]/.test(value)) {
    throw new Error('UNSAFE_EVIDENCE_' + name);
  }
  return value;
}

export function validateEvidenceObservation(value: EvidenceObservation): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schema !== 'relatte.evidence-observation/v0') {
    throw new Error('INVALID_EVIDENCE_SCHEMA');
  }
  const expected = [
    'schema', 'source_system', 'source_world', 'source_particular',
    'source_event_id', 'subject_ref', 'assertion_kind', 'payload_ref',
    'evidence_level', 'occurred_at', 'observed_at',
  ];
  if (Object.keys(value).sort().join('|') !== expected.sort().join('|')) {
    throw new Error('UNEXPECTED_EVIDENCE_FIELD');
  }
  for (const field of [
    'source_system','source_world','source_particular','source_event_id',
    'subject_ref','assertion_kind',
  ] as const) required(value[field], field.toUpperCase());
  if (!HASH.test(value.payload_ref)) throw new Error('INVALID_EVIDENCE_PAYLOAD_REF');
  if (!['claim','source_observed','bytes_verified'].includes(value.evidence_level)) {
    throw new Error('INVALID_EVIDENCE_LEVEL');
  }
  validateTimestamp(value.occurred_at);
  validateTimestamp(value.observed_at);
}

export function evidenceEventId(observation: EvidenceObservation): string {
  validateEvidenceObservation(observation);
  return 'relatte-evidence-event-v0:' +
    sha256Hex(canonicalizeDomainValue(EVIDENCE_EVENT_DOMAIN, observation));
}

export async function sealEvidenceObservation(
  observation: EvidenceObservation,
  destination: string,
  keys: P256KeyMaterial,
  capabilityRef: string | null,
): Promise<Record<string, any>> {
  const eventId = evidenceEventId(observation);
  required(destination, 'DESTINATION');
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: observation.source_particular,
    source_world: observation.source_world,
    source_history_head: null,
    parents: [],
    declared_kind: 'EVIDENCE_OBSERVATION',
    payload_refs: [{
      address: observation.payload_ref,
      role: 'source-owned-evidence-reference',
      media_type: 'application/octet-stream',
    }],
    requested_effect: { kind: 'store-observation', destination },
    capability_ref: capabilityRef,
    privacy_policy: 'payload-not-in-envelope',
    audience_policy: destination,
    return_address: null,
    created_at: observation.observed_at,
    extensions: {
      evidence_transit: {
        schema: 'relatte.evidence-reference/v0',
        event_id: eventId,
        source_event_id: observation.source_event_id,
        assertion_kind: observation.assertion_kind,
        evidence_level: observation.evidence_level,
        laws: [
          'OBSERVATION != TRUTH',
          'SOURCE_SIGNATURE != SOURCE_AUTHORITY',
          'ADMISSION != FIELD_VERIFICATION',
        ],
      },
    },
  }, keys);
}

function output(
  event_id: string,
  crossing_id: string,
  receive_receipt_id: string,
  disposition_receipt_id: string | null,
  status: EvidenceTransitResult['status'],
  reason: string,
  record_ref: string | null = null,
): EvidenceTransitResult {
  return {
    schema: 'relatte.evidence-transit-result/v0',
    event_id, crossing_id, receive_receipt_id, disposition_receipt_id,
    status, reason, record_ref,
  };
}

export async function transportEvidence(
  observation: EvidenceObservation,
  route: EvidenceRoute,
): Promise<EvidenceTransitResult> {
  const eventId = evidenceEventId(observation);
  const crossing = await sealEvidenceObservation(
    observation, route.destination, route.source_keys, route.capability_ref,
  );
  const receivedAt = route.received_at();
  validateTimestamp(receivedAt);
  const receive = await route.receiver.receive(crossing, receivedAt);
  let decision: EvidenceDisposition = route.evaluate
    ? await route.evaluate(observation, crossing)
    : { disposition: 'HOLD', reason: 'no owner policy configured' };
  if (!decision || !['HOLD','REFUSE','ADMIT'].includes(decision.disposition) ||
      typeof decision.reason !== 'string' || decision.reason.trim() === '') {
    throw new Error('INVALID_EVIDENCE_DECISION');
  }
  if (decision.disposition === 'ADMIT' && !route.store) {
    decision = { disposition: 'HOLD', reason: 'receiver observation store not configured' };
  }

  const existing = route.receiver.getDispositionReceipt(crossing.crossing_id);
  const disposition = existing ?? await route.receiver.dispose(
    crossing.crossing_id, decision.disposition, route.received_at(), {
      note: decision.reason,
      admit_effect: 'receiver-local-observation-only',
    },
  );
  const dId = disposition.receipt_id as string;
  if (disposition.kind === 'R3_HOLD') {
    return output(eventId, crossing.crossing_id, receive.receipt_id, dId, 'HELD',
      'held by receiver; new signed crossing required to revisit a settled HOLD');
  }
  if (disposition.kind === 'R3_REFUSE') {
    return output(eventId, crossing.crossing_id, receive.receipt_id, dId, 'REFUSED', decision.reason);
  }
  if (disposition.kind !== 'R3_ADMIT') throw new Error('UNSUPPORTED_EVIDENCE_DISPOSITION');
  if (decision.disposition !== 'ADMIT') {
    return output(eventId, crossing.crossing_id, receive.receipt_id, dId, 'BLOCKED',
      'current owner policy no longer permits storage');
  }
  const stored = await route.store!(observation, {
    event_id: eventId, crossing_id: crossing.crossing_id,
  });
  if (!stored || !['stored','already-stored'].includes(stored.status)) {
    throw new Error('INVALID_EVIDENCE_STORE_RESULT');
  }
  return output(
    eventId, crossing.crossing_id, receive.receipt_id, dId,
    stored.status === 'stored' ? 'STORED' : 'ALREADY_STORED',
    decision.reason, stored.record_ref ?? null,
  );
}

export interface EvidenceSource {
  poll(cursor: string | null): Promise<{
    observations: EvidenceObservation[];
    next_cursor: string | null;
  }>;
}

export interface EvidenceCursorStore {
  read(): Promise<string | null>;
  write(next: string | null): Promise<void>;
}

/** Only checkpoint after complete delivery. Source retries must be idempotent. */
export async function pollEvidenceOnce(
  source: EvidenceSource, cursor: EvidenceCursorStore, route: EvidenceRoute,
): Promise<EvidenceTransitResult[]> {
  const batch = await source.poll(await cursor.read());
  if (!batch || !Array.isArray(batch.observations) ||
      (batch.next_cursor !== null && typeof batch.next_cursor !== 'string')) {
    throw new Error('INVALID_EVIDENCE_BATCH');
  }
  const results: EvidenceTransitResult[] = [];
  for (const observation of batch.observations) {
    results.push(await transportEvidence(observation, route));
  }
  await cursor.write(batch.next_cursor);
  return results;
}
