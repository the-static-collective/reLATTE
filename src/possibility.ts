import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealEvidenceObservation, transportEvidence } from './evidence-transit.ts';
import type { EvidenceObservation, EvidenceRoute, EvidenceTransitResult } from './evidence-transit.ts';
import type { P256KeyMaterial } from './protocol.ts';

/**
 * POSSIBILITY-001: a domain-neutral, claim-level crossing for a particular
 * offer, need, invitation, contribution, or relationship event.
 *
 * Nothing here creates credit, transferable legal claims, settlement,
 * verified identities, consent, reputation, or a world-wide ledger.
 */
export const POSSIBILITY_CONTENT_DOMAIN = 'reLATTE-PossibilityContent-v0|';
const ID = /^[A-Za-z][A-Za-z0-9_.:/-]{1,119}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const ACTION = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const FIELDS = [
  'schema','source_system','source_world','source_particular','source_event_id',
  'relation_ref','kind','action','content_ref','occurred_at','claim_level',
  'scope',
].sort();

export interface PossibilitySignal {
  schema: 'relatte.possibility-signal/v0';
  source_system: string;
  source_world: string;
  source_particular: string;
  source_event_id: string;
  /** Opaque stable relation address, never a human name or contact. */
  relation_ref: string;
  /** Application vocabulary. Extensible: 'service', 'goods', 'time', etc. */
  kind: string;
  /** Source-local action vocabulary; no fixed economic ontology. */
  action: string;
  /** Content-addressed private source record. Not a retrieval grant. */
  content_ref: string;
  occurred_at: string;
  claim_level: 'source_claim';
  scope: 'review_only';
}

function token(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw Error('INVALID_POSSIBILITY_' + label);
  return value;
}
function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_POSSIBILITY_OBJECT');
  return value as Record<string, unknown>;
}
function ownFields(record: Record<string, unknown>, fields: string[], code: string): void {
  if (Object.keys(record).sort().join('|') !== fields.join('|')) throw Error(code);
}
export function validatePossibilitySignal(value: unknown): asserts value is PossibilitySignal {
  const s = asObject(value);
  ownFields(s, FIELDS, 'UNEXPECTED_POSSIBILITY_FIELD');
  if (s.schema !== 'relatte.possibility-signal/v0' ||
      s.claim_level !== 'source_claim' || s.scope !== 'review_only') {
    throw Error('UNSAFE_POSSIBILITY_AUTHORITY');
  }
  for (const field of ['source_system','source_world','source_particular',
    'source_event_id','relation_ref'] as const) token(s[field], field.toUpperCase());
  if (typeof s.kind !== 'string' || !ACTION.test(s.kind) || s.kind.length > 80 ||
      typeof s.action !== 'string' || !ACTION.test(s.action) || s.action.length > 80) {
    throw Error('INVALID_POSSIBILITY_ACTION');
  }
  if (typeof s.content_ref !== 'string' || !HASH.test(s.content_ref)) {
    throw Error('INVALID_POSSIBILITY_CONTENT_REF');
  }
  validateTimestamp(s.occurred_at);
}
export function possibilityContentRef(sourceRecord: unknown): string {
  return 'sha256:' + sha256Hex(canonicalizeDomainValue(POSSIBILITY_CONTENT_DOMAIN, sourceRecord));
}
export function possibilitySignalId(signal: PossibilitySignal): string {
  validatePossibilitySignal(signal);
  return 'relatte-possibility-v0:' +
    sha256Hex(canonicalizeDomainValue('reLATTE-PossibilitySignal-v0|', signal));
}
export function adaptPossibilityToEvidence(signal: PossibilitySignal): EvidenceObservation {
  validatePossibilitySignal(signal);
  return {
    schema: 'relatte.evidence-observation/v0',
    source_system: signal.source_system,
    source_world: signal.source_world,
    source_particular: signal.source_particular,
    source_event_id: possibilitySignalId(signal),
    subject_ref: signal.relation_ref,
    assertion_kind: 'possibility.' + signal.kind + '.' + signal.action,
    payload_ref: signal.content_ref,
    evidence_level: 'claim',
    occurred_at: signal.occurred_at,
    observed_at: signal.occurred_at,
  };
}
/** Signed reference only; no source packet contents in crossing. */
export function sealPossibilitySignal(
  signal: PossibilitySignal, destination: string, keys: P256KeyMaterial,
  capabilityRef: string | null = null,
): Promise<Record<string, any>> {
  return sealEvidenceObservation(adaptPossibilityToEvidence(signal), destination, keys, capabilityRef);
}
/**
 * Receiver ADMIT, if independently permitted, stores only a review observation.
 * No policy or no sink = signed HOLD. Refusal and replay follow Evidence Transit.
 */
