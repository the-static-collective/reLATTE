import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';
import {sealEvidenceObservation} from '../src/evidence-transit.ts';
import type { EvidenceRoute } from '../src/evidence-transit.ts';
import {adaptPlanReturnToEvidence,planReturnPayloadRef,transportPlanReturn,validatePlanReturnCandidate,matchesPlanReturnPayload} from '../src/planz-return.ts';
import type {PlanReturnCandidate} from '../src/planz-return.ts';
function sample():PlanReturnCandidate {
 const basis={
   planId:'GLOBAL-CROSSING-001',
   sourceIssue:'https://github.com/the-static-collective/BananaSpork/issues/29',
   sourceEdition:'ATTENTION-2026-10-28-001',
   sourceSha256:'b'.repeat(64),
   weaveId:'weave:7f3baec7-03bc-4ff4-8d78-cac2f24e0410',
   publicMethodCandidate:'Review one shelf-stable food route through existing authorized local operators before spending money.',
 };
 return {
   schema:'planz.return-candidate/v0',
   candidateId:'planz-return-v0:'+createHash('sha256').update('PLANZ-RETURN-001|'+JSON.stringify(basis)).digest('hex'),
   ...basis,preparedAt:'2026-10-28T20:00:00.000Z',
   localReport:'COMPLETED_REPORTED_UNVERIFIED',
   review:'SECOND_ALIAS_REVIEW_ASSERTED_NOT_AUTHENTICATED',
   disposition:'HOLD_FOR_OWNER_REVIEW',
   fieldVerified:false,sourceOwnerApproved:false,recipientConfirmed:false,
   sentExternally:false,authority:'NONE',
   notice:'Unverified local candidate. No personal notes, aliases or evidence exported.',
 };
}
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'relatte-planz-return-'));
 const receiver=await LocalReceiver.create(join(dir,'receiver'),{
   world_id:'world:planz-owner-local',
   receiver_particular:'particular:planz-review-inbox',
   contract_ref:'contract:planz-return-observation/v0',
 });
 const source_keys=await generateP256KeyPair();
 const seen=new Set<string>();
 const route:EvidenceRoute={
   destination:'planz:return-candidate-inbox',capability_ref:null,
   source_keys,receiver,received_at:()=> '2026-10-28T20:01:00.000Z',
 };
 return {dir,route,seen};
}
test('source packet is a claim with exact source address and no personal payload in crossing',async()=>{
 const p=sample();validatePlanReturnCandidate(p);
 const obs=adaptPlanReturnToEvidence(p);
 assert.equal(obs.evidence_level,'claim');
 assert.equal(obs.payload_ref,planReturnPayloadRef(p));
 assert.equal(obs.subject_ref,'planz:GLOBAL-CROSSING-001');
 const {dir,route}=await setup();
 try{
   const crossing=await sealEvidenceObservation(obs,route.destination,route.source_keys,null);
   assert.equal(await verifyCrossingEnvelope(crossing),true);
   assert.equal(crossing.extensions.evidence_transit.evidence_level,'claim');
   assert.equal(JSON.stringify(crossing).includes(p.publicMethodCandidate),false);
   const mutated={...crossing,payload_refs:[{...crossing.payload_refs[0],address:'sha256:'+'0'.repeat(64)}]};
   assert.equal(await verifyCrossingEnvelope(mutated),false);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('missing independent policy always signs HOLD, cannot store a local act',async()=>{
 const {dir,route}=await setup();
 try{
  const result=await transportPlanReturn(sample(),route);
  assert.equal(result.status,'HELD');
  assert.equal(route.receiver.snapshot().admitted.length,0);
  assert.equal(await verifyReceipt(route.receiver.getReceiveReceipt(result.crossing_id)),true);
  assert.equal(await verifyReceipt(route.receiver.getDispositionReceipt(result.crossing_id)),true);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('receiver owner may admit only an observation, replay remains idempotent',async()=>{
 const {dir,route,seen}=await setup();
 try{
   route.evaluate=async e=>({disposition:e.evidence_level==='claim'?'ADMIT':'REFUSE',reason:'owner allows an unverified review candidate, no task credit'});
   route.store=async (_e,context)=>{const before=seen.has(context.event_id);seen.add(context.event_id);return {status:before?'already-stored':'stored',record_ref:'planz:local-review/001'}};
   const a=await transportPlanReturn(sample(),route);
   assert.equal(a.status,'STORED');assert.equal(seen.size,1);
   route.receiver=await LocalReceiver.open(join(dir,'receiver'));
   const b=await transportPlanReturn(sample(),route);
   assert.equal(b.status,'ALREADY_STORED');assert.equal(b.crossing_id,a.crossing_id);
   assert.equal(seen.size,1);
   route.evaluate=async()=>({disposition:'HOLD',reason:'owner withdrew observation permission'});
   assert.equal((await transportPlanReturn(sample(),route)).status,'BLOCKED');
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('independent refusal never invokes sink',async()=>{
 const {dir,route,seen}=await setup();
 try{
  route.evaluate=async()=>({disposition:'REFUSE',reason:'local owner has not accepted source'});
  route.store=async(_e,c)=>{seen.add(c.event_id);return {status:'stored'}};
  assert.equal((await transportPlanReturn(sample(),route)).status,'REFUSED');
  assert.equal(seen.size,0);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('packet cannot claim verification, include contacts, or rewrite the digest',()=>{
 const p=sample();
 assert.throws(()=>validatePlanReturnCandidate({...p,fieldVerified:true}),/UNSAFE/);
 assert.throws(()=>validatePlanReturnCandidate({...p,sourceOwnerApproved:true}),/UNSAFE/);
 assert.throws(()=>validatePlanReturnCandidate({...p,publicMethodCandidate:'Contact donor@example.org for private recipients'}),/UNSAFE/);
 assert.throws(()=>validatePlanReturnCandidate({...p,publicMethodCandidate:p.publicMethodCandidate+'!'}),/MISMATCH/);
 assert.throws(()=>validatePlanReturnCandidate({...p,secret:'recipient'}),/UNSAFE/);
});
test('wrong inbox or absent local store cannot receive content as accomplishment',async()=>{
 const {dir,route}=await setup();
 try{
   route.destination='another-service';
   await assert.rejects(transportPlanReturn(sample(),route),/OWNER_INBOX/);
   route.destination='planz:return-candidate-inbox';
   route.evaluate=async()=>({disposition:'ADMIT',reason:'local review only'});
   assert.equal((await transportPlanReturn(sample(),route)).status,'HELD');
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('receiver can bind redacted out-of-band review packet to signed reference without claiming field proof',()=>{
 const p=sample();
 const obs=adaptPlanReturnToEvidence(p);
 assert.equal(matchesPlanReturnPayload(obs,p),true);
 assert.equal(matchesPlanReturnPayload({...obs,payload_ref:'sha256:'+'0'.repeat(64)},p),false);
 assert.equal(matchesPlanReturnPayload(obs,{...p,notice:'Other notice'}),false);
 assert.equal(matchesPlanReturnPayload(obs,{...p,fieldVerified:true}),false);
});
