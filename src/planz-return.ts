import { createHash } from 'node:crypto';
import { canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { transportEvidence } from './evidence-transit.ts';
import type { EvidenceObservation, EvidenceRoute, EvidenceTransitResult } from './evidence-transit.ts';

/**
 * PLANZ-RETURN-TRANSPORT-001: transport a locally prepared JAR;VIS candidate as
 * a signed, content-addressed OBSERVATION. Never transmit personal work notes.
 * Even receiver ADMIT only stores a pointer, not source-plan completion.
 */
export interface PlanReturnCandidate {
  schema: 'planz.return-candidate/v0';
  candidateId: string;
  planId: string;
  sourceIssue: string;
  sourceEdition: string;
  sourceSha256: string;
  weaveId: string;
  publicMethodCandidate: string;
  preparedAt: string;
  localReport: 'COMPLETED_REPORTED_UNVERIFIED';
  review: 'SECOND_ALIAS_REVIEW_ASSERTED_NOT_AUTHENTICATED';
  disposition: 'HOLD_FOR_OWNER_REVIEW';
  fieldVerified: false;
  sourceOwnerApproved: false;
  recipientConfirmed: false;
  sentExternally: false;
  authority: 'NONE';
  notice: string;
}
const FIELDS = [
  'schema','candidateId','planId','sourceIssue','sourceEdition','sourceSha256',
  'weaveId','publicMethodCandidate','preparedAt','localReport','review',
  'disposition','fieldVerified','sourceOwnerApproved','recipientConfirmed',
  'sentExternally','authority','notice',
].sort();
const CONTACT = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ().-]{8,}\d|\b(?:street address|shelter address|home address|account number|case number)\b|\b\d{1,5}\s+\w+\s+(?:st|street|ave|avenue|road|rd|drive|dr|lane|ln)\b)/i;
export function validatePlanReturnCandidate(value: unknown): asserts value is PlanReturnCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_PLAN_RETURN');
  const p=value as Record<string,unknown>;
  if(Object.keys(p).sort().join('|')!==FIELDS.join('|') ||
      p.schema!=='planz.return-candidate/v0' ||
      typeof p.planId!=='string'|| !/^[A-Z0-9-]{5,44}$/.test(p.planId) ||
      typeof p.sourceIssue!=='string'||
      !/^https:\/\/github\.com\/the-static-collective\/[\w.-]+\/issues\/[1-9]\d*$/.test(p.sourceIssue)||
      typeof p.sourceEdition!=='string'|| !/^ATTENTION-\d{4}-\d{2}-\d{2}-\d{3}$/.test(p.sourceEdition)||
      typeof p.sourceSha256!=='string'|| !/^[a-f0-9]{64}$/.test(p.sourceSha256)||
      typeof p.weaveId!=='string'|| !/^weave:[0-9a-f-]{36}$/.test(p.weaveId)||
      typeof p.publicMethodCandidate!=='string'||p.publicMethodCandidate.length<30||p.publicMethodCandidate.length>220||
      CONTACT.test(p.publicMethodCandidate)||/https?:\/\//i.test(p.publicMethodCandidate)||
      typeof p.preparedAt!=='string'|| !/^\d{4}-\d{2}-\d{2}T/.test(p.preparedAt)||
      p.localReport!=='COMPLETED_REPORTED_UNVERIFIED'||
      p.review!=='SECOND_ALIAS_REVIEW_ASSERTED_NOT_AUTHENTICATED'||
      p.disposition!=='HOLD_FOR_OWNER_REVIEW'||p.fieldVerified!==false||
      p.sourceOwnerApproved!==false||p.recipientConfirmed!==false||
      p.sentExternally!==false||p.authority!=='NONE'||
      typeof p.notice!=='string'||p.notice.length>300||
      typeof p.candidateId!=='string'|| !/^planz-return-v0:[a-f0-9]{64}$/.test(p.candidateId)) {
    throw Error('UNSAFE_OR_UNVERIFIED_PLAN_RETURN');
  }
  const basis={
    planId:p.planId,sourceIssue:p.sourceIssue,sourceEdition:p.sourceEdition,
    sourceSha256:p.sourceSha256,weaveId:p.weaveId,
    publicMethodCandidate:p.publicMethodCandidate,
  };
  const expected='planz-return-v0:'+createHash('sha256')
    .update('PLANZ-RETURN-001|'+JSON.stringify(basis)).digest('hex');
  if(p.candidateId!==expected)throw Error('PLAN_RETURN_CANDIDATE_ID_MISMATCH');
}

export const PLANZ_RETURN_DOMAIN='reLATTE-PlanReturnPayload-v0|';

/** Payload stays in sender custody. Reference alone does not grant fetch rights. */
export function planReturnPayloadRef(value: PlanReturnCandidate): string {
  validatePlanReturnCandidate(value);
  return 'sha256:'+sha256Hex(canonicalizeDomainValue(PLANZ_RETURN_DOMAIN,value));
}

/** This is *claim*-level evidence even when both reLATTE signatures verify. */
export function adaptPlanReturnToEvidence(value: PlanReturnCandidate): EvidenceObservation {
  validatePlanReturnCandidate(value);
  return {
    schema:'relatte.evidence-observation/v0',
    source_system:'jarvis-local-inheritance',
    source_world:'world:jarvis-operator-local',
    source_particular:'particular:jarvis-unverified-return',
    source_event_id:value.candidateId,
    subject_ref:'planz:'+value.planId,
    assertion_kind:'planz.return-candidate.unverified',
    payload_ref:planReturnPayloadRef(value),
    evidence_level:'claim',
    occurred_at:value.preparedAt,
    observed_at:value.preparedAt,
  };
}

/** No evaluate/store callback means receiver-local signed HOLD. */
export async function transportPlanReturn(
  candidate: PlanReturnCandidate, route: EvidenceRoute,
): Promise<EvidenceTransitResult> {
  const observation=adaptPlanReturnToEvidence(candidate);
  if(route.destination!=='planz:return-candidate-inbox')
    throw Error('PLAN_RETURN_DESTINATION_NOT_OWNER_INBOX');
  return transportEvidence(observation,route);
}
