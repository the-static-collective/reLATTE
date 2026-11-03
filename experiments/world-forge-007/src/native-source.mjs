// WORLD-FORGE-007: independently validate actual PR #101 native-signed donors,
// then let separate receiver-local worlds apply DIFFERENT explicit signer policies.
// No normative source change, no claimed external personal identity or auto-admission.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyCrossingEnvelope,verifyReceipt} from '../../../src/protocol.ts';
import {LocalReceiver} from '../../../src/receiver.ts';

export const PINNED_PR101_COMMIT='4943f14fd28d5b0bdb1b6d11bad035a009afe8b4';
export const PINNED_CORE_TREE='c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';
export const PINNED_SERVER_SHA1='49c8195703ad0ba4f0a4efbccfd85a4a8ca57431';
export const RETURN_SCHEMA='ghot.riff-raft-minecraft-return-bundle/v0';
export const PACKET_SCHEMA='ghot.riff-raft-minecraft-return/v0';
export const POLICY_SCHEMA='world-forge/native-signer-policy/v0';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const iso=(s)=>typeof s==='string'&&/^2026-11-03T\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,ks)=>obj(x)&&Object.keys(x).length===ks.length&&ks.every(k=>Object.hasOwn(x,k));
const action=(x)=>x==='RECOGNIZE_PINNED_CI_PROVENANCE'||x==='REQUIRE_PRE_ENROLLED_SIGNER';
const WORLD_INPUTS=['A','B'];
function git(root,...args){
  return execFileSync('git',['-C',resolve(root),...args],{encoding:'utf8'}).trim();
}
export function verifyPinnedSourceCheckout(root){
  if(git(root,'rev-parse','HEAD')!==PINNED_PR101_COMMIT
    ||git(root,'rev-parse','HEAD:src')!==PINNED_CORE_TREE)
    throw Error('SOURCE_CHECKOUT_NOT_EXACT_PR101_COMMIT');
  return true;
}
export function sourceKeyFingerprint(crossing){
  const key=crossing?.signing?.public_key;
  if(!exact(key,['kty','crv','x','y'])||key.kty!=='EC'||key.crv!=='P-256'
    ||typeof key.x!=='string'||typeof key.y!=='string')
    throw Error('INVALID_SOURCE_KEY');
  // Digest of canonical PUBLIC-coordinate encoding, not a human key identity.
  return sha(Buffer.from(JSON.stringify({kty:key.kty,crv:key.crv,x:key.x,y:key.y}),'utf8'));
}
export function validatePolicy(policy){
  if(!exact(policy,['schema','mode','source_commit','normative_core_tree','minecraft_server_sha1',
      'enrolled_signer_fingerprint','recognition_basis','authorizes_execution','authorizes_admission']))
    throw Error('INVALID_SOURCE_POLICY_FIELDS');
  if(policy.schema!==POLICY_SCHEMA||!action(policy.mode)
    ||policy.source_commit!==PINNED_PR101_COMMIT
    ||policy.normative_core_tree!==PINNED_CORE_TREE
    ||policy.minecraft_server_sha1!==PINNED_SERVER_SHA1
    ||policy.authorizes_execution!==false||policy.authorizes_admission!==false)
    throw Error('POLICY_AUTHORITY_ESCALATION_OR_SOURCE_DRIFT');
  if(policy.mode==='RECOGNIZE_PINNED_CI_PROVENANCE'){
    if(policy.recognition_basis!=='PINNED_PR101_CODE_AND_VERIFIED_EPHEMERAL_P256_NOT_HUMAN_ID'
      ||typeof policy.enrolled_signer_fingerprint!=='string'
      ||!/^[0-9a-f]{64}$/.test(policy.enrolled_signer_fingerprint))
      throw Error('UNVERIFIED_SIGNER_ENROLLMENT');
  }else{
    if(policy.recognition_basis!=='NO_OUT_OF_BAND_SIGNER_ENROLLMENT'
      ||policy.enrolled_signer_fingerprint!==null)
      throw Error('PRE_ENROLLMENT_POLICY_INCORRECT');
  }
  return true;
}
export function issueTestPolicy(mode,sourceFingerprint){
  if(!action(mode))throw Error('UNSUPPORTED_POLICY_MODE');
  const policy={
    schema:POLICY_SCHEMA,mode,
    source_commit:PINNED_PR101_COMMIT,normative_core_tree:PINNED_CORE_TREE,
    minecraft_server_sha1:PINNED_SERVER_SHA1,
    enrolled_signer_fingerprint:mode==='RECOGNIZE_PINNED_CI_PROVENANCE'?sourceFingerprint:null,
    recognition_basis:mode==='RECOGNIZE_PINNED_CI_PROVENANCE'
      ?'PINNED_PR101_CODE_AND_VERIFIED_EPHEMERAL_P256_NOT_HUMAN_ID'
      :'NO_OUT_OF_BAND_SIGNER_ENROLLMENT',
    authorizes_execution:false,authorizes_admission:false
  };
  validatePolicy(policy);
  return policy;
}
export function chooseLocalDisposition(policy,sourceFingerprint){
  validatePolicy(policy);
  if(typeof sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(sourceFingerprint))
    throw Error('INVALID_OBSERVED_SOURCE_KEY');
  const trusted=policy.mode==='RECOGNIZE_PINNED_CI_PROVENANCE'
    && policy.enrolled_signer_fingerprint===sourceFingerprint;
  return trusted?'HOLD':'REFUSE';
}
export async function verifyNativeReturn(bundle){
  if(!exact(bundle,['schema','packet_json','crossing','receipt','world_evidence'])
    ||bundle.schema!==RETURN_SCHEMA||typeof bundle.packet_json!=='string'
    ||bundle.packet_json.length<200||bundle.packet_json.length>65536)
    throw Error('BAD_NATIVE_RETURN_SCHEMA');
  const packet=JSON.parse(bundle.packet_json);
  if(!obj(packet)||packet.schema!==PACKET_SCHEMA||!Array.isArray(packet.worlds)
    ||packet.worlds.length!==2
    ||packet.source_project!=='the-static-collective/reLATTE'
    ||packet.receiving_project!=='the-static-collective/GHoT'
    ||packet.recommended_gHot_disposition!=='HOLD'
    ||packet.signed_sender_identity_is_not_trusted_org_authority!==true
    ||packet.owner_admission!==false
    ||packet.no_direct_game_or_physical_actuation!==true
    ||packet.selected_game_runtime!=='official-vanilla-26.1.1')
    throw Error('WRONG_SOURCE_PACKET_IDENTITY');
  if(!(await verifyCrossingEnvelope(bundle.crossing))||!(await verifyReceipt(bundle.receipt)))
    throw Error('NATIVE_RETURN_SIGNATURE_REJECTED');
  if(bundle.receipt.crossing_id!==bundle.crossing.crossing_id
    ||bundle.receipt.kind!=='R3_HOLD'
    ||bundle.crossing.payload_refs?.length!==1
    ||bundle.crossing.payload_refs[0].address!=='sha256:'+sha(Buffer.from(bundle.packet_json,'utf8')))
    throw Error('PACKET_NOT_NATIVE_SIGNATURE_BOUND');
  if(!exact(bundle.world_evidence,['A','B']))throw Error('MISSING_TWO_RAW_SOURCE_WORLD_OBJECTS');
  for(const id of WORLD_INPUTS){
    const evidence=bundle.world_evidence[id];
    if(!exact(evidence,['composition_json','runtime_json'])
      ||typeof evidence.composition_json!=='string'
      ||typeof evidence.runtime_json!=='string')
      throw Error('RAW_WORLD_NOT_INCLUDED');
  }
  return {packet,sourceFingerprint:sourceKeyFingerprint(bundle.crossing)};
}
export async function verifyOriginal101Sources({checkout,artifactRoot,bundle}){
  verifyPinnedSourceCheckout(checkout);
  const parsed=await verifyNativeReturn(bundle);
  const importer=await import(pathToFileURL(join(resolve(checkout),
    'experiments/riff-raft-minecraft-003/two-world-replay.mjs')).href);
  const inputs=[];
  for(const world_id of WORLD_INPUTS){
    const dir=join(artifactRoot,'wf007-pr101-'+world_id);
    const comp=readFileSync(join(dir,'composition-evidence.json'));
    const runtime=readFileSync(join(dir,'runtime-evidence.json'));
    const c=comp.toString('utf8'),r=runtime.toString('utf8');
    if(c!==bundle.world_evidence[world_id].composition_json
      ||r!==bundle.world_evidence[world_id].runtime_json)
      throw Error('BUNDLE_RAW_SOURCE_ARTIFACT_BYTES_CHANGED');
    const meta=JSON.parse(readFileSync(join(dir,'server-version.json'),'utf8'));
    if(meta.id!=='26.1.1'||meta.server_sha1!==PINNED_SERVER_SHA1)
      throw Error('DONOR_SERVER_JAR_SHA1_CHANGED');
    inputs.push({world_id,composition_bytes:comp,runtime_bytes:runtime});
  }
  // Original PR101 code independently checks source launch+candidate P256
  // signatures, raw payload SHA, distinct author/observer, 0/9→3/9→0/9→9/9,
  // source GHoT commit, seed and world identity separation.
  const packet=await importer.assemblePair(inputs);
  if(JSON.stringify(packet)!==bundle.packet_json)
    throw Error('SIGNED_NATIVE_PACKET_DISAGREES_WITH_REBUILT_SOURCE');
  if(packet.worlds.some(w=>w.server_jar_sha1!==PINNED_SERVER_SHA1
     ||w.candidate_disposition!=='R3_HOLD'||w.real_world_effect!==false))
    throw Error('UNEXPECTED_NATIVE_SOURCE_SCOPE');
  return {
    packet,
    packet_sha256:sha(Buffer.from(bundle.packet_json,'utf8')),
    source_signer_fingerprint:parsed.sourceFingerprint,
    crossing_id:bundle.crossing.crossing_id,
    source_commit:PINNED_PR101_COMMIT,
    original_donor_P256_signatures_verified:true,
    original_two_independent_minecraft_observer_receipts:true,
    original_candidate_holds:true,
    external_donor_human_identity_verified:false,
    exact_pinned_commit:true
  };
}
export async function receiveNativeSource({checkout,artifactRoot,bundle,policy,receiverRoot}){
  const original=await verifyOriginal101Sources({checkout,artifactRoot,bundle});
  validatePolicy(policy);
  const decision=chooseLocalDisposition(policy,original.source_signer_fingerprint);
  const receiver=await LocalReceiver.create(receiverRoot,{
    world_id:'wf007-'+policy.mode.toLowerCase(),
    receiver_particular:'wf007-fresh-local-test-receiver',
    contract_ref:'wf007/review-only-no-execution'
  });
  const crossingId=bundle.crossing.crossing_id;
  const received=await receiver.receive(bundle.crossing,'2026-11-03T21:00:01.000Z');
  const disposed=await receiver.dispose(crossingId,decision,'2026-11-03T21:00:02.000Z');
  const custody=await receiver.verifyPayloadBytes(crossingId,
    Buffer.from(bundle.packet_json,'utf8'),'2026-11-03T21:00:03.000Z');
  for(const receipt of [received,disposed,custody]){
    if(!(await verifyReceipt(receipt)))throw Error('INVALID_LOCAL_RECEIVER_P256_RECEIPT');
  }
  const reopened=await LocalReceiver.open(receiverRoot);
  const snap=reopened.snapshot();
  if(reopened.journalLength()!==3||snap.admitted.length!==0
    ||snap[decision==='HOLD'?'held':'refused'].length!==1
    ||custody.extensions?.local_receiver?.payload_custody?.retained!==(decision==='HOLD'))
    throw Error('INVALID_LOCAL_RESTART_OR_CUSTODY_POLICY');
  return {
    schema:'world-forge/native-source-policy-decision/v0',
    source_commit:PINNED_PR101_COMMIT,
    source_signer_fingerprint:original.source_signer_fingerprint,
    source_signer_is_ephemeral:true,
    source_signatures_verified:true,
    source_worlds:original.packet.worlds.map(x=>({world_id:x.world_id,
      seed:x.server_seed,instance_id:x.instance_id,
      native_observed_sha256:x.observed_state_sha256})),
    packet_sha256:original.packet_sha256,
    crossing_id:crossingId,
    review_policy:policy,
    source_external_identity_verified:false,
    local_disposition:decision,
    local_receipts_verified:true,
    local_receiver_public_identity:disposed.signing.public_key,
    receiver_snapshot:snap,
    receipts:{received,disposed,custody},
    verified_byte_retention:decision==='HOLD',
    admitted:false,autonomous_execution:false,
    original_005_material_procedure_is_same_as_pr101_redstone:false,
    note:'PR101 causal evidence is separately authenticated collateral, NOT proof of the 005 Gold/Blackstone procedure.'
  };
}
export async function compareNativeReceivers(a,b){
  const proofs=[a,b];
  for(const p of proofs){
    if(p.schema!=='world-forge/native-source-policy-decision/v0'
      ||p.source_signatures_verified!==true||p.source_external_identity_verified!==false
      ||p.source_signer_is_ephemeral!==true||p.admitted!==false
      ||p.autonomous_execution!==false||p.local_receipts_verified!==true
      ||p.original_005_material_procedure_is_same_as_pr101_redstone!==false
      ||p.receiver_snapshot?.admitted?.length!==0)
      throw Error('UNSUPPORTED_RECEIVER_FINAL_CLAIMS');
    validatePolicy(p.review_policy);
    if(chooseLocalDisposition(p.review_policy,p.source_signer_fingerprint)!==p.local_disposition)
      throw Error('RECEIVER_POLICY_MISMATCH');
    if(p.verified_byte_retention!==(p.local_disposition==='HOLD'))throw Error('CUSTODY_POLICY_MISMATCH');
    for(const r of Object.values(p.receipts)){
      if(!(await verifyReceipt(r))||r.crossing_id!==p.crossing_id)
        throw Error('FORGED_RECEIVER_RECEIPT');
    }
  }
  if(a.crossing_id!==b.crossing_id||a.packet_sha256!==b.packet_sha256
    ||a.source_signer_fingerprint!==b.source_signer_fingerprint)
    throw Error('NOT_THE_SAME_NATIVE_SOURCE');
  if(new Set(proofs.map(p=>p.local_disposition)).size!==2
    ||new Set(proofs.map(p=>p.receiver_snapshot.world_id)).size!==2
    ||JSON.stringify(a.local_receiver_public_identity)===JSON.stringify(b.local_receiver_public_identity))
    throw Error('RECEIVER_WORLDS_NOT_DISTINCT');
  return {
    schema:'world-forge/pinned-native-source-trust-boundary/v0',
    source_pr101_commit:PINNED_PR101_COMMIT,
    source_core_tree:PINNED_CORE_TREE,
    minecraft_jar_sha1:PINNED_SERVER_SHA1,
    crossing_id:a.crossing_id,packet_sha256:a.packet_sha256,
    source_signer_fingerprint:a.source_signer_fingerprint,
    original_donor_p256_signatures_verified:true,
    original_source_observer_data_rechecked:true,
    recognized_external_human_identity:false,
    local_dispositions:proofs.map(p=>({mode:p.review_policy.mode,decision:p.local_disposition,
      receiver_world:p.receiver_snapshot.world_id})),
    two_independent_local_receiver_keys:true,
    retained_by_hold_only:true,refused_payload_retained:false,
    global_admission:null,automatic_execution:false,
    source_005_material_skill_ancestry_proven_by_pr101:false,
    law:'SOURCE_AUTHENTICITY != HUMAN_IDENTITY != PROCEDURE_REPRODUCTION != PERMISSION'
  };
}
async function cli(){
  const [mode,...args]=process.argv.slice(2);
  if(mode==='source-check'){
    const [checkout,artifactRoot,bundlePath,out]=args;
    if(!out)throw Error('source-check PINNED_CHECKOUT INPUT_ARTIFACTS BUNDLE OUTPUT');
    const v=await verifyOriginal101Sources({checkout,artifactRoot,
      bundle:JSON.parse(readFileSync(bundlePath,'utf8'))});
    writeFileSync(out,JSON.stringify(v,null,2)+'\n');
    console.log('WF007_PINNED_SOURCE_ORIGINAL_P256_VERIFIED='+JSON.stringify({
      source_commit:v.source_commit,world_ids:v.packet.worlds.map(x=>x.world_id),
      source_signer_fingerprint:v.source_signer_fingerprint,
      ephemeral_key_not_externally_trusted:true}));
    return;
  }
  if(mode==='receive'){
    const [checkout,artifactRoot,bundlePath,policyPath,root,out]=args;
    if(!out)throw Error('receive PINNED_CHECKOUT INPUT_ARTIFACTS BUNDLE POLICY RECEIVER_DIR OUTPUT');
    const p=await receiveNativeSource({
      checkout,artifactRoot,
      bundle:JSON.parse(readFileSync(bundlePath,'utf8')),
      policy:JSON.parse(readFileSync(policyPath,'utf8')),
      receiverRoot:root
    });
    writeFileSync(out,JSON.stringify(p,null,2)+'\n');
    console.log('WF007_NATIVE_OWNER_POLICY='+JSON.stringify({
      local_disposition:p.local_disposition,
      fingerprint:p.source_signer_fingerprint,
      provenance_sig_checked:p.source_signatures_verified,admitted:false}));
    return;
  }
  if(mode==='policy'){
    const [checkout,bundlePath,policyMode,out]=args;
    if(!out)throw Error('policy PINNED_CHECKOUT BUNDLE MODE OUTPUT');
    verifyPinnedSourceCheckout(checkout);
    const bundle=JSON.parse(readFileSync(bundlePath,'utf8'));
    const {sourceFingerprint}=await verifyNativeReturn(bundle);
    const p=issueTestPolicy(policyMode,sourceFingerprint);
    writeFileSync(out,JSON.stringify(p,null,2)+'\n');
    console.log('WF007_POLICY_ISSUED='+JSON.stringify({mode:p.mode,
      decision:chooseLocalDisposition(p,sourceFingerprint),
      external_identity_trusted:false}));
    return;
  }
  if(mode==='compare'){
    const [holdFile,refuseFile,out]=args;
    if(!out)throw Error('compare HOLD_PROOF REFUSE_PROOF OUTPUT');
    const report=await compareNativeReceivers(
      JSON.parse(readFileSync(holdFile,'utf8')),
      JSON.parse(readFileSync(refuseFile,'utf8'))
    );
    writeFileSync(out,JSON.stringify(report,null,2)+'\n');
    console.log('WF007_SOURCE_TRUST_LOCAL_CHOICES='+JSON.stringify(report));
    return;
  }
  throw Error('UNKNOWN_WF007_CLI_MODE');
}
if(process.argv[1]?.endsWith('/native-source.mjs'))await cli();
