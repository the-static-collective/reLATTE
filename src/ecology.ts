import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import {
  Com5ReceiverPolicy,
  evaluateCom5Capsule,
  sealCom5Capsule,
} from './com5.ts';
import {
  evaluateCreativeCustoms,
  sealPorch,
} from './porch.ts';
import { verifyCrossingEnvelope } from './protocol.ts';

export const GRAMMAR_CANDIDATE_ID_DOMAIN = 'reLATTE-GrammarCandidate-v0|';
export const TRADITION_TRACE_ID_DOMAIN = 'reLATTE-TraditionTrace-v0|';
export const RELEASE_DECLARATION_ID_DOMAIN = 'reLATTE-ReleaseDeclaration-v0|';
export const CAPACITY_PROPOSAL_ID_DOMAIN = 'reLATTE-CapacityProposal-v0|';

export type FrontDoorState = 'CUSTOMS_STOP' | 'LOCAL_DECISION';
export type FogStatus = 'UNRESOLVED';
export type ReleaseMode = 'REST' | 'RELEASE' | 'MORTALITY';
export type CarrierKind = 'git-artifact' | 'file-bundle' | 'http-relay' | 'removable-media';

export interface GrammarCandidate {
  schema: 'relatte.grammar-candidate/v0';
  candidate_id?: string;
  name: string;
  grammar_id: string;
  proposition: string;
  observed_in: string[];
  evidence_refs: string[];
  portable_operators: string[];
  non_authorities: string[];
  status: 'CANDIDATE';
  created_at: string;
}

export interface FogCase {
  schema: 'relatte.fog-case/v0';
  crossing_id: string;
  capsule_id: string;
  porch_id: string;
  status: FogStatus;
  questions: string[];
  known: string[];
  unknown: string[];
  laws: string[];
}

export interface CarrierPacket {
  schema: 'relatte.carrier-packet/v0';
  carrier: CarrierKind;
  crossing_id: string;
  crossing: Record<string, unknown>;
  transport_note: string;
}

export interface TraditionTrace {
  schema: 'relatte.tradition-trace/v0';
  tradition_trace_id?: string;
  capsule_id: string;
  grammar_id: string;
  admitted_receipt_id: string;
  descendant_ref: string;
  variation: string;
  ancestry_preserved: true;
  inherited_authority: false;
  created_at: string;
}

export interface ReleaseDeclaration {
  schema: 'relatte.release-declaration/v0';
  release_id?: string;
  world_id: string;
  mode: ReleaseMode;
  subject_refs: string[];
  offered_refs: string[];
  license_refs: string[];
  note: string;
  successor_authority: 'fresh-decision-required';
  deletion_implied: false;
  created_at: string;
}

export interface CapacityProposal {
  schema: 'relatte.capacity-proposal/v0';
  proposal_id?: string;
  world_id: string;
  participant_ref: string;
  basis_receipt_id: string;
  capability_kind: string;
  scope: string[];
  proposal_only: true;
  reputation_score: null;
  created_at: string;
}

export interface WeatherProjection {
  schema: 'relatte.cultural-weather/v0';
  observed_receipts: number;
  by_kind: Record<string, number>;
  by_grammar: Record<string, number>;
  held_or_unresolved: number;
  laws: string[];
}

export interface CommuterEdge {
  crossing_id: string;
  source_world: string;
  destination_world: string;
  receipt_id: string | null;
  disposition: string;
  semantic_effect: string;
}

export interface CommuterLine {
  schema: 'relatte.commuter-line/v0';
  edges: CommuterEdge[];
  return_routes: Array<{
    from_world: string;
    return_address: string;
    crossing_id: string;
  }>;
  laws: string[];
}

function requireRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function requireStringArray(value: unknown, code: string, min = 0): string[] {
  if (!Array.isArray(value) || value.length < min || value.some((x) => typeof x !== 'string' || x.trim() === '')) {
    throw new Error(code);
  }
  return [...value];
}

function contentId(domain: string, prefix: string, value: unknown): string {
  return `${prefix}:${sha256Hex(canonicalizeDomainValue(domain, value))}`;
}

