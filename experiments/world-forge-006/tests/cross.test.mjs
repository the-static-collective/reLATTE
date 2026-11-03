// Native crypto/receiver integration tests are SYNTHETIC fixtures.
// Real source authentication gates in CI read raw Minecraft/Godot artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sealDemoOffer,verifyOffer,deliverToIndependentLocalReceiver,makePayload,requireLocalChoice} from '../src/cross.mjs';
import {forgeCandidate} from '../../world-forge-005/src/forge.mjs';
import {FORMAT,HASH} from '../../world-forge-004/src/verify.mjs';

const cases={
 alpha:{name:'WFWatchAlpha',seed:'381654729',station:'garden',base:'minecraft:moss_block'},
 beta:{name:'WFWatchBeta',seed:'918273645',station:'forge',base:'minecraft:cut_copper'}
};
function donor(world){
  const c=cases[world];
  const evidence={
    format:FORMAT,source_sha256:HASH,engine:'minecraft-java-26.1.1',instance:world,
    seed:c.seed,engine_version:'26.1.1',observer:c.name,
    observer_class:'NON_OP_SEPARATE_PROCESS_PROTOCOL_CLIENT',observer_unprivileged:true,
    observations:[{stage:'build',block:c.base},{stage:'impact',block:'minecraft:polished_blackstone'},
      {stage:'repair',block:c.base}],actions:['BUILD','IMPACT','REPAIR'],
    artifact_digests:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],receiver:'HOLD',signature:null
  };
  const cmds=[
    'forceload add -32 -32 32 32','tp '+c.name+' 0 80 0',
    'execute positioned 0 80 0 run function worldforge:build_'+world,
    'execute positioned 0 80 0 run function crater:impact_'+world,
    'execute positioned 0 80 0 run function crater:visual_repair_'+world+'_'+c.station
  ];
  const trace={operator:'RCON',observer:c.name,observer_ops_file_verified:true,server_sha1:'1'.repeat(40),
    source_sha256:HASH,commands:cmds.map(command=>({role:'OPERATOR_RCON',command,response:'synthetic ok'})),
    worker_stderr:'',receiver:'HOLD'};
  return {evidence,trace,evidence_bytes:JSON.stringify(evidence)+'\n',trace_bytes:JSON.stringify(trace)+'\n'};
}
function payload(){
  const candidate=forgeCandidate({alpha:donor('alpha'),beta:donor('beta')});
  const sha=x=>createHash('sha256').update(x).digest('hex');
  const report={
    format:'world-forge/recovery-rehearsal-report/v0',
    source_sha256:HASH,candidate_sha256:sha(JSON.stringify(candidate)),
    godot_engine:'4.4.1',authored_phases:['build','impact','repair'],
    independently_read_states:[{stage:'build',block:'minecraft:gold_block'},
      {stage:'impact',block:'minecraft:polished_blackstone'},{stage:'repair',block:'minecraft:gold_block'}],
    serialized_scene_hashes:['d'.repeat(64),'e'.repeat(64),'f'.repeat(64)],
    donor_minecraft_worlds:['alpha','beta'],source_action_trace_parsed:true,
    donor_observer_separate_process:true,fresh_sandbox_material:true,fresh_sandbox_coordinates:true,
    bounded_declarative_procedure_reproduced:true,independent_human_observer:false,
    native_relattte_signatures_verified:false,general_skill_learning_or_ml:false,
    inventory_or_survival_parity_verified:false,physical_external_execution:false,
    owner_admitted:false,receiver:'HOLD'
  };
  return makePayload(candidate,report);
}
test('native P256 source crossing, signed R3_HOLD, signed custody, restart',async ()=>{
 const p=payload(),r=await sealDemoOffer(p),root=mkdtempSync(join(tmpdir(),'wf006-hold-'));
 // LocalReceiver.create needs a *new* leaf path:
 const leaf=join(root,'owner');try{
 await verifyOffer(r.offer,r.payloadBytes,p);
 const v=await deliverToIndependentLocalReceiver(r.offer,r.payloadBytes,p,'HOLD',leaf);
 assert.equal(v.snapshot.held.length,1);assert.equal(v.custody.extensions.local_receiver.payload_custody.retained,true);
 assert.equal(v.snapshot.admitted.length,0);
 assert.equal(v.source_native_relatte_crossing_signature_verified,true);
 assert.equal(v.receiver_receipt_signatures_verified,true);
 assert.equal(existsSync(join(leaf,'payloads',v.crossing_id+'.bin')),true);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('native signed R3_REFUSE keeps NO payload and no admission',async ()=>{
 const p=payload(),r=await sealDemoOffer(p),root=mkdtempSync(join(tmpdir(),'wf006-refuse-')),leaf=join(root,'owner');
 try{
  const v=await deliverToIndependentLocalReceiver(r.offer,r.payloadBytes,p,'REFUSE',leaf);
  assert.equal(v.snapshot.refused.length,1);assert.equal(v.snapshot.held.length,0);assert.equal(v.snapshot.admitted.length,0);
  assert.equal(v.custody.extensions.local_receiver.payload_custody.retained,false);
  assert.equal(existsSync(join(leaf,'payloads',v.crossing_id+'.bin')),false);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('no decision silently implies admission',()=>{
 for(const bad of ['ADMIT','RETURN','EXECUTE','AUTO_ADMIT','',null,undefined])assert.throws(()=>requireLocalChoice(bad));
 assert.equal(requireLocalChoice('HOLD'),'HOLD');assert.equal(requireLocalChoice('REFUSE'),'REFUSE');
});
test('tampered bytes rejected before receiver root exists',async()=>{
 const p=payload(),r=await sealDemoOffer(p),root=mkdtempSync(join(tmpdir(),'wf006-tamper-')),leaf=join(root,'owner');
 try{
  const tampered=Buffer.concat([r.payloadBytes,Buffer.from(' ')]);
  await assert.rejects(deliverToIndependentLocalReceiver(r.offer,tampered,p,'HOLD',leaf));
  assert.equal(existsSync(leaf),false);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('crossing signature falsification rejected',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 r.offer.crossing.requested_effect.auto_admit=true;
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,p));
});
test('crossing reported key cannot be substituted',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 r.offer.source_signer_public_jwk={...r.offer.source_signer_public_jwk,x:'f'.repeat(43)};
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,p));
});
test('transport cannot rewrite signed crossing',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 r.offer.transport_frame.crossing_id='relatte-crossing-v0:imposter';
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,p));
});
test('source evidence receives altered expected report => reject',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 const different=structuredClone(p);different.report.owner_admitted=true;
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,different));
});
test('bad offer can never issue source or owner identity authority',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 r.offer.source_key_disposition='EXTERNALLY_TRUSTED_HUMAN';
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,p));
});
test('unsigned/null signature cannot masquerade as native crossing',async()=>{
 const p=payload(),r=await sealDemoOffer(p);
 r.offer.crossing.signing.signature=null;
 await assert.rejects(verifyOffer(r.offer,r.payloadBytes,p));
});
