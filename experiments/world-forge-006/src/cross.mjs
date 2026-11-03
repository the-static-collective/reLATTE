// WORLD-FORGE-006 — native signed REview-only crossing over the verified 005 experiment.
// Non-normative adapter; never grant execution, host access, token minting or admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {forgeFromArtifacts,validateCandidate} from '../../world-forge-005/src/forge.mjs';
import {verifyReplay} from '../../world-forge-005/src/verify-replay.mjs';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt} from '../../../src/protocol.ts';
import {sealOpaqueOrganCrossing,verifyOpaqueOrganCrossing} from '../../../src/organ.ts';
import {makeTransportFrame,verifyAndExtractTransportFrame} from '../../../src/transport.ts';
import {LocalReceiver} from '../../../src/receiver.ts';

export const PAYLOAD_FORMAT='world-forge/held-candidate-with-rehearsal/v0';
export const OFFER_FORMAT='world-forge/native-signed-offer/v0';
const TS='2026-11-03T20:00:00.000Z';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>isRecord(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const readUtf8=p=>readFileSync(p,'utf8');
const bytes=p=>readFileSync(p);
function single(root,paths){
  const hits=paths.map(p=>join(root,p)).filter(p=>existsSync(p));
  if(hits.length!==1)throw Error('MISSING_OR_AMBIGUOUS_PROOF_SOURCE: '+paths.join(' | '));
  return hits[0];
}
export function verifyRaw005(donorRoot,candidatePath,reproRoot){
  const candidate=JSON.parse(readUtf8(candidatePath));
  validateCandidate(candidate);
  assert.deepEqual(candidate,forgeFromArtifacts(donorRoot),'donor evidence changed after candidate extraction');
  const logRoot='work/wf005/';
  const author=readUtf8(single(reproRoot,[logRoot+'godot-author.log','godot-author.log']));
  const reader=readUtf8(single(reproRoot,[logRoot+'godot-observer.log','godot-observer.log']));
  const sceneRoot='experiments/world-forge-005/godot/snapshots/';
  const snapshots=['build','impact','repair'].map(stage=>bytes(single(reproRoot,[
    sceneRoot+'gamma-'+stage+'.tscn','snapshots/gamma-'+stage+'.tscn'
  ])));
  const recomputed=verifyReplay(candidate,donorRoot,author,reader,snapshots);
  const report=JSON.parse(readUtf8(single(reproRoot,[logRoot+'reproduction-report.json','reproduction-report.json'])));
  assert.deepEqual(report,recomputed,'replay report changed since raw Godot scene observations');
  if(report.receiver!=='HOLD'||report.owner_admitted!==false
    ||report.bounded_declarative_procedure_reproduced!==true
    ||report.native_relattte_signatures_verified!==false)
    throw Error('CLAIM_ESCALATION_OR_UNREPRODUCED');
  return {candidate,report};
}
export function makePayload(candidate,report){
  validateCandidate(candidate);
  if(!exact(report,[
    'format','source_sha256','candidate_sha256','godot_engine','authored_phases',
    'independently_read_states','serialized_scene_hashes','donor_minecraft_worlds',
    'source_action_trace_parsed','donor_observer_separate_process','fresh_sandbox_material',
    'fresh_sandbox_coordinates','bounded_declarative_procedure_reproduced',
    'independent_human_observer','native_relattte_signatures_verified',
    'general_skill_learning_or_ml','inventory_or_survival_parity_verified',
    'physical_external_execution','owner_admitted','receiver'
  ]))throw Error('UNEXPECTED_REPLAY_REPORT');
  if(report.format!=='world-forge/recovery-rehearsal-report/v0'
    ||report.source_sha256!==candidate.source_sha256
    ||report.receiver!=='HOLD'||report.owner_admitted!==false
    ||report.bounded_declarative_procedure_reproduced!==true
    ||report.native_relattte_signatures_verified!==false)
    throw Error('UNSAFE_REPLAY_REPORT');
  return {schema:PAYLOAD_FORMAT,candidate,report,requested_effect:'LOCAL_REVIEW_ONLY',
    declaration:'NO_EXECUTION_NO_AUTOMATIC_ADMISSION_NO_TRANSFERRED_HUMAN_AUTHORITY'};
}
export async function sealDemoOffer(payload,createdAt=TS){
  if(!exact(payload,['schema','candidate','report','requested_effect','declaration'])
    ||payload.schema!==PAYLOAD_FORMAT||payload.requested_effect!=='LOCAL_REVIEW_ONLY'
    ||payload.declaration!=='NO_EXECUTION_NO_AUTOMATIC_ADMISSION_NO_TRANSFERRED_HUMAN_AUTHORITY')
    throw Error('UNEXPECTED_OFFER_PAYLOAD');
  makePayload(payload.candidate,payload.report);
  const payloadBytes=Buffer.from(JSON.stringify(payload)+'\n','utf8');
  if(payloadBytes.byteLength<100||payloadBytes.byteLength>65536)throw Error('PAYLOAD_SIZE_LIMIT');
  const hash=sha(payloadBytes);
  // Ephemeral signer, intentionally *not* a pinned external donor/human identity.
  const keys=await generateP256KeyPair();
  const crossing=await sealOpaqueOrganCrossing({
    schema:'relatte.opaque-organ-spec/v0',
    family_ref:'world-forge/cartridge-forge-006/experimental',
    donor_contract_ref:'world-forge/held-candidate-with-rehearsal/v0',
    artifact_kind:'HELD_PROCEDURE_REVIEW_OFFER',
    source_world:'world-forge-ci-fictional-minecraft-2-world-source',
    source_particular:'ephemeral-ci-key-not-human-identity',
    source_history_head:'sha256:'+payload.candidate.source_sha256,
    payload_refs:[{address:'sha256:'+hash,role:'candidate-and-reproduction-report',media_type:'application/json'}],
    donor_claims:{
      scope:'bounded-two-verb-extraction-and-godot-rehearsal',
      candidate_hash:sha(Buffer.from(JSON.stringify(payload.candidate))),
      report_hash:sha(Buffer.from(JSON.stringify(payload.report))),
      donor_worlds:['alpha','beta'],
      recipient_policy:'receiver-local-HOLD-or-REFUSE',
      genuine_external_identity:false
    },
    requested_effect:{kind:'LOCAL_REVIEW_ONLY',run_code:false,auto_admit:false},
    return_address:null,
    created_at:createdAt
  },keys);
  if(!(await verifyOpaqueOrganCrossing(crossing)))throw Error('NATIVE_CROSSING_NOT_VALID');
  const frame=await makeTransportFrame(crossing,'file-bundle',createdAt,'world-forge-006 local review-only experiment');
  const offer={schema:OFFER_FORMAT,payload_sha256:hash,source_signer_public_jwk:keys.publicKeyJwk,
    source_key_disposition:'EPHEMERAL_CI_SELF_ATTESTED_NO_EXTERNAL_TRUST_ROOT',
    crossing,transport_frame:frame};
  return {offer,payloadBytes};
}
export async function verifyOffer(offer,payloadBytes,expectedPayload){
  if(!exact(offer,['schema','payload_sha256','source_signer_public_jwk','source_key_disposition','crossing','transport_frame'])
    ||offer.schema!==OFFER_FORMAT
    ||offer.source_key_disposition!=='EPHEMERAL_CI_SELF_ATTESTED_NO_EXTERNAL_TRUST_ROOT')
    throw Error('INVALID_OFFER_SCHEMA');
  if(!Buffer.isBuffer(payloadBytes)||sha(payloadBytes)!==offer.payload_sha256)throw Error('OFFER_PAYLOAD_SHA_MISMATCH');
  if(payloadBytes.length>65536)throw Error('OFFER_OVERSIZE');
  const payload=JSON.parse(payloadBytes.toString('utf8'));
  if(payloadBytes.toString('utf8')!==JSON.stringify(payload)+'\n')throw Error('NON_CANONICAL_EXPERIMENT_PAYLOAD_BYTES');
  assert.deepEqual(payload,expectedPayload,'payload must rederive from raw donor and Godot evidence');
  if(!(await verifyOpaqueOrganCrossing(offer.crossing))||!(await verifyCrossingEnvelope(offer.crossing)))
    throw Error('BAD_NATIVE_P256_CROSSING');
  assert.deepEqual(offer.crossing.signing.public_key,offer.source_signer_public_jwk,'sender key mismatch');
  if(offer.crossing.declared_kind!=='OPAQUE_ORGAN_ARTIFACT'
    ||offer.crossing.requested_effect?.kind!=='LOCAL_REVIEW_ONLY'
    ||offer.crossing.requested_effect?.run_code!==false
    ||offer.crossing.requested_effect?.auto_admit!==false
    ||offer.crossing.capability_ref!==null
    ||offer.crossing.payload_refs?.length!==1
    ||offer.crossing.payload_refs[0].address!=='sha256:'+offer.payload_sha256
    ||offer.crossing.payload_refs[0].role!=='candidate-and-reproduction-report'
    ||offer.crossing.extensions?.organ_adapter?.family_ref!=='world-forge/cartridge-forge-006/experimental'
    ||offer.crossing.extensions?.organ_adapter?.donor_claims?.recipient_policy!=='receiver-local-HOLD-or-REFUSE')
    throw Error('UNSUPPORTED_OFFER_SEMANTICS');
  const extracted=await verifyAndExtractTransportFrame(offer.transport_frame);
  assert.equal(extracted.crossing_id,offer.crossing.crossing_id);
  assert.deepEqual(extracted,offer.crossing,'transport cannot substitute crossing');
  return true;
}
export function requireLocalChoice(choice){
  if(choice!=='HOLD'&&choice!=='REFUSE')throw Error('OWNER_CHOICE_REQUIRES_HOLD_OR_REFUSE');
  return choice;
}
export async function deliverToIndependentLocalReceiver(offer,payloadBytes,expectedPayload,decision,receiverRoot){
  requireLocalChoice(decision);
  // Verifications MUST precede any receiver mutation.
  await verifyOffer(offer,payloadBytes,expectedPayload);
  const receiver=await LocalReceiver.create(receiverRoot,{
    world_id:'world-forge-006-'+decision.toLowerCase()+'-test-world',
    receiver_particular:'new-local-owner-'+decision.toLowerCase()+'-test-key',
    contract_ref:'world-forge-006/REVIEW_ONLY/HOLD_OR_REFUSE'
  });
  const crossingId=offer.crossing.crossing_id;
  const receive=await receiver.receive(offer.crossing,'2026-11-03T20:00:01.000Z');
  const disposed=await receiver.dispose(crossingId,decision,'2026-11-03T20:00:02.000Z');
  const custody=await receiver.verifyPayloadBytes(crossingId,payloadBytes,'2026-11-03T20:00:03.000Z');
  for(const receipt of [receive,disposed,custody]){
    if(!(await verifyReceipt(receipt)))throw Error('BAD_RECEIVER_SIGNATURE');
  }
  if(disposed.kind!=='R3_'+decision||disposed.semantic_effect!=='none'||custody.kind!=='PAYLOAD_BYTES_VERIFIED')
    throw Error('IMPROPER_RECEIVER_DISPOSITION');
  const reopened=await LocalReceiver.open(receiverRoot);
  const snap=reopened.snapshot();
  if(reopened.journalLength()!==3
    ||snap.received.length!==1
    ||(decision==='HOLD'?snap.held.length!==1:snap.refused.length!==1)
    ||snap.admitted.length!==0
    ||custody.extensions?.local_receiver?.payload_custody?.retained!==(decision==='HOLD'))
    throw Error('RECEIVER_RESTART_OR_CUSTODY_CONTRADICTION');
  return {
    schema:'world-forge/native-owner-local-review-proof/v0',
    crossing_id:crossingId,source_signer_self_attested:true,
    source_native_relatte_crossing_signature_verified:true,
    transport_frame_verified:true,payload_byte_sha256:sha(payloadBytes),
    receiver_local_choice:decision,receiver_receipt_signatures_verified:true,
    receives:receive,disposition:disposed,custody,
    snapshot:snap,journal_length:reopened.journalLength(),
    independent_institution_identity_verified:false,
    original_pr101_source_signatures_verified:false,
    owner_admitted:false,automation_permitted:false,
    actual_external_human_choice:false,
    law:'SIGNED_DELIVERY != ADMITTED; HOLD_OR_REFUSE != HUMAN_IDENTITY'
  };
}
export function writeOffer(dir,record){
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'offer.json'),JSON.stringify(record.offer,null,2)+'\n');
  writeFileSync(join(dir,'payload.json'),record.payloadBytes);
}
export function readOffer(dir){
  return {offer:JSON.parse(readUtf8(join(dir,'offer.json'))),payloadBytes:bytes(join(dir,'payload.json'))};
}
export async function runCli(args){
  const [mode,...rest]=args;
  if(mode==='seal'){
    const [donors,candidate,repro,out]=rest;
    if(!out)throw Error('usage seal DONORS CANDIDATE REPRO OFFER_DIR');
    const {candidate:c,report}=verifyRaw005(donors,candidate,repro);
    const offer=await sealDemoOffer(makePayload(c,report));
    writeOffer(out,offer);
    console.log('WORLD_FORGE_006_NATIVE_SEALED='+JSON.stringify({
      crossing_id:offer.offer.crossing.crossing_id,
      signer:'EPHEMERAL_CI_NOT_HUMAN_IDENTITY',receiver:'NONE_YET',effect:'REVIEW_ONLY'}));
    return;
  }
  if(mode==='receive'){
    const [donors,candidate,repro,offerDir,decision,root,out]=rest;
    if(!out)throw Error('usage receive DONORS CANDIDATE REPRO OFFER_DIR HOLD|REFUSE RECEIVER_ROOT OUTPUT');
    const {candidate:c,report}=verifyRaw005(donors,candidate,repro);
    const {offer,payloadBytes}=readOffer(offerDir);
    const proof=await deliverToIndependentLocalReceiver(offer,payloadBytes,makePayload(c,report),decision,root);
    writeFileSync(out,JSON.stringify(proof,null,2)+'\n');
    console.log('WORLD_FORGE_006_NATIVE_RECEPTION='+JSON.stringify({
      choice:decision,receipt:proof.disposition.receipt_id,
      source_native_p256_verified:true,receiver_signed_receipts:true,
      custody_retained:proof.custody.extensions.local_receiver.payload_custody.retained,
      owner_admitted:false}));
    return;
  }
  throw Error('unknown 006 CLI mode');
}
if(process.argv[1]?.endsWith('/cross.mjs'))await runCli(process.argv.slice(2));