export function draftGrammarCandidate(value: Omit<GrammarCandidate, 'schema' | 'candidate_id' | 'status'>): GrammarCandidate {
  validateTimestamp(value.created_at);
  const body = {
    schema: 'relatte.grammar-candidate/v0' as const,
    name: requireString(value.name, 'INVALID_GRAMMAR_CANDIDATE_NAME'),
    grammar_id: requireString(value.grammar_id, 'INVALID_GRAMMAR_CANDIDATE_GRAMMAR_ID'),
    proposition: requireString(value.proposition, 'INVALID_GRAMMAR_CANDIDATE_PROPOSITION'),
    observed_in: requireStringArray(value.observed_in, 'INVALID_GRAMMAR_CANDIDATE_OBSERVED_IN', 1),
    evidence_refs: requireStringArray(value.evidence_refs, 'INVALID_GRAMMAR_CANDIDATE_EVIDENCE', 1),
    portable_operators: requireStringArray(value.portable_operators, 'INVALID_GRAMMAR_CANDIDATE_OPERATORS', 1),
    non_authorities: requireStringArray(value.non_authorities, 'INVALID_GRAMMAR_CANDIDATE_NON_AUTHORITIES', 1),
    status: 'CANDIDATE' as const,
    created_at: value.created_at,
  };
  return {
    ...body,
    candidate_id: contentId(GRAMMAR_CANDIDATE_ID_DOMAIN, 'relatte-grammar-candidate-v0', body),
  };
}

export function runFrontDoor(args: {
  porch: unknown;
  capsule: unknown;
  crossing: unknown;
  customs_at: string;
  local_at: string;
  receiver_policy: Com5ReceiverPolicy;
}): {
  state: FrontDoorState;
  customs_receipt_draft: Record<string, unknown>;
  local_receipt_draft: Record<string, unknown> | null;
} {
  const crossing = requireRecord(args.crossing, 'INVALID_FRONT_DOOR_CROSSING');
  const crossingId = requireString(crossing.crossing_id, 'INVALID_FRONT_DOOR_CROSSING_ID');

  const customs = evaluateCreativeCustoms(args.porch, args.capsule, crossing, args.customs_at);
  if (customs.kind !== 'CUSTOMS_WELCOME') {
    return {
      state: 'CUSTOMS_STOP',
      customs_receipt_draft: customs,
      local_receipt_draft: null,
    };
  }

  return {
    state: 'LOCAL_DECISION',
    customs_receipt_draft: customs,
    local_receipt_draft: evaluateCom5Capsule(
      args.capsule,
      crossingId,
      args.receiver_policy,
      args.local_at,
    ),
  };
}

export function makeFogCase(
  customsReceiptValue: unknown,
  questions: string[],
  known: string[],
  unknown: string[],
): FogCase {
  const receipt = requireRecord(customsReceiptValue, 'INVALID_FOG_CUSTOMS_RECEIPT');
  if (receipt.kind !== 'CUSTOMS_HOLD') throw new Error('FOG_REQUIRES_CUSTOMS_HOLD');
  const extensions = requireRecord(receipt.extensions, 'INVALID_FOG_EXTENSIONS');
  const customs = requireRecord(extensions.customs, 'INVALID_FOG_CUSTOMS_EXTENSIONS');

  return {
    schema: 'relatte.fog-case/v0',
    crossing_id: requireString(receipt.crossing_id, 'INVALID_FOG_CROSSING_ID'),
    capsule_id: requireString(customs.capsule_id, 'INVALID_FOG_CAPSULE_ID'),
    porch_id: requireString(customs.porch_id, 'INVALID_FOG_PORCH_ID'),
    status: 'UNRESOLVED',
    questions: requireStringArray(questions, 'INVALID_FOG_QUESTIONS', 1),
    known: requireStringArray(known, 'INVALID_FOG_KNOWN'),
    unknown: requireStringArray(unknown, 'INVALID_FOG_UNKNOWN', 1),
    laws: [
      'UNKNOWN != REFUSE',
      'HOLD != ADMIT',
      'QUESTION != VERDICT',
    ],
  };
}

