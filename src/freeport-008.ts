/**
 * FREEPORT 008 — MOTIF-style proposal -> reLATTE crossing -> TOWER local review.
 * Only the original reLATTE protocol creates/verifies signatures.
 * Nothing in this module schedules, plays, publishes, or admits music.
 */
import { sha256Hex, validateTimestamp } from './canonical.ts';
import {
  sealCrossingEnvelope,
  verifyCrossingEnvelope,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import { LocalReceiver } from './receiver.ts';
import { buildSovereignResponseBundle, verifySovereignResponseBundle } from './sovereign.ts';

export const FREEPORT_PROGRAM_SCHEMA = 'freeport.program-proposal/v1';
export const FREEPORT_CROSSING_SCHEMA = 'freeport.program-crossing/v1';
export const FREEPORT_REVIEW_KIND = 'HUMKIN_PROGRAM_REVIEW_PROPOSAL';

export interface ProgramTrack {
  ref: string;
  transition: 'cut' | 'fade';
  weight: number;
}

export interface ProgramProposal {
  schema: typeof FREEPORT_PROGRAM_SCHEMA;
  program_id: string;
  station: 'HUMKIN';
  origin: 'MOTIF';
  tracks: ProgramTrack[];
  preview_only: true;
  schedule_effect: false;
}

export interface ProgramCrossingCarrier {
  crossing: Record<string, any>;
  payload_base64: string;
}
export interface ReviewRecord {
  crossing_id: string;
  source_world: string;
  destination_world: string;
  source_key_fingerprint: string;
  payload_sha256: string;
  payload_base64: string;
  crossing: Record<string, any>;
  response_bundle: Record<string, any>;
  disposition: 'HOLD' | 'REFUSE';
}
export interface ReviewArchive {
  saveReview(record: ReviewRecord): Promise<void>;
}
export interface SourcePin {
  world: string;
  particular: string;
  public_key: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
}
const exact = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).sort().join('|') === [...names].sort().join('|');
const object = (value: unknown, code: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(code);
  return value as Record<string, any>;
};
const nonblank = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const refPattern = /^catalog:[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

export function inspectProgram(value: unknown): ProgramProposal {
  const p = object(value, 'INVALID_PROGRAM');
  if (!exact(p, ['schema','program_id','station','origin','tracks','preview_only','schedule_effect']) ||
      p.schema !== FREEPORT_PROGRAM_SCHEMA || !nonblank(p.program_id) ||
      !idPattern.test(p.program_id) || p.station !== 'HUMKIN' || p.origin !== 'MOTIF' ||
      p.preview_only !== true || p.schedule_effect !== false ||
      !Array.isArray(p.tracks) || p.tracks.length < 1 || p.tracks.length > 12) {
    throw Error('UNAUTHORIZED_OR_INVALID_PROGRAM');
  }
  const seen = new Set<string>();
  for (const entry of p.tracks) {
    const t = object(entry, 'INVALID_PROGRAM_TRACK');
    if (!exact(t,['ref','transition','weight']) || !refPattern.test(t.ref) ||
        !['cut','fade'].includes(t.transition) || !Number.isInteger(t.weight) ||
        t.weight < 1 || t.weight > 100 || seen.has(t.ref)) {
      throw Error('INVALID_PROGRAM_TRACK');
    }
    seen.add(t.ref);
  }
  return p as ProgramProposal;
}

function decodePayload(base64: unknown): { proposal: ProgramProposal; bytes: Buffer; digest: string } {
  if (typeof base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw Error('INVALID_PAYLOAD_BASE64');
  }
  const bytes = Buffer.from(base64,'base64');
  if (bytes.length === 0 || bytes.length > 16_384 || bytes.toString('base64') !== base64) {
    throw Error('PAYLOAD_SIZE_OR_ENCODING');
  }
  const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const proposal = inspectProgram(JSON.parse(text));
  // Refuse alternate JSON spellings, duplicated keys and other parser ambiguities.
  if (JSON.stringify(proposal) !== text) throw Error('NONCANONICAL_PROGRAM_BYTES');
  return { proposal, bytes, digest: sha256Hex(bytes) };
}

function sameKey(value: unknown, pin: SourcePin['public_key']): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const k = value as Record<string,unknown>;
  return exact(k,['kty','crv','x','y']) && k.kty === pin.kty && k.crv === pin.crv &&
    k.x === pin.x && k.y === pin.y;
}

