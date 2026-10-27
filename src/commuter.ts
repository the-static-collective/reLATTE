import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealCrossingEnvelope } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import type { LocalReceiver } from './receiver.ts';

/**
 * COMMUTER-001: owner-local correspondence, not a universal email or CRM API.
 * The source owns its data; the receiving world owns admission and execution.
 */
export const COMMUTER_EVENT_DOMAIN = 'reLATTE-CommuterEvent-v0|';
export type CommuterPurpose = 'operational' | 'marketing' | 'suppression';
export type CommuterConsentState = 'granted' | 'revoked' | 'unknown';

export interface CommuterChange {
  schema: 'relatte.commuter-change/v0';
  source_system: string;
  source_event_id: string;
  source_world: string;
  source_particular: string;
  subject_ref: string;
  kind: string;
  payload_ref: string;
  purpose: CommuterPurpose;
  consent: { state: CommuterConsentState; evidence_ref: string | null };
  occurred_at: string;
}

export interface CommuterDecision {
  disposition: 'HOLD' | 'ADMIT' | 'REFUSE';
  reason: string;
}

export interface CommuterDelivery {
  status: 'applied' | 'already-applied';
  destination_ref?: string;
}

export interface CommuterRoute {
  destination: string;
  capability_ref: string | null;
  source_keys: P256KeyMaterial;
  receiver: LocalReceiver;
  /**
   * The receiver owner verifies source identity, purpose, freshness, consent,
   * and contractual permission here. No callback means HOLD.
   */
  evaluate?: (change: Readonly<CommuterChange>, crossing: Readonly<Record<string, any>>) =>
    Promise<CommuterDecision>;
  /**
   * A destination MUST honor the stable idempotency key, including after a
   * caller crash between remote success and local acknowledgment.
   */
  apply?: (change: Readonly<CommuterChange>, context: {
    crossing_id: string;
    idempotency_key: string;
  }) => Promise<CommuterDelivery>;
  received_at: () => string;
}

export interface CommuterResult {
  schema: 'relatte.commuter-result/v0';
  event_id: string;
  crossing_id: string;
  receive_receipt_id: string;
  disposition_receipt_id: string | null;
  status: 'HELD' | 'REFUSED' | 'BLOCKED' | 'APPLIED' | 'ALREADY_APPLIED';
  reason: string;
  delivery_ref: string | null;
}

const ADDRESS = /^sha256:[a-f0-9]{64}$/;

function required(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function validateChange(change: CommuterChange): void {
  if (change.schema !== 'relatte.commuter-change/v0') throw new Error('INVALID_COMMUTER_SCHEMA');
  for (const key of ['source_system', 'source_event_id', 'source_world', 'source_particular', 'subject_ref', 'kind'] as const) {
    required(change[key], 'INVALID_COMMUTER_' + key.toUpperCase());
  }
  if (change.subject_ref.includes('@')) throw new Error('COMMUTER_SUBJECT_MUST_BE_OPAQUE');
  if (!ADDRESS.test(change.payload_ref)) throw new Error('INVALID_COMMUTER_PAYLOAD_REF');
  if (!['operational', 'marketing', 'suppression'].includes(change.purpose)) {
    throw new Error('INVALID_COMMUTER_PURPOSE');
  }
  if (!change.consent || !['granted', 'revoked', 'unknown'].includes(change.consent.state)) {
    throw new Error('INVALID_COMMUTER_CONSENT');
  }
  if (change.consent.evidence_ref !== null && !ADDRESS.test(change.consent.evidence_ref)) {
    throw new Error('INVALID_COMMUTER_CONSENT_EVIDENCE');
  }
  if (change.purpose === 'suppression' && change.consent.state !== 'revoked') {
    throw new Error('INVALID_COMMUTER_SUPPRESSION');
  }
  validateTimestamp(change.occurred_at);
}

export function commuterEventId(change: CommuterChange): string {
  validateChange(change);
  return 'relatte-commuter-event-v0:' + sha256Hex(
    canonicalizeDomainValue(COMMUTER_EVENT_DOMAIN, change),
  );
}

export async function sealCommuterChange(
  change: CommuterChange,
  destination: string,
  keys: P256KeyMaterial,
  capabilityRef: string | null,
): Promise<Record<string, any>> {
  const id = commuterEventId(change);
  required(destination, 'INVALID_COMMUTER_DESTINATION');
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: change.source_particular,
    source_world: change.source_world,
    source_history_head: null,
    parents: [],
    declared_kind: 'COMMUTER_CORRESPONDENCE',
    payload_refs: [{
      address: change.payload_ref,
      role: 'source-owned-data-reference',
      media_type: 'application/octet-stream',
    }],
    requested_effect: { kind: change.kind, destination, purpose: change.purpose },
    capability_ref: capabilityRef,
    privacy_policy: 'source-owned-payload-not-in-envelope',
    audience_policy: destination,
    return_address: null,
    created_at: change.occurred_at,
    extensions: {
      commuter: {
        schema: 'relatte.commuter-reference/v0',
        event_id: id,
        subject_ref: change.subject_ref,
        consent_evidence_ref: change.consent.evidence_ref,
      },
    },
  }, keys);
}