export function makeCarrierPacket(
  crossingValue: unknown,
  carrier: CarrierKind,
  transportNote: string,
): CarrierPacket {
  const crossing = requireRecord(crossingValue, 'INVALID_CARRIER_CROSSING');
  return {
    schema: 'relatte.carrier-packet/v0',
    carrier,
    crossing_id: requireString(crossing.crossing_id, 'INVALID_CARRIER_CROSSING_ID'),
    crossing: { ...crossing },
    transport_note: requireString(transportNote, 'INVALID_CARRIER_NOTE'),
  };
}

export async function verifyCarrierPacket(packetValue: unknown): Promise<boolean> {
  try {
    const packet = requireRecord(packetValue, 'INVALID_CARRIER_PACKET');
    const crossing = requireRecord(packet.crossing, 'INVALID_CARRIER_CROSSING');
    if (packet.crossing_id !== crossing.crossing_id) return false;
    return verifyCrossingEnvelope(crossing);
  } catch {
    return false;
  }
}

export function projectCulturalWeather(receipts: unknown[]): WeatherProjection {
  const byKind: Record<string, number> = {};
  const byGrammar: Record<string, number> = {};
  let held = 0;

  for (const value of receipts) {
    const receipt = requireRecord(value, 'INVALID_WEATHER_RECEIPT');
    const kind = requireString(receipt.kind, 'INVALID_WEATHER_RECEIPT_KIND');
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    if (kind.includes('HOLD')) held += 1;

    const extensions = typeof receipt.extensions === 'object' && receipt.extensions !== null
      ? receipt.extensions as Record<string, any>
      : {};
    const grammar =
      extensions.com5?.grammar_id ??
      extensions.customs?.grammar_id ??
      null;
    if (typeof grammar === 'string' && grammar.length > 0) {
      byGrammar[grammar] = (byGrammar[grammar] ?? 0) + 1;
    }
  }

  return {
    schema: 'relatte.cultural-weather/v0',
    observed_receipts: receipts.length,
    by_kind: byKind,
    by_grammar: byGrammar,
    held_or_unresolved: held,
    laws: [
      'WEATHER != RECOMMENDATION',
      'FREQUENCY != VALUE',
      'PRESSURE != AUTHORITY',
    ],
  };
}

export function recordTradition(args: {
  capsule: unknown;
  admitted_receipt: unknown;
  descendant_ref: string;
  variation: string;
  created_at: string;
}): TraditionTrace {
  const capsule = sealCom5Capsule(args.capsule);
  const receipt = requireRecord(args.admitted_receipt, 'INVALID_TRADITION_RECEIPT');
  if (receipt.kind !== 'COM5_ADMIT') throw new Error('TRADITION_REQUIRES_ADMIT');
  const receiptId = requireString(receipt.receipt_id, 'TRADITION_REQUIRES_SIGNED_RECEIPT');
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.tradition-trace/v0' as const,
    capsule_id: capsule.capsule_id!,
    grammar_id: capsule.grammar.grammar_id,
    admitted_receipt_id: receiptId,
    descendant_ref: requireString(args.descendant_ref, 'INVALID_TRADITION_DESCENDANT'),
    variation: requireString(args.variation, 'INVALID_TRADITION_VARIATION'),
    ancestry_preserved: true as const,
    inherited_authority: false as const,
    created_at: args.created_at,
  };

  return {
    ...body,
    tradition_trace_id: contentId(TRADITION_TRACE_ID_DOMAIN, 'relatte-tradition-v0', body),
  };
}