export function transportPossibilitySignal(
  signal: PossibilitySignal, route: EvidenceRoute,
): Promise<EvidenceTransitResult> {
  return transportEvidence(adaptPossibilityToEvidence(signal), route);
}
/** Digest equality verifies source-record bytes, not external truth. */
export function matchesPossibilityContent(signal: PossibilitySignal, sourceRecord: unknown): boolean {
  try {
    validatePossibilitySignal(signal);
    return signal.content_ref === possibilityContentRef(sourceRecord);
  } catch { return false; }
}

/** GrO Useful Later is ONE donor, not the grammar imposed on other sources. */
const GRO_TYPES = new Set([
  'CREATED','ADVANCE_OFFERED','ADVANCE_WITHDRAWN','ADVANCE_RECEIVED',
  'WORK_REPORTED','WORK_CONFIRMED','TRANSFER_REQUESTED','TRANSFER_APPROVED',
  'TRANSFER_ACCEPTED','TRANSFER_WITHDRAWN','HOLD_PLACED','HOLD_RESOLVED','RELEASED',
]);
export interface GrOUsefulLaterCard {
  version: 'useful-later/001';
  id: string;
  events: Record<string, unknown>[];
}
function name(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value ||
      value.length === 0 || value.length > 60) throw Error('INVALID_GRO_PARTICIPANT');
  return value;
}
function bounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length > max)
    throw Error('INVALID_GRO_TEXT');
  return value;
}
/** Structural replay checks prevent accepting impossible LOCAL history states.
 * All actors are still self-asserted text from the browser, never identities.
 */