export async function sealProgramProposal(
  proposalValue: unknown,
  input: {
    sourceKeys: P256KeyMaterial;
    sourceWorld: string;
    sourceParticular: string;
    towerWorld: string;
    createdAt: string;
    ownerApprovedReview: boolean;
  },
): Promise<ProgramCrossingCarrier> {
  if (input.ownerApprovedReview !== true) throw Error('SOURCE_APPROVAL_REQUIRED');
  if (![input.sourceWorld,input.sourceParticular,input.towerWorld].every(nonblank) ||
      input.sourceWorld === input.towerWorld) throw Error('INVALID_WORLDS');
  validateTimestamp(input.createdAt);
  const proposal = inspectProgram(proposalValue);
  const bytes = Buffer.from(JSON.stringify(proposal), 'utf8');
  if (bytes.length > 16_384) throw Error('PROGRAM_TOO_LARGE');
  const digest = sha256Hex(bytes);
  const crossing = await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0', protocol_version:'0',
    source_particular:input.sourceParticular, source_world:input.sourceWorld,
    source_history_head:null, parents:[],
    declared_kind: FREEPORT_REVIEW_KIND,
    payload_refs:[{address:'sha256:'+digest,role:'program-proposal',media_type:'application/json'}],
    requested_effect:{operation:'REVIEW_ONLY', automatic_schedule:false},
    capability_ref:null,
    privacy_policy:{visibility:'private'},
    audience_policy:{destination_world:input.towerWorld},
    return_address:null,
    created_at:input.createdAt,
    extensions:{freeport008:{schema:FREEPORT_CROSSING_SCHEMA,destination_world:input.towerWorld,authority:'NONE'}},
  }, input.sourceKeys);
  return {crossing,payload_base64:bytes.toString('base64')};
}

export async function verifyProgramCarrier(
  carrierValue: unknown,
  sourcePin: SourcePin,
  expectedTowerWorld: string,
): Promise<{ carrier: ProgramCrossingCarrier; proposal: ProgramProposal; digest: string }> {
  const carrier = object(carrierValue,'INVALID_CARRIER');
  if (!exact(carrier,['crossing','payload_base64'])) throw Error('INVALID_CARRIER_FIELDS');
  const crossing = object(carrier.crossing,'INVALID_CROSSING');
  if (!(await verifyCrossingEnvelope(crossing))) throw Error('INVALID_RELATTE_SIGNATURE');
  if (crossing.source_world !== sourcePin.world ||
      crossing.source_particular !== sourcePin.particular ||
      !sameKey(crossing.signing?.public_key, sourcePin.public_key)) {
    throw Error('UNTRUSTED_SOURCE_PIN');
  }
  const {proposal,digest} = decodePayload(carrier.payload_base64);
  if (crossing.declared_kind !== FREEPORT_REVIEW_KIND ||
      !Array.isArray(crossing.payload_refs) || crossing.payload_refs.length !== 1 ||
      !exact(object(crossing.payload_refs[0],'INVALID_REF'),['address','role','media_type']) ||
      crossing.payload_refs[0].address !== 'sha256:'+digest ||
      crossing.payload_refs[0].role !== 'program-proposal' ||
      crossing.payload_refs[0].media_type !== 'application/json') {
    throw Error('PAYLOAD_NOT_BOUND_TO_CROSSING');
  }
  if (!nonblank(expectedTowerWorld) ||
      JSON.stringify(crossing.requested_effect) !== JSON.stringify({operation:'REVIEW_ONLY',automatic_schedule:false}) ||
      JSON.stringify(crossing.privacy_policy) !== JSON.stringify({visibility:'private'}) ||
      JSON.stringify(crossing.audience_policy) !== JSON.stringify({destination_world:expectedTowerWorld}) ||
      JSON.stringify(crossing.extensions) !== JSON.stringify({freeport008:{schema:FREEPORT_CROSSING_SCHEMA,destination_world:expectedTowerWorld,authority:'NONE'}})) {
    throw Error('UNAUTHORIZED_CROSSING_EFFECT');
  }
  return {carrier:carrier as ProgramCrossingCarrier,proposal,digest};
}

export async function deliverProgramForLocalReview(
  carrierValue: unknown,
  input: {
    sourcePin: SourcePin;
    receiver: LocalReceiver;
    decision: 'HOLD' | 'REFUSE';
    reviewedAt: string;
    archive?: ReviewArchive;
  },
): Promise<{ proposal: ProgramProposal; record: ReviewRecord }> {
  if (input.decision !== 'HOLD' && input.decision !== 'REFUSE') throw Error('LIVE_ADMISSION_FORBIDDEN');
  validateTimestamp(input.reviewedAt);
  const dest = input.receiver.config.world_id;
  const {carrier,proposal,digest} = await verifyProgramCarrier(carrierValue,input.sourcePin,dest);
  await input.receiver.receive(carrier.crossing,input.reviewedAt);
  await input.receiver.dispose(carrier.crossing.crossing_id,input.decision,input.reviewedAt,{
    note:'FREEPORT 008: review only; no playlist or schedule mutation',
  });
  const bundle = buildSovereignResponseBundle(input.receiver,carrier.crossing.crossing_id);
  if (!(await verifySovereignResponseBundle(bundle,carrier.crossing.crossing_id)) ||
      bundle.disposition_receipt.kind !== 'R3_'+input.decision ||
      bundle.disposition_receipt.semantic_effect !== 'none') throw Error('INVALID_DESTINATION_RECEIPT');
  const publicKey = input.sourcePin.public_key;
  const fingerprint=sha256Hex(Buffer.from(JSON.stringify(publicKey),'utf8'));
  const record:ReviewRecord = {
    crossing_id:carrier.crossing.crossing_id,
    source_world:input.sourcePin.world,
    destination_world:dest,
    source_key_fingerprint:fingerprint,
    payload_sha256:digest,
    payload_base64:carrier.payload_base64,
    crossing:carrier.crossing,
    response_bundle:bundle,
    disposition:input.decision,
  };
  if (input.archive) await input.archive.saveReview(record);
  return {proposal,record};
}