export function declareRelease(args: {
  world_id: string;
  mode: ReleaseMode;
  subject_refs: string[];
  offered_refs?: string[];
  license_refs?: string[];
  note: string;
  created_at: string;
}): ReleaseDeclaration {
  validateTimestamp(args.created_at);
  const offered = requireStringArray(args.offered_refs ?? [], 'INVALID_RELEASE_OFFERED_REFS');
  const licenses = requireStringArray(args.license_refs ?? [], 'INVALID_RELEASE_LICENSE_REFS');
  if (offered.length > 0 && licenses.length === 0) throw new Error('RELEASE_REQUIRES_LICENSE_REF');

  const body = {
    schema: 'relatte.release-declaration/v0' as const,
    world_id: requireString(args.world_id, 'INVALID_RELEASE_WORLD'),
    mode: args.mode,
    subject_refs: requireStringArray(args.subject_refs, 'INVALID_RELEASE_SUBJECTS', 1),
    offered_refs: offered,
    license_refs: licenses,
    note: requireString(args.note, 'INVALID_RELEASE_NOTE'),
    successor_authority: 'fresh-decision-required' as const,
    deletion_implied: false as const,
    created_at: args.created_at,
  };

  return {
    ...body,
    release_id: contentId(RELEASE_DECLARATION_ID_DOMAIN, 'relatte-release-v0', body),
  };
}

export function proposeCapacity(args: {
  admitted_receipt: unknown;
  world_id: string;
  participant_ref: string;
  capability_kind: string;
  scope: string[];
  created_at: string;
}): CapacityProposal {
  const receipt = requireRecord(args.admitted_receipt, 'INVALID_CAPACITY_RECEIPT');
  if (receipt.kind !== 'COM5_ADMIT') throw new Error('CAPACITY_REQUIRES_ADMITTED_PARTICIPATION');
  const receiptId = requireString(receipt.receipt_id, 'CAPACITY_REQUIRES_SIGNED_RECEIPT');
  validateTimestamp(args.created_at);

  const body = {
    schema: 'relatte.capacity-proposal/v0' as const,
    world_id: requireString(args.world_id, 'INVALID_CAPACITY_WORLD'),
    participant_ref: requireString(args.participant_ref, 'INVALID_CAPACITY_PARTICIPANT'),
    basis_receipt_id: receiptId,
    capability_kind: requireString(args.capability_kind, 'INVALID_CAPACITY_KIND'),
    scope: requireStringArray(args.scope, 'INVALID_CAPACITY_SCOPE', 1),
    proposal_only: true as const,
    reputation_score: null,
    created_at: args.created_at,
  };

  return {
    ...body,
    proposal_id: contentId(CAPACITY_PROPOSAL_ID_DOMAIN, 'relatte-capacity-proposal-v0', body),
  };
}

export function buildCommuterLine(args: {
  source_world: string;
  crossing: unknown;
  receipts: unknown[];
}): CommuterLine {
  const crossing = requireRecord(args.crossing, 'INVALID_COMMUTER_CROSSING');
  const crossingId = requireString(crossing.crossing_id, 'INVALID_COMMUTER_CROSSING_ID');
  const returnAddress = typeof crossing.return_address === 'string' ? crossing.return_address : null;

  const edges: CommuterEdge[] = [];
  const returnRoutes: CommuterLine['return_routes'] = [];

  for (const value of args.receipts) {
    const receipt = requireRecord(value, 'INVALID_COMMUTER_RECEIPT');
    if (receipt.crossing_id !== crossingId) throw new Error('COMMUTER_RECEIPT_CROSSING_MISMATCH');

    const destinationWorld = requireString(receipt.world_id, 'INVALID_COMMUTER_WORLD');
    edges.push({
      crossing_id: crossingId,
      source_world: args.source_world,
      destination_world: destinationWorld,
      receipt_id: typeof receipt.receipt_id === 'string' ? receipt.receipt_id : null,
      disposition: requireString(receipt.kind, 'INVALID_COMMUTER_DISPOSITION'),
      semantic_effect: requireString(receipt.semantic_effect, 'INVALID_COMMUTER_EFFECT'),
    });

    if (returnAddress) {
      returnRoutes.push({
        from_world: destinationWorld,
        return_address: returnAddress,
        crossing_id: crossingId,
      });
    }
  }

  return {
    schema: 'relatte.commuter-line/v0',
    edges,
    return_routes: returnRoutes,
    laws: [
      'ROUTE != AUTHORITY',
      'EDGE != ENDORSEMENT',
      'RETURN ADDRESS != RETURN OBLIGATION',
    ],
  };
}