export function validateGrOUsefulLater(value: unknown): asserts value is GrOUsefulLaterCard {
  const card = asObject(value);
  ownFields(card, ['events','id','version'], 'INVALID_GRO_CARD_FIELDS');
  if (card.version !== 'useful-later/001' ||
      typeof card.id !== 'string' || !/^UL-[a-zA-Z0-9-]{10,60}$/.test(card.id) ||
      !Array.isArray(card.events) || !card.events.length || card.events.length > 200)
    throw Error('INVALID_GRO_CARD');
  let phase: 'empty'|'open'|'awaiting'|'active'|'reported'|'completed'|'released' = 'empty';
  let maker = '', holder = '', proposed = '', to = '', transfer = false, approved = false, held = false;
  for (const raw of card.events) {
    const e = asObject(raw);
    const type = e.type;
    if (typeof type !== 'string' || !GRO_TYPES.has(type)) throw Error('INVALID_GRO_EVENT');
    name(e.actor);
    validateTimestamp(e.at);
    const actor = e.actor as string;
    if (type === 'CREATED') {
      if (phase !== 'empty') throw Error('INVALID_GRO_DUPLICATE_CREATION');
      maker = name(e.maker);
      if (actor !== maker || !bounded(e.work, 240) ||
          typeof e.minutes !== 'number' || !Number.isInteger(e.minutes) ||
          e.minutes < 1 || e.minutes > 480 ||
          typeof e.advance !== 'number' || !Number.isFinite(e.advance) ||
          e.advance < 0 || e.advance > 25 ||
          Math.abs(Math.round(e.advance*100)-e.advance*100)>1e-6 ||
          typeof e.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.due) ||
          !bounded(e.boundaries,240)) throw Error('INVALID_GRO_CREATED');
      phase = 'open';
      continue;
    }
    if (phase === 'empty' || phase === 'completed' || phase === 'released')
      throw Error('INVALID_GRO_CLOSED_EVENT');
    if (held && type !== 'HOLD_RESOLVED') throw Error('INVALID_GRO_EVENT_DURING_HOLD');
    switch (type) {
      case 'ADVANCE_OFFERED':
        if (phase !== 'open' || actor !== name(e.holder) || actor === maker)
          throw Error('INVALID_GRO_SUPPORTER');
        proposed=actor; phase='awaiting'; break;
      case 'ADVANCE_WITHDRAWN':
        if (phase !== 'awaiting' || (actor !== maker && actor !== proposed))
          throw Error('INVALID_GRO_WITHDRAWAL');
        proposed=''; phase='open'; break;
      case 'ADVANCE_RECEIVED':
        if (phase !== 'awaiting' || actor !== maker) throw Error('INVALID_GRO_ADVANCE');
        holder=proposed; proposed=''; phase='active'; break;
      case 'WORK_REPORTED':
        if (phase !== 'active' || actor !== maker || transfer) throw Error('INVALID_GRO_REPORT');
        phase='reported'; break;
      case 'WORK_CONFIRMED':
        if (phase !== 'reported' || actor !== holder) throw Error('INVALID_GRO_CONFIRM');
        phase='completed'; break;
      case 'TRANSFER_REQUESTED':
        if (phase !== 'active' || actor !== holder || transfer)
          throw Error('INVALID_GRO_TRANSFER_REQUEST');
        to=name(e.to);
        if (to === holder || to === maker) throw Error('INVALID_GRO_TRANSFER_PARTY');
        transfer=true; approved=false; break;
      case 'TRANSFER_APPROVED':
        if (!transfer || approved || actor !== maker) throw Error('INVALID_GRO_TRANSFER_APPROVAL');
        approved=true; break;
      case 'TRANSFER_ACCEPTED':
        if (!transfer || !approved || actor !== to) throw Error('INVALID_GRO_TRANSFER_ACCEPTANCE');
        holder=to; to=''; transfer=false; approved=false; break;
      case 'TRANSFER_WITHDRAWN':
        if (!transfer || (actor !== maker && actor !== holder))
          throw Error('INVALID_GRO_TRANSFER_WITHDRAWN');
        transfer=false; to=''; approved=false; break;
      case 'HOLD_PLACED':
        if (actor !== maker && actor !== holder && actor !== proposed)
          throw Error('INVALID_GRO_HOLD_ACTOR');
        bounded(e.note,200); held=true; break;
      case 'HOLD_RESOLVED':
        if (!held || (actor !== maker && actor !== holder && actor !== proposed))
          throw Error('INVALID_GRO_HOLD_RESOLUTION');
        held=false; break;
      case 'RELEASED':
        if ((phase !== 'active' && phase !== 'reported') || actor !== holder)
          throw Error('INVALID_GRO_RELEASE');
        phase='released'; transfer=false; break;
    }
  }
}
/**
 * Hash card ID + full source history into opaque refs. Source's names, notes,
 * skill description, terms, date and amount never enter crossing metadata.
 * Repeated identical exports -> same identifier; next event -> new identifier.
 * This does NOT assert the named actors really consented or did the work.
 */
export function adaptGrOUsefulLater(
  cardValue: unknown, source: { world: string; particular: string },
): PossibilitySignal {
  validateGrOUsefulLater(cardValue);
  const card = cardValue as GrOUsefulLaterCard;
  const latest = card.events[card.events.length - 1]!;
  const content_ref = possibilityContentRef(card);
  const signal: PossibilitySignal = {
    schema: 'relatte.possibility-signal/v0',
    source_system: 'gro.useful-later',
    source_world: token(source.world, 'WORLD'),
    source_particular: token(source.particular, 'PARTICULAR'),
    source_event_id: 'event:' + sha256Hex(canonicalizeDomainValue(
      'reLATTE-GrOEvent-v0|', {card_id: card.id, events: card.events},
    )),
    relation_ref: 'relation:' + sha256Hex(canonicalizeDomainValue(
      'reLATTE-GrORelation-v0|', card.id,
    )),
    kind: 'service',
    action: String(latest.type).toLowerCase().replaceAll('_', '.'),
    content_ref,
    occurred_at: latest.at as string,
    claim_level: 'source_claim',
    scope: 'review_only',
  };
  validatePossibilitySignal(signal);
  return signal;
}
export function matchesGrOUsefulLater(signal: PossibilitySignal, card: unknown): boolean {
  try {
    if (signal.source_system !== 'gro.useful-later') return false;
    const expected = adaptGrOUsefulLater(card, {
      world: signal.source_world, particular: signal.source_particular,
    });
    return possibilitySignalId(expected) === possibilitySignalId(signal) &&
      matchesPossibilityContent(signal, card);
  } catch { return false; }
}