/**
 * Public-interface verification for a completed review, intended for a future
 * authenticated Neon Function. The receiver key must have been pinned OUTSIDE
 * the submitted packet, by the destination's owner.
 */
export interface DestinationPin {
  world: string;
  particular: string;
  public_key: SourcePin['public_key'];
}
export async function verifyCompletedProgramReview(
  carrierValue: unknown,
  responseValue: unknown,
  sourcePin: SourcePin,
  destinationPin: DestinationPin,
): Promise<ReviewRecord> {
  const {carrier,digest}=await verifyProgramCarrier(carrierValue,sourcePin,destinationPin.world);
  const bundle=object(responseValue,'INVALID_REVIEW_BUNDLE');
  if (!(await verifySovereignResponseBundle(bundle,carrier.crossing.crossing_id)) ||
      bundle.world_id!==destinationPin.world ||
      bundle.receiver_particular!==destinationPin.particular ||
      !sameKey(bundle.receive_receipt?.signing?.public_key,destinationPin.public_key) ||
      !sameKey(bundle.disposition_receipt?.signing?.public_key,destinationPin.public_key) ||
      !['R3_HOLD','R3_REFUSE'].includes(bundle.disposition_receipt?.kind) ||
      bundle.disposition_receipt?.semantic_effect!=='none') {
    throw Error('UNTRUSTED_OR_CONSEQUENTIAL_RECEIVER_BUNDLE');
  }
  return {
    crossing_id:carrier.crossing.crossing_id,source_world:sourcePin.world,
    destination_world:destinationPin.world,
    source_key_fingerprint:sha256Hex(Buffer.from(JSON.stringify(sourcePin.public_key),'utf8')),
    payload_sha256:digest,payload_base64:carrier.payload_base64,
    crossing:carrier.crossing,response_bundle:bundle,
    disposition:bundle.disposition_receipt.kind==='R3_HOLD'?'HOLD':'REFUSE',
  };
}
export async function archiveCompletedProgramReview(
  carrier: unknown,
  response: unknown,
  sourcePin: SourcePin,
  destinationPin: DestinationPin,
  archive: ReviewArchive,
): Promise<ReviewRecord> {
  const record=await verifyCompletedProgramReview(carrier,response,sourcePin,destinationPin);
  await archive.saveReview(record);
  return record;
}

/**
 * Owner-facing projection ONLY. HUMKIN's existing Radio House program/v1
 * is a draft artifact, never a Tower queue command or Cloud HOUSE publication.
 * Approval remains with HUMKIN's existing owner-side review and catalog gates.
 */
export interface HumkinRadiohouseDraft {
  schema: 'humkin.radiohouse.program/v1';
  station_id: string;
  revision: string;
  items: Array<{recording_id:string}>;
  publication_state: 'draft';
  approval_ref: string;
}

export async function projectSignedReviewToHumkinDraft(
  carrierValue: unknown,
  responseValue: unknown,
  sourcePin: SourcePin,
  destinationPin: DestinationPin,
  stationId: string,
): Promise<HumkinRadiohouseDraft> {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(stationId)) throw Error('INVALID_HUMKIN_STATION');
  const checked=await verifyCompletedProgramReview(carrierValue,responseValue,sourcePin,destinationPin);
  if (checked.disposition!=='HOLD') throw Error('REFUSED_PROGRAM_CANNOT_PROJECT');
  const {proposal}=await verifyProgramCarrier(carrierValue,sourcePin,destinationPin.world);
  const items=proposal.tracks.map(track=>({recording_id:track.ref.slice('catalog:'.length)}));
  return {
    schema:'humkin.radiohouse.program/v1',
    station_id:stationId,
    revision:'freeport008:'+checked.crossing_id,
    items,
    publication_state:'draft',
    approval_ref:checked.response_bundle.disposition_receipt.receipt_id,
  };
}