function result(
  id: string,
  crossingId: string,
  receiveId: string,
  dispositionId: string | null,
  status: CommuterResult['status'],
  reason: string,
  deliveryRef: string | null = null,
): CommuterResult {
  return {
    schema: 'relatte.commuter-result/v0',
    event_id: id,
    crossing_id: crossingId,
    receive_receipt_id: receiveId,
    disposition_receipt_id: dispositionId,
    status,
    reason,
    delivery_ref: deliveryRef,
  };
}

/**
 * Processes one immutable source event. No external effect is possible without
 * the receiver owner's explicit ADMIT decision, an apply port, and (for
 * marketing) a granted consent claim with an evidence reference.
 *
 * The claim is NOT automatically trusted: evaluate must verify it with the
 * receiver's own authority. Re-evaluation happens on retries.
 */
export async function commuteChange(
  change: CommuterChange,
  route: CommuterRoute,
): Promise<CommuterResult> {
  const id = commuterEventId(change);
  const crossing = await sealCommuterChange(change, route.destination, route.source_keys, route.capability_ref);
  const now = route.received_at();
  validateTimestamp(now);
  const received = await route.receiver.receive(crossing, now);

  let decision: CommuterDecision = route.evaluate
    ? await route.evaluate(change, crossing)
    : { disposition: 'HOLD', reason: 'receiver policy not configured' };
  if (!decision || !['HOLD', 'ADMIT', 'REFUSE'].includes(decision.disposition)) {
    throw new Error('INVALID_COMMUTER_DECISION');
  }
  required(decision.reason, 'INVALID_COMMUTER_DECISION_REASON');

  // Fail closed even if a faulty owner policy attempts to authorize marketing.
  if (change.purpose === 'marketing' &&
      (change.consent.state !== 'granted' || !change.consent.evidence_ref)) {
    decision = { disposition: 'HOLD', reason: 'marketing consent evidence missing or revoked' };
  }
  if (decision.disposition === 'ADMIT' && !route.apply) {
    decision = { disposition: 'HOLD', reason: 'destination adapter not configured' };
  }

  const previous = route.receiver.getDispositionReceipt(crossing.crossing_id);
  const disposition = previous ?? await route.receiver.dispose(
    crossing.crossing_id,
    decision.disposition,
    route.received_at(),
    { note: decision.reason, admit_effect: 'correspondence-authorized-not-yet-sent' },
  );
  if (disposition.kind === 'R3_HOLD') {
    return result(id, crossing.crossing_id, received.receipt_id, disposition.receipt_id, 'HELD', decision.reason);
  }
  if (disposition.kind !== 'R3_ADMIT') {
    return result(id, crossing.crossing_id, received.receipt_id, disposition.receipt_id, 'REFUSED', decision.reason);
  }
  // A previous admission does not override a later negative consent check.
  if (decision.disposition !== 'ADMIT') {
    return result(id, crossing.crossing_id, received.receipt_id, disposition.receipt_id, 'BLOCKED', decision.reason);
  }

  // All destinations must dedupe by this key, not by a transport attempt ID.
  const delivered = await route.apply!(change, {
    crossing_id: crossing.crossing_id,
    idempotency_key: id,
  });
  if (delivered.status !== 'applied' && delivered.status !== 'already-applied') {
    throw new Error('INVALID_COMMUTER_DELIVERY_RESULT');
  }
  return result(
    id,
    crossing.crossing_id,
    received.receipt_id,
    disposition.receipt_id,
    delivered.status === 'applied' ? 'APPLIED' : 'ALREADY_APPLIED',
    decision.reason,
    delivered.destination_ref ?? null,
  );
}

export interface CommuterSource {
  poll(cursor: string | null): Promise<{
    changes: CommuterChange[];
    next_cursor: string | null;
  }>;
}

export interface CommuterCursorStore {
  read(): Promise<string | null>;
  write(next: string | null): Promise<void>;
}

/**
 * One automatic polling cycle. Checkpoint ONLY after the whole batch has
 * finished. A source may be polled again after any crash; destination-side
 * idempotency is therefore mandatory. Run serially; no distributed lease yet.
 */
export async function pollCommuterOnce(
  source: CommuterSource,
  cursor: CommuterCursorStore,
  route: CommuterRoute,
): Promise<CommuterResult[]> {
  const batch = await source.poll(await cursor.read());
  if (!batch || !Array.isArray(batch.changes) ||
      (batch.next_cursor !== null && typeof batch.next_cursor !== 'string')) {
    throw new Error('INVALID_COMMUTER_POLL_BATCH');
  }
  const outcomes: CommuterResult[] = [];
  for (const change of batch.changes) {
    outcomes.push(await commuteChange(change, route));
  }
  await cursor.write(batch.next_cursor);
  return outcomes;
}
