// WORLD-FORGE-009 — local bridge from a WF008 owner-signed proposal grant
// into native reLATTE LocalReceiver's separately signed HOLD/REFUSE custody.
// No actual user grant or public key is hard-coded in this Git repository.
// Never takes custody of the owner's browser private key.
import {createHash,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {
  verifySigned,grantDigest,publicFingerprint,evaluateGrant,ALLOW
} from '../../world-forge-008/src/delegation-core.mjs';
import {generateP256KeyPair,verifyReceipt} from '../../../src/protocol.ts';
import {sealOpaqueOrganCrossing,verifyOpaqueOrganCrossing} from '../../../src/organ.ts';
import {LocalReceiver} from '../../../src/receiver.ts';

export const TRUST_SCHEMA='world-forge/local-owner-key-pin/v0';
export const REVIEW_SCHEMA='world-forge/native-local-proposal-review/v0';
const sha=data=>createHash('sha256').update(data).digest('hex');
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,fields)=>isObj(x)&&Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const stamp=(s)=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
const fp=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stampPlus=(s,ms)=>new Date(Date.parse(s)+ms).toISOString();
const publicJson=async file=>JSON.parse(await readFile(file,'utf8'));
const grantGate=async grant=>{
  if(!(await verifySigned(grant))||grant.body?.schema!=='world-forge/delegation-grant/v0')
    throw Error('OWNER_GRANT_SIGNATURE_INVALID');
  return {fingerprint:await publicFingerprint(grant.body.owner_public_key),
    grant_sha256:await grantDigest(grant)};
};
export async function enrollmentPreview(grant){
  const gate=await grantGate(grant);
  return {
    schema:'world-forge/enrollment-preview-not-a-trust-enrollment/v0',
    grant_signature_valid:true,
    owner_fingerprint:gate.fingerprint,
    grant_digest:gate.grant_sha256,
    issued_at:grant.body.issued_at,
    expires_at:grant.body.expires_at,
    scopes:[...grant.body.scopes],
    requires_separate_local_fingerprint_confirmation:true,
    personal_identity_verified:false,
    already_enrolled:false,
    private_key_received:false,
    published_to_github:false
  };
}
export function validateTrust(reg){
  if(!exact(reg,['schema','recognized_fingerprint','pinned_grant_digest','pinned_audience',
      'enrolled_at','recognition_basis','authority_mode','external_identity_verified',
      'automatic_execution','automatic_merge','automatic_admission','owner_private_key_custodied']))
    throw Error('BAD_TRUST_SCHEMA');
  if(reg.schema!==TRUST_SCHEMA||!fp(reg.recognized_fingerprint)||!fp(reg.pinned_grant_digest)
    ||reg.pinned_audience!=='the-static-collective/reLATTE/world-forge-experiments'
    ||!stamp(reg.enrolled_at)
    ||reg.recognition_basis!=='EXPLICIT_LOCAL_FINGERPRINT_CONFIRMATION_NOT_HUMAN_IDENTITY'
    ||reg.authority_mode!=='LOCAL_PROPOSAL_REVIEW_ONLY'
    ||reg.external_identity_verified!==false||reg.automatic_execution!==false
    ||reg.automatic_merge!==false||reg.automatic_admission!==false
    ||reg.owner_private_key_custodied!==false)
    throw Error('UNSAFE_LOCAL_TRUST');
  return true;
}
async function readTrust(root){
  const trust=await publicJson(join(root,'trust.json'));
  validateTrust(trust);
  const revocations=await publicJson(join(root,'revocations.json'));
  if(!Array.isArray(revocations)||revocations.length>1000)throw Error('BAD_LOCAL_REVOCATION_LEDGER');
  return {trust,revocations};
}
export async function enrollLocalSigner({grant,root,confirmedFingerprint,at}){
  // Enrollment is SEPARATE from signature verification: passing a signed
  // grant alone cannot enroll an unknown key into this receiver's trust root.
  const gate=await grantGate(grant);
  if(!fp(confirmedFingerprint)||gate.fingerprint!==confirmedFingerprint)
    throw Error('FINGERPRINT_CONFIRMATION_REQUIRED');
  if(!stamp(at)||Date.parse(at)<Date.parse(grant.body.issued_at)
    ||Date.parse(at)>=Date.parse(grant.body.expires_at))
    throw Error('OWNER_GRANT_NOT_CURRENT_AT_ENROLLMENT');
  if(!grant.body.scopes.every(x=>ALLOW.includes(x)))throw Error('UNKNOWN_SIGNED_SCOPE');
  if(existsSync(root))throw Error('TRUST_ROOT_ALREADY_EXISTS');
  const trust={
    schema:TRUST_SCHEMA,
    recognized_fingerprint:gate.fingerprint,
    pinned_grant_digest:gate.grant_sha256,
    pinned_audience:grant.body.audience,
    enrolled_at:at,
    recognition_basis:'EXPLICIT_LOCAL_FINGERPRINT_CONFIRMATION_NOT_HUMAN_IDENTITY',
    authority_mode:'LOCAL_PROPOSAL_REVIEW_ONLY',
    external_identity_verified:false,
    automatic_execution:false,automatic_merge:false,automatic_admission:false,
    owner_private_key_custodied:false
  };
  validateTrust(trust);
  await mkdir(root,{recursive:false,mode:0o700});
  await writeFile(join(root,'trust.json'),JSON.stringify(trust,null,2)+'\n',{flag:'wx',mode:0o600});
  await writeFile(join(root,'revocations.json'),'[]\n',{flag:'wx',mode:0o600});
  return trust;
}
export async function importSignedRevocation({root,grant,revocation}){
  const {trust,revocations}=await readTrust(root),gate=await grantGate(grant);
  if(gate.fingerprint!==trust.recognized_fingerprint||gate.grant_sha256!==trust.pinned_grant_digest)
    throw Error('UNRECOGNIZED_OWNER_GRANT');
  if(!(await verifySigned(revocation))||revocation.body.schema!=='world-forge/delegation-revocation/v0'
    ||await publicFingerprint(revocation.body.owner_public_key)!==gate.fingerprint
    ||revocation.body.grant_digest!==gate.grant_sha256)
    throw Error('REVOCATION_NOT_SIGNED_BY_PINNED_GRANT_KEY');
  if(revocations.some(x=>JSON.stringify(x)===JSON.stringify(revocation)))
    throw Error('DUPLICATE_REVOCATION');
  revocations.push(revocation);
  await writeFile(join(root,'revocations.json'),JSON.stringify(revocations,null,2)+'\n',{mode:0o600});
  return {schema:'world-forge/local-revocation-received/v0',
    signature_valid:true,revoked_grant_digest:gate.grant_sha256,
    local_revocations:revocations.length,
    broadcast_to_other_receivers:false,
    previously_completed_work_undone:false
  };
}
export async function evaluateLocalPolicy({root,grant,action,at}){
  if(typeof action!=='string'||action.length===0||action.length>80
    ||!/^[A-Z_]+$/.test(action))throw Error('INVALID_ACTION_NAME');
  if(!stamp(at))throw Error('INVALID_REVIEW_TIME');
  const {trust,revocations}=await readTrust(root);
  const gate=await grantGate(grant);
  if(trust.recognized_fingerprint!==gate.fingerprint||
      trust.pinned_grant_digest!==gate.grant_sha256||
      trust.pinned_audience!==grant.body.audience)
    throw Error('GRANT_DOES_NOT_MATCH_LOCALLY_CONFIRMED_TRUST_PIN');
  const result=await evaluateGrant({grant,at,action,revocations});
  if(!exact(result,result.authorized?
    ['authorized','reason','owner_fingerprint','allowlisted_action',
      'actual_human_identity_verified','legal_agency','automatic_admission']:
    ['authorized','reason']))throw Error('UNEXPECTED_GRANT_POLICY_RESULT');
  return {
    schema:'world-forge/local-operator-decision/v0',
    grant_digest:gate.grant_sha256,
    owner_fingerprint:gate.fingerprint,
    action,at,
    verified_grant_signature:true,
    pinned_key_matches_signed_grant:true,
    revoked_only_if_locally_received:true,
    local_revocation_count:revocations.length,
    scoped_action_allowed:result.authorized===true,
    local_disposition:result.authorized===true?'HOLD':'REFUSE',
    reason:result.reason,
    actual_human_identity_verified:false,
    consent_for_specific_action_reconfirmed:false,
    legal_agency:false,
    agent_possesses_owner_key:false,
    automatic_execution:false,automatic_merge:false,automatic_admission:false
  };
}
export async function reviewProposalInNativeReceiver({root,grant,action,at,requestId}){
  if(typeof requestId!=='string'||!/^[a-z0-9][a-z0-9-]{0,50}$/.test(requestId))
    throw Error('INVALID_PROPOSAL_ID');
  const decision=await evaluateLocalPolicy({root,grant,action,at});
  // Native reLATTE signing is done by a separate ephemeral BRIDGE key. The
  // real owner does not cryptographically sign these local proposal receipts.
  const payload={
    schema:'world-forge/local-proposal-disposition-payload/v0',
    request_id:requestId,at,action,
    owner_key_fingerprint:decision.owner_fingerprint,
    signed_grant_digest:decision.grant_digest,
    source_grant_signature_verified:decision.verified_grant_signature,
    local_policy_disposition:decision.local_disposition,
    local_policy_reason:decision.reason,
    allowed_as_project_proposal_only:decision.scoped_action_allowed,
    no_remote_execution:true,no_auto_merge:true,no_auto_admit:true,
    original_owner_grant_not_embedded:true,
    bridge_is_not_owner:true
  };
  const data=Buffer.from(JSON.stringify(payload)+'\n','utf8');
  if(data.length>65536)throw Error('NATIVE_PAYLOAD_OVERSIZE');
  const keys=await generateP256KeyPair();
  const crossing=await sealOpaqueOrganCrossing({
    schema:'relatte.opaque-organ-spec/v0',
    family_ref:'world-forge/local-owner-delegation-009/experimental',
    donor_contract_ref:'world-forge/locally-signed-delegation/v0',
    artifact_kind:'OWNER_SCOPED_PROJECT_PROPOSAL_REVIEW',
    source_world:'local-operator-bridge-simulation',
    source_particular:'separate-ephemeral-bridge-signer-not-owner',
    source_history_head:'sha256:'+decision.grant_digest,
    payload_refs:[{address:'sha256:'+sha(data),role:'verified-proposal-decision',
      media_type:'application/json'}],
    donor_claims:{
      owner_fingerprint:decision.owner_fingerprint,
      signed_grant_digest:decision.grant_digest,
      proposal_action:action,
      bridge_not_user_private_key:true,
      recognized_human_identity:false
    },
    requested_effect:{kind:'LOCAL_REVIEW_ONLY',remote_execution:false,
      automatic_merge:false,automatic_admission:false},
    return_address:null,created_at:at
  },keys);
  if(!(await verifyOpaqueOrganCrossing(crossing))
    ||crossing.payload_refs.length!==1
    ||crossing.payload_refs[0].address!=='sha256:'+sha(data))
    throw Error('NATIVE_BOUND_CROSSING_INVALID');
  const nativeRoot=join(root,'native-receiver');
  const receiver=existsSync(nativeRoot)
    ?await LocalReceiver.open(nativeRoot)
    :await LocalReceiver.create(nativeRoot,{
      world_id:'wf009-local-review-world',
      receiver_particular:'wf009-local-review-receipt-signer-not-owner',
      contract_ref:'wf009/bounded-project-proposal-review-only'
    });
  const id=crossing.crossing_id;
  const received=await receiver.receive(crossing,at);
  const disposition=await receiver.dispose(id,decision.local_disposition,stampPlus(at,1000));
  const custody=await receiver.verifyPayloadBytes(id,data,stampPlus(at,2000));
  for(const receipt of [received,disposition,custody]){
    if(!(await verifyReceipt(receipt)))throw Error('BAD_NATIVE_SIGNED_RECEIPT');
  }
  if(disposition.kind!=='R3_'+decision.local_disposition
    ||disposition.semantic_effect!=='none'
    ||custody.extensions?.local_receiver?.payload_custody?.retained!==(decision.local_disposition==='HOLD'))
    throw Error('LOCAL_AUTHORITY_ESCALATION');
  const restarted=await LocalReceiver.open(nativeRoot);
  const snapshot=restarted.snapshot();
  if(snapshot.admitted.length!==0
    ||!snapshot[decision.local_disposition==='HOLD'?'held':'refused'].includes(id))
    throw Error('NATIVE_RECEIVER_RESTART_DISAGREES');
  return {
    schema:REVIEW_SCHEMA,
    request_id:requestId,action,owner_key_fingerprint:decision.owner_fingerprint,
    signed_grant_digest:decision.grant_digest,
    decision:decision.local_disposition,scope_allowlisted:decision.scoped_action_allowed,
    reason:decision.reason,
    native_crossing_id:id,
    native_source_signer:'EPHEMERAL_BRIDGE_NOT_OWNER',
    native_receiver_receipts_verified:true,
    native_receipts:{received,disposition,custody},
    native_receiver_world:snapshot.world_id,
    native_receiver_journal_length:restarted.journalLength(),
    native_receiver_admitted:snapshot.admitted.length,
    payload_retained_for_review:decision.local_disposition==='HOLD',
    owner_private_key_transferred:false,
    owner_identity_independently_verified:false,
    acts_on_github:false,exercises_project_authority:false,
    automatic_execution:false,automatic_merge:false,
    law:'SIGNED_GRANT != HUMAN_IDENTITY; LOCAL_HOLD != ACTION_PERMISSION'
  };
}
export async function readGrantFile(path){return publicJson(path)}
export async function readRevocationFile(path){return publicJson(path)}
