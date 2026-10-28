import { createHash } from 'node:crypto';
import { sealCrossingEnvelope } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import type { LocalReceiver } from './receiver.ts';

// BRIDGE-005: signed local REVIEW receipt built from an independent public-only
// operator draft. Browser SHA256 integrity is not an institution signature.
const SOURCE_COMMIT='27c280d5297e593512d85eb3c83d74904856cfdf';
const SOURCE_URL='https://github.com/the-static-collective/webZ/blob/'+SOURCE_COMMIT+'/bridge/network/model.mjs';
const DOORS=new Set(['mit-solve','rochester-task-force','rochester-grant','cities-deliver','code-for-america','bloom','igh','dpga','umn-extension','voqal','arts-midwest','unitac','nexus','foss-backstage','ncoa','anderson','state-net','levitt','osm','ocx','mn-housing','open-referral','civic-alliance']);
const ACTIONS=new Set(['VERIFY_ELIGIBILITY','ASK_LOCAL_PERMISSION','PREPARE_SYNTHETIC_DEMO','REQUEST_CRITIQUE']);
const KEYS=['schema','sourceCommit','sourceUrl','snapshot','doorId','target','actionCode','classification','manualExport','externalContact','applicationSubmitted','receiverAdmitted','fieldVerified','authority','candidateId'];
type Route='JARVIS'|'PLANZ';
export interface BridgeWorkCard {
 schema:'abundent.bridge-work-card/v1';
 sourceCommit:string;sourceUrl:string;snapshot:'BRIDGE-NETWORK-003/2026-10-28';
 doorId:string;target:Route;actionCode:string;
 classification:'PUBLIC_ONLY_HOLD_FOR_LOCAL_REVIEW';
 manualExport:true;externalContact:false;applicationSubmitted:false;
 receiverAdmitted:false;fieldVerified:false;authority:'NONE';candidateId:string;
}
const sha=(input:string)=>createHash('sha256').update(input).digest('hex');

export function inspectBridgeCard(value:unknown):BridgeWorkCard {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('HOLD_INVALID_BRIDGE_CARD');
 const p=value as Record<string,unknown>;
 if(Object.keys(p).sort().join('|')!==[...KEYS].sort().join('|')||
 typeof p.doorId!=='string'||!DOORS.has(p.doorId)||
 typeof p.actionCode!=='string'||!ACTIONS.has(p.actionCode)||
 p.target!=='JARVIS'&&p.target!=='PLANZ')throw Error('HOLD_INVALID_BRIDGE_CARD');
 const body={
 schema:'abundent.bridge-work-card/v1',sourceCommit:SOURCE_COMMIT,sourceUrl:SOURCE_URL,
 snapshot:'BRIDGE-NETWORK-003/2026-10-28',doorId:p.doorId,target:p.target,actionCode:p.actionCode,
 classification:'PUBLIC_ONLY_HOLD_FOR_LOCAL_REVIEW',manualExport:true,
 externalContact:false,applicationSubmitted:false,receiverAdmitted:false,
 fieldVerified:false,authority:'NONE'
 };
 if(Object.entries(body).some(([k,v])=>p[k]!==v)||
 p.candidateId!=='bridge-work-v1:'+sha('BRIDGE-005|'+JSON.stringify(body)))
 throw Error('HOLD_INVALID_BRIDGE_ID_OR_AUTHORITY');
 return value as BridgeWorkCard;
}
export interface BridgeReviewRoute {
 receiver:LocalReceiver;
 sourceKeys:P256KeyMaterial;
 sourceWorld:string;
 sourceParticular:string;
 recordedAt:string;
 ownerApprovedReview:boolean;
 receiverDecision:'HOLD'|'REFUSE';
}
/** Signed *review-only* and durable receiver-local disposition, never ADMIT.
 * Source keys in a test fixture are NOT real recipient organization keys.
 * The receiver independently controls the record of receipt/refusal; receipt
 * does not prove identity, external delivery, verified need or application.
 */
export async function deliverBridgeForReview(cardValue:unknown,route:BridgeReviewRoute){
 const card=inspectBridgeCard(cardValue);
 if(route.ownerApprovedReview!==true)throw Error('HOLD_SOURCE_OWNER_APPROVAL_MISSING');
 if(!['HOLD','REFUSE'].includes(route.receiverDecision))throw Error('INVALID_BRIDGE_RECEIVER_DECISION');
 if(!route.sourceWorld||!route.sourceParticular)throw Error('INVALID_BRIDGE_SOURCE');
 const payloadDigest=sha(JSON.stringify(card));
 const crossing=await sealCrossingEnvelope({
 schema:'relatte.crossing-envelope/v0',protocol_version:'0',
 source_particular:route.sourceParticular,source_world:route.sourceWorld,
 source_history_head:null,parents:[],
 declared_kind:'BRIDGE_PUBLIC_REVIEW_CANDIDATE',
 payload_refs:[{address:'sha256:'+payloadDigest,role:'public-work-card-reference',media_type:'application/json'}],
 requested_effect:null,capability_ref:null,
 privacy_policy:'public-only-work-card-no-journal-notes',
 audience_policy:'receiver-controlled-review-only',return_address:null,
 created_at:route.recordedAt,
 extensions:{bridge:{schema:'relatte.bridge-review-reference/v1',candidate_id:card.candidateId,
 door_id:card.doorId,target:card.target,action_code:card.actionCode,
 public_only:true,external_effect:false}}
 },route.sourceKeys);
 const received=await route.receiver.receive(crossing,route.recordedAt);
 const disposition=await route.receiver.dispose(crossing.crossing_id,route.receiverDecision,route.recordedAt,
   {note:'Public candidate received for bounded review only; no external act approved.'});
 return {schema:'relatte.bridge-review-result/v1' as const,candidateId:card.candidateId,
 crossingId:crossing.crossing_id,receiveReceipt:received,dispositionReceipt:disposition,
 disposition:route.receiverDecision,executionAllowed:false,fieldVerified:false,
 institutionAccepted:false,applicationSubmitted:false,otherDataImported:false};
}
